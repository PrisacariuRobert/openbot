import type { StudioDraft } from "../shared/types";

export type DraftCapture = { threadId: string; body: string; revision: number };
export type DraftView = {
  body: string;
  ready: boolean;
  dirty: boolean;
  saving: boolean;
  error: string;
  conflict: StudioDraft | null;
};
type Entry = DraftView & {
  revision: number;
  remote: StudioDraft | null;
  inFlight: DraftCapture | null;
  timer: ReturnType<typeof setTimeout> | null;
};
type SaveDraft = (threadId: string, body: string) => Promise<StudioDraft>;

/** Session-local drafts with serialized writes per conversation.
 * The current server is last-write-wins, not compare-and-swap. Observed remote
 * conflicts are held for a user choice; an unseen concurrent device write
 * cannot be prevented atomically by this client alone.
 */
export class ConversationDrafts {
  private entries = new Map<string, Entry>();
  private listeners = new Set<() => void>();
  constructor(private save: SaveDraft, private delay = 650) {}

  private entry(threadId: string): Entry {
    let entry = this.entries.get(threadId);
    if (!entry) {
      entry = {
        body: "", ready: false, dirty: false, saving: false, error: "",
        conflict: null, revision: 0, remote: null, inFlight: null, timer: null,
      };
      this.entries.set(threadId, entry);
    }
    return entry;
  }
  private notify() { for (const listener of this.listeners) listener(); }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  view(threadId: string): DraftView {
    const entry = this.entry(threadId);
    return { body: entry.body, ready: entry.ready, dirty: entry.dirty,
      saving: entry.saving, error: entry.error, conflict: entry.conflict };
  }
  hasUnsaved() { return [...this.entries.values()].some((entry) => entry.dirty || entry.saving); }

  receive(remote: StudioDraft) {
    const entry = this.entry(remote.threadId);
    // Polling can finish after a newer write or phone update was acknowledged.
    if (entry.remote && (remote.updatedAt || "") <= (entry.remote.updatedAt || "")) return;
    const previous = entry.remote;
    entry.ready = true;
    entry.remote = remote;
    if (entry.dirty || entry.saving) {
      const expected = remote.body === entry.inFlight?.body || remote.body === previous?.body;
      if (!expected && remote.body !== entry.body && (previous || remote.body)) {
        entry.conflict = remote;
        if (entry.timer) clearTimeout(entry.timer);
        entry.timer = null;
      }
    } else {
      entry.body = remote.body;
      entry.revision += 1;
    }
    this.notify();
    this.schedule(remote.threadId);
  }

  edit(threadId: string, body: string) {
    const entry = this.entry(threadId);
    if (entry.body === body) return;
    entry.body = body;
    entry.revision += 1;
    entry.dirty = true;
    entry.error = "";
    this.notify();
    this.schedule(threadId);
  }
  capture(threadId: string): DraftCapture {
    const entry = this.entry(threadId);
    return { threadId, body: entry.body, revision: entry.revision };
  }
  clearSent(sent: DraftCapture): boolean {
    const entry = this.entry(sent.threadId);
    if (entry.body !== sent.body || entry.revision !== sent.revision) return false;
    this.edit(sent.threadId, "");
    return true;
  }
  resolve(threadId: string, choice: "local" | "remote") {
    const entry = this.entry(threadId);
    if (!entry.conflict) return;
    if (choice === "remote") {
      // A request already in flight cannot be recalled. Re-save the chosen
      // remote copy after it completes, instead of allowing it to win later.
      entry.body = entry.conflict.body;
      entry.revision += 1;
      entry.dirty = entry.saving;
    } else entry.dirty = true;
    entry.conflict = null;
    entry.error = "";
    this.notify();
    this.schedule(threadId);
  }
  private schedule(threadId: string) {
    const entry = this.entry(threadId);
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = null;
    if (!entry.ready || !entry.dirty || entry.saving || entry.conflict || entry.error) return;
    entry.timer = setTimeout(() => { void this.flush(threadId); }, this.delay);
  }
  async flush(threadId: string): Promise<void> {
    const entry = this.entry(threadId);
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = null;
    if (!entry.ready || !entry.dirty || entry.saving || entry.conflict) return;
    const captured = this.capture(threadId);
    entry.saving = true;
    entry.inFlight = captured;
    entry.error = "";
    this.notify();
    try {
      const saved = await this.save(threadId, captured.body);
      if (saved.threadId !== threadId || saved.body !== captured.body)
        throw new Error("The saved draft did not match. Your text is still here.");
      if (!entry.remote || (saved.updatedAt || "") >= (entry.remote.updatedAt || "")) entry.remote = saved;
      if (entry.revision === captured.revision && !entry.conflict) entry.dirty = false;
    } catch (reason) {
      entry.error = reason instanceof Error ? reason.message : "Couldn’t save your draft. Your text is still here.";
    } finally {
      entry.saving = false;
      entry.inFlight = null;
      this.notify();
      this.schedule(threadId);
    }
  }
  flushAll() { for (const threadId of this.entries.keys()) void this.flush(threadId); }
}

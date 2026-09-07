import type { Routine } from "../shared/types.js";
import type { OpenBotDatabase } from "./database.js";
import { fetchWatchedPage, pageChange, pageHash, pageWatchConfig } from "./page-watch-source.js";

interface Checkpoint {
  version: 1; fingerprint: string; text: string | null; hash: string | null; revision: number;
  state: "baseline" | "unchanged" | "changed" | "error"; checkedAt: string; nextCheckAt: string;
  checks: number; unchangedChecks: number; detail: string; observedAt: string | null;
}
export type PageWatchDispatch = (routine: Routine, payload: Record<string, unknown>, externalId: string) => boolean;
const fingerprint = (routine: Routine) => pageHash(JSON.stringify([routine.botId, routine.threadId, routine.triggerConfig]));
const sameRequest = (a: Routine, b: Routine | null) => b?.enabled && b.triggerType === "webpage" && fingerprint(a) === fingerprint(b) && a.prompt === b.prompt && a.intervalMinutes === b.intervalMinutes;

export class PageWatchMonitor {
  private running = false;
  private stopped = false;
  private readonly cancellation = new AbortController();
  constructor(private readonly db: OpenBotDatabase, private readonly dispatch: PageWatchDispatch,
    private readonly read = fetchWatchedPage, private readonly now = Date.now, private readonly isLeader = () => true) {}

  async checkNow(id: string): Promise<boolean> {
    if (this.stopped || this.running || !this.isLeader()) return false;
    const routine = this.db.getRoutine(id);
    if (!routine?.enabled || routine.triggerType !== "webpage") return false;
    this.running = true;
    try { return await this.check(routine, true); } finally { this.running = false; }
  }

  async poll(): Promise<boolean> {
    if (this.stopped || this.running || !this.isLeader()) return false;
    this.running = true;
    let checked = false;
    try {
      const routines = this.db.listRoutines().filter((routine) => routine.enabled && routine.triggerType === "webpage").slice(0, 20);
      // Two bounded reads at a time. No browser or model is started for polling.
      for (let i = 0; i < routines.length; i += 2) {
        if (this.stopped || !this.isLeader()) break;
        const results = await Promise.all(routines.slice(i, i + 2).map((routine) => this.check(routine)));
        checked ||= results.some(Boolean);
      }
    } finally { this.running = false; }
    return checked;
  }

  stop(): void { this.stopped = true; this.cancellation.abort(); }

  private async check(routine: Routine, force = false): Promise<boolean> {
    let prior: Checkpoint | null = null;
    const saved = this.db.automationCursor(routine.id, "webpage");
    if (saved) {
      try {
        prior = JSON.parse(saved) as Checkpoint;
        if (prior.version !== 1 || !Number.isSafeInteger(prior.revision) || prior.revision < 0 ||
          !Number.isSafeInteger(prior.checks) || !Number.isSafeInteger(prior.unchangedChecks) ||
          !Number.isFinite(Date.parse(prior.nextCheckAt)) || prior.fingerprint !== fingerprint(routine) ||
          (prior.text !== null && (typeof prior.text !== "string" || prior.text.length > 8000 || pageHash(prior.text) !== prior.hash))) throw new Error("Invalid checkpoint");
      } catch {
        this.db.createAutomationAlert({ routineId: routine.id, kind: "failure", message: `${routine.name} has an unreadable saved baseline. Edit its page address to start a new baseline; no changes were inferred.` });
        return false;
      }
    }
    const at = this.now();
    if (!force && prior && Date.parse(prior.nextCheckAt) > at) return false;
    const checkedAt = new Date(at).toISOString();
    const nextCheckAt = new Date(at + Math.max(15, routine.intervalMinutes) * 60_000).toISOString();
    const current: Checkpoint = { version: 1, fingerprint: fingerprint(routine), text: prior?.text ?? null, hash: prior?.hash ?? null,
      revision: prior?.revision ?? 0, state: "baseline", checkedAt, nextCheckAt, checks: (prior?.checks ?? 0) + 1,
      unchangedChecks: prior?.unchangedChecks ?? 0, observedAt: prior?.observedAt ?? null, detail: "First readable version saved. Waiting for changes; no model was used." };
    try {
      const config = pageWatchConfig(routine.triggerConfig);
      const text = await this.read(config, AbortSignal.any([this.cancellation.signal, AbortSignal.timeout(15_000)]));
      if (this.stopped || !this.isLeader() || !sameRequest(routine, this.db.getRoutine(routine.id))) return false;
      const hash = pageHash(text);
      current.text = text; current.hash = hash; current.observedAt = checkedAt;
      if (prior?.hash === hash) {
        current.state = "unchanged"; current.unchangedChecks++;
        current.detail = "No readable content changed. No model was used for this check.";
      } else if (prior?.text !== null && prior?.text !== undefined) {
        current.state = "changed"; current.revision++;
        current.detail = "A content change was saved and queued for your teammate.";
      }
      this.db.automationTransaction(() => {
        // Recheck in the same commit as the event/run and the new baseline.
        if (!sameRequest(routine, this.db.getRoutine(routine.id))) throw new Error("This watch changed while checking the page.");
        if (current.state === "changed") {
          const payload = { url: config.pageUrl, section: config.pageSelector || "readable page/feed content", previousObservedAt: prior!.observedAt, observedAt: checkedAt,
            previousHash: prior!.hash, currentHash: hash, ...pageChange(prior!.text!, text),
            scope: "Static text comparison, not a browser screenshot or a fact check. Verify the source before acting. No external action has occurred." };
          if (!this.dispatch(routine, payload, `page:${current.fingerprint}:${current.revision}:${hash}`)) throw new Error("Your teammate could not be queued. The previous version was kept for retry.");
        }
        this.db.saveAutomationCursor(routine.id, "webpage", JSON.stringify(current));
      });
    } catch (error) {
      if (this.stopped || !this.isLeader() || !sameRequest(routine, this.db.getRoutine(routine.id))) return false;
      const detail = error instanceof Error ? error.message.slice(0, 300) : "The page could not be checked.";
      // A failed read/dispatch never becomes the comparison baseline.
      this.db.saveAutomationCursor(routine.id, "webpage", JSON.stringify({ ...current, text: prior?.text ?? null, hash: prior?.hash ?? null, observedAt: prior?.observedAt ?? null, revision: prior?.revision ?? 0, state: "error", detail }));
      this.db.createAutomationAlert({ routineId: routine.id, kind: "failure", message: `${routine.name}: ${detail}` });
    }
    return true;
  }
}

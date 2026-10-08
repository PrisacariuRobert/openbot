import { createHash } from "node:crypto";
import type { Routine } from "../shared/types.js";

/** Task F5: your Mac reacts. Two triggers next to the calendar, webhook and app
 * triggers: "a file lands in a folder" and "mail like this arrives". Both poll
 * (no file-system or Mail hooks to install), start from a baseline so turning one
 * on never floods the studio with what's already there, wait for a quiet moment so
 * a burst of files or mails becomes one run, and cap runs per hour. A triggered run
 * is an ordinary routine run: it follows its teammate's autonomy level. */

export type MacTriggerSource = "folder" | "mail";
export interface FolderEntry { name: string; size: number; modifiedMs: number }
export interface MailEntry { id: string; from: string; subject: string; date: string }

export interface MacTriggerDeps {
  /** Enabled folder and mail routines. */
  routines: () => Routine[];
  /** Files & apps on this Mac is on for the studio. */
  macAccess: () => boolean;
  /** The files directly in a folder (not subfolders). Throws if it can't be read. */
  listFolder: (folder: string) => FolderEntry[];
  unreadMail: () => Promise<MailEntry[]>;
  cursor: { get: (routineId: string, source: MacTriggerSource) => string | null; set: (routineId: string, source: MacTriggerSource, value: string) => void };
  /** Runs this routine started from its trigger in the last hour. */
  startedSince: (routineId: string, sinceMs: number) => number;
  dispatch: (routine: Routine, source: MacTriggerSource, payload: unknown, externalId: string) => void;
  alert: (routine: Routine, message: string) => void;
  now?: () => number;
  /** How long a folder or inbox must stay unchanged before a run starts. */
  quietMs?: number;
  perHour?: number;
}

/** Files a browser or app is still writing, and the Mac's own files. */
const UNFINISHED = /^\.|\.(?:crdownload|part|partial|download|tmp|icloud)$|^~\$/i;

export function fileTypesMatch(name: string, fileTypes: string | undefined): boolean {
  const wanted = (fileTypes || "").split(/[,\s]+/).map((type) => type.replace(/^\*?\./, "").toLowerCase()).filter(Boolean);
  return !wanted.length || wanted.includes(name.split(".").pop()?.toLowerCase() || "");
}

export function mailMatches(mail: MailEntry, config: Routine["triggerConfig"]): boolean {
  const from = (config.mailFrom || "").trim().toLowerCase(), subject = (config.mailSubject || "").trim().toLowerCase();
  if (!from && !subject) return false;
  return (!from || mail.from.toLowerCase().includes(from)) && (!subject || mail.subject.toLowerCase().includes(subject));
}

type Pending<T> = { items: Map<string, { item: T; signature: string }>; lastChange: number };

export class MacTriggers {
  private readonly pending = new Map<string, Pending<FolderEntry | MailEntry>>();
  private readonly alerted = new Map<string, number>();
  private running = false;
  constructor(private readonly deps: MacTriggerDeps) {}

  private get now() { return (this.deps.now ?? Date.now)(); }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const routines = this.deps.routines().filter((routine) => routine.enabled && (routine.triggerType === "folder" || routine.triggerType === "mail"));
      if (!routines.length) return;
      if (!this.deps.macAccess()) { for (const routine of routines) this.alertOnce(routine, `${routine.name} is waiting: turn on Files & apps on this Mac so it can watch ${routine.triggerType === "folder" ? "the folder" : "Mail"}.`); return; }
      let mail: MailEntry[] | null = null;
      for (const routine of routines) {
        try {
          if (routine.triggerType === "folder") this.folder(routine);
          else { mail ??= await this.deps.unreadMail(); this.mail(routine, mail); }
        } catch (error) {
          this.alertOnce(routine, `${routine.name} couldn't check ${routine.triggerType === "folder" ? "its folder" : "Mail"}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } finally { this.running = false; }
  }

  private folder(routine: Routine) {
    const folder = routine.triggerConfig.folderPath || "";
    const files = this.deps.listFolder(folder).filter((entry) => !UNFINISHED.test(entry.name) && fileTypesMatch(entry.name, routine.triggerConfig.fileTypes));
    const signature = (entry: FolderEntry) => `${entry.size}:${Math.floor(entry.modifiedMs)}`;
    // Keyed by a short hash of the name, so the saved record stays small: a new
    // name is a new file; an edited or replaced file with the same name isn't.
    const key = (name: string) => createHash("sha256").update(name).digest("hex").slice(0, 12);
    this.step(routine, "folder", files.map((entry) => ({ key: key(entry.name), item: entry, signature: signature(entry) })), (items) => ({
      folder, files: items.map((entry) => { const file = entry as FolderEntry; return { name: file.name, path: `${folder.replace(/\/+$/, "")}/${file.name}`, size: file.size, modified: new Date(file.modifiedMs).toISOString() }; }),
    }));
  }

  private mail(routine: Routine, inbox: MailEntry[]) {
    const matching = inbox.filter((mail) => mailMatches(mail, routine.triggerConfig));
    this.step(routine, "mail", matching.map((mail) => ({ key: mail.id, item: mail, signature: mail.id })), (items) => ({ mails: items }));
  }

  /** Baseline, then collect what's new until it has been quiet long enough, then
   * start one run for the batch, within the hourly cap. */
  private step(routine: Routine, source: MacTriggerSource, current: Array<{ key: string; item: FolderEntry | MailEntry; signature: string }>, payload: (items: Array<FolderEntry | MailEntry>) => unknown) {
    const raw = this.deps.cursor.get(routine.id, source);
    if (raw === null) {
      // First look: what's already there never starts a run.
      this.deps.cursor.set(routine.id, source, JSON.stringify(current.map((entry) => entry.key)));
      return;
    }
    const seen = new Set(JSON.parse(raw) as string[]);
    const id = `${routine.id}:${source}`;
    const pending = this.pending.get(id) ?? { items: new Map(), lastChange: this.now };
    for (const entry of current) {
      if (seen.has(entry.key)) continue;
      const known = pending.items.get(entry.key);
      if (known?.signature === entry.signature) continue;
      // New, or still being written (its size or date changed): wait for quiet.
      pending.items.set(entry.key, { item: entry.item, signature: entry.signature });
      pending.lastChange = this.now;
    }
    // Something that disappeared before it settled isn't reported.
    const present = new Set(current.map((entry) => entry.key));
    for (const key of [...pending.items.keys()]) if (!present.has(key)) pending.items.delete(key);
    if (!pending.items.size) { this.pending.delete(id); return; }
    this.pending.set(id, pending);
    if (this.now - pending.lastChange < (this.deps.quietMs ?? 30_000)) return;
    const perHour = this.deps.perHour ?? 6;
    if (this.deps.startedSince(routine.id, this.now - 3_600_000) >= perHour) {
      this.alertOnce(routine, `${routine.name} already ran ${perHour} times this hour. The new ${source === "folder" ? "files" : "mail"} will start one run when the hour allows.`);
      return;
    }
    const order = (item: FolderEntry | MailEntry) => "name" in item ? item.name : item.date;
    const batch = [...pending.items.entries()].sort(([, a], [, b]) => order(a.item).localeCompare(order(b.item)));
    const externalId = createHash("sha256").update(JSON.stringify(batch.map(([key, value]) => [key, value.signature]))).digest("hex").slice(0, 32);
    this.deps.dispatch(routine, source, payload(batch.map(([, value]) => value.item)), externalId);
    for (const [key] of batch) seen.add(key);
    // Forget what's gone, so the record stays small.
    for (const key of [...seen]) if (!present.has(key)) seen.delete(key);
    this.deps.cursor.set(routine.id, source, JSON.stringify([...seen]));
    this.pending.delete(id);
  }

  private alertOnce(routine: Routine, message: string) {
    const last = this.alerted.get(routine.id);
    if (last !== undefined && this.now - last < 3_600_000) return;
    this.alerted.set(routine.id, this.now);
    this.deps.alert(routine, message);
  }
}

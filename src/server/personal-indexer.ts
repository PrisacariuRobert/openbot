import { execFile } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { inspectAttachment } from "./attachments.js";
import { MacMail, MailAccessError } from "./mac-mail-index.js";
import { FullDiskAccessError } from "./imessage-channel.js";
import { ContactNames, readMessageItems } from "./mac-messages-index.js";
import { PersonalIndex, SOURCES, type IndexItem, type SourceKind } from "./personal-index.js";

/** Fills the personal index from the sources the owner switched on, and
 * keeps it fresh. Everything runs on this Mac, one source at a time, yielding
 * between batches so the studio stays responsive. */

const exec = promisify(execFile);
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

export interface IndexerConfig {
  enabled: Record<SourceKind, boolean>;
  folders: string[];
  indexedAt: Partial<Record<SourceKind, string>>;
  problem: Partial<Record<SourceKind, { message: string; needsFullDiskAccess: boolean }>>;
}

export interface SourceStatus { id: SourceKind; enabled: boolean; items: number; newest: string | null; indexedAt: string | null; indexing: boolean; problem: { message: string; needsFullDiskAccess: boolean } | null }
export interface IndexerStatus { sources: SourceStatus[]; folders: string[]; total: number }

const emptyConfig = (): IndexerConfig => ({ enabled: { files: false, notes: false, mail: false, messages: false }, folders: [], indexedAt: {}, problem: {} });

// ---------- Notes ----------

export const NOTES_SCRIPT = `
function run() {
  var app = Application("Notes"), ids = app.notes.id(), names = app.notes.name(), mods = app.notes.modificationDate(), texts = app.notes.plaintext(), folders = [];
  try { folders = app.notes.container().map(function(c){ return String(c.name()); }); } catch (e) {}
  var out = [];
  for (var i = 0; i < ids.length && i < 3000; i++) out.push({ id: String(ids[i]), title: String(names[i] || ""), at: mods[i].toISOString(), text: String(texts[i] || "").slice(0, 40000), folder: folders[i] || "" });
  return JSON.stringify(out);
}`;

export type ScriptRunner = (script: string) => Promise<string>;
const runJxa: ScriptRunner = async (script) => (await exec("/usr/bin/osascript", ["-l", "JavaScript", "-e", script], { timeout: 120_000, maxBuffer: 64 * 1024 * 1024 })).stdout;

export async function readNotes(run: ScriptRunner = runJxa): Promise<IndexItem[]> {
  let raw: string;
  try { raw = await run(NOTES_SCRIPT); }
  catch (error) {
    if (/-1743|not authori[sz]ed|not permitted/i.test(String(error))) throw new Error("Allow OpenBot to use Notes in System Settings → Privacy & Security → Automation, then try again.");
    throw new Error("Notes didn't answer. Open Notes once, then try again.");
  }
  const notes = JSON.parse(raw) as Array<{ id: string; title: string; at: string; text: string; folder: string }>;
  return notes.map((note) => ({ source: "notes" as const, key: note.id, title: note.title, author: note.folder || null, at: note.at, body: note.text, stamp: note.at }));
}

// ---------- Files ----------

const TEXT_EXTENSIONS = new Set([".md", ".markdown", ".txt", ".csv", ".tsv"]);
const DOCUMENT_EXTENSIONS = new Set([".pdf", ".docx", ".pptx", ".xlsx"]);
const SKIP_DIRECTORIES = /^(\.|node_modules$|Library$|__pycache__$|venv$|dist$|build$|target$|Pods$)|\.(app|photoslibrary|xcodeproj|framework)$/i;

export interface FileLimits { files: number; textBytes: number; documentBytes: number }
const defaultLimits: FileLimits = { files: 4_000, textBytes: 1_000_000, documentBytes: 25_000_000 };

export function walkFolder(root: string, limits = defaultLimits): string[] {
  const found: string[] = [], stack = [root];
  while (stack.length && found.length < limits.files) {
    const dir = stack.pop()!;
    let entries: import("node:fs").Dirent[] = [];
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (SKIP_DIRECTORIES.test(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { stack.push(full); continue; }
      const extension = path.extname(entry.name).toLowerCase();
      if (entry.isFile() && (TEXT_EXTENSIONS.has(extension) || DOCUMENT_EXTENSIONS.has(extension))) found.push(full);
      if (found.length >= limits.files) break;
    }
  }
  return found;
}

export async function readFileItem(file: string, limits = defaultLimits): Promise<IndexItem | null> {
  let info;
  try { info = statSync(file); } catch { return null; }
  const extension = path.extname(file).toLowerCase(), isText = TEXT_EXTENSIONS.has(extension);
  if (info.size === 0 || info.size > (isText ? limits.textBytes : limits.documentBytes)) return null;
  let text: string | null = null;
  try {
    if (isText) { const bytes = readFileSync(file); text = bytes.includes(0) ? null : bytes.toString("utf8"); }
    else text = (await inspectAttachment(file, path.basename(file), "")).extractedText;
  } catch { return null; }
  if (!text?.trim()) return null;
  return { source: "files", key: file, title: path.basename(file), author: path.dirname(file), at: info.mtime.toISOString(), body: text, stamp: `${info.mtimeMs}:${info.size}` };
}

// ---------- The orchestrator ----------

export class PersonalIndexer {
  private running = new Map<SourceKind, Promise<void>>();
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly options: {
    index: PersonalIndex;
    load: () => IndexerConfig | null;
    save: (config: IndexerConfig) => void;
    home?: string;
    mail?: MacMail;
    notes?: () => Promise<IndexItem[]>;
    messages?: () => IndexItem[];
    platform?: NodeJS.Platform;
    now?: () => number;
  }) {}

  private get home() { return this.options.home || homedir(); }
  private config(): IndexerConfig { const saved = this.options.load(); return saved ? { ...emptyConfig(), ...saved, enabled: { ...emptyConfig().enabled, ...saved.enabled } } : emptyConfig(); }
  private update(change: (config: IndexerConfig) => void) { const config = this.config(); change(config); this.options.save(config); }

  status(): IndexerStatus {
    const config = this.config(), counts = this.options.index.counts();
    const sources = SOURCES.map((id): SourceStatus => ({ id, enabled: config.enabled[id], items: counts[id].items, newest: counts[id].newest, indexedAt: config.indexedAt[id] || null, indexing: this.running.has(id), problem: config.problem[id] || null }));
    return { sources, folders: config.folders, total: sources.reduce((sum, source) => sum + source.items, 0) };
  }

  anyEnabled() { return Object.values(this.config().enabled).some(Boolean); }

  setEnabled(source: SourceKind, enabled: boolean) {
    if (!SOURCES.includes(source)) throw new Error("That source isn't available.");
    if ((source === "notes" || source === "mail" || source === "messages") && (this.options.platform ?? process.platform) !== "darwin") throw new Error("This source is only on a Mac.");
    this.update((config) => { config.enabled[source] = enabled; if (!enabled) { delete config.problem[source]; delete config.indexedAt[source]; } });
    if (enabled) void this.refresh(source); else this.options.index.clear(source);
  }

  addFolder(folder: string): string[] {
    const resolved = path.resolve(this.home, folder.replace(/^~(?=\/|$)/, this.home));
    if (!resolved.startsWith(this.home + path.sep)) throw new Error("Choose a folder inside your home folder.");
    if (!existsSync(resolved) || !statSync(resolved).isDirectory()) throw new Error("That folder doesn't exist.");
    if (path.relative(this.home, resolved).split(path.sep)[0] === "Library") throw new Error("Library holds app data, not your documents. Choose another folder.");
    this.update((config) => { if (!config.folders.includes(resolved)) config.folders.push(resolved); config.enabled.files = true; });
    void this.refresh("files");
    return this.config().folders;
  }

  removeFolder(folder: string) {
    this.update((config) => { config.folders = config.folders.filter((item) => item !== folder); if (!config.folders.length) config.enabled.files = false; });
    void this.refresh("files");
  }

  /** Forget everything from one source, or all of them. Sources switch off. */
  forget(source?: SourceKind) {
    this.update((config) => { for (const id of source ? [source] : SOURCES) { config.enabled[id] = false; delete config.indexedAt[id]; delete config.problem[id]; if (id === "files" && !source) config.folders = []; } });
    this.options.index.clear(source);
  }

  /** Indexes one source (or every enabled one) and resolves when done. A
   * source already being indexed is waited for, not started twice. */
  async refresh(source?: SourceKind): Promise<void> {
    for (const id of source ? [source] : SOURCES.filter((item) => this.config().enabled[item])) {
      const existing = this.running.get(id);
      if (existing) { await existing; continue; }
      if (!this.config().enabled[id]) continue;
      const job = (async () => {
        try {
          await this.index(id);
          this.update((config) => { config.indexedAt[id] = new Date((this.options.now || Date.now)()).toISOString(); delete config.problem[id]; });
        } catch (error) {
          const message = error instanceof Error ? error.message : "That source couldn't be indexed.";
          this.update((config) => { config.problem[id] = { message, needsFullDiskAccess: error instanceof MailAccessError || error instanceof FullDiskAccessError || /Full Disk Access/i.test(message) }; });
        } finally { this.running.delete(id); }
      })();
      this.running.set(id, job);
      await job;
    }
  }

  private async index(source: SourceKind) {
    const { index } = this.options;
    if (source === "notes") {
      const notes = await (this.options.notes || readNotes)();
      index.upsert(notes);
      index.prune("notes", new Set(notes.map((note) => note.key)));
    } else if (source === "files") {
      const seen = new Set<string>(), batch: IndexItem[] = [];
      let count = 0;
      for (const folder of this.config().folders) {
        for (const file of walkFolder(folder)) {
          seen.add(file);
          let stamp: string | undefined;
          try { const info = statSync(file); stamp = `${info.mtimeMs}:${info.size}`; } catch { continue; }
          if (index.has("files", file, stamp)) continue;
          const item = await readFileItem(file);
          if (item) batch.push(item);
          if (batch.length >= 25) { index.upsert(batch.splice(0)); }
          if (++count % 20 === 0) await tick();
        }
      }
      index.upsert(batch);
      index.prune("files", seen);
    } else if (source === "mail") {
      const mail = this.options.mail || new MacMail();
      const messages = mail.recent(365, 4_000, (id) => index.has("mail", id));
      for (let at = 0; at < messages.length; at += 50) {
        index.upsert(messages.slice(at, at + 50).map((message) => ({ source: "mail" as const, key: message.id, title: message.subject, author: message.from, at: message.date, body: `${message.text}${message.attachments.length ? `\nAttachments: ${message.attachments.map((item) => item.name).join(", ")}` : ""}` })));
        await tick();
      }
    } else if (source === "messages") {
      const items = (this.options.messages || (() => readMessageItems({ days: 365, limit: 60_000, names: ContactNames.load(this.home) })))();
      for (let at = 0; at < items.length; at += 100) { index.upsert(items.slice(at, at + 100)); await tick(); }
      index.prune("messages", new Set(items.map((item) => item.key)));
    }
  }

  /** Re-check enabled sources every few hours while the studio runs. */
  start(everyMs = 6 * 3_600_000) {
    if (this.timer) return;
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), everyMs);
    this.timer.unref();
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
}

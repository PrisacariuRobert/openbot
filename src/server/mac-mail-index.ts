import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

/** Mail on this Mac, read from Mail's own message files. Scripting Mail
 * walks the whole inbox (tens of thousands of messages can take minutes) and
 * Spotlight may not index Mail at all, so OpenBot reads the newest message
 * files directly, within a date window and a fixed cap. Needs Full Disk
 * Access for OpenBot (the same switch iMessage uses). */


export class MailAccessError extends Error {}

export interface MailSummary { id: string; subject: string; from: string; date: string; snippet: string; attachments: { name: string; size: number }[] }
export interface MailMessage extends MailSummary { text: string; truncated: boolean }

// ---------- MIME ----------

type Part = { headers: Map<string, string>; body: Buffer };

function splitHeaders(raw: Buffer): Part {
  let at = raw.indexOf("\r\n\r\n"), gap = 4;
  const lf = raw.indexOf("\n\n");
  if (at < 0 || (lf >= 0 && lf < at)) { at = lf; gap = 2; }
  if (at < 0) return { headers: new Map(), body: raw };
  const headers = new Map<string, string>();
  const lines = raw.subarray(0, at).toString("latin1").replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/);
  for (const line of lines) {
    const colon = line.indexOf(":");
    if (colon > 0) headers.set(line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim());
  }
  return { headers, body: raw.subarray(at + gap) };
}

/** =?utf-8?B?...?= and =?iso-8859-1?Q?...?= words in headers. */
export function decodeWords(value: string): string {
  return value.replace(/=\?([^?]+)\?([bqBQ])\?([^?]*)\?=(\s+(?==\?))?/g, (_all, charset: string, kind: string, data: string) => {
    const bytes = kind.toUpperCase() === "B" ? Buffer.from(data, "base64") : Buffer.from(data.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (_m, hex: string) => String.fromCharCode(parseInt(hex, 16))), "latin1");
    try { return new TextDecoder(charset.toLowerCase().replace(/^utf8$/, "utf-8")).decode(bytes); } catch { return bytes.toString("utf8"); }
  });
}

function param(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  // RFC 2231: filename*=utf-8''name%20with%20spaces (possibly split as *0*, *1*)
  const extended = [...header.matchAll(new RegExp(`${name}\\*(?:(\\d+)\\*?)?=\\s*("?)([^";]*)\\2`, "gi"))];
  if (extended.length) {
    const joined = extended.sort((a, b) => Number(a[1] || 0) - Number(b[1] || 0)).map((match) => match[3]).join("");
    const [, charset = "utf-8", encoded = joined] = /^([^']*)'[^']*'(.*)$/.exec(joined) || [];
    try { return new TextDecoder(charset || "utf-8").decode(Buffer.from(decodeURIComponent(encoded).split("").map((c) => c.charCodeAt(0)))); } catch { return decodeURIComponent(encoded); }
  }
  const plain = new RegExp(`${name}\\s*=\\s*("([^"]*)"|[^;\\s]+)`, "i").exec(header);
  return plain ? decodeWords(plain[2] ?? plain[1]!) : undefined;
}

function decodeBody(part: Part): Buffer {
  const encoding = (part.headers.get("content-transfer-encoding") || "").toLowerCase();
  if (encoding === "base64") return Buffer.from(part.body.toString("latin1").replace(/[^A-Za-z0-9+/=]/g, ""), "base64");
  if (encoding === "quoted-printable") return Buffer.from(part.body.toString("latin1").replace(/=\r?\n/g, "").replace(/=([0-9A-Fa-f]{2})/g, (_m, hex: string) => String.fromCharCode(parseInt(hex, 16))), "latin1");
  return part.body;
}

function textOf(part: Part): string {
  const charset = param(part.headers.get("content-type"), "charset") || "utf-8";
  try { return new TextDecoder(charset.toLowerCase()).decode(decodeBody(part)); } catch { return decodeBody(part).toString("utf8"); }
}

type Leaf = { part: Part; index: string; type: string; filename?: string };

/** Every leaf part with its Mail-style index ("1", "2.1", …). */
export function leaves(part: Part, index = ""): Leaf[] {
  const type = (part.headers.get("content-type") || "text/plain").toLowerCase();
  if (type.startsWith("multipart/")) {
    const boundary = param(part.headers.get("content-type"), "boundary");
    if (!boundary) return [];
    const chunks = part.body.toString("latin1").split(`--${boundary}`).slice(1);
    const out: Leaf[] = [];
    chunks.forEach((chunk, i) => {
      if (chunk.startsWith("--")) return;
      out.push(...leaves(splitHeaders(Buffer.from(chunk.replace(/^\r?\n/, ""), "latin1")), index ? `${index}.${i + 1}` : String(i + 1)));
    });
    return out;
  }
  const filename = param(part.headers.get("content-disposition"), "filename") || param(part.headers.get("content-type"), "name");
  return [{ part, index: index || "1", type, filename }];
}

function htmlToText(html: string): string {
  return html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, "").replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, "\n").replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** An .emlx is "<byte count>\n<RFC 822 message><Apple plist>". */
export function parseEmlx(file: Buffer) {
  const newline = file.indexOf("\n");
  const length = Number(file.subarray(0, newline).toString().trim());
  const raw = Number.isFinite(length) && length > 0 ? file.subarray(newline + 1, newline + 1 + length) : file;
  const root = splitHeaders(raw);
  const parts = leaves(root);
  const plain = parts.find((leaf) => leaf.type.startsWith("text/plain") && !leaf.filename);
  const html = parts.find((leaf) => leaf.type.startsWith("text/html") && !leaf.filename);
  const text = plain ? textOf(plain.part) : html ? htmlToText(textOf(html.part)) : "";
  const attachments = parts.filter((leaf) => leaf.filename).map((leaf) => ({ name: leaf.filename!, index: leaf.index, size: decodeBody(leaf.part).length, part: leaf.part }));
  return {
    subject: decodeWords(root.headers.get("subject") || "(no subject)"),
    from: decodeWords(root.headers.get("from") || ""),
    date: new Date(root.headers.get("date") || 0),
    text,
    attachments,
  };
}

// ---------- Finding files ----------

const idOf = (file: string) => /(\d+)(?:\.partial)?\.emlx$/.exec(file)?.[1] || null;

export class MacMail {
  private readonly known = new Map<string, string>();
  constructor(private readonly home = homedir(), private readonly platform: NodeJS.Platform = process.platform) {}

  private get root() { return path.join(this.home, "Library", "Mail"); }

  private checkAccess() {
    if (this.platform !== "darwin") throw new MailAccessError("Mail is only available when OpenBot runs on a Mac.");
    try { readdirSync(this.root); } catch { throw new MailAccessError("To search your Mail, give OpenBot Full Disk Access: System Settings → Privacy & Security → Full Disk Access → turn on OpenBot. Nothing was read."); }
  }

  /** Every message file, newest first, within the window. Listing and
   * stat-ing tens of thousands of files takes well under a second. */
  private recentFiles(days: number): string[] {
    const since = Date.now() - days * 86_400_000, found: { file: string; at: number }[] = [];
    const stack = [this.root];
    while (stack.length) {
      const dir = stack.pop()!;
      let entries: import("node:fs").Dirent[] = [];
      try { entries = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { if (entry.name !== "MailData" && entry.name !== "Attachments") stack.push(full); continue; }
        if (!entry.name.endsWith(".emlx")) continue;
        try { const at = statSync(full).mtimeMs; if (at >= since) found.push({ file: full, at }); } catch { /* moved */ }
        const id = idOf(entry.name);
        if (id) this.known.set(id, full);
      }
    }
    return found.sort((a, b) => b.at - a.at).map((item) => item.file);
  }

  async search(query: string, days = 60, limit = 6): Promise<{ messages: MailSummary[]; matched: number }> {
    this.checkAccess();
    const words = query.toLowerCase().replace(/["*\\]/g, " ").trim().split(/\s+/).filter((word) => word.length > 1).slice(0, 6);
    if (!words.length) return { messages: [], matched: 0 };
    const files = this.recentFiles(Math.max(1, Math.min(365, days)));
    const messages: MailSummary[] = [];
    let matched = 0, opened = 0;
    for (const file of files) {
      if (opened >= 2_000) break;
      opened += 1;
      const read = this.readFile(file);
      if (!read) continue;
      const haystack = `${read.subject}\n${read.from}\n${read.attachments.map((item) => item.name).join(" ")}\n${read.text.slice(0, 4_000)}`.toLowerCase();
      // Any of the words: "invoice receipt booking" finds each kind.
      if (!words.some((word) => haystack.includes(word))) continue;
      matched += 1;
      const { text, truncated: _truncated, ...summary } = read;
      messages.push({ ...summary, snippet: text.replace(/\s+/g, " ").slice(0, 600) });
      if (messages.length >= limit) break;
    }
    return { messages, matched };
  }

  private findFile(id: string): string | null {
    if (!/^\d{1,15}$/.test(id)) return null;
    const cached = this.known.get(id);
    if (cached && existsSync(cached)) return cached;
    const stack = [this.root];
    // Mail keeps messages at …/<account>/<mailbox>.mbox/<uuid>/Data/<digits>/Messages/<id>.emlx.
    while (stack.length) {
      const dir = stack.pop()!;
      let entries: string[] = [];
      try { entries = readdirSync(dir); } catch { continue; }
      for (const name of entries) {
        if (name === `${id}.emlx` || name === `${id}.partial.emlx`) return path.join(dir, name);
        if (!name.includes(".") || name.endsWith(".mbox") || name.endsWith(".imapmbox")) stack.push(path.join(dir, name));
      }
    }
    return null;
  }

  private readFile(file: string): MailMessage | null {
    try {
      const parsed = parseEmlx(readFileSync(file));
      const id = idOf(file)!;
      this.known.set(id, file);
      const separate = this.separateAttachments(file, id);
      for (const item of parsed.attachments) if (!item.size) item.size = separate.find((copy) => copy.name === item.name)?.size ?? 0;
      const extra = separate.filter((item) => !parsed.attachments.some((known) => known.name === item.name));
      return {
        id, subject: parsed.subject.slice(0, 300), from: parsed.from.slice(0, 300), date: (Number.isFinite(parsed.date.getTime()) ? parsed.date : new Date(statSync(file).mtimeMs)).toISOString(),
        snippet: "", text: parsed.text.slice(0, 20_000), truncated: parsed.text.length > 20_000,
        attachments: [...parsed.attachments.map(({ name, size }) => ({ name: name.slice(0, 300), size })), ...extra.map(({ name, size }) => ({ name, size }))].slice(0, 20),
      };
    } catch { return null; }
  }

  /** Partially downloaded messages keep attachments beside the mailbox:
   * …/<uuid>/Data/Attachments/<id>/<part>/<filename>. */
  private separateAttachments(file: string, id: string): { name: string; size: number; path: string }[] {
    const data = path.resolve(path.dirname(file), "..");
    const candidates = [path.join(data, "Attachments", id), path.join(path.resolve(data, ".."), "Attachments", id)];
    const out: { name: string; size: number; path: string }[] = [];
    for (const base of candidates) {
      if (!existsSync(base)) continue;
      for (const partDir of readdirSync(base)) {
        const dir = path.join(base, partDir);
        try { for (const name of readdirSync(dir)) { const full = path.join(dir, name); const info = statSync(full); if (info.isFile()) out.push({ name, size: info.size, path: full }); } } catch { /* not a folder */ }
      }
    }
    return out;
  }

  read(id: string): MailMessage {
    this.checkAccess();
    const file = this.findFile(id);
    const message = file ? this.readFile(file) : null;
    if (!message) throw new Error("That email isn't on this Mac anymore. Search again.");
    return message;
  }

  /** The attachment's bytes, from the message itself or Mail's attachment folder. */
  attachment(id: string, name: string): Buffer {
    this.checkAccess();
    const file = this.findFile(id);
    if (!file) throw new Error("That email isn't on this Mac anymore. Search again. Nothing was saved.");
    const parsed = parseEmlx(readFileSync(file));
    // A partly downloaded message keeps an empty placeholder part; the real
    // bytes then live in Mail's Attachments folder.
    const inline = parsed.attachments.find((item) => item.name === name && item.size > 0);
    if (inline) return decodeBody(inline.part);
    const separate = this.separateAttachments(file, id).find((item) => item.name === name && item.size > 0);
    if (separate) return readFileSync(separate.path);
    if (parsed.attachments.some((item) => item.name === name)) throw new Error("That attachment hasn't been downloaded to this Mac yet. Open the email in Mail once so it downloads, then try again. Nothing was saved.");
    const names = [...parsed.attachments.map((item) => item.name), ...this.separateAttachments(file, id).map((item) => item.name)];
    throw new Error(names.length ? `That email has no attachment called “${name}”. Its attachments: ${names.join(", ")}.` : "That attachment hasn't been downloaded to this Mac yet. Open the email in Mail once, then try again. Nothing was saved.");
  }
}

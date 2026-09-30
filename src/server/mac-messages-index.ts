import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { FullDiskAccessError, textFromAttributedBody } from "./imessage-channel.js";
import type { IndexItem } from "./personal-index.js";

/** Your Messages, for the personal index. Texts are read from the Messages
 * database (read-only) and grouped into one item per conversation per day, so
 * a search finds the exchange, not a single line without context. Phone
 * numbers and emails are turned back into the names in Contacts, so "Anna"
 * finds what Anna wrote. Needs Full Disk Access, like Mail. */

const APPLE_EPOCH = 978_307_200;

/** Contacts by phone number (last nine digits) and email address. */
export class ContactNames {
  private readonly byKey = new Map<string, string>();

  static load(home = homedir()): ContactNames {
    const names = new ContactNames();
    const root = path.join(home, "Library", "Application Support", "AddressBook");
    const files: string[] = [];
    try {
      if (existsSync(path.join(root, "AddressBook-v22.abcddb"))) files.push(path.join(root, "AddressBook-v22.abcddb"));
      const sources = path.join(root, "Sources");
      for (const entry of existsSync(sources) ? readdirSync(sources) : []) if (existsSync(path.join(sources, entry, "AddressBook-v22.abcddb"))) files.push(path.join(sources, entry, "AddressBook-v22.abcddb"));
    } catch { return names; }
    for (const file of files) {
      try {
        const db = new DatabaseSync(file, { readOnly: true });
        try {
          const label = (row: Record<string, unknown>) => [row.first, row.last].filter(Boolean).join(" ").trim() || String(row.org || "").trim();
          for (const row of db.prepare("SELECT r.ZFIRSTNAME AS first, r.ZLASTNAME AS last, r.ZORGANIZATION AS org, p.ZFULLNUMBER AS value FROM ZABCDPHONENUMBER p JOIN ZABCDRECORD r ON r.Z_PK = p.ZOWNER WHERE p.ZFULLNUMBER IS NOT NULL").all() as Array<Record<string, unknown>>) names.add(String(row.value), label(row));
          for (const row of db.prepare("SELECT r.ZFIRSTNAME AS first, r.ZLASTNAME AS last, r.ZORGANIZATION AS org, e.ZADDRESS AS value FROM ZABCDEMAILADDRESS e JOIN ZABCDRECORD r ON r.Z_PK = e.ZOWNER WHERE e.ZADDRESS IS NOT NULL").all() as Array<Record<string, unknown>>) names.add(String(row.value), label(row));
        } finally { db.close(); }
      } catch { /* an unreadable address book just means fewer names */ }
    }
    return names;
  }

  static key(handle: string): string | null {
    const value = handle.trim();
    if (!value) return null;
    if (value.includes("@")) return value.toLowerCase();
    const digits = value.replace(/\D/g, "");
    return digits.length >= 6 ? digits.slice(-9) : null;
  }

  add(handle: string, name: string) { const key = ContactNames.key(handle); if (key && name && !this.byKey.has(key)) this.byKey.set(key, name); }
  lookup(handle: string | null): string | null { const key = handle ? ContactNames.key(handle) : null; return key ? this.byKey.get(key) ?? null : null; }
  get size() { return this.byKey.size; }
}

export interface MessageReadOptions { file?: string; days: number; limit: number; names?: ContactNames; now?: number }

function open(file: string) {
  try { return new DatabaseSync(file, { readOnly: true }); }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/authorization denied|not authorized|operation not permitted|unable to open/i.test(message)) throw new FullDiskAccessError("To search your Messages, give OpenBot Full Disk Access: System Settings → Privacy & Security → Full Disk Access → turn on OpenBot. Nothing was read.");
    throw error;
  }
}

const dayOf = (seconds: number) => new Date(seconds * 1000).toLocaleDateString("en-CA");
const clock = (seconds: number) => new Date(seconds * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

export function readMessageItems(options: MessageReadOptions): IndexItem[] {
  const file = options.file || path.join(homedir(), "Library", "Messages", "chat.db");
  const since = Math.floor((options.now ?? Date.now()) / 1000 - options.days * 86_400 - APPLE_EPOCH);
  const db = open(file);
  let rows: Array<Record<string, unknown>>;
  try {
    // Modern Messages stores nanoseconds since 2001 (about 8e17), too large for a
    // JavaScript number: convert to seconds inside the query.
    rows = db.prepare(`SELECT m.ROWID AS id, m.text AS text, m.attributedBody AS body,
        CASE WHEN m.date > 1000000000000 THEN m.date / 1000000000 ELSE m.date END AS date, m.is_from_me AS fromMe, h.id AS handle,
        c.chat_identifier AS chat, c.display_name AS chatName
      FROM message m LEFT JOIN handle h ON h.ROWID = m.handle_id
      LEFT JOIN chat_message_join cmj ON cmj.message_id = m.ROWID LEFT JOIN chat c ON c.ROWID = cmj.chat_id
      WHERE m.item_type = 0 AND (CASE WHEN m.date > 1000000000000 THEN m.date / 1000000000 ELSE m.date END) >= ? ORDER BY m.date ASC LIMIT ?`).all(since, options.limit) as Array<Record<string, unknown>>;
  } finally { db.close(); }

  const names = options.names;
  const who = (handle: string | null) => (handle && names?.lookup(handle)) || handle || "Unknown";
  const groups = new Map<string, { chat: string; label: string; day: string; people: Set<string>; lines: string[]; lastAt: number; count: number }>();
  for (const row of rows) {
    const text = (row.text == null ? null : String(row.text)) ?? textFromAttributedBody(row.body instanceof Uint8Array ? row.body : null);
    const cleaned = text?.replace(/￼/g, "").trim();
    if (!cleaned) continue;
    const seconds = Number(row.date) + APPLE_EPOCH;
    const handle = row.handle == null ? null : String(row.handle), chat = String(row.chat || handle || "unknown");
    const day = dayOf(seconds), key = `${chat}|${day}`;
    const group = groups.get(key) || { chat, label: "", day, people: new Set<string>(), lines: [], lastAt: 0, count: 0 };
    const fromMe = Number(row.fromMe) === 1;
    const person = fromMe ? "Me" : who(handle);
    if (!fromMe) group.people.add(person);
    const chatName = row.chatName ? String(row.chatName).trim() : "";
    group.label = chatName || (group.people.size ? [...group.people].slice(0, 3).join(", ") : who(handle));
    group.lines.push(`[${clock(seconds)}] ${person}: ${cleaned}`);
    group.lastAt = Math.max(group.lastAt, seconds); group.count += 1;
    groups.set(key, group);
  }
  return [...groups.entries()].map(([key, group]): IndexItem => ({
    source: "messages", key, title: `Messages with ${group.label || "someone"} · ${group.day}`, author: [...group.people].join(", ") || null,
    at: new Date(group.lastAt * 1000).toISOString(), body: group.lines.join("\n"), stamp: String(group.count),
  }));
}

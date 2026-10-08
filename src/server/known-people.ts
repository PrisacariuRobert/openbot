import type { OpenBotDatabase } from "./database.js";

/** Known people (task T1, kept for AU2 and F4): the first message to anyone else
 * always asks. Known means the owner wrote to them (a send the owner approved, or
 * Gmail's Sent folder) or saved them in Contacts. Someone who only wrote to the
 * owner stays new until the owner replies once, so a stranger can't write their
 * way into autonomous replies. Positive checks are remembered; negative ones aren't,
 * since anyone can become known. */

type Db = Pick<OpenBotDatabase, "isKnownPerson" | "rememberKnownPerson">;

export interface KnownPeopleSources {
  /** Mac Contacts, by normalized key (needs Full Disk Access; absent elsewhere). */
  contacts?: (key: string) => boolean;
  /** Whether the owner's Sent mail has a message to this address. */
  sentMail?: (address: string) => Promise<boolean>;
}

/** An email address (from "Name <a@b>" too), lowercased; a phone number by its last
 * nine digits, matching how Contacts are keyed. */
export function personKey(handle: string): string | null {
  const value = handle.trim(), email = /<([^<>\s]+@[^<>\s]+)>/.exec(value)?.[1] ?? value;
  if (email.includes("@")) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email.toLowerCase() : null;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 6 ? digits.slice(-9) : null;
}

/** Who a mediated send reaches, from the arguments the owner reviews. */
export function recipientsOf(action: string, args: Record<string, unknown>): string[] {
  const list = (value: unknown) => (Array.isArray(value) ? value.map(String) : String(value ?? "").split(/[,;]/)).map((item) => item.trim()).filter(Boolean);
  if (action === "gmail_send") return [...list(args.to), ...list(args.cc), ...list(args.bcc)];
  if (action === "gmail_reply") return list(args.to);
  if (action === "google_calendar_create") return list(args.attendees);
  return [];
}

/** The recipients who aren't known. An unreadable handle counts as unknown. */
export async function unknownRecipients(db: Db, handles: string[], sources: KnownPeopleSources = {}): Promise<string[]> {
  const unknown: string[] = [];
  for (const handle of handles) {
    const key = personKey(handle);
    if (!key) { unknown.push(handle); continue; }
    if (db.isKnownPerson(key)) continue;
    if (sources.contacts?.(key)) { db.rememberKnownPerson(key, "contacts"); continue; }
    if (key.includes("@") && sources.sentMail && await sources.sentMail(key).catch(() => false)) { db.rememberKnownPerson(key, "sent"); continue; }
    unknown.push(key);
  }
  return unknown;
}

/** After a send the owner approved goes out, its recipients are known. */
export function rememberRecipients(db: Db, action: string, args: Record<string, unknown>) {
  for (const handle of recipientsOf(action, args)) {
    const key = personKey(handle);
    if (key) db.rememberKnownPerson(key, "owner");
  }
}

/** Task F3: Private mode's placeholders. Before text reaches a cloud AI,
 * personal details become stable placeholders such as [EMAIL_1] and
 * [NAME_2]; the answer, and anything the teammate asks Sidemates to do, gets
 * the real values back on this Mac.
 *
 * Email addresses, phone numbers, IBANs and long numbers (cards, accounts)
 * are found by pattern. Names are found only where a name can be recognised:
 * a display name next to an email address, a From/To line, a greeting or a
 * sign-off, a contact record, or the owner's own list. A name mentioned in
 * passing is not caught; the studio says so. */
import { PERSONAL_PATTERNS } from "./redact.js";

export type MaskKind = "name" | "email" | "phone" | "iban" | "number";
export const MASK_KINDS: readonly MaskKind[] = ["name", "email", "phone", "iban", "number"];
export interface MaskEntry { kind: MaskKind; value: string; token: string }
export interface MaskVault { entries: MaskEntry[]; next: Partial<Record<MaskKind, number>> }
export type MaskCounts = Record<MaskKind, number>;

const LABEL: Record<MaskKind, string> = { name: "NAME", email: "EMAIL", phone: "PHONE", iban: "IBAN", number: "NUMBER" };
const TOKEN = /\[(NAME|EMAIL|PHONE|IBAN|NUMBER)_(\d{1,6})(?:_(FIRST|LAST))?\]/g;

export function emptyVault(): MaskVault { return { entries: [], next: {} }; }
export function zeroCounts(): MaskCounts { return { name: 0, email: 0, phone: 0, iban: 0, number: 0 }; }
export function addCounts(into: MaskCounts, more: MaskCounts): MaskCounts {
  for (const kind of MASK_KINDS) into[kind] += more[kind];
  return into;
}
export function countTotal(counts: MaskCounts): number { return MASK_KINDS.reduce((sum, kind) => sum + counts[kind], 0); }

/** "2 names, 1 email address" */
export function describeCounts(counts: MaskCounts): string {
  const words: Record<MaskKind, [string, string]> = { name: ["name", "names"], email: ["email address", "email addresses"], phone: ["phone number", "phone numbers"], iban: ["IBAN", "IBANs"], number: ["long number", "long numbers"] };
  return MASK_KINDS.filter((kind) => counts[kind]).map((kind) => `${counts[kind]} ${words[kind][counts[kind] === 1 ? 0 : 1]}`).join(", ");
}

// ---- Names -----------------------------------------------------------------

const WORD = "[\\p{Lu}][\\p{Ll}\\p{M}'’]+(?:-[\\p{Lu}][\\p{Ll}\\p{M}'’]+)?";
const PARTICLE = "(?:van|von|de|da|di|del|der|du|la|le|ter|ten|bin|al)";
const NAME = `${WORD}(?:[ \\t]+(?:${PARTICLE}[ \\t]+){0,2}${WORD}){0,3}`;
const EMAIL_SOURCE = PERSONAL_PATTERNS.email.source;
const NAME_BEFORE_EMAIL = new RegExp(`(?:"(${NAME})"|(${NAME}))[ \\t]*<[ \\t]*${EMAIL_SOURCE}[ \\t]*>`, "gu");
const HEADER_LINE = new RegExp(`^[ \\t]*(?:[Ff]rom|[Tt]o|[Cc]c|[Bb]cc|[Rr]eply-[Tt]o|[Ss]ender|[Oo]rganizer|[Aa]ttendees?)[ \\t]*:[ \\t]*"?(${NAME})"?[ \\t]*(?:<|,|$)`, "gmu");
const GREETING = new RegExp(`^[ \\t]*(?:Hi|Hello|Hey|Dear|Hallo|Liebe|Lieber|Bonjour|Hola|Ciao|Hej)[ \\t]+(${NAME})[ \\t]*[,!:]`, "gmu");
const SIGN_OFF = new RegExp(`^[ \\t]*(?:Best|Best regards|Kind regards|Regards|Warm regards|Many thanks|Thanks|Thank you|Cheers|Sincerely|Yours|Warmly|Viele Grüße|Beste Grüße|Liebe Grüße|Cordialement|Saludos|Grazie)[ \\t]*[,!.]?[ \\t]*\\r?\\n(?:[ \\t]*\\r?\\n)?[ \\t]*(${NAME})[ \\t]*$`, "gmu");
const WHOLE_NAME = new RegExp(`^${NAME}$`, "u");

/** Words that make a "name" an organisation or a mailbox, never a person. */
const NOT_A_PERSON = new Set("Team Teams Support Service Services Customer Customers Client Clients Billing Account Accounts Notifications Notification Newsletter Info Admin Sales Help Desk Store Shop News Updates Update Calendar Mail Google Apple Microsoft Amazon GitHub Slack Notion Inc Ltd LLC GmbH Sidemates OpenBot All Everyone There Sir Madam Friend Friends Folks Noreply Reply The Your Our Hello Hi Dear Thanks Thank Best Regards Kind Cheers Sincerely Office Bank Hotel Restaurant Department University School Group Committee Board Security Alerts Alert Receipts Orders Order Delivery Shipping Daily Weekly Digest Invoice Invoices Payments Payment Travel Events Community Marketing Partners Careers Jobs Hiring Press Media Legal Privacy Accounting Finance Operations Bot Assistant".split(" "));
/** Words that start a request or a sentence, never a name. */
const LEADING_WORDS = new Set("Ask Tell Send Email Mail Call Write Reply Remind Draft Book Find Check Meet Thank Invite Please Message Text Schedule Let Can Could Would Should Will Did Does Is Are Was The A An My Our Your His Her Their This That These Those Hi Hey Dear Hello When Where What Who Why How If And But Or So Then Also Only Today Tomorrow Yesterday Forward Add Move Cancel Pay Buy Order Get Give Show Look Search Read Open Plan Prepare Summarize Summarise Compare Help Make Set Note Save With For From To At On In About Before After Since Until".split(" "));
/** First names that are also ordinary words: masked only as part of a full name. */
const ORDINARY_WORDS = new Set("Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February March April May June July August September October November December Will Mark Bill Grace Rose Hope Joy Faith Art Max Sun Summer Autumn Winter Spring Page Hunter Rich Dean Frank Pat Sue Ray Rob Jack Sky Star Dawn Eve Ivy Lily Iris Amber Ruby Pearl Crystal Destiny Honey Angel Cherry Hazel Holly Jade Violet Willow Lane Chase Miles Reed Wade Gene Don Guy Earl Major Royal".split(" "));

function looksLikePerson(candidate: string): boolean {
  const words = candidate.split(/[ \t]+/).filter((word) => !new RegExp(`^${PARTICLE}$`, "u").test(word));
  if (!words.length || words.length > 4 || words.some((word) => NOT_A_PERSON.has(word))) return false;
  if (words.length === 1 && (ORDINARY_WORDS.has(words[0]!) || words[0]!.length < 3)) return false;
  return words.every((word) => word.length >= 2 && word.length <= 30);
}

/** Names this text itself shows to be names. */
export function namesIn(text: string): string[] {
  const found = new Set<string>();
  const take = (value: string | undefined) => { const name = value?.trim().replace(/\s+/g, " "); if (name && looksLikePerson(name)) found.add(name); };
  for (const match of text.matchAll(NAME_BEFORE_EMAIL)) take(match[1] || match[2]);
  for (const pattern of [HEADER_LINE, GREETING, SIGN_OFF]) for (const match of text.matchAll(pattern)) take(match[1]);
  return [...found];
}

const FULL_NAME = new RegExp(`(?<![\\p{L}\\p{N}_])${WORD}(?:[ \\t]+(?:${PARTICLE}[ \\t]+){0,2}${WORD}){1,3}(?![\\p{L}\\p{N}_])`, "gu");

/** In the owner's own words (requests and saved memories), any first-and-last
 * name: two to four capitalised words. Some places and titles are caught too;
 * they come back unchanged in the answer, so that costs little. */
export function fullNamesIn(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(FULL_NAME)) {
    const words = match[0].split(/\s+/);
    // "Ask Jane Doe", "Tell Anna Berg": a capitalised verb or word that starts a sentence isn't part of the name.
    if (LEADING_WORDS.has(words[0]!)) words.shift();
    const name = words.join(" ");
    if (words.filter((word) => !new RegExp(`^${PARTICLE}$`, "u").test(word)).length >= 2 && looksLikePerson(name)) found.add(name);
  }
  return [...found];
}

const PERSON_KEYS = /^(?:from|to|sender|fromName|from_name|senderName|sender_name|displayName|display_name|fullName|full_name|firstName|first_name|lastName|last_name|organizer|attendee|author|recipient|contact|person|owner)$/i;
const CONTACT_FIELDS = /^(?:email|emails|address|phone|phones|mobile|handle)$/i;

/** Names in a record: a sender or contact field, or "name" beside an email or phone. */
function namesInRecord(record: Record<string, unknown>): string[] {
  const found: string[] = [];
  const contactLike = Object.keys(record).some((key) => CONTACT_FIELDS.test(key));
  for (const [key, value] of Object.entries(record)) {
    if (typeof value !== "string" || value.length > 120) continue;
    const plain = value.replace(/[ \t]*<[^>]*>[ \t]*$/, "").replace(/^"|"$/g, "").trim();
    if ((PERSON_KEYS.test(key) || (contactLike && /^name$/i.test(key))) && WHOLE_NAME.test(plain) && looksLikePerson(plain)) found.push(plain);
  }
  return found;
}

// ---- The vault -------------------------------------------------------------

function keyOf(kind: MaskKind, value: string): string {
  if (kind === "email") return value.toLowerCase();
  if (kind === "phone" || kind === "number") return value.replace(/\D/g, "");
  if (kind === "iban") return value.replace(/\s/g, "").toUpperCase();
  return value.replace(/\s+/g, " ");
}

class Book {
  private readonly byKey = new Map<string, MaskEntry>();
  private readonly byToken = new Map<string, MaskEntry>();
  changed = false;
  constructor(readonly vault: MaskVault) {
    for (const entry of vault.entries) { this.byKey.set(`${entry.kind}:${keyOf(entry.kind, entry.value)}`, entry); this.byToken.set(entry.token, entry); }
  }
  find(kind: MaskKind, value: string): MaskEntry | undefined { return this.byKey.get(`${kind}:${keyOf(kind, value)}`); }
  token(kind: MaskKind, value: string, token?: string): string {
    const existing = this.find(kind, value);
    if (existing) return existing.token;
    let made = token;
    if (!made) {
      const number = (this.vault.next[kind] ?? 0) + 1;
      this.vault.next[kind] = number;
      made = `[${LABEL[kind]}_${number}]`;
    }
    const entry = { kind, value, token: made };
    this.vault.entries.push(entry);
    this.byKey.set(`${kind}:${keyOf(kind, value)}`, entry);
    this.byToken.set(made, entry);
    this.changed = true;
    return made;
  }
  /** A full name, plus its first and last names on their own when they aren't ordinary words. */
  learnName(name: string) {
    if (this.find("name", name)) return;
    const token = this.token("name", name);
    const words = name.split(" ").filter((word) => !new RegExp(`^${PARTICLE}$`, "u").test(word));
    if (words.length < 2) return;
    const base = token.slice(0, -1);
    const first = words[0]!, last = words[words.length - 1]!;
    if (!ORDINARY_WORDS.has(first) && first.length >= 3 && !this.find("name", first)) this.token("name", first, `${base}_FIRST]`);
    if (!ORDINARY_WORDS.has(last) && last.length >= 3 && !this.find("name", last)) this.token("name", last, `${base}_LAST]`);
  }
  value(token: string): string | undefined { return this.byToken.get(token)?.value; }
  names(): MaskEntry[] { return this.vault.entries.filter((entry) => entry.kind === "name"); }
}

function escapeRegExp(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function maskWith(book: Book, input: string, counts: MaskCounts): string {
  if (!input) return input;
  for (const name of namesIn(input)) book.learnName(name);
  const { email, iban, phone, longNumber, date } = PERSONAL_PATTERNS;
  let text = input.replace(new RegExp(email.source, "g"), (match) => (counts.email += 1, book.token("email", match)));
  text = text.replace(new RegExp(iban.source, "g"), (match) => (match.replace(/\s/g, "").length >= 15 ? (counts.iban += 1, book.token("iban", match)) : match));
  text = text.replace(new RegExp(phone.source, "g"), (match) => (match.replace(/\D/g, "").length >= 8 && !date.test(match) ? (counts.phone += 1, book.token("phone", match)) : match));
  text = text.replace(new RegExp(longNumber.source, "g"), (match) => { const digits = match.replace(/\D/g, ""); return digits.length >= 13 && digits.length <= 19 ? (counts.number += 1, book.token("number", match)) : match; });
  const present = book.names().filter((entry) => text.includes(entry.value)).sort((a, b) => b.value.length - a.value.length);
  if (present.length) {
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${present.map((entry) => escapeRegExp(entry.value)).join("|")})(?![\\p{L}\\p{N}_])`, "gu");
    text = text.replace(pattern, (match) => (counts.name += 1, book.find("name", match)?.token ?? match));
  }
  return text;
}

function learnExtra(book: Book, names: readonly string[]) {
  for (const raw of names) { const name = raw.trim().replace(/\s+/g, " "); if (name.length >= 2 && name.length <= 80) book.learnName(name); }
}

/** Teaches the vault names from the owner's own words, so they are masked wherever they appear. */
export function learnNames(vault: MaskVault, names: readonly string[]): boolean {
  const book = new Book(vault);
  learnExtra(book, names);
  return book.changed;
}

/** Masks one text. `vault` is updated in place; `changed` says whether it needs saving. */
export function maskText(text: string, vault: MaskVault, names: readonly string[] = []): { text: string; counts: MaskCounts; changed: boolean } {
  const book = new Book(vault), counts = zeroCounts();
  learnExtra(book, names);
  return { text: maskWith(book, text, counts), counts, changed: book.changed };
}

const BINARY = /^[A-Za-z0-9+/=\r\n]{400,}$/;

/** Masks every string in a value (a tool's JSON answer), learning names from its records first. */
export function maskValue<T>(value: T, vault: MaskVault, names: readonly string[] = []): { value: T; counts: MaskCounts; changed: boolean } {
  const book = new Book(vault), counts = zeroCounts();
  learnExtra(book, names);
  const learn = (node: unknown, depth: number) => {
    if (depth > 40 || !node || typeof node !== "object") return;
    if (Array.isArray(node)) { for (const item of node) learn(item, depth + 1); return; }
    for (const name of namesInRecord(node as Record<string, unknown>)) book.learnName(name);
    for (const child of Object.values(node as Record<string, unknown>)) learn(child, depth + 1);
  };
  learn(value, 0);
  const walk = (node: unknown, depth: number): unknown => {
    if (typeof node === "string") return BINARY.test(node) ? node : maskWith(book, node, counts);
    if (depth > 40 || !node || typeof node !== "object") return node;
    if (Array.isArray(node)) return node.map((item) => walk(item, depth + 1));
    return Object.fromEntries(Object.entries(node as Record<string, unknown>).map(([key, child]) => [key, walk(child, depth + 1)]));
  };
  return { value: walk(value, 0) as T, counts, changed: book.changed };
}

/** Puts the real values back. Placeholders the vault doesn't know stay as they are. */
function unmaskWith(book: Book, text: string): string {
  return !text || !text.includes("[") ? text : text.replace(TOKEN, (token) => book.value(token) ?? token);
}

export function unmaskText(text: string, vault: MaskVault): string { return unmaskWith(new Book(vault), text); }

export function unmaskValue<T>(value: T, vault: MaskVault): T {
  const book = new Book(vault);
  const walk = (node: unknown, depth: number): unknown => {
    if (typeof node === "string") return unmaskWith(book, node);
    if (depth > 40 || !node || typeof node !== "object") return node;
    if (Array.isArray(node)) return node.map((item) => walk(item, depth + 1));
    return Object.fromEntries(Object.entries(node as Record<string, unknown>).map(([key, child]) => [key, walk(child, depth + 1)]));
  };
  return walk(value, 0) as T;
}

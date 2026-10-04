import { z } from "zod";
import type { OpenBotDatabase, QueueItemRecord, QueueRuleRecord } from "./database.js";
import { emailAddresses } from "./queue-grounding.js";
import { describeAppleChange, eventCreateInput, mailDraftInput, mailSaveAttachmentInput, reminderCreateInput } from "./mac-apple-apps.js";

/** "Waiting for you": things a teammate prepared that a person approves, skips
 * or undoes. A card holds a typed action, validated by the same schemas as the
 * Apple-app tools. Proposing never runs anything, approving runs fixed scripts,
 * and every change keeps what it needs to be undone. Nothing is ever sent. */

/** What a teammate is told about the four kinds of card. Shared by the morning brief and the first-run scan.
 * Kept free of words that would hold an unattended run for approval. */
export const QUEUE_CARD_GUIDE = `- reminder, for something with a due date (a bill, a form, an appointment to book). Give the due date and time with my timezone offset.
- calendar_event, for an invitation or a dated plan. Give the start and end.
- reply_draft, for a short answer that someone is waiting for. Write it in my voice, brief and polite. It goes only to the sender and is saved as a draft that I open myself.
- file_attachment, for an invoice or receipt attached to an email. Use the folder Documents/Receipts/<year>-<month>. Also give vendor, amount (plain, like 1240.50), currency (like EUR), invoiceDate (2026-10-09) and reference when the email says them; leave out whatever it doesn't, never guess.`;

/** "Look at my last few days": the same cards as the morning review, on request, so the list is useful
 * on the first day instead of the next morning. */
export function queueScanPrompt(): string {
  return `Look through my mail from the last three days, read and unread, and prepare cards for me. Only look things up; don't change anything.

List the recent mail with the mail tools and read the ones that look like they need me. Skip newsletters and automatic notifications. Then, if you have queue_propose, prepare at most six cards, usually one per email (an invoice with a due date may get two: a reminder and a file card), the most useful first. Each card needs a short title and one plain line saying why. Kinds:
${QUEUE_CARD_GUIDE}
Skip anything that doesn't need me. A card runs nothing: I decide each one. Finish with one sentence saying how many cards you prepared; I will find them under "Waiting for you" in the sidebar.`;
}

export const QUEUE_CARDS_PER_DAY = 8;
export const QUEUE_CARD_DAYS = 7;
export const QUEUE_UNDO_DAYS = 7;
/** Earned trust: after this many approvals in a row of one narrow pattern, offer to do it automatically. */
export const QUEUE_OFFER_AFTER = 5;
/** Even with a rule, no more than this many things happen on their own in a day; the rest wait as cards. */
export const QUEUE_AUTO_PER_DAY = 20;

const line = (max: number) => z.string().trim().min(1).max(max);
const common = { title: line(120), why: line(240), sourceKey: line(200) };

/** What a filed invoice or receipt says about itself, for the accountant's list. Everything is optional:
 * leave it out rather than guess. The amount is written plainly (1240.50, no thousands separator). */
export const receiptDetails = z.object({
  vendor: line(80).optional(),
  amount: z.string().trim().regex(/^\d{1,9}(?:[.,]\d{1,2})?$/, "write the amount plainly, like 1240.50").optional(),
  currency: z.string().trim().regex(/^[A-Z]{3}$/, "use a three-letter currency code like EUR").optional(),
  invoiceDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "use a date like 2026-10-09").optional(),
  reference: line(60).optional(),
}).strict().refine((receipt) => !receipt.amount || Boolean(receipt.currency), { message: "give the currency with the amount", path: ["currency"] });
export type ReceiptDetails = z.infer<typeof receiptDetails>;

export const queueProposalInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("reminder"), ...common, action: reminderCreateInput }).strict(),
  z.object({ kind: z.literal("calendar_event"), ...common, action: eventCreateInput }).strict(),
  z.object({ kind: z.literal("reply_draft"), ...common, action: mailDraftInput }).strict(),
  z.object({ kind: z.literal("file_attachment"), ...common, action: mailSaveAttachmentInput, receipt: receiptDetails.optional() }).strict(),
]);
export type QueueProposal = z.infer<typeof queueProposalInput>;
export type QueueKind = QueueProposal["kind"];

/** What the queue needs from the Mac. AppleApps implements it; tests use a fake. */
export interface QueueExecutor {
  createReminder(input: z.input<typeof reminderCreateInput>): Promise<{ id: string; list: string; title: string; due: string | null }>;
  deleteReminder(id: string): Promise<void>;
  createEvent(input: z.input<typeof eventCreateInput>): Promise<{ id: string; calendar: string; title: string }>;
  deleteEvent(id: string, calendar?: string): Promise<void>;
  saveMailDraft(input: z.input<typeof mailDraftInput>): Promise<{ saved: true; subject: string; at: string }>;
  deleteMailDraft(ref: { subject: string; at: string }): Promise<void>;
  saveMailAttachment(input: z.input<typeof mailSaveAttachmentInput>): Promise<{ saved: string; bytes: number }>;
  trashFile(filePath: string): Promise<void>;
}

export class QueueError extends Error {
  constructor(message: string, readonly code: "not_found" | "already_handled" | "failed" | "too_old" = "failed") { super(message); }
}

/** Only these kinds can ever become automatic. Replies are drafts a person always looks at. */
const AUTO_KINDS: ReadonlySet<string> = new Set(["reminder", "calendar_event", "file_attachment"]);
const FREE_MAIL = new Set(["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "yahoo.com", "icloud.com", "me.com", "proton.me", "protonmail.com", "aol.com", "gmx.com", "yandex.com"]);

/** Who a card is about: the company domain, or the whole address for a personal mailbox, so "gmail.com"
 * never means "anyone". */
export function senderKey(from: string): string | null {
  const address = emailAddresses(from)[0];
  if (!address) return null;
  const domain = address.split("@")[1]!;
  return (FREE_MAIL.has(domain) ? address : domain).replace(/\|/g, "");
}

const keyPart = (value: string | undefined, fallback: string) => (value ?? "").trim().replace(/\|/g, "") || fallback;
/** "Documents/Receipts/2026-10" and "Documents/Receipts/2026-11" are the same place for trust purposes. */
const folderKey = (folder: string) => folder.trim().replace(/^\/+|\/+$/g, "").replace(/\|/g, "").replace(/\b(?:19|20)\d{2}[-_/ ]?(?:0[1-9]|1[0-2])\b/g, "YYYY-MM").replace(/\b(?:19|20)\d{2}\b/g, "YYYY");

/** The narrow kind of thing a card is, or null when it can never be automatic. */
export function queuePattern(proposal: QueueProposal, from: string | null | undefined): string | null {
  if (!AUTO_KINDS.has(proposal.kind) || !from) return null;
  const sender = senderKey(from);
  if (!sender) return null;
  if (proposal.kind === "reminder") return `reminder|${sender}|${keyPart(proposal.action.list, "default")}`;
  if (proposal.kind === "calendar_event") return `calendar_event|${sender}|${keyPart(proposal.action.calendar, "default")}`;
  if (proposal.kind === "file_attachment") return `file_attachment|${sender}|${folderKey(proposal.action.folder)}`;
  return null;
}

/** The same pattern in plain words for the offer and the rules list. */
export function patternLabel(pattern: string): string {
  const [kind, sender, target] = pattern.split("|");
  const where = target && target !== "default" ? target : "";
  if (kind === "reminder") return `Reminders from ${sender}${where ? ` in “${where}”` : ""}`;
  if (kind === "calendar_event") return `Calendar events from ${sender}${where ? ` in “${where}”` : ""}`;
  if (kind === "file_attachment") return `Files from ${sender} saved to ~/${(target ?? "").replace(/YYYY-MM/g, "<year>-<month>").replace(/YYYY/g, "<year>")}`;
  return pattern;
}

export type QueueOffer = { pattern: string; kind: string; label: string; approvals: number };
export type QueueRule = QueueRuleRecord & { label: string };

export type ProposeResult =
  | { ok: true; item: QueueItemRecord }
  | { ok: false; reason: "invalid" | "duplicate" | "full"; message: string };

/** Teammates send flat fields (easier for models than nested objects); this builds the card. A nested
 * `action` object is accepted too. Fields that do not belong to the kind are ignored, never forwarded. */
export function proposalFromFlatArgs(args: Record<string, unknown>): Record<string, unknown> {
  if (args.action && typeof args.action === "object") return args;
  const { kind, title, why, sourceKey } = args;
  const pick = (keys: string[]) => Object.fromEntries(keys.filter((key) => args[key] !== undefined && args[key] !== null && args[key] !== "").map((key) => [key, args[key]]));
  const receipt = kind === "file_attachment" ? pick(["vendor", "amount", "currency", "invoiceDate", "reference"]) : {};
  const action =
    kind === "reminder" ? { title, ...pick(["notes", "due", "list"]) } :
    kind === "calendar_event" ? { title, ...pick(["start", "end", "location", "notes", "calendar", "allDay"]) } :
    kind === "reply_draft" ? pick(["to", "subject", "body"]) :
    kind === "file_attachment" ? pick(["id", "attachment", "folder"]) : {};
  return Object.keys(receipt).length ? { kind, title, why, sourceKey, action, receipt } : { kind, title, why, sourceKey, action };
}

/** One plain sentence saying exactly what approving will do. */
export function queuePreview(proposal: QueueProposal): string {
  if (proposal.kind === "reply_draft") {
    const a = proposal.action;
    return `Save a reply to ${a.to.join(", ")} in Mail's Drafts: “${a.subject}”. It is not sent; you open it and send it yourself.`;
  }
  const action = proposal.kind === "reminder" ? "mac_reminder_create" : proposal.kind === "calendar_event" ? "mac_event_create" : "mac_mail_save_attachment";
  const what = describeAppleChange(action, proposal.action as Record<string, unknown>)?.reason ?? proposal.title;
  if (proposal.kind === "file_attachment" && proposal.receipt) {
    const r = proposal.receipt, bits = [r.vendor, r.amount && `${r.amount} ${r.currency}`, r.invoiceDate].filter(Boolean);
    if (bits.length) return `${what} It is also listed for your accountant: ${bits.join(", ")}.`;
  }
  return what;
}

const localDate = (iso: string) => { const d = new Date(iso); return `${monthKey(d)}-${String(d.getDate()).padStart(2, "0")}`; };
const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
const cents = (amount: string) => Math.round(Number(amount.replace(",", ".")) * 100);
/** A cell that starts like a formula would run in a spreadsheet; a leading quote keeps it text. */
const csvCell = (value: string) => {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
export type ReceiptRow = { filedAt: string; vendor: string; invoiceDate: string; reference: string; amount: string; currency: string; file: string; savedTo: string };
export type ReceiptsSummary = { month: string; months: string[]; rows: ReceiptRow[]; totals: { currency: string; amount: string; count: number }[]; withoutAmount: number };

export class WorkQueue {
  constructor(
    private readonly db: OpenBotDatabase,
    private readonly executor: () => QueueExecutor,
    clock?: () => Date,
    private readonly limits: { cardsPerDay?: number; autoPerDay?: number } = {},
  ) { this.clock = clock ?? (() => new Date()); }
  private readonly clock: () => Date;

  /** Adds a card. Nothing runs. Returns why a card was not added instead of throwing. */
  propose(input: unknown, context: { botId: string | null; runId: string | null; sender?: string | null }): ProposeResult {
    const parsed = queueProposalInput.safeParse(input);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return { ok: false, reason: "invalid", message: `That card is not valid (${first?.path.join(".") || "input"}: ${first?.message ?? "unknown problem"}). Nothing was added.` };
    }
    const proposal = parsed.data;
    const now = this.clock();
    this.expire();
    // Respect an earlier "no": a source that was skipped or undone is not offered again.
    const earlier = this.db.queueItemFindBySource(proposal.kind, proposal.sourceKey);
    if (earlier) return { ok: false, reason: "duplicate", message: "There is already a card for that (or you decided on it before). Nothing was added." };
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const pattern = queuePattern(proposal, context.sender);
    // A kind the person already trusts does not crowd the list, so only cards needing a look count toward the day's eight.
    if (!this.trusts(pattern, dayStart) && this.db.queueItemsCreatedSince(dayStart) >= (this.limits.cardsPerDay ?? QUEUE_CARDS_PER_DAY)) {
      return { ok: false, reason: "full", message: `Today's list already has ${this.limits.cardsPerDay ?? QUEUE_CARDS_PER_DAY} cards. Leave the rest for another day.` };
    }
    const item = this.db.queueItemInsert({
      kind: proposal.kind, title: proposal.title, why: proposal.why, sourceKey: proposal.sourceKey,
      botId: context.botId, runId: context.runId, action: proposal.action as Record<string, unknown>,
      preview: queuePreview(proposal), expiresAt: new Date(now.getTime() + QUEUE_CARD_DAYS * 86_400_000).toISOString(),
      pattern,
      meta: proposal.kind === "file_attachment" && proposal.receipt ? Object.fromEntries(Object.entries(proposal.receipt).filter(([, value]) => value)) as Record<string, string> : null,
    });
    if (!item) return { ok: false, reason: "duplicate", message: "There is already a card for that. Nothing was added." };
    return { ok: true, item };
  }

  expire(): number { return this.db.queueItemsExpire(this.clock().toISOString()); }

  /** What the screen shows: cards waiting, recent results with their Undo, and what trust has been earned. */
  list() {
    this.expire();
    const weekAgo = new Date(this.clock().getTime() - 7 * 86_400_000).toISOString();
    return {
      ready: this.db.queueItemsList(["ready"], 50).reverse(),
      recent: this.db.queueItemsList(["done", "undone", "failed"], 30),
      offers: this.offers(),
      rules: this.rules(),
      automaticThisWeek: this.db.queueItemsDecidedByRulesSince(weekAgo).filter((card) => card.status === "done").length,
    };
  }

  /** Patterns a person has approved five times in a row, with no skip or Undo in between and no earlier answer. */
  offers(): QueueOffer[] {
    const offers: QueueOffer[] = [];
    for (const { pattern, kind } of this.db.queueApprovedPatterns()) {
      if (!AUTO_KINDS.has(kind) || this.db.queueRuleFindByPattern(pattern)) continue;
      const approvals = this.db.queuePatternStreak(pattern);
      if (approvals >= QUEUE_OFFER_AFTER) offers.push({ pattern, kind, label: patternLabel(pattern), approvals });
    }
    return offers.sort((a, b) => b.approvals - a.approvals);
  }

  rules(): QueueRule[] {
    return this.db.queueRuleList().filter((rule) => rule.status !== "declined").map((rule) => ({ ...rule, label: patternLabel(rule.pattern) }));
  }

  /** The month's filed receipts for the accountant. Only files a person approved and nobody undid. */
  receipts(month?: string): ReceiptsSummary {
    const months = this.db.queueFileMonths();
    const chosen = month && /^\d{4}-(?:0[1-9]|1[0-2])$/.test(month) ? month : months[0] ?? monthKey(this.clock());
    const [year, number] = chosen.split("-").map(Number) as [number, number];
    const items = this.db.queueFilesFiledBetween(new Date(year, number - 1, 1).toISOString(), new Date(year, number, 1).toISOString());
    const rows = items.map((item): ReceiptRow => {
      const meta = item.meta ?? {}, action = item.action as Record<string, string>, result = (item.result ?? {}) as Record<string, string>;
      return {
        filedAt: item.decidedAt ?? item.createdAt,
        vendor: meta.vendor ?? item.pattern?.split("|")[1] ?? "",
        invoiceDate: meta.invoiceDate ?? "", reference: meta.reference ?? "",
        amount: meta.amount ? (cents(meta.amount) / 100).toFixed(2) : "", currency: meta.amount ? meta.currency ?? "" : "",
        file: action.attachment ?? "", savedTo: String(result.saved ?? "").replace(/^\/Users\/[^/]+/, "~"),
      };
    });
    const sums = new Map<string, { cents: number; count: number }>();
    for (const row of rows) if (row.amount) { const entry = sums.get(row.currency) ?? { cents: 0, count: 0 }; entry.cents += cents(row.amount); entry.count++; sums.set(row.currency, entry); }
    return { month: chosen, months, rows, totals: [...sums].map(([currency, entry]) => ({ currency, amount: (entry.cents / 100).toFixed(2), count: entry.count })), withoutAmount: rows.filter((row) => !row.amount).length };
  }

  /** The same list as a spreadsheet file that opens in Excel, Numbers and Google Sheets. */
  receiptsCsv(month?: string): { month: string; csv: string } {
    const summary = this.receipts(month);
    const header = ["Date filed", "Vendor", "Invoice date", "Reference", "Amount", "Currency", "File", "Saved to"];
    const lines = [header, ...summary.rows.map((row) => [localDate(row.filedAt), row.vendor, row.invoiceDate, row.reference, row.amount, row.currency, row.file, row.savedTo])];
    return { month: summary.month, csv: "\uFEFF" + lines.map((cells) => cells.map(csvCell).join(",")).join("\r\n") + "\r\n" };
  }

  /** "Yes, do this automatically": only for a pattern that is being offered right now. */
  acceptOffer(pattern: string): QueueRule {
    const existing = this.db.queueRuleFindByPattern(pattern);
    if (existing) throw new QueueError("You already answered that one.", "already_handled");
    const offer = this.offers().find((candidate) => candidate.pattern === pattern);
    if (!offer) throw new QueueError("That isn't on offer right now.", "not_found");
    const rule = this.db.queueRuleInsert(offer.kind, offer.pattern, "active");
    if (!rule) throw new QueueError("You already answered that one.", "already_handled");
    return { ...rule, label: patternLabel(rule.pattern) };
  }

  /** "Not now": the offer is not shown again for that pattern. */
  declineOffer(pattern: string): void {
    const offer = this.offers().find((candidate) => candidate.pattern === pattern);
    if (!offer) throw new QueueError("That isn't on offer right now.", "not_found");
    this.db.queueRuleInsert(offer.kind, offer.pattern, "declined");
  }

  pauseRule(id: string): QueueRule { return this.moveRule(id, ["active"], "paused", "You paused it."); }
  resumeRule(id: string): QueueRule { return this.moveRule(id, ["paused"], "active"); }
  /** Removing keeps a quiet "declined" row so the same offer does not come straight back. */
  removeRule(id: string): void { this.moveRule(id, ["active", "paused"], "declined"); }

  private moveRule(id: string, from: Array<"active" | "paused">, to: "active" | "paused" | "declined", reason: string | null = null): QueueRule {
    const rule = this.db.queueRuleGet(id);
    if (!rule || rule.status === "declined") throw new QueueError("That rule is gone.", "not_found");
    const moved = this.db.queueRuleTransition(id, from, to, reason);
    if (!moved) throw new QueueError("That rule was already changed.", "already_handled");
    return { ...moved, label: patternLabel(moved.pattern) };
  }

  /** A fresh card whose pattern a person already trusts is approved by that rule right away. Anything
   * else, or any failure, leaves a normal card. Replies are never automatic. */
  async runRules(item: QueueItemRecord): Promise<QueueItemRecord> {
    if (!item.pattern || !AUTO_KINDS.has(item.kind) || item.status !== "ready") return item;
    const now = this.clock();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    if (!this.trusts(item.pattern, dayStart)) return item;
    const rule = this.db.queueRuleFindByPattern(item.pattern)!;
    try {
      const done = await this.approve(item.id, `rule:${rule.id}`);
      this.db.queueRuleRecordUse(rule.id);
      return done;
    } catch {
      // Something went wrong on the Mac: show the failed card and stop doing this alone until a person says so.
      this.db.queueRuleTransition(rule.id, ["active"], "paused", "One of them couldn't finish, so it is paused.");
      return this.db.queueItemGet(item.id) ?? item;
    }
  }

  /** True when the person has a live rule for this pattern and today's limit on doing things alone is not used up. */
  private trusts(pattern: string | null, dayStart: string): boolean {
    if (!pattern) return false;
    const rule = this.db.queueRuleFindByPattern(pattern);
    if (!rule || rule.status !== "active") return false;
    return this.db.queueItemsDecidedByRulesSince(dayStart).length < (this.limits.autoPerDay ?? QUEUE_AUTO_PER_DAY);
  }

  /** Approving runs the stored action once. A second tap, or a second window, cannot run it twice. */
  async approve(id: string, by: "person" | `rule:${string}` = "person"): Promise<QueueItemRecord> {
    const card = this.db.queueItemGet(id);
    if (!card) throw new QueueError("That card is gone.", "not_found");
    // Claim first: only one caller moves ready to done.
    const claimed = this.db.queueItemTransition(id, ["ready"], { status: "done", decidedBy: by });
    if (!claimed) throw new QueueError("That card was already handled.", "already_handled");
    try {
      const result = await this.run(claimed);
      return this.db.queueItemTransition(id, ["done"], { status: "done", result })!;
    } catch (error) {
      const message = error instanceof Error ? error.message : "That didn't work. Nothing was changed.";
      this.db.queueItemTransition(id, ["done"], { status: "failed", error: message });
      throw new QueueError(message, "failed");
    }
  }

  skip(id: string): QueueItemRecord {
    if (!this.db.queueItemGet(id)) throw new QueueError("That card is gone.", "not_found");
    const skipped = this.db.queueItemTransition(id, ["ready"], { status: "skipped", decidedBy: "person" });
    if (!skipped) throw new QueueError("That card was already handled.", "already_handled");
    return skipped;
  }

  /** Reverses what an approved card did. If the reversal fails the card stays "done" so it can be retried. */
  async undo(id: string): Promise<QueueItemRecord> {
    const card = this.db.queueItemGet(id);
    if (!card) throw new QueueError("That card is gone.", "not_found");
    if (card.status !== "done" || !card.result) throw new QueueError("There is nothing to undo on that card.", "already_handled");
    if (this.clock().getTime() - Date.parse(card.decidedAt ?? card.createdAt) > QUEUE_UNDO_DAYS * 86_400_000) {
      throw new QueueError(`Undo is available for ${QUEUE_UNDO_DAYS} days. This one is older, so change it in the app itself.`, "too_old");
    }
    const ex = this.executor(), r = card.result as Record<string, string>;
    try {
      if (card.kind === "reminder") await ex.deleteReminder(r.id!);
      else if (card.kind === "calendar_event") await ex.deleteEvent(r.id!, r.calendar);
      else if (card.kind === "reply_draft") await ex.deleteMailDraft({ subject: r.subject!, at: r.at! });
      else if (card.kind === "file_attachment") await ex.trashFile(r.saved!);
      else throw new QueueError("This kind of card cannot be undone here.", "failed");
    } catch (error) {
      throw new QueueError(error instanceof Error ? error.message : "That couldn't be undone. Nothing was changed.", "failed");
    }
    const undone = this.db.queueItemTransition(id, ["done"], { status: "undone", undone: true })!;
    // Undoing something a rule did by itself switches that rule off until the person says otherwise.
    const ruleId = /^rule:(.+)$/.exec(card.decidedBy ?? "")?.[1];
    if (ruleId) this.db.queueRuleTransition(ruleId, ["active"], "paused", `You undid “${card.title}”.`);
    return undone;
  }

  private async run(card: QueueItemRecord): Promise<Record<string, unknown>> {
    const ex = this.executor();
    if (card.kind === "reminder") {
      const made = await ex.createReminder(reminderCreateInput.parse(card.action));
      return { id: made.id, list: made.list, title: made.title, due: made.due };
    }
    if (card.kind === "calendar_event") {
      const made = await ex.createEvent(eventCreateInput.parse(card.action));
      return { id: made.id, calendar: made.calendar, title: made.title };
    }
    if (card.kind === "reply_draft") {
      const saved = await ex.saveMailDraft(mailDraftInput.parse(card.action));
      return { subject: saved.subject, at: saved.at };
    }
    if (card.kind === "file_attachment") {
      const saved = await ex.saveMailAttachment(mailSaveAttachmentInput.parse(card.action));
      return { saved: saved.saved, bytes: saved.bytes };
    }
    throw new QueueError("This kind of card is not supported.", "failed");
  }
}

import { z } from "zod";
import type { OpenBotDatabase, QueueItemRecord } from "./database.js";
import { describeAppleChange, eventCreateInput, mailDraftInput, mailSaveAttachmentInput, reminderCreateInput } from "./mac-apple-apps.js";

/** "Waiting for you": things a teammate prepared that a person approves, skips
 * or undoes. A card holds a typed action, validated by the same schemas as the
 * Apple-app tools. Proposing never runs anything, approving runs fixed scripts,
 * and every change keeps what it needs to be undone. Nothing is ever sent. */

export const QUEUE_CARDS_PER_DAY = 8;
export const QUEUE_CARD_DAYS = 7;
export const QUEUE_UNDO_DAYS = 7;

const line = (max: number) => z.string().trim().min(1).max(max);
const common = { title: line(120), why: line(240), sourceKey: line(200) };

export const queueProposalInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("reminder"), ...common, action: reminderCreateInput }).strict(),
  z.object({ kind: z.literal("calendar_event"), ...common, action: eventCreateInput }).strict(),
  z.object({ kind: z.literal("reply_draft"), ...common, action: mailDraftInput }).strict(),
  z.object({ kind: z.literal("file_attachment"), ...common, action: mailSaveAttachmentInput }).strict(),
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

export type ProposeResult =
  | { ok: true; item: QueueItemRecord }
  | { ok: false; reason: "invalid" | "duplicate" | "full"; message: string };

/** Teammates send flat fields (easier for models than nested objects); this builds the card. A nested
 * `action` object is accepted too. Fields that do not belong to the kind are ignored, never forwarded. */
export function proposalFromFlatArgs(args: Record<string, unknown>): Record<string, unknown> {
  if (args.action && typeof args.action === "object") return args;
  const { kind, title, why, sourceKey } = args;
  const pick = (keys: string[]) => Object.fromEntries(keys.filter((key) => args[key] !== undefined && args[key] !== null && args[key] !== "").map((key) => [key, args[key]]));
  const action =
    kind === "reminder" ? { title, ...pick(["notes", "due", "list"]) } :
    kind === "calendar_event" ? { title, ...pick(["start", "end", "location", "notes", "calendar", "allDay"]) } :
    kind === "reply_draft" ? pick(["to", "subject", "body"]) :
    kind === "file_attachment" ? pick(["id", "attachment", "folder"]) : {};
  return { kind, title, why, sourceKey, action };
}

/** One plain sentence saying exactly what approving will do. */
export function queuePreview(proposal: QueueProposal): string {
  if (proposal.kind === "reply_draft") {
    const a = proposal.action;
    return `Save a reply to ${a.to.join(", ")} in Mail's Drafts: “${a.subject}”. It is not sent; you open it and send it yourself.`;
  }
  const action = proposal.kind === "reminder" ? "mac_reminder_create" : proposal.kind === "calendar_event" ? "mac_event_create" : "mac_mail_save_attachment";
  return describeAppleChange(action, proposal.action as Record<string, unknown>)?.reason ?? proposal.title;
}

export class WorkQueue {
  constructor(
    private readonly db: OpenBotDatabase,
    private readonly executor: () => QueueExecutor,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** Adds a card. Nothing runs. Returns why a card was not added instead of throwing. */
  propose(input: unknown, context: { botId: string | null; runId: string | null }): ProposeResult {
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
    if (this.db.queueItemsCreatedSince(dayStart) >= QUEUE_CARDS_PER_DAY) {
      return { ok: false, reason: "full", message: `Today's list already has ${QUEUE_CARDS_PER_DAY} cards. Leave the rest for another day.` };
    }
    const item = this.db.queueItemInsert({
      kind: proposal.kind, title: proposal.title, why: proposal.why, sourceKey: proposal.sourceKey,
      botId: context.botId, runId: context.runId, action: proposal.action as Record<string, unknown>,
      preview: queuePreview(proposal), expiresAt: new Date(now.getTime() + QUEUE_CARD_DAYS * 86_400_000).toISOString(),
    });
    if (!item) return { ok: false, reason: "duplicate", message: "There is already a card for that. Nothing was added." };
    return { ok: true, item };
  }

  expire(): number { return this.db.queueItemsExpire(this.clock().toISOString()); }

  /** What the screen shows: cards waiting, and recent results with their Undo. */
  list() {
    this.expire();
    return {
      ready: this.db.queueItemsList(["ready"], 50).reverse(),
      recent: this.db.queueItemsList(["done", "undone", "failed"], 30),
    };
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
    return this.db.queueItemTransition(id, ["done"], { status: "undone", undone: true })!;
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

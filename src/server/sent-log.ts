/** Task F3: what each run sent to its AI, kept on this Mac for the receipt.
 * Stored encrypted with the other extension records, at most 300 items per
 * run and 20,000 characters per item, and deleted after 30 days. It records
 * what Sidemates hands the runtime (instructions and memories, the request,
 * every tool answer), exactly as sent: masked when Private mode applied. */
import type { Run } from "../shared/types.js";
import type { SentKind } from "../shared/ai-receipt.js";

export type { SentKind };
import { zeroCounts, type MaskCounts } from "../shared/private-mask.js";
import type { OpenBotDatabase } from "./database.js";

export interface SentEntry {
  at: string; kind: SentKind; label: string;
  /** The text as sent, cut at SENT_TEXT_LIMIT. */
  text: string; chars: number; truncatedChars: number;
  masked: boolean; local: boolean; counts: MaskCounts;
  model: string; connection: string;
}
export const SENT_TEXT_LIMIT = 20_000;
export const SENT_ENTRIES_LIMIT = 300;
export const SENT_DAYS = 30;
const PREFIX = "sent-log:";
let sequence = 0;

export function logSentText(db: OpenBotDatabase, run: Run, input: { kind: SentKind; label: string; text: string; masked: boolean; local: boolean; counts?: MaskCounts }) {
  const kind = `${PREFIX}${run.id}`, count = db.countExtensionRecords(kind);
  if (count > SENT_ENTRIES_LIMIT) return;
  const bot = db.getBot(run.botId), provider = db.providerForBot(run.botId);
  const at = new Date().toISOString();
  sequence = (sequence + 1) % 1_000_000;
  const full = count === SENT_ENTRIES_LIMIT
    ? { ...input, kind: "kept" as const, label: "More was sent", text: `This task sent more than ${SENT_ENTRIES_LIMIT} items; the receipt keeps the first ${SENT_ENTRIES_LIMIT}.`, counts: zeroCounts() }
    : input;
  const entry: SentEntry = {
    at, kind: full.kind, label: full.label.slice(0, 120),
    text: full.text.slice(0, SENT_TEXT_LIMIT), chars: full.text.length, truncatedChars: Math.max(0, full.text.length - SENT_TEXT_LIMIT),
    masked: full.masked, local: full.local, counts: full.counts ?? zeroCounts(),
    model: (run.modelOverride || bot?.model || "").replace(/^(opencode|claude-code)\//, ""), connection: provider?.name || "No AI connection",
  };
  db.saveExtensionRecord(kind, `${at}-${String(sequence).padStart(6, "0")}`, entry);
}

export function sentLog(db: OpenBotDatabase, runId: string): SentEntry[] {
  return db.extensionRecords<SentEntry>(`${PREFIX}${runId}`).map((record) => record.value);
}

/** Deletes items older than SENT_DAYS. */
export function pruneSentLog(db: OpenBotDatabase, now = Date.now()): number {
  return db.deleteExtensionRecordsBefore(PREFIX, new Date(now - SENT_DAYS * 86_400_000).toISOString());
}

/** Task F3: the receipt's "What the AI saw" and "Usage", as the studio receives them. */
export type SentKind = "instructions" | "request" | "tool" | "kept";

export interface AiReceiptEntry {
  at: string; kind: SentKind; label: string;
  /** Masked placeholders either way: as sent in Private mode, masked for display otherwise. */
  text: string; chars: number; truncatedChars: number;
  /** Private mode masked these before sending. */
  maskedBeforeSending: string | null;
  /** Went to the AI as written (only for text that left this Mac). */
  sentAsWritten: string | null;
}
export interface AiReceiptRun {
  runId: string; botName: string; model: string; connection: string; local: boolean;
  /** Private mode masked what this run sent (not the setting today). */
  privateMode: boolean;
  entries: AiReceiptEntry[];
}
export interface AiReceiptUsage {
  inputTokens: number; outputTokens: number; reasoningTokens: number; cacheReadTokens: number;
  /** input + output + reasoning, the figure every limit in Sidemates counts. */
  totalTokens: number;
  requests: number; cost: number; runs: number;
}
export interface AiReceipt {
  runs: AiReceiptRun[];
  usage: AiReceiptUsage;
  /** One sentence per connection and teammate: cost, plan, free quota or weekly budget. */
  allowance: string[];
  keptDays: number;
}

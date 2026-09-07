import type { OpenBotDatabase } from "./database.js";

export const usageFields = ["inputTokens", "outputTokens", "reasoningTokens", "cacheReadTokens", "cost"] as const;
type Field = typeof usageFields[number];
type Values = Record<Field, number | null>;
export type UsageEvidence = Record<Field, { value: number | null; reporting: "reported" | "partial" | "unavailable" }>;
const numeric = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;

// This is evidence, separate from the legacy numeric counters used for budgets.
// A missing field is never inferred to be zero, nor estimated from chat length.
export function reportedUsage(event: Record<string, unknown>): Values | null {
  const part = event.part as Record<string, unknown> | undefined, message = event.message as Record<string, unknown> | undefined;
  const tokens = (event.tokens ?? part?.tokens ?? event.usage ?? message?.usage) as Record<string, unknown> | undefined;
  if (!tokens || typeof tokens !== "object" || Array.isArray(tokens)) return null;
  const cache = tokens.cache as Record<string, unknown> | undefined;
  return { inputTokens: numeric(tokens.input ?? tokens.input_tokens), outputTokens: numeric(tokens.output ?? tokens.output_tokens), reasoningTokens: numeric(tokens.reasoning), cacheReadTokens: numeric(cache?.read ?? tokens.cacheRead ?? tokens.cache_read_input_tokens), cost: numeric(event.cost ?? event.total_cost_usd ?? part?.cost) };
}
export class UsageEvidenceAccumulator {
  private entries = new Map<string, Values>();
  private result: Values | null = null;
  private anonymous = 0;
  add(event: Record<string, unknown>) {
    const value = reportedUsage(event); if (!value) return;
    const part = event.part as Record<string, unknown> | undefined, message = event.message as Record<string, unknown> | undefined;
    if (event.type === "result") this.result = value;
    else { const id = part?.id ?? message?.id; this.entries.set(typeof id === "string" ? `${event.type}:${id}` : `anonymous:${this.anonymous++}`, value); }
  }
  evidence(): UsageEvidence {
    const entries = this.result ? [this.result] : [...this.entries.values()];
    return Object.fromEntries(usageFields.map((field) => {
      const known = entries.map((entry) => entry[field]).filter((value): value is number => value !== null);
      return [field, { value: known.length ? known.reduce((sum, value) => sum + value, 0) : null, reporting: !known.length ? "unavailable" : known.length === entries.length ? "reported" : "partial" }];
    })) as UsageEvidence;
  }
}
export interface UsageAttempt { id: string; runId: string; providerId: string | null; model: string; runtime: string; at: string; closed: boolean; evidence: UsageEvidence }
export function usageLedger(db: OpenBotDatabase, runId: string) {
  const ids = new Set<string>();
  const visit = (id: string) => { if (ids.has(id)) return; ids.add(id); for (const child of db.listChildRuns(id)) visit(child.id); };
  visit(runId);
  const attempts = [...ids].flatMap((id) => db.extensionRecords<UsageAttempt>(`usage-attempt:${id}`).map((record) => record.value)).sort((a, b) => a.at.localeCompare(b.at));
  return { attempts, runsWithoutEvidence: [...ids].filter((id) => !attempts.some((attempt) => attempt.runId === id)) };
}
export function usageLedgerMarkdown(db: OpenBotDatabase, runId: string): string {
  const ledger = usageLedger(db, runId), rows = ["# Provider usage receipt", "", "Provider-reported values, not a bill or a remaining-subscription allowance. No estimates are included. Reported zero cost does not mean the model has no subscription cost. Categories may overlap depending on the provider; do not add cached/reasoning categories to totals blindly.", "", "`reported` means every received usage record in that attempt included the field, not that delivery was complete. An interrupted process or lost provider event can omit usage. Legacy budget counters cannot enforce unknown token usage; elapsed-time, step and output caps still apply.", ""];
  for (const attempt of ledger.attempts) {
    rows.push(`## Attempt ${attempt.id}`, "", `Run: ${attempt.runId} · ${attempt.closed ? "process closed" : "last checkpoint; completion not recorded"} · ${attempt.at}`, "", `Model: ${JSON.stringify(attempt.model)} · runtime: ${attempt.runtime}`, "", "| Category | Value | Reporting |", "|---|---:|---|");
    for (const field of usageFields) { const item = attempt.evidence[field]; rows.push(`| ${field === "cost" ? "Cost (USD)" : field} | ${item.value === null ? "Unavailable" : item.value} | ${item.reporting} |`); }
    rows.push("");
  }
  if (!ledger.attempts.length) rows.push("No provider usage receipt is available for this job.", "");
  if (ledger.runsWithoutEvidence.length) rows.push(`Runs without a receipt (not zero usage): ${ledger.runsWithoutEvidence.join(", ")}`, "");
  rows.push("Private consultation runs are included when recorded. This file is a snapshot at delivery, not a live ledger.");
  return rows.join("\n");
}

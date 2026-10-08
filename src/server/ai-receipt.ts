/** Task F3: the receipt's "What the AI saw" and "Usage". Every number comes
 * from what the runner recorded for the task's runs; the text comes from the
 * sent log. Text that went out as written is shown here with its personal
 * details masked, so the receipt itself is safe to show someone. */
import type { ProviderInstance } from "../shared/types.js";
import { countTotal, describeCounts, emptyVault, maskText, type MaskCounts } from "../shared/private-mask.js";
import type { OpenBotDatabase } from "./database.js";
import { localConnection } from "./private-mode.js";
import { sentLog, SENT_DAYS } from "./sent-log.js";
import type { AiReceipt, AiReceiptEntry, AiReceiptRun, AiReceiptUsage } from "../shared/ai-receipt.js";

export type { AiReceipt } from "../shared/ai-receipt.js";

function displayText(text: string, maskedAlready: boolean): { text: string; counts: MaskCounts | null } {
  if (maskedAlready) return { text, counts: null };
  const shown = maskText(text, emptyVault());
  return { text: shown.text, counts: shown.counts };
}

function money(value: number): string {
  return value >= 0.01 ? `$${value.toFixed(2)}` : `$${value.toFixed(4)}`;
}

function allowanceLine(provider: ProviderInstance | null, requests: number, cost: number): string {
  const count = `${requests} ${requests === 1 ? "request" : "requests"}`;
  if (!provider) return `${count}; no AI connection is recorded.`;
  if (localConnection(provider)) return `${provider.name} ran on this Mac: ${count}, no cost and no allowance used.`;
  if (provider.authMode === "subscription") return `Included in your ${provider.name} plan: ${count}. The plan's own limits apply.`;
  if (provider.runtime === "claude_code") return cost > 0 ? `Through Claude Code: ${count}. Claude Code reported ${money(cost)}.` : `Through Claude Code: ${count}, counted toward its sign-in's limits.`;
  if (cost > 0) return `${provider.name}: ${count}, ${money(cost)} as reported by the AI's runtime.`;
  if (provider.provider === "google") return `${provider.name}: ${count}. On a free Gemini key these count toward Google's daily free requests.`;
  return `${provider.name}: ${count}. The provider didn't report a cost.`;
}

export function buildAiReceipt(db: OpenBotDatabase, runId: string): AiReceipt | null {
  const root = db.getRun(runId);
  if (!root) return null;
  const runIds = [...new Set(db.getJobUsage(runId).runIds)];
  const runs = runIds.map((id) => db.getRun(id)).filter((run): run is NonNullable<typeof run> => Boolean(run));
  const usage: AiReceiptUsage = { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cacheReadTokens: 0, totalTokens: 0, requests: 0, cost: 0, runs: runs.length };
  const byConnection = new Map<string, { provider: ProviderInstance | null; requests: number; cost: number }>();
  const byBot = new Map<string, number>();
  const receiptRuns: AiReceiptRun[] = [];
  for (const run of runs) {
    usage.inputTokens += run.inputTokens; usage.outputTokens += run.outputTokens; usage.reasoningTokens += run.reasoningTokens;
    usage.cacheReadTokens += run.cacheReadTokens; usage.requests += run.modelSteps; usage.cost += run.cost;
    const tokens = run.inputTokens + run.outputTokens + run.reasoningTokens;
    usage.totalTokens += tokens;
    byBot.set(run.botId, (byBot.get(run.botId) ?? 0) + tokens);
    const bot = db.getBot(run.botId), provider = db.providerForBot(run.botId);
    const key = provider?.id ?? "none", connection = byConnection.get(key) ?? { provider, requests: 0, cost: 0 };
    connection.requests += run.modelSteps; connection.cost += run.cost;
    byConnection.set(key, connection);
    const sent = sentLog(db, run.id);
    const entries = sent.map((entry): AiReceiptEntry => {
      const shown = displayText(entry.text, entry.masked);
      const leftTheMac = !entry.local && entry.kind !== "kept";
      return {
        at: entry.at, kind: entry.kind, label: entry.label, text: shown.text, chars: entry.chars, truncatedChars: entry.truncatedChars,
        maskedBeforeSending: entry.masked && countTotal(entry.counts) ? describeCounts(entry.counts) : null,
        sentAsWritten: leftTheMac && shown.counts && countTotal(shown.counts) ? describeCounts(shown.counts) : null,
      };
    });
    const last = sent.at(-1);
    receiptRuns.push({
      runId: run.id, botName: run.botName, model: last?.model || (run.modelOverride || bot?.model || "").replace(/^(opencode|claude-code)\//, ""),
      connection: last?.connection || provider?.name || "No AI connection", local: localConnection(provider), privateMode: sent.some((entry) => entry.masked),
      entries,
    });
  }
  const allowance = [...byConnection.values()].map((connection) => allowanceLine(connection.provider, connection.requests, connection.cost));
  for (const [botId, tokens] of byBot) {
    const bot = db.getBot(botId);
    if (!bot || bot.weeklyTokenBudget <= 0) continue;
    const share = (tokens / bot.weeklyTokenBudget) * 100;
    allowance.push(`${tokens.toLocaleString("en-US")} tokens of ${bot.name}'s weekly budget of ${bot.weeklyTokenBudget.toLocaleString("en-US")} (${share < 0.1 && tokens > 0 ? "under 0.1" : share.toFixed(1)}%).`);
  }
  return { runs: receiptRuns, usage, allowance, keptDays: SENT_DAYS };
}

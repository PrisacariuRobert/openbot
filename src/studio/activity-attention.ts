import type { Run } from "../shared/types";

export interface ActivityAttentionGroup {
  run: Run;
  count: number;
}

function attentionTime(run: Run): number {
  for (const value of [run.finishedAt, run.progressAt, run.startedAt]) {
    if (!value) continue;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Number.NEGATIVE_INFINITY;
}

/**
 * Keeps every pending decision independently actionable while collapsing only
 * genuinely repeated failures from the same teammate. Input order is the
 * final recency fallback because Studio runs already arrive newest-first.
 */
export function groupActivityAttentionRuns(runs: Run[]): ActivityAttentionGroup[] {
  const ordered = runs
    .map((run, inputIndex) => ({ run, inputIndex }))
    .filter(({ run }) => run.status === "awaiting_approval" || run.status === "failed")
    .sort((a, b) => {
      const priority = Number(b.run.status === "awaiting_approval") - Number(a.run.status === "awaiting_approval");
      return priority || attentionTime(b.run) - attentionTime(a.run) || a.inputIndex - b.inputIndex;
    });

  const groups: ActivityAttentionGroup[] = [];
  const failedGroups = new Map<string, ActivityAttentionGroup>();
  for (const { run } of ordered) {
    if (run.status === "awaiting_approval") {
      groups.push({ run, count: 1 });
      continue;
    }

    const reason = run.error?.trim();
    // A missing reason is not evidence that two failures are the same.
    const key = reason ? JSON.stringify(["reason", run.botId, reason]) : JSON.stringify(["run", run.botId, run.id]);
    const group = failedGroups.get(key);
    if (group) group.count += 1;
    else {
      const next = { run, count: 1 };
      failedGroups.set(key, next);
      groups.push(next);
    }
  }
  return groups;
}

import type { Run } from "../shared/types";

const STALE_FAILURE_MS = 7 * 24 * 60 * 60 * 1000;

/** Tasks that need the owner now. A waiting approval always does. A failed
 * task does only while it is still the latest task in its conversation
 * and it finished within the last week: once the owner has asked for
 * something newer there, or it is a week old, it stays in history instead
 * of holding the "needs you" badge open forever. */
export function tasksNeedingOwner(runs: Run[], now = Date.now()): Run[] {
  const top = runs.filter((run) => !run.parentRunId);
  const began = (run: Run) => Date.parse(run.startedAt || run.progressAt || run.finishedAt || "");
  return top.filter((run) => {
    if (run.status === "awaiting_approval") return true;
    if (run.status !== "failed") return false;
    const finished = Date.parse(run.finishedAt || run.progressAt || "");
    if (Number.isFinite(finished) && now - finished > STALE_FAILURE_MS) return false;
    return !top.some((later) => later.id !== run.id && later.threadId === run.threadId && began(later) > began(run));
  });
}

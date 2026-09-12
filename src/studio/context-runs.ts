import type { Run } from "../shared/types";

const contextRunTime = (run: Run) => {
  const timestamps = [run.progressAt, run.finishedAt, run.startedAt]
    .map((value) => value ? Date.parse(value) : Number.NEGATIVE_INFINITY)
    .filter(Number.isFinite);
  return timestamps.length ? Math.max(...timestamps) : Number.NEGATIVE_INFINITY;
};

/** Keep active/current work first while preserving older runs as history. */
export function orderContextRuns(runs: Run[]): Run[] {
  return [...runs].sort((a, b) => {
    const active = (status: Run["status"]) => ["queued", "running", "awaiting_approval", "waiting_for_teammate"].includes(status);
    return Number(active(b.status)) - Number(active(a.status)) || contextRunTime(b) - contextRunTime(a);
  });
}

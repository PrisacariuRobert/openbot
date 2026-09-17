import type { OpenBotDatabase } from "./database.js";

/** Human-attention measurement, read-only (P07a).
 *
 * Supervision can only be reduced deliberately when it is measured. This
 * module aggregates what the host already records — approval open windows,
 * tool-labeled activities, run elapsed time — into one comparable shape for
 * evaluators (Q01) and future UI. It writes nothing and changes no behavior.
 *
 * Honesty rules, documented where enforced:
 * - Waiting is not attention. `awaitingSeconds` is the uncapped wall time a
 *   run spent blocked on owner decisions. `attendedSecondsEstimate` caps
 *   each decision window at 15 minutes: glancing at a phone approval takes
 *   seconds, and an approval left open over a weekend must not read as a
 *   weekend of supervision. Estimates are labeled as estimates.
 * - Only decided approvals count toward attention. Pending reviews contribute
 *   to waiting only through the run's elapsed time, never to attended time.
 */

export const ATTENTION_WINDOW_CAP_SECONDS = 15 * 60;

export type ApprovalWindow = { openedAtMs: number; decidedAtMs: number | null; decision: string };

export type AttentionSummary = {
  approvals: number;
  approved: number;
  denied: number;
  /** Uncapped wall seconds blocked on owner decisions. */
  awaitingSeconds: number;
  /** Capped per-decision estimate of active human time. */
  attendedSecondsEstimate: number;
};

export function summarizeAttention(windows: ApprovalWindow[]): AttentionSummary {
  let approved = 0, denied = 0, awaitingSeconds = 0, attendedSecondsEstimate = 0;
  for (const window of windows) {
    if (window.decision === "approved") approved += 1;
    else if (window.decision === "denied") denied += 1;
    else continue;
    if (window.decidedAtMs === null || window.decidedAtMs < window.openedAtMs) continue;
    const elapsed = Math.floor((window.decidedAtMs - window.openedAtMs) / 1000);
    awaitingSeconds += elapsed;
    attendedSecondsEstimate += Math.min(elapsed, ATTENTION_WINDOW_CAP_SECONDS);
  }
  return { approvals: approved + denied, approved, denied, awaitingSeconds, attendedSecondsEstimate };
}

export type RunAttention = AttentionSummary & {
  runId: string;
  /** Tool-labeled activities on this run (reads leave none, so this is a
   * floor on tool use, not a dispatch count). */
  toolActivities: number;
  /** Run wall time in seconds, to completion or to now. */
  elapsedSeconds: number;
};

export function describeRunAttention(db: OpenBotDatabase, runId: string, nowMs = Date.now()): RunAttention | null {
  const run = db.getRun(runId);
  if (!run) return null;
  const windows: ApprovalWindow[] = db.listRunApprovals(runId)
    .map((approval) => ({
      openedAtMs: Date.parse(approval.createdAt),
      decidedAtMs: approval.status === "pending" ? null : Date.parse(approval.decidedAt || approval.createdAt),
      decision: approval.status,
    }))
    .filter((window) => Number.isFinite(window.openedAtMs) && (window.decidedAtMs === null || Number.isFinite(window.decidedAtMs)));
  const summary = summarizeAttention(windows);
  // Elapsed measures the active span only: a run that never started has no
  // span to report, and that is reported as zero rather than invented.
  const startMs = run.startedAt ? Date.parse(run.startedAt) : NaN;
  const endMs = run.finishedAt ? Date.parse(run.finishedAt) : nowMs;
  const elapsedSeconds = Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs
    ? Math.floor((endMs - startMs) / 1000)
    : 0;
  return {
    runId,
    ...summary,
    toolActivities: (run.activities || []).filter((activity) => activity.kind === "tool").length,
    elapsedSeconds,
  };
}

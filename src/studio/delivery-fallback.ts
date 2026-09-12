import type { Run } from "../shared/types";

/** Exact host fallback for a text-only result with no real validation evidence. */
export function isUnverifiedTextFallback(run: Run, hasReviews: boolean, hasDeliveredArtifacts?: boolean): boolean {
  return run.task.verificationStatus === "partial"
    && run.task.verificationSummary === "The result is ready, but it could not be fully checked automatically."
    && run.task.verificationChecks.length === 2
    && run.task.verificationChecks[0]?.label === "A result was created"
    && run.task.verificationChecks[0]?.passed === true
    && run.task.verificationChecks.every((check) => check.source === "teammate" && !check.detail)
    && run.task.verificationChecks[1]?.label === "Final checks completed"
    && run.task.verificationChecks[1]?.passed === false
    && hasDeliveredArtifacts === false
    && !hasReviews;
}

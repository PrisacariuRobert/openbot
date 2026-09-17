import type { Approval, Run } from "../shared/types";

/** Pending private sign-in selection (U03). Split view opens the live
 * website beside the chat; narrow screens get a returnable fullscreen
 * overlay instead of nothing. Both render from this one selection so a
 * waiting handoff can never offer a CTA that leads nowhere. */
export function selectPendingSignIn(
  approvals: Pick<Approval, "id" | "kind" | "requiresSignIn" | "status" | "runId">[],
  runs: Pick<Run, "id" | "threadId">[],
  threadId: string,
): string | null {
  const threadRuns = new Set(runs.filter((run) => run.threadId === threadId).map((run) => run.id));
  return (
    approvals.find(
      (approval) =>
        approval.kind === "browser" &&
        approval.requiresSignIn === true &&
        approval.status === "pending" &&
        threadRuns.has(approval.runId),
    )?.id || null
  );
}

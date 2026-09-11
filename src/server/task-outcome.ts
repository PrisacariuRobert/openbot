/** Honest task outcomes (OB-02): process termination is not task success.
 * A run whose model turn ended is "completed", but only a run that delivered
 * something checkable — artifacts, work reports, or a passed verification —
 * counts as delivered. A run that started with input files and produced none
 * of those is blocked, with an actionable explanation instead of an
 * unqualified success. Plain answers without checked deliverables stay
 * outcome-less rather than claiming delivery. */

export type TaskOutcome = "delivered" | "blocked" | null;

const INPUT_FILES_MARKER = "Files attached by the user are available in your workspace";

export function decideTaskOutcome(input: {
  prompt: string;
  deliveredArtifacts: number;
  deliveredReports: number;
  verificationStatus: string | null;
}): { outcome: TaskOutcome; error: string | null } {
  const delivered = input.deliveredArtifacts > 0 || input.deliveredReports > 0;
  if (delivered || input.verificationStatus === "passed") return { outcome: "delivered", error: null };
  if (input.prompt.includes(INPUT_FILES_MARKER)) {
    return {
      outcome: "blocked",
      error: "The task stopped without producing a result from its input files. Nothing was delivered and nothing was verified — check the inputs and ask the teammate to continue from this task rather than starting over.",
    };
  }
  return { outcome: null, error: null };
}

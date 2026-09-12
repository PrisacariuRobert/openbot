import type { Message, Run } from "../shared/types";

/** A cancelled top-level run needs one durable UI acknowledgement when the
 * host did not already persist a run_stopped event. Keep the wording neutral:
 * cancellation alone is not proof that an approved action was never run. */
export function needsCancelledRunOutcome(run: Run, messages: Message[]): boolean {
  return run.status === "cancelled" && !run.parentRunId && !messages.some(
    (message) => message.runId === run.id && message.senderType !== "user" && (message.eventType === "run_stopped" || message.kind === "text"),
  );
}

export function cancelledRunForTrigger(runs: Run[], messages: Message[], messageId: string): Run | undefined {
  return runs.find((run) => run.triggerMessageId === messageId && needsCancelledRunOutcome(run, messages));
}

export function latestCancelledWithoutTrigger(runs: Run[], messages: Message[]): Run | undefined {
  const topLevel = runs.filter((run) => !run.parentRunId);
  const runTime = (item: Run) => {
    const values = [item.finishedAt, item.progressAt, item.startedAt].map((value) => value ? Date.parse(value) : Number.NEGATIVE_INFINITY).filter(Number.isFinite);
    return values.length ? Math.max(...values) : Number.NEGATIVE_INFINITY;
  };
  const newest = [...topLevel].sort((a, b) => runTime(b) - runTime(a))[0];
  return runs.filter((run) => !run.triggerMessageId && run.id === newest?.id && needsCancelledRunOutcome(run, messages)).filter((run) => {
    const stoppedAt = runTime(run);
    return !messages.some((message) => message.senderType === "user" && Number.isFinite(Date.parse(message.createdAt)) && Date.parse(message.createdAt) > stoppedAt);
  })[0];
}

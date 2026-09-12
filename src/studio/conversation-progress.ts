import type { Run } from "../shared/types";

const visibleActivityLabels = new Set(["Opening the website", "Reading the page", "Using the page", "Preparing the next step"]);

/** Process states drive the language; elapsed time is never a completion estimate. */
export function conversationProgress(run: Run) {
  if (run.status === "queued") return { label: `${run.botName} is up next`, detail: "Your request is saved.", animated: false };
  if (run.status === "waiting_for_teammate") return { label: `${run.botName} is checking with the team`, detail: "You’ll get one combined reply here.", animated: true };
  if (run.status === "awaiting_approval") return { label: `${run.botName} needs your decision`, detail: "Review the next step before work continues.", animated: false };
  if (run.status !== "running") return null;
  if (run.task?.stage === "checking") return { label: `${run.botName} is checking the result`, detail: "The result isn’t final yet.", animated: true };
  const activity = [...(run.activities || [])]
    .map((item, index) => ({ item, index, time: Date.parse(item.createdAt || "") }))
    .sort((a, b) => (Number.isFinite(b.time) ? b.time : Number.NEGATIVE_INFINITY) - (Number.isFinite(a.time) ? a.time : Number.NEGATIVE_INFINITY) || b.index - a.index)[0]?.item;
  return { label: `${run.botName} is working on it`, detail: activity && visibleActivityLabels.has(activity.label) ? activity.label : "You can keep chatting while this runs.", animated: true };
}

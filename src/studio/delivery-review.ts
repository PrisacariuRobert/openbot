import type { Run } from "../shared/types";

export function deliveryReviewSummary(runs: Run[]): string {
  const reviews = runs.map(deliveryReview).filter((review) => review !== null);
  const count = `${reviews.length} ${reviews.length === 1 ? "review" : "reviews"}`;
  const concerning = reviews.filter((review) => /concern|couldn’t/.test(review.label));
  if (concerning.some((review) => review.bound)) return `${count} · needs attention`;
  if (concerning.length) return `${count} · earlier concern`;
  if (reviews.some((review) => review.label.endsWith("is checking this"))) return `${count} · checking`;
  return count;
}

/** A completed model process is not a positive review. Keep old reviews
 * readable, but never imply they were bound to the delivered revision. */
export function deliveryReview(run: Run) {
  if (!run.review && !run.prompt.startsWith("Independent review for ")) return null;
  if (["failed", "cancelled"].includes(run.status)) {
    return { label: `${run.botName} couldn’t finish the review`, finding: run.error || "The review stopped before a finding was ready.", detail: "", bound: Boolean(run.review) };
  }
  if (run.status !== "completed") {
    return { label: `${run.botName} is checking this`, finding: "", detail: "", bound: Boolean(run.review) };
  }
  const text = (run.summary || "").trim();
  const plain = text.replace(/^[\s#*_]+/, "").replace(/\*\*/g, "")
    .replace(/^Internal finding[^\n]*?[—:]\s*/i, "");
  const issue = /^DISAGREE\b/i.test(plain);
  const unavailable = /^UNABLE TO VERIFY\b/i.test(plain) || !text;
  const label = issue ? `${run.botName} found a concern`
    : unavailable ? `${run.botName} couldn’t verify this`
    : `${run.botName} shared a review`;
  const first = plain.split(/\n/)[0]!.replace(/^(?:DISAGREE|AGREE|UNABLE TO VERIFY)\s*[:.\-—]\s*/i, "");
  return {
    label,
    finding: first ? `${first.slice(0, 240)}${first.length > 240 ? "…" : ""}` : "Open the review to see the finding.",
    detail: text,
    bound: Boolean(run.review),
  };
}

import test from "node:test";
import assert from "node:assert/strict";
import type { Run } from "../shared/types";
import { deliveryReview, deliveryReviewSummary } from "./delivery-review";

const review = (patch: Partial<Run> = {}) => ({ botName: "Pixel", prompt: "Independent review for Scout: check this", status: "completed", summary: "AGREE: The totals match.\nChecked the supplied rows.", review: { artifacts: [] }, ...patch } as Run);

test("compact summaries keep current concerns, earlier concerns and working states distinct", () => {
  assert.equal(deliveryReviewSummary([review()]), "1 review");
  assert.equal(deliveryReviewSummary([review(), review({ review: null, summary: "DISAGREE: Old file was wrong." })]), "2 reviews · earlier concern");
  assert.equal(deliveryReviewSummary([review({ summary: "DISAGREE: Total is wrong." })]), "1 review · needs attention");
  assert.equal(deliveryReviewSummary([review({ status: "failed" })]), "1 review · needs attention");
  assert.equal(deliveryReviewSummary([review({ status: "running" })]), "1 review · checking");
});

test("disagreement is visible instead of a generic reviewed badge", () => {
  const result = deliveryReview(review({ summary: "**DISAGREE**: The saved total is wrong.\nExpected 490, got 620." }))!;
  assert.equal(result.label, "Pixel found a concern");
  assert.match(result.finding, /saved total is wrong/);
  assert.match(result.detail, /Expected 490/);
});
test("completed does not mean verified and legacy reviews stay identifiable", () => {
  assert.equal(deliveryReview(review())?.label, "Pixel shared a review");
  assert.equal(deliveryReview(review({ summary: "UNABLE TO VERIFY: The workbook could not be read." }))?.label, "Pixel couldn’t verify this");
  assert.equal(deliveryReview(review({ summary: null }))?.label, "Pixel couldn’t verify this");
  assert.equal(deliveryReview(review({ review: null }))?.bound, false);
  assert.equal(deliveryReview(review({ review: null, summary: "Internal finding for the coordinator — DISAGREE with the delivered result." }))?.label, "Pixel found a concern");
  assert.equal(deliveryReview(review({ review: null, summary: "Internal finding for the coordinator — DISAGREE with the delivered result." }))?.finding, "DISAGREE with the delivered result.");
  assert.equal(deliveryReview(review({ review: null, prompt: "Research vendors" })), null);
});
test("running, failed, and cancelled reviews have honest states", () => {
  assert.equal(deliveryReview(review({ status: "running" }))?.label, "Pixel is checking this");
  for (const status of ["failed", "cancelled"] as const) {
    const result = deliveryReview(review({ status, error: "The exact file is missing." }))!;
    assert.equal(result.label, "Pixel couldn’t finish the review");
    assert.equal(result.finding, "The exact file is missing.");
  }
});

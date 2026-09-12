import test from "node:test";
import assert from "node:assert/strict";
import { approvalPreview } from "./approval-preview";
import type { Approval } from "./types";

const approval: Approval = { id: "approval", runId: "run", botId: "nova", botName: "Nova", kind: "browser", reason: "Review upload", actionLabel: "Upload CV", status: "pending", createdAt: "now", decidedAt: null };
const run = { id: "run", botId: "nova", prompt: "Upload my saved CV" };
const args = { savedFileId: "file", selector: "#cv", name: "cv.pdf", size: 282, mime: "application/pdf", sha256: "a".repeat(64), origin: "https://jobs.example", targetFingerprint: "b".repeat(64), targetReview: { url: "https://jobs.example/apply", label: "CV", control: "input", fields: [], contextScope: "form" as const, complete: true as const } };

test("saved browser upload review binds exact file, destination and input", () => {
  const result = approvalPreview(approval, run, { type: "browser_upload_saved_file", botId: "nova", args });
  assert.equal(result.canApprove, true);
  for (const value of ["cv.pdf", "282 bytes", "a".repeat(64), "https://jobs.example/apply"]) assert.ok(result.fields.some((field) => field.value === value));
  for (const changed of [{ ...args, origin: "https://other.example" }, { ...args, extra: true }, { ...args, targetReview: { ...args.targetReview, control: "button" } }]) {
    assert.equal(approvalPreview(approval, run, { type: "browser_upload_saved_file", botId: "nova", args: changed }).canApprove, false);
  }
});

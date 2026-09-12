import test from "node:test";
import assert from "node:assert/strict";
import { isUnverifiedTextFallback } from "./delivery-fallback.js";
import type { Run } from "../shared/types.js";
const base = { attachmentIds: [], task: { verificationStatus: "partial", verificationSummary: "The result is ready, but it could not be fully checked automatically.", verificationChecks: [{ label: "A result was created", passed: true }, { label: "Final checks completed", passed: false }] } } as unknown as Run;
test("only the exact artifact-free host fallback is quiet", () => {
  const teammateChecks = { ...base, task: { ...base.task, verificationChecks: base.task.verificationChecks.map((check) => ({ ...check, source: "teammate" as const })) } };
  assert.equal(isUnverifiedTextFallback(teammateChecks, false, false), true);
  assert.equal(isUnverifiedTextFallback(teammateChecks, true, false), false);
  assert.equal(isUnverifiedTextFallback(teammateChecks, false), false);
  assert.equal(isUnverifiedTextFallback({ ...teammateChecks, task: { ...teammateChecks.task, verificationChecks: teammateChecks.task.verificationChecks.map((check) => ({ ...check, source: "host" as const })) } }, false, false), false);
  assert.equal(isUnverifiedTextFallback({ ...teammateChecks, task: { ...teammateChecks.task, verificationChecks: teammateChecks.task.verificationChecks.map((check) => ({ ...check, detail: "host evidence" })) } }, false, false), false);
  assert.equal(isUnverifiedTextFallback({ ...teammateChecks, attachmentIds: ["file-1"] }, false, true), false);
  assert.equal(isUnverifiedTextFallback({ ...base, task: { ...base.task, verificationChecks: [{ label: "A result was created", passed: true }] } }, false), false);
});

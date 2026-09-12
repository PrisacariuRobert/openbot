import test from "node:test";
import assert from "node:assert/strict";
import { decideTaskOutcome } from "./task-outcome.js";

const WITH_FILES = "Do the reconciliation.\n\nFiles attached by the user are available in your workspace. OpenBot has prepared bounded previews below.";
const PLAIN = "What is 17 + 25? Reply with the number only.";

test("delivered artifacts count as delivered, with or without inputs", () => {
  assert.deepEqual(
    decideTaskOutcome({ prompt: WITH_FILES, deliveredArtifacts: 2, deliveredReports: 0, verificationStatus: "pending" }),
    { outcome: "delivered", error: null },
  );
  assert.deepEqual(
    decideTaskOutcome({ prompt: PLAIN, deliveredArtifacts: 1, deliveredReports: 0, verificationStatus: null }),
    { outcome: "delivered", error: null },
  );
});

test("work reports and passed verification count as delivered", () => {
  assert.deepEqual(
    decideTaskOutcome({ prompt: WITH_FILES, deliveredArtifacts: 0, deliveredReports: 1, verificationStatus: "pending" }),
    { outcome: "delivered", error: null },
  );
  assert.deepEqual(
    decideTaskOutcome({ prompt: WITH_FILES, deliveredArtifacts: 0, deliveredReports: 0, verificationStatus: "passed" }),
    { outcome: "delivered", error: null },
  );
});

test("input files with nothing delivered and nothing verified are blocked, with an actionable error", () => {
  const result = decideTaskOutcome({ prompt: WITH_FILES, deliveredArtifacts: 0, deliveredReports: 0, verificationStatus: "pending" });
  assert.equal(result.outcome, "blocked");
  assert.match(result.error!, /without producing a result|continue from this task/);
});

test("a failed verification without delivery is also blocked, not silently completed", () => {
  const result = decideTaskOutcome({ prompt: WITH_FILES, deliveredArtifacts: 0, deliveredReports: 0, verificationStatus: "failed" });
  assert.equal(result.outcome, "blocked");
});

test("a plain answer with no checked deliverable stays outcome-less, never blocked", () => {
  assert.deepEqual(
    decideTaskOutcome({ prompt: PLAIN, deliveredArtifacts: 0, deliveredReports: 0, verificationStatus: null }),
    { outcome: null, error: null },
  );
});

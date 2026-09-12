import test from "node:test";
import assert from "node:assert/strict";
import { cancelledRunForTrigger, latestCancelledWithoutTrigger, needsCancelledRunOutcome } from "./cancelled-run-outcome.js";
import type { Run } from "../shared/types.js";

const run = (status: Run["status"], parentRunId: string | null = null) => ({ id: "run-1", status, parentRunId } as Run);
test("cancelled top-level runs need a durable outcome when no stop event exists", () => {
  assert.equal(needsCancelledRunOutcome(run("cancelled"), []), true);
  assert.equal(needsCancelledRunOutcome(run("cancelled", "parent"), []), false);
  assert.equal(needsCancelledRunOutcome(run("completed"), []), false);
  assert.equal(needsCancelledRunOutcome(run("cancelled"), [{ runId: "run-1", eventType: "run_stopped" } as never]), false);
});

test("cancelled outcomes stay attached to their trigger and ignore unrelated events", () => {
  const triggered = { ...run("cancelled"), triggerMessageId: "request-1", threadId: "thread-a" } as Run;
  const unrelated = { ...run("cancelled"), id: "run-2", triggerMessageId: "request-2", threadId: "thread-b" } as Run;
  assert.equal(cancelledRunForTrigger([triggered, unrelated], [], "request-1")?.id, "run-1");
  assert.equal(cancelledRunForTrigger([triggered, unrelated], [], "request-2")?.threadId, "thread-b");
  assert.equal(cancelledRunForTrigger([triggered], [{ id: "event", runId: "run-1", senderType: "system", kind: "text" } as never], "request-1"), undefined);
});

test("only the latest triggerless cancelled run is a fallback", () => {
  const old = { ...run("cancelled"), id: "old", finishedAt: "2026-09-11T09:00:00Z" } as Run;
  const latest = { ...run("cancelled"), id: "latest", finishedAt: "2026-09-12T09:00:00Z" } as Run;
  assert.equal(latestCancelledWithoutTrigger([old, latest], [])?.id, "latest");
  const retry = { ...run("running"), id: "retry", startedAt: "2026-09-12T10:00:00Z" } as Run;
  assert.equal(latestCancelledWithoutTrigger([latest, retry], []) , undefined);
  assert.equal(latestCancelledWithoutTrigger([latest], [{ senderType: "user", createdAt: "2026-09-12T10:00:00Z" } as never]), undefined);
});

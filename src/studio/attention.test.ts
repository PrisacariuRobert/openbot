import test from "node:test";
import assert from "node:assert/strict";
import type { Run } from "../shared/types";
import { tasksNeedingOwner } from "./attention";

const at = (iso: string) => new Date(iso).toISOString();
const run = (id: string, threadId: string, status: Run["status"], createdAt: string, extra: Partial<Run> = {}) => ({ id, threadId, status, startedAt: at(createdAt), finishedAt: at(createdAt), progressAt: at(createdAt), parentRunId: null, ...extra }) as unknown as Run;

test("a failure needs the owner only while it is recent and still the latest word in its chat", () => {
  const now = Date.parse("2026-09-23T12:00:00Z");
  const ids = tasksNeedingOwner([
    run("waiting", "a", "awaiting_approval", "2026-09-01T10:00:00Z"),
    run("fresh-failure", "b", "failed", "2026-09-23T09:00:00Z"),
    run("superseded", "c", "failed", "2026-09-22T09:00:00Z"),
    run("newer", "c", "completed", "2026-09-22T10:00:00Z"),
    run("old-failure", "d", "failed", "2026-09-09T09:00:00Z"),
    run("child-failure", "e", "failed", "2026-09-23T09:00:00Z", { parentRunId: "x" }),
    run("done", "f", "completed", "2026-09-23T09:00:00Z"),
  ], now).map((item) => item.id);
  assert.deepEqual(ids, ["waiting", "fresh-failure"]);
});

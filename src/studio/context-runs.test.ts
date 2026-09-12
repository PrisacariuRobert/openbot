import test from "node:test";
import assert from "node:assert/strict";
import { orderContextRuns } from "./context-runs.js";
import type { Run } from "../shared/types.js";

const run = (id: string, status: Run["status"], times: Partial<Pick<Run, "startedAt" | "progressAt" | "finishedAt">> = {}) => ({
  id, status, startedAt: null, progressAt: null, finishedAt: null, ...times,
} as Run);

test("context work puts active work before a newer completed result", () => {
  const active = run("active", "running", { startedAt: "2026-09-12T08:00:00Z" });
  const completed = run("newer", "completed", { finishedAt: "2026-09-12T09:00:00Z" });
  assert.deepEqual(orderContextRuns([completed, active]).map((item) => item.id), ["active", "newer"]);
});

test("context work keeps the latest completed result before an old failure", () => {
  const latest = run("inbox", "completed", { finishedAt: "2026-09-12T09:00:00Z" });
  const oldFailure = run("calendar", "failed", { finishedAt: "2026-09-11T09:00:00Z" });
  assert.deepEqual(orderContextRuns([oldFailure, latest]).map((item) => item.id), ["inbox", "calendar"]);
});

test("context work handles unsorted timestamps without mutating or dropping runs", () => {
  const runs = [
    run("old", "failed", { startedAt: "2026-09-01T09:00:00Z" }),
    run("middle", "completed", { progressAt: "2026-09-10T09:00:00Z" }),
    run("new", "completed", { startedAt: "2026-09-12T09:00:00Z" }),
  ];
  const original = runs.slice();
  const ordered = orderContextRuns(runs);
  assert.deepEqual(ordered.map((item) => item.id), ["new", "middle", "old"]);
  assert.deepEqual(runs, original);
  assert.equal(new Set(ordered.map((item) => item.id)).size, runs.length);
});

test("context work gives invalid timestamps a deterministic oldest position", () => {
  const invalid = run("invalid", "completed", { finishedAt: "not-a-date" });
  const dated = run("dated", "completed", { finishedAt: "2026-09-12T09:00:00Z" });
  assert.deepEqual(orderContextRuns([invalid, dated]).map((item) => item.id), ["dated", "invalid"]);
});

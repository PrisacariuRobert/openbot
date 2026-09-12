import test from "node:test";
import assert from "node:assert/strict";
import type { Run } from "../shared/types";
import { groupActivityAttentionRuns } from "./activity-attention";

const run = (id: string, status: Run["status"], patch: Partial<Run> = {}) => ({
  id,
  botId: "nova",
  botName: "Nova",
  status,
  error: null,
  approvalReason: null,
  finishedAt: null,
  progressAt: null,
  startedAt: null,
  ...patch,
} as Run);

test("pending decisions stay separate, come first, and retain newest-first order", () => {
  const groups = groupActivityAttentionRuns([
    run("failed-new", "failed", { error: "Provider unavailable", finishedAt: "2026-09-12T12:00:00.000Z" }),
    run("approval-old", "awaiting_approval", { approvalReason: "Review send", progressAt: "2026-09-12T09:00:00.000Z" }),
    run("ignored", "running"),
    run("approval-new", "awaiting_approval", { approvalReason: "Review send", progressAt: "2026-09-12T11:00:00.000Z" }),
  ]);

  assert.deepEqual(groups.map(({ run: item, count }) => [item.id, count]), [
    ["approval-new", 1],
    ["approval-old", 1],
    ["failed-new", 1],
  ]);
});

test("failures group only for the same teammate and exact failure reason", () => {
  const groups = groupActivityAttentionRuns([
    run("timeout-old", "failed", { error: "Timed out", finishedAt: "2026-09-12T08:00:00.000Z" }),
    run("auth", "failed", { error: "Sign-in required", finishedAt: "2026-09-12T10:00:00.000Z" }),
    run("timeout-new", "failed", { error: "Timed out", finishedAt: "2026-09-12T12:00:00.000Z" }),
    run("pixel-timeout", "failed", { botId: "pixel", botName: "Pixel", error: "Timed out", finishedAt: "2026-09-12T11:00:00.000Z" }),
    run("unknown-one", "failed", { error: null }),
    run("unknown-two", "failed", { error: null }),
  ]);

  assert.deepEqual(groups.map(({ run: item, count }) => [item.id, count]), [
    ["timeout-new", 2],
    ["pixel-timeout", 1],
    ["auth", 1],
    ["unknown-one", 1],
    ["unknown-two", 1],
  ]);
});

test("timestamp ties and missing timestamps preserve the incoming Studio order", () => {
  const groups = groupActivityAttentionRuns([
    run("first", "failed", { error: "First reason" }),
    run("second", "failed", { error: "Second reason" }),
    run("third", "failed", { error: "Third reason" }),
  ]);
  assert.deepEqual(groups.map(({ run: item }) => item.id), ["first", "second", "third"]);
});

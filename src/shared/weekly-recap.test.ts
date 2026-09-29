import test from "node:test";
import assert from "node:assert/strict";
import { duration, weeklyRecap, type RecapRun } from "./weekly-recap.js";

const now = Date.parse("2026-09-27T18:00:00Z");
const run = (over: Partial<RecapRun>): RecapRun => ({ botId: "nova", botName: "Nova", goal: "plan my week", finishedAt: "2026-09-26T10:00:00Z", activeDurationMs: 120_000, status: "completed", parentRunId: null, ...over });

test("weekly recap counts only real, finished, top-level work from the last 7 days", () => {
  assert.equal(weeklyRecap([], now), null);
  assert.equal(weeklyRecap([run({ status: "failed" }), run({ parentRunId: "x" }), run({ finishedAt: "2026-09-10T10:00:00Z" })], now), null);
  const recap = weeklyRecap([
    run({ goal: "plan my week please", activeDurationMs: 30 * 60_000 }),
    run({ goal: "hi there", activeDurationMs: 10_000 }),
    run({ goal: "Hi, after the fix", activeDurationMs: 90 * 60_000 }),
    run({ goal: "summarize the new invoices", finishedAt: "2026-09-27T09:00:00Z", activeDurationMs: 45 * 60_000 }),
    run({ botId: "pixel", botName: "Pixel", goal: "draft the launch post", activeDurationMs: 5 * 60_000 }),
    run({ status: "failed", goal: "should not count" }),
  ], now)!;
  assert.equal(recap.finished, 5);
  assert.equal(recap.headline, "Your team finished 5 things this week and worked 2 h 50 min so you didn't have to.");
  assert.equal(recap.detail, "Nova helped most, with 4 of them.");
  assert.deepEqual(recap.highlights, ["Summarize the new invoices", "Plan my week please", "Draft the launch post"]);
});

test("weekly recap stays modest for one short task", () => {
  const recap = weeklyRecap([run({ activeDurationMs: 20_000 })], now)!;
  assert.equal(recap.headline, "Your team finished 1 thing this week.");
  assert.equal(recap.detail, "Nova took care of it.");
  assert.equal(duration(59 * 60_000), "59 min");
  assert.equal(duration(120 * 60_000), "2 h");
});

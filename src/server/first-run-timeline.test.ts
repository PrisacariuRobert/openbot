import assert from "node:assert/strict";
import test from "node:test";
import { FirstRunClock, type FirstRunFacts, type FirstRunTimeline } from "./first-run-timeline.js";

const none: FirstRunFacts = { aiReady: false, teammates: false, jobStarted: false, listReady: false, jobFinished: false };

function clock(saved: FirstRunTimeline | null = null) {
  const store = { value: saved, writes: 0 };
  let seconds = 0;
  const instance = new FirstRunClock({ read: () => store.value, write: (timeline) => { store.value = structuredClone(timeline); store.writes++; } }, () => new Date(Date.UTC(2026, 9, 8, 9, 0, seconds)));
  return { instance, store, at: (next: number) => { seconds = next; } };
}

test("a new studio's first minutes are timed, first times only", () => {
  const { instance, store, at } = clock();
  instance.observe(none);
  at(4); instance.observe({ ...none, aiReady: true });
  at(6); instance.observe({ ...none, aiReady: true, teammates: true });
  at(9); instance.observe({ ...none, aiReady: true, teammates: true, jobStarted: true });
  at(161); instance.observe({ ...none, aiReady: true, teammates: true, jobStarted: true, listReady: true });
  at(170); instance.observe({ ...none, aiReady: true, teammates: true, jobStarted: true, listReady: true });
  const summary = instance.summary();
  assert.equal(summary.recorded, true);
  assert.deepEqual(summary.steps.map((step) => [step.step, step.afterSeconds]), [["opened", 0], ["ai_ready", 4], ["team_ready", 6], ["first_job", 9], ["first_list", 161]]);
  assert.equal(summary.usefulAfterSeconds, 161);
  assert.equal(store.writes, 5, "Nothing is written when nothing new happened");

  at(200); instance.observe({ aiReady: true, teammates: true, jobStarted: true, listReady: true, jobFinished: true });
  assert.equal(instance.summary().usefulAfterSeconds, 161, "The first useful moment is the earlier of the list and a finished job");
  const writes = store.writes;
  instance.observe({ aiReady: true, teammates: true, jobStarted: true, listReady: true, jobFinished: true });
  assert.equal(store.writes, writes, "A complete timeline is never touched again");
});

test("a studio that already had teammates is left out, and the timeline survives a restart", () => {
  const existing = clock();
  existing.instance.observe({ ...none, aiReady: true, teammates: true });
  assert.deepEqual(existing.store.value, { skipped: true });
  assert.equal(existing.instance.summary().recorded, false);
  existing.instance.mark("first_job");
  assert.deepEqual(existing.store.value, { skipped: true });

  const first = clock();
  first.instance.observe(none);
  first.at(30); first.instance.mark("first_job");
  const restarted = clock(first.store.value);
  restarted.at(50); restarted.instance.observe({ ...none, aiReady: true, teammates: true });
  assert.deepEqual(restarted.instance.summary().steps.map((step) => step.step), ["opened", "ai_ready", "team_ready", "first_job"]);
  assert.equal(restarted.instance.summary().usefulAfterSeconds, null);
});

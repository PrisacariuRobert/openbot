import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_EXECUTION_LIMITS,
  ExecutionMeter,
  executionLimits,
} from "./execution-policy.js";

test("execution limits reject invalid or unlimited configuration", () => {
  assert.deepEqual(executionLimits({}), DEFAULT_EXECUTION_LIMITS);
  for (const value of ["0", "-1", "NaN", "1.5", "9999", ""])
    assert.throws(() => executionLimits({ OPENBOT_RUN_MAX_MINUTES: value }));
  assert.equal(
    executionLimits({ OPENBOT_RUN_MAX_TOKENS: "20000" }).maxTokens,
    20_000,
  );
  assert.equal(executionLimits({ OPENBOT_JOB_MAX_TOKENS: "50000" }).maxJobTokens, 50_000);
  for (const value of ["0", "-1", "NaN", "1.5", "2000001", ""]) {
    assert.throws(() => executionLimits({ OPENBOT_JOB_MAX_TOKENS: value }));
  }
});

test("execution meter distinguishes silence from progress and bounds active time across resumes", () => {
  let now = 0;
  const limits = {
    ...DEFAULT_EXECUTION_LIMITS,
    maxActiveMs: 1000,
    maxIdleMs: 100,
  };
  const meter = new ExecutionMeter(limits, 800, 0, () => now);
  now = 90;
  meter.output(100); // Logs alone must not keep a stalled worker alive.
  assert.equal(meter.reason(0, false), null);
  now = 101;
  assert.equal(meter.reason(0, false), "idle");
  meter.progress();
  assert.equal(meter.reason(0, false), null);
  now = 200;
  meter.progress();
  assert.equal(meter.reason(0, false), "time");
});

test("step limits deduplicate stream events, include previous attempts, and respect usage/output limits", () => {
  const meter = new ExecutionMeter(
    {
      ...DEFAULT_EXECUTION_LIMITS,
      maxSteps: 3,
      maxTokens: 100,
      maxOutputBytes: 10,
    },
    0,
    1,
  );
  const step = { type: "step_finish", part: { id: "one" } };
  meter.event(step);
  meter.event(step);
  assert.equal(meter.steps, 2);
  assert.equal(meter.reason(99, false), null);
  assert.equal(meter.reason(100, false), "tokens");
  assert.equal(meter.reason(0, true), "weekly_budget");
  meter.event({ type: "assistant", message: { id: "second" } });
  assert.equal(meter.reason(0, false), "steps");
  meter.output(11);
  assert.equal(meter.reason(0, false), "output");
});

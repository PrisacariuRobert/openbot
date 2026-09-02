import test from "node:test";
import assert from "node:assert/strict";
import { normalizeRoutineInterval, routineScheduleLabel, routineStartsInLabel } from "./routines.js";

test("formats routine intervals in useful everyday language", () => {
  assert.equal(routineScheduleLabel(5), "Every 5 minutes");
  assert.equal(routineScheduleLabel(60), "Every hour");
  assert.equal(routineScheduleLabel(180), "Every 3 hours");
  assert.equal(routineScheduleLabel(1440), "Every day");
  assert.equal(routineScheduleLabel(10080), "Every week");
  assert.equal(routineStartsInLabel(5), "First run in 5 minutes");
  assert.equal(routineStartsInLabel(60), "First run in an hour");
  assert.equal(routineStartsInLabel(1440), "First run tomorrow");
});

test("keeps custom routine intervals within safe scheduler limits", () => {
  assert.equal(normalizeRoutineInterval(1), 5);
  assert.equal(normalizeRoutineInterval(90.4), 90);
  assert.equal(normalizeRoutineInterval(90_000), 43_200);
});

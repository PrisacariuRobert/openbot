import test from "node:test";
import assert from "node:assert/strict";
import { nextRoutineOccurrence, routineScheduleInput, schedulePreview, type RoutineSchedule } from "./calendar-schedule.js";

const daily = (timeZone = "Europe/Brussels", time = "08:00"): RoutineSchedule => ({ kind: "calendar", timeZone, time, daysOfWeek: [1, 2, 3, 4, 5, 6, 7] });
const next = (schedule: RoutineSchedule, after: string) => nextRoutineOccurrence(schedule, 1440, Date.parse(after));

test("weekdays keep their wall clock across DST and exclude weekends", () => {
  const schedule: RoutineSchedule = { ...daily(), daysOfWeek: [1, 2, 3, 4, 5] } as RoutineSchedule;
  assert.deepEqual(schedulePreview(schedule, 1440, Date.parse("2026-03-27T06:00:00Z")).nextRuns,
    ["2026-03-27T07:00:00.000Z", "2026-03-30T06:00:00.000Z", "2026-03-31T06:00:00.000Z"]);
  assert.equal(next(schedule, "2026-10-23T06:00:00Z"), "2026-10-26T07:00:00.000Z");
});

test("missing times use the first valid local time, not an hour of drift", () => {
  assert.equal(next(daily("Europe/Brussels", "02:30"), "2026-03-28T23:00:00Z"), "2026-03-29T01:00:00.000Z");
  assert.equal(next(daily("Europe/Brussels", "02:30"), "2026-03-29T01:00:00Z"), "2026-03-30T00:30:00.000Z");
  // Lord Howe's spring transition is only thirty minutes.
  assert.equal(next(daily("Australia/Lord_Howe", "02:15"), "2026-10-03T13:00:00Z"), "2026-10-03T15:30:00.000Z");
});

test("repeated wall times run only at the earlier occurrence", () => {
  const schedule = daily("America/New_York", "01:30");
  assert.equal(next(schedule, "2026-11-01T04:00:00Z"), "2026-11-01T05:30:00.000Z");
  assert.equal(next(schedule, "2026-11-01T05:30:00Z"), "2026-11-02T06:30:00.000Z");
  assert.equal(next(schedule, "2026-11-01T06:00:00Z"), "2026-11-02T06:30:00.000Z");
});

test("named zones handle fractional offsets and a skipped civil date", () => {
  assert.equal(next(daily("Asia/Kathmandu"), "2026-09-05T00:00:00Z"), "2026-09-05T02:15:00.000Z");
  assert.equal(next(daily("Pacific/Apia"), "2011-12-29T18:00:00Z"), "2011-12-30T18:00:00.000Z");
});

test("one-time schedules expire; preview retains a pending catch-up only once", () => {
  const schedule = routineScheduleInput.parse({ kind: "once", at: "2026-09-07T08:00:00+02:00", timeZone: "Europe/Brussels" });
  assert.equal(next(schedule, "2026-09-07T05:00:00Z"), "2026-09-07T06:00:00.000Z");
  assert.equal(next(schedule, "2026-09-07T06:00:00Z"), null);
  assert.deepEqual(schedulePreview(schedule, 1440, Date.parse("2026-09-08T00:00:00Z"), "2026-09-07T06:00:00.000Z").nextRuns, ["2026-09-07T06:00:00.000Z"]);
});

test("invalid and unsupported schedules are rejected rather than silently changed", () => {
  for (const overrides of [{ timeZone: "Mars/Base" }, { timeZone: "+02:00" }, { time: "24:00" }, { daysOfWeek: [] }, { daysOfWeek: [0] }, { daysOfWeek: [8] }, { cron: "* * * * *" }]) {
    assert.equal(routineScheduleInput.safeParse({ ...daily(), ...overrides }).success, false);
  }
  assert.equal(routineScheduleInput.safeParse({ kind: "once", at: "2026-09-07T08:00", timeZone: "UTC" }).success, false);
  assert.deepEqual(routineScheduleInput.parse({ ...daily(), daysOfWeek: [5, 1, 1] }), { ...daily(), daysOfWeek: [1, 5] });
});

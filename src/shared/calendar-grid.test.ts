import test from "node:test";
import assert from "node:assert/strict";
import { calendarMonthDays, calendarKeyDate, onceAtLocal } from "./calendar-grid.js";

test("calendar has six Monday-first weeks across year and leap-day boundaries", () => {
  const january = calendarMonthDays("2027-01-13");
  assert.equal(january.length, 42);
  assert.equal(january[0]!.toString(), "2026-12-28");
  assert.equal(january.at(-1)!.toString(), "2027-02-07");
  assert.equal(calendarMonthDays("2028-02-01").filter((day) => day.month === 2).length, 29);
});
test("calendar keyboard moves preserve civil dates without timezone conversion", () => {
  assert.equal(calendarKeyDate("2026-12-31", "ArrowRight"), "2027-01-01");
  assert.equal(calendarKeyDate("2028-03-31", "PageUp"), "2028-02-29");
  assert.equal(calendarKeyDate("2026-09-06", "Home"), "2026-08-31");
  assert.equal(calendarKeyDate("2026-09-06", "End"), "2026-09-06");
  assert.equal(calendarKeyDate("2026-09-06", "ArrowDown"), "2026-09-13");
  assert.equal(calendarKeyDate("2026-09-06", "Enter"), "2026-09-06");
});
test("one-time date selections use the saved zone and reject ambiguous clock times", () => {
  assert.equal(onceAtLocal("2026-09-07", "08:00", "Europe/Brussels"), "2026-09-07T06:00:00Z");
  assert.equal(onceAtLocal("2026-09-07", "08:00", "Asia/Kathmandu"), "2026-09-07T02:15:00Z");
  assert.throws(() => onceAtLocal("2026-03-29", "02:30", "Europe/Brussels"));
  assert.throws(() => onceAtLocal("2026-10-25", "02:30", "Europe/Brussels"));
  assert.throws(() => onceAtLocal("2026-09-07", "", "Europe/Brussels"));
  assert.throws(() => onceAtLocal("2026-09-07", "08:00", "Mars/Base"));
});

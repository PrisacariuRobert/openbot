import assert from "node:assert/strict";
import test from "node:test";
import { currentMoment } from "./current-moment.js";

test("states the owner's local date, time and offset", () => {
  const at = new Date("2026-09-30T14:05:00Z");
  assert.equal(currentMoment(at, "Europe/Bucharest"), `It is now Wednesday, 30 September 2026, 17:05 in the owner's time zone (Europe/Bucharest, UTC+03:00). Resolve "today", "tomorrow" and "this weekend" from this, and write times with this offset.`);
  assert.match(currentMoment(at, "UTC"), /Wednesday, 30 September 2026, 14:05 .*\(UTC, UTC\+00:00\)/);
  assert.match(currentMoment(at, "America/New_York"), /10:05 .*UTC-04:00/);
});

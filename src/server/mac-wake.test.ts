import test from "node:test";
import assert from "node:assert/strict";
import { plannedWakeTime, setMacWake, wakeCommand } from "./mac-wake.js";

test("the Mac wakes three minutes before the earliest active routine, in local time", () => {
  const routines = [
    { enabled: true, nextRunAt: "2026-09-28T06:00:00.000Z" }, // 08:00 in Vienna (UTC+2)
    { enabled: true, nextRunAt: "2026-09-28T16:30:00.000Z" },
    { enabled: false, nextRunAt: "2026-09-28T03:00:00.000Z" },
  ];
  assert.equal(plannedWakeTime(routines, -120), "07:57:00");
  assert.equal(plannedWakeTime([{ enabled: true, nextRunAt: "2026-09-28T22:01:00.000Z" }], -120), "23:58:00");
  assert.equal(plannedWakeTime([{ enabled: true, nextRunAt: "2026-09-28T22:02:00.000Z" }], -120), "23:59:00", "wraps back past midnight");
  assert.equal(plannedWakeTime([], -120), null);
});

test("only a validated pmset command reaches the admin prompt", async () => {
  assert.equal(wakeCommand("07:57:00"), "pmset repeat wakeorpoweron MTWRFSU 07:57:00");
  assert.equal(wakeCommand(null), "pmset repeat cancel");
  assert.throws(() => wakeCommand("07:57:00; rm -rf ~"));
  const ran: string[] = [];
  const state = await setMacWake(true, [{ enabled: true, nextRunAt: new Date(Date.now() + 3_600_000).toISOString() }], async (command) => { ran.push(command); });
  assert.equal(state.enabled, true);
  assert.match(ran[0]!, /^pmset repeat wakeorpoweron MTWRFSU \d\d:\d\d:00$/);
  await setMacWake(false, [], async (command) => { ran.push(command); });
  assert.equal(ran[1], "pmset repeat cancel");
  await assert.rejects(setMacWake(true, [], async () => {}), /Add a scheduled routine first/);
});

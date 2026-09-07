import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { OpenBotDatabase } from "./testing/database.js";
import type { Routine } from "../shared/types.js";

const input = { name: "Morning brief", botId: "nova", threadId: "bot-nova", prompt: "Prepare my brief", intervalMinutes: 1440 };
const calendar = { kind: "calendar" as const, timeZone: "Europe/Brussels", time: "08:00", daysOfWeek: [1, 2, 3, 4, 5] };
function queue(db: OpenBotDatabase, routine: Routine, failAt?: "receipt" | "run" | "linked") {
  const receipt = db.receiveAutomationEvent({ routine, source: "schedule", externalId: routine.nextRunAt!, dedupeKey: `schedule:${routine.nextRunAt}`, payloadSummary: "Scheduled run", payload: { scheduledFor: routine.nextRunAt } });
  assert.equal(receipt.duplicate, false);
  if (failAt === "receipt") throw new Error("injected crash after receipt");
  const run = db.createRun({ ...input, status: "queued", routineId: routine.id, automationEventId: receipt.event.id });
  if (failAt === "run") throw new Error("injected crash after run");
  db.linkAutomationEvent(receipt.event.id, run.id);
  db.addMessage({ threadId: routine.threadId, senderType: "system", senderId: null, body: "Scheduled", runId: run.id });
  if (failAt === "linked") throw new Error("injected crash after links");
}

test("legacy schema migration and unrelated edits preserve the exact next run", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-03-27T06:00:00Z") });
  const root = mkdtempSync(path.join(tmpdir(), "openbot-schedule-migration-"));
  let db = new OpenBotDatabase(root);
  try {
    const old = db.createRoutine({ ...input, intervalMinutes: 60 });
    db.close();
    const raw = new DatabaseSync(path.join(root, ".openbot/openbot.sqlite"));
    raw.exec("ALTER TABLE routines DROP COLUMN schedule_json"); raw.close();
    t.mock.timers.setTime(Date.parse("2026-03-27T06:45:00Z"));
    db = new OpenBotDatabase(root);
    const migrated = db.getRoutine(old.id)!;
    assert.deepEqual(migrated.schedule, { kind: "interval" });
    assert.equal(migrated.nextRunAt, old.nextRunAt);
    assert.equal(db.updateRoutine(old.id, { ...migrated, name: "Renamed" })!.nextRunAt, old.nextRunAt);
    assert.equal(db.toggleRoutine(old.id, true)!.nextRunAt, old.nextRunAt);
  } finally { db.close(); rmSync(root, { recursive: true, force: true }); }
});

test("occurrence transaction rolls back failures at every dispatch boundary", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-03-27T06:00:00Z") });
  const root = mkdtempSync(path.join(tmpdir(), "openbot-schedule-atomic-"));
  let db = new OpenBotDatabase(root);
  try {
    const routine = db.createRoutine({ ...input, schedule: calendar });
    t.mock.timers.setTime(Date.parse(routine.nextRunAt!));
    for (const phase of ["receipt", "run", "linked"] as const) {
      assert.throws(() => db.dispatchScheduledOccurrence(routine.id, routine.nextRunAt!, (r) => queue(db, r, phase)), /injected crash/);
      db.close(); db = new OpenBotDatabase(root);
      assert.equal(db.getRoutine(routine.id)!.nextRunAt, routine.nextRunAt);
      assert.equal(db.listAutomationEvents(routine.id).length, 0);
      assert.equal(db.listRoutineRuns(routine.id).length, 0);
    }
    const other = new OpenBotDatabase(root);
    try {
      assert.equal(db.dispatchScheduledOccurrence(routine.id, routine.nextRunAt!, (r) => queue(db, r)), true);
      assert.equal(other.dispatchScheduledOccurrence(routine.id, routine.nextRunAt!, () => assert.fail("Stale claim dispatched twice")), false);
      assert.equal(other.listRoutineRuns(routine.id).length, 1);
      assert.equal(other.getRoutine(routine.id)!.nextRunAt, "2026-03-30T06:00:00.000Z");
    } finally { other.close(); }
  } finally { db.close(); rmSync(root, { recursive: true, force: true }); }
});

test("a week of virtual downtime catches up once, then returns to calendar time", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-03-27T06:00:00Z") });
  const root = mkdtempSync(path.join(tmpdir(), "openbot-schedule-catchup-"));
  const db = new OpenBotDatabase(root);
  try {
    const routine = db.createRoutine({ ...input, schedule: calendar });
    t.mock.timers.setTime(Date.parse("2026-04-03T10:00:00Z"));
    assert.equal(db.dueRoutines().length, 1);
    db.dispatchScheduledOccurrence(routine.id, routine.nextRunAt!, (r) => queue(db, r));
    assert.equal(db.listRoutineRuns(routine.id).length, 1);
    assert.equal(db.dueRoutines().length, 0);
    assert.equal(db.getRoutine(routine.id)!.nextRunAt, "2026-04-06T06:00:00.000Z");
    assert.equal(db.listAutomationAlerts().filter((a) => a.kind === "missed").length, 1);
    assert.match(db.listAutomationAlerts()[0]!.message, /caught up once/);
  } finally { db.close(); rmSync(root, { recursive: true, force: true }); }
});

test("pause and schedule edits invalidate stale claims; old clients do not erase calendar times", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-03-27T06:00:00Z") });
  const root = mkdtempSync(path.join(tmpdir(), "openbot-schedule-edit-"));
  const db = new OpenBotDatabase(root);
  try {
    const routine = db.createRoutine({ ...input, schedule: calendar });
    db.updateRoutine(routine.id, { ...input, name: "New name", enabled: true });
    assert.deepEqual(db.getRoutine(routine.id)!.schedule, calendar);
    db.toggleRoutine(routine.id, false);
    t.mock.timers.setTime(Date.parse(routine.nextRunAt!));
    assert.equal(db.dispatchScheduledOccurrence(routine.id, routine.nextRunAt!, () => assert.fail()), false);
    assert.equal(db.toggleRoutine(routine.id, true)!.nextRunAt, "2026-03-30T06:00:00.000Z");
    assert.equal(db.updateRoutine(routine.id, { ...input, schedule: { ...calendar, time: "10:00" }, enabled: true })!.nextRunAt, "2026-03-27T09:00:00.000Z");
  } finally { db.close(); rmSync(root, { recursive: true, force: true }); }
});

test("one-time jobs catch up after restart and cannot be re-enabled in the past", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-09-05T06:00:00Z") });
  const root = mkdtempSync(path.join(tmpdir(), "openbot-schedule-once-"));
  const db = new OpenBotDatabase(root);
  try {
    const schedule = { kind: "once" as const, at: "2026-09-05T07:00:00.000Z", timeZone: "Europe/Brussels" };
    const routine = db.createRoutine({ ...input, schedule });
    t.mock.timers.setTime(Date.parse("2026-09-06T06:00:00Z"));
    db.dispatchScheduledOccurrence(routine.id, routine.nextRunAt!, (r) => queue(db, r));
    assert.equal(db.getRoutine(routine.id)!.enabled, false);
    assert.equal(db.getRoutine(routine.id)!.nextRunAt, null);
    assert.equal(db.dispatchScheduledOccurrence(routine.id, routine.nextRunAt!, () => assert.fail()), false);
    assert.throws(() => db.toggleRoutine(routine.id, true), /future date/);
    assert.throws(() => db.createRoutine({ ...input, schedule }), /future date/);
    assert.equal(db.createRoutine({ ...input, schedule, enabled: false }).enabled, false);
  } finally { db.close(); rmSync(root, { recursive: true, force: true }); }
});

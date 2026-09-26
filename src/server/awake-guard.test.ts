import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { AwakeGuard } from "./awake-guard.js";
import { OpenBotDatabase } from "./testing/database.js";

function fakeSpawn() {
  const calls: string[][] = [];
  let alive = 0;
  const impl = ((command: string, args: string[]) => {
    calls.push([command, ...args]);
    alive += 1;
    const child = new EventEmitter() as EventEmitter & { kill: () => boolean };
    child.kill = () => { alive -= 1; child.emit("exit", 0); return true; };
    return child;
  }) as never;
  return { impl, calls, alive: () => alive };
}

test("the Mac is kept awake only while work is active or an automation is about to run", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-awake-"));
  const db = new OpenBotDatabase(root);
  const spawned = fakeSpawn();
  let now = Date.parse("2026-09-23T07:00:00Z");
  const guard = new AwakeGuard({ db, platform: "darwin", spawnImpl: spawned.impl, now: () => now });
  try {
    guard.tick();
    assert.equal(spawned.alive(), 0, "idle studio: no assertion");

    const run = db.createRun({ threadId: "bot-nova", botId: "nova", prompt: "Work", status: "running" });
    guard.tick(); guard.tick();
    assert.equal(spawned.alive(), 1, "one assertion while working");
    assert.deepEqual(spawned.calls[0], ["caffeinate", "-i", "-w", String(process.pid)], "tied to this process; idle sleep only");
    assert.equal(guard.status().reason, "A teammate is working.");

    db.updateRun(run.id, { status: "completed", finishedAt: new Date(now).toISOString() });
    guard.tick();
    assert.equal(spawned.alive(), 0, "released when the work ends");

    const bot = db.getBot("nova")!;
    const routine = db.createRoutine({ botId: bot.id, threadId: bot.threadId, name: "Morning brief", prompt: "Brief me", intervalMinutes: 1440, enabled: true });
    (db as unknown as { db: { prepare: (sql: string) => { run: (...args: unknown[]) => void } } }).db.prepare("UPDATE routines SET next_run_at=? WHERE id=?").run(new Date(now + 10 * 60_000).toISOString(), routine.id);
    guard.tick();
    assert.equal(spawned.alive(), 0, "ten minutes out is not yet");
    now += 8 * 60_000;
    guard.tick();
    assert.equal(spawned.alive(), 1, "two minutes before the routine");
    assert.equal(guard.status().reason, "An automation is about to run.");
    now += 60 * 60_000;
    guard.tick();
    assert.equal(spawned.alive(), 0, "a long-overdue schedule does not hold the Mac awake forever");

    guard.stop();
    assert.equal(spawned.alive(), 0);
  } finally {
    guard.stop();
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("other platforms and the opt-out never hold an assertion", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-awake-off-"));
  const db = new OpenBotDatabase(root);
  const spawned = fakeSpawn();
  try {
    db.createRun({ threadId: "bot-nova", botId: "nova", prompt: "Work", status: "running" });
    new AwakeGuard({ db, platform: "linux", spawnImpl: spawned.impl }).tick();
    new AwakeGuard({ db, platform: "darwin", spawnImpl: spawned.impl, enabled: () => false }).tick();
    assert.equal(spawned.calls.length, 0);
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

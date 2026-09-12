import test from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { OpenBotDatabase } from "./testing/database.js";
import { OpenCodeRunner } from "./opencode.js";
import { AttachmentService } from "./attachments.js";
import { DEFAULT_EXECUTION_LIMITS } from "./execution-policy.js";
import type { Routine, Run } from "../shared/types.js";

async function waitForRun(db: OpenBotDatabase, id: string, status: Run["status"], timeoutMs = 3_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const run = db.getRun(id);
    if (run?.status === status) return run;
    await delay(20);
  }
  assert.fail(`Run ${id} did not become ${status}; last status was ${db.getRun(id)?.status}.`);
}

function runner(db: OpenBotDatabase, script: string) {
  return new OpenCodeRunner({
    db,
    internalToken: "fixture",
    internalUrl: "http://127.0.0.1:1",
    onChange: () => {},
    attachments: new AttachmentService(db),
    limits: { ...DEFAULT_EXECUTION_LIMITS, terminationGraceMs: 50 },
    runtimeCheck: () => ({ runtime: "opencode", detectedVersion: "fixture", compatibility: "verified" }),
    spawnProcess: (_command: string, _args: string[], options: SpawnOptions): ChildProcess => spawn(
      process.execPath,
      ["--input-type=module", "-e", script],
      { ...options, env: {} },
    ),
  });
}

function queueScheduledRun(db: OpenBotDatabase, routine: Routine): Run {
  let queued: Run | undefined;
  const scheduledFor = routine.nextRunAt!;
  assert.equal(db.dispatchScheduledOccurrence(routine.id, scheduledFor, (current) => {
    const receipt = db.receiveAutomationEvent({
      routine: current,
      source: "schedule",
      externalId: `schedule:${scheduledFor}`,
      dedupeKey: `schedule:${scheduledFor}`,
      payloadSummary: "Scheduled run",
      payload: { scheduledFor },
    });
    queued = db.createRun({
      threadId: current.threadId,
      botId: current.botId,
      prompt: current.prompt,
      status: "queued",
      routineId: current.id,
      automationEventId: receipt.event.id,
    });
    db.linkAutomationEvent(receipt.event.id, queued.id);
  }), true);
  return queued!;
}

test("a claimed scheduled run survives runner shutdown and database restart exactly once", { timeout: 8_000 }, async () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-routine-restart-"));
  let db = new OpenBotDatabase(root);
  const first = runner(db, "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)");
  let firstStopped = false;
  let second: OpenCodeRunner | undefined;
  try {
    db.chooseInitialProvider("local-opencode", "opencode/fixture");
    const routine = db.createRoutine({
      name: "Restart-safe brief",
      botId: "nova",
      threadId: "bot-nova",
      prompt: "Return the saved brief.",
      intervalMinutes: 5,
      schedule: { kind: "once", at: new Date(Date.now() + 100).toISOString(), timeZone: "UTC" },
    });
    await delay(Math.max(0, Date.parse(routine.nextRunAt!) - Date.now()) + 5);
    const scheduled = queueScheduledRun(db, db.getRoutine(routine.id)!);

    first.start();
    const claimed = await waitForRun(db, scheduled.id, "running");
    assert.equal(claimed.attemptCount, 1);
    await first.stop();
    firstStopped = true;
    assert.equal(db.getRun(scheduled.id)?.status, "queued", "graceful shutdown must durably release claimed work");
    db.close();

    db = new OpenBotDatabase(root);
    second = runner(db, 'console.log(JSON.stringify({type:"text",text:"Recovered scheduled result."}))');
    second.start();
    const completed = await waitForRun(db, scheduled.id, "completed");
    assert.equal(completed.attemptCount, 2, "the same durable job is reclaimed once after restart");
    assert.equal(completed.summary, "Recovered scheduled result.");
    assert.equal(db.listRoutineRuns(routine.id).length, 1, "restart must not create a second run for the occurrence");
    const events = db.listAutomationEvents(routine.id);
    assert.equal(events.length, 1);
    assert.equal(events[0]?.runId, scheduled.id);
  } finally {
    if (!firstStopped) await first.stop();
    if (second) await second.stop();
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

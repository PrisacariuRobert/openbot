import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { skillAuthoringFixture } from "./testing/skill-authoring-fixture.js";

/** Q01a-1: deterministic journey J1 (routine lifecycle) from
 * verification/cases.json, executed through the production conversation
 * runtime with scripted transport: no model, no allowance, no accounts.
 *
 * The runtime is state-driven like a real agent: every invocation re-lists,
 * acts once on current state, and stops at approvals (the run pauses; the
 * yolo fixture auto-approves; the next invocation continues). Oracles assert
 * the durable end-state from cases.json: single history, revision chain,
 * deletion receipt, decoy isolation, bounded tool calls. */

const runtime = `#!${process.execPath}
const fs = require('node:fs'), path = require('node:path');
const endpoint = process.env.OPENBOT_INTERNAL_URL, runId = process.env.OPENBOT_RUN_ID;
if (!endpoint || !runId) { console.log('Fixture runtime'); process.exit(0); }
const stateFile = path.join(process.cwd(), '.journey-j1.json');
const recordFile = path.join(process.cwd(), '.journey-j1-record-' + runId + '.json');
async function main() {
  const headers = { 'content-type': 'application/json', 'x-openbot-token': process.env.OPENBOT_INTERNAL_TOKEN };
  const base = { botId: process.env.OPENBOT_BOT_ID, runId };
  let calls = 0;
  const call = async (action, args) => {
    calls += 1;
    const r = await fetch(endpoint + '/api/internal/tools', { method: 'POST', headers, body: JSON.stringify({ ...base, action, args }) });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : { done: {} };
  const startedAt = Date.now();
  const finish = (text) => {
    fs.writeFileSync(stateFile, JSON.stringify(state));
    state.callsTotal = (state.callsTotal || 0) + calls;
    fs.writeFileSync(recordFile, JSON.stringify({ calls: state.callsTotal, elapsedMs: Date.now() - startedAt, done: state.done }));
    console.log(JSON.stringify({ type: 'text', text }));
  };
  if (state.done.deleted) {
    // The deletion was proposed last invocation; if the target is really
    // gone the journey is complete, otherwise fall through and keep going.
    const check = await call('routine_list', {});
    const gone = check.status === 200 && !check.body.routines.some((r) => r.name === 'Journey brief' || r.name === 'Journey brief v2');
    if (gone) { finish('Journey complete.'); return; }
  }
  // One invocation drives every direct step; proposing review pauses the run
  // and the next invocation continues. Loop bound keeps a stuck journey loud.
  for (let i = 0; i < 12; i++) {
    const list = await call('routine_list', {});
    if (list.status !== 200) { finish('Listing failed'); process.exitCode = 1; return; }
    const target = list.body.routines.find((r) => r.name === 'Journey brief' || r.name === 'Journey brief v2');
    if (!target) {
      // enabled:true is explicit here: the journey exercises pause next, and
      // tool-created routines otherwise save paused by default.
      const created = await call('routine_create', { name: 'Journey brief', prompt: 'Brief the owner.', intervalMinutes: 1440, enabled: true });
      if ((created.status !== 201 && created.status !== 200) || !created.body.routineId) { finish('Create failed'); process.exitCode = 1; return; }
      state.done.created = true;
      state.routineId = created.body.routineId;
      continue;
    }
    state.routineId = target.id;
    if (target.enabled && !state.done.paused) {
      const paused = await call('routine_pause', { routineId: target.id, expectedRevision: target.revision });
      if (paused.status !== 200 || paused.body.enabled !== false) { finish('Pause failed'); process.exitCode = 1; return; }
      state.done.paused = true;
      continue;
    }
    if (!target.enabled && !state.done.resumed) {
      const resumed = await call('routine_resume', { routineId: target.id, expectedRevision: target.revision });
      if (resumed.status !== 200 || !resumed.body.approvalRequired) { finish('Resume did not propose review'); process.exitCode = 1; return; }
      state.done.resumed = true;
      finish('Proposed the resume.');
      return;
    }
    if (!target.name.endsWith(' v2') && !state.done.updated) {
      const updated = await call('routine_update', { routineId: target.id, expectedRevision: target.revision, name: 'Journey brief v2' });
      if (updated.status !== 200 || !updated.body.approvalRequired) { finish('Update did not propose review'); process.exitCode = 1; return; }
      state.done.updated = true;
      finish('Proposed the update.');
      return;
    }
    if (!state.done.deleted) {
      const removed = await call('routine_delete', { routineId: target.id, expectedRevision: target.revision });
      if (removed.status !== 200 || !removed.body.approvalRequired) { finish('Delete did not propose review'); process.exitCode = 1; return; }
      state.done.deleted = true;
      finish('Proposed the deletion.');
      return;
    }
    finish('Journey complete.');
    return;
  }
  finish('Journey did not converge inside its step bound.');
  process.exitCode = 1;
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
`;

async function runVariant(variant: "J1A" | "J1B") {
  const clutter = variant === "J1B";
  const f = await skillAuthoringFixture({ runtime,
    configure(db) {
      if (clutter) db.createRoutine({ name: "Decoy routine", botId: "nova", threadId: "bot-nova", prompt: "Decoy work.", intervalMinutes: 60 });
    },
  });
  try {
    const response = await f.post("/api/messages", { threadId: "bot-nova", targetBotIds: ["nova"], body: "Handle the Journey brief routine through its full lifecycle." });
    assert.equal(response.status, 202, await response.clone().text());
    const { runs } = (await response.json()) as { runs: Array<{ id: string }> };
    const runId = runs[0]!.id;
    const completed = await f.until(() => f.db.getRun(runId)?.status === "completed" && f.db.getRun(runId));
    assert.ok(completed, `${variant}: journey run did not complete`);
    const record = JSON.parse(readFileSync(path.join(f.db.workspacesDir, "nova", `.journey-j1-record-${runId}.json`), "utf8")) as { calls: number; elapsedMs: number };
    // The catalogue contract this execution must satisfy.
    const catalogue = JSON.parse(readFileSync(new URL("../../verification/cases.json", import.meta.url), "utf8")) as {
      schema_version: number; journeys: Array<{ id: string; variants: Array<{ id: string; oracles: Record<string, number | boolean> }> }>;
    };
    assert.equal(catalogue.schema_version, 1);
    const oracles = catalogue.journeys.find((journey) => journey.id === "J1")!.variants.find((entry) => entry.id === variant)!.oracles;
    assert.ok(record.calls <= (oracles.maxToolCalls as number), `${variant}: ${record.calls} tool calls exceed budget`);
    assert.ok(record.elapsedMs < 120_000, "journey finishes inside its time box");

    const state = JSON.parse(readFileSync(path.join(f.db.workspacesDir, "nova", ".journey-j1.json"), "utf8")) as { routineId?: string };
    const targetId = state.routineId!;
    assert.ok(targetId, "journey recorded its target id");
    assert.equal(f.db.getRoutine(targetId), null, "target fully deleted");
    const receipt = f.db.getDeletedRoutineReceipt(targetId)!;
    assert.ok(receipt, "deletion receipt recorded");
    assert.equal(receipt.revisionAtDelete, 4, "create(1) -> pause(2) -> resume(3) -> update(4)");
    assert.equal(receipt.deletedByRunId, runId, "the journey run is recorded");
    const routines = f.db.listRoutines("bot-nova");
    assert.equal(routines.filter((routine) => routine.name.startsWith("Journey brief")).length, 0, "no duplicate target");
    assert.equal(routines.length, clutter ? 1 : 0, "exactly the intended record history remains");
    return { f, runId, routines };
  } catch (error) {
    await f.close();
    throw error;
  }
}

test("J1A: routine lifecycle completes on a clean thread", { timeout: 240_000 }, async () => {
  const { f, runId, routines } = await runVariant("J1A");
  try {
    assert.equal(routines.length, 0);
    void runId;
  } finally {
    await f.close();
  }
});

test("J1B: lifecycle isolates the target with a decoy present", { timeout: 240_000 }, async () => {
  const { f, runId, routines } = await runVariant("J1B");
  try {
    const decoy = routines.find((routine) => routine.name === "Decoy routine")!;
    assert.ok(decoy, "decoy still exists");
    assert.equal(decoy.enabled, true, "decoy never paused");
    assert.equal(decoy.revision, 1, "decoy never mutated");
    void runId;
  } finally {
    await f.close();
  }
});

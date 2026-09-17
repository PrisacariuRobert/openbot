import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenBotDatabase } from "./testing/database.js";
import { RoutineRevisionConflictError } from "./database.js";
import { skillAuthoringFixture } from "./testing/skill-authoring-fixture.js";

test("deletion records a durable receipt and never resurrects", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-routine-delete-"));
  const db = new OpenBotDatabase(root);
  let routineId = "";
  try {
    const created = db.createRoutine({ name: "Old brief", botId: "nova", threadId: "bot-nova", prompt: "Brief.", intervalMinutes: 1440 });
    routineId = created.id;
    db.createRun({ threadId: "bot-nova", botId: "nova", prompt: "Ran the brief.", status: "completed", routineId: created.id });
    assert.equal(db.deleteRoutine(created.id), true);
    assert.equal(db.getRoutine(created.id), null);
    const receipt = db.getDeletedRoutineReceipt(created.id)!;
    assert.equal(receipt.name, "Old brief");
    assert.equal(receipt.threadId, "bot-nova");
    assert.equal(receipt.revisionAtDelete, 1);
    assert.equal(receipt.deletedByRunId, null, "owner-UI deletes carry no run");
    assert.equal(db.listRoutineRuns(created.id).length, 1, "past runs stay readable as orphans");
    assert.equal(db.deleteRoutine(created.id, "run-2"), false, "second delete changes nothing");
    assert.equal(db.getDeletedRoutineReceipt(created.id)?.deletedByRunId, null, "first receipt wins");
    assert.equal(db.getDeletedRoutineReceipt("missing"), null);
  } finally {
    db.close();
  }
  const reopened = new OpenBotDatabase(root);
  try {
    assert.equal(reopened.getDeletedRoutineReceipt(routineId)?.name, "Old brief", "receipts survive restart");
  } finally {
    reopened.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("legacy toggle shares the guarded update path", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-routine-toggle-"));
  const db = new OpenBotDatabase(root);
  try {
    const created = db.createRoutine({ name: "Toggle me", botId: "nova", threadId: "bot-nova", prompt: "Work.", intervalMinutes: 60 });
    const paused = db.toggleRoutine(created.id, false)!;
    assert.equal(paused.enabled, false);
    assert.equal(paused.revision, 2);
    assert.equal(db.toggleRoutine(created.id, false)!.revision, 2, "no-op toggle bumps nothing");
    assert.throws(
      () => db.toggleRoutine(created.id, true, 1),
      (error: unknown) => error instanceof RoutineRevisionConflictError && error.currentRevision === 2,
    );
    assert.equal(db.toggleRoutine(created.id, true, 2)!.enabled, true);
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

/** P03c through the REAL host: delete proposes exact review, executes once
 * with a recorded receipt, keeps history, and can never resurrect. */
const runtime = `#!${process.execPath}
const fs = require('node:fs'), path = require('node:path');
const endpoint = process.env.OPENBOT_INTERNAL_URL, runId = process.env.OPENBOT_RUN_ID;
if (!endpoint || !runId) { console.log('Fixture runtime'); process.exit(0); }
const record = path.join(process.cwd(), '.routine-deletion-' + runId + '.json');
async function main() {
  if (fs.existsSync(record)) { console.log(JSON.stringify({ type: 'text', text: 'Deletion already proposed.' })); return; }
  const headers = { 'content-type': 'application/json', 'x-openbot-token': process.env.OPENBOT_INTERNAL_TOKEN };
  const base = { botId: process.env.OPENBOT_BOT_ID, runId };
  const call = (action, args, h = headers) => fetch(endpoint + '/api/internal/tools', { method: 'POST', headers: h, body: JSON.stringify({ ...base, action, args }) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  const obs = {};
  obs.list = await call('routine_list', {});
  const target = obs.list.body.routines.find((r) => r.name === 'Doomed brief');
  const pixelTarget = fs.existsSync('.pixel-target') ? fs.readFileSync('.pixel-target', 'utf8').trim() : null;
  obs.pixelTarget = pixelTarget;
  obs.staleDelete = await call('routine_delete', { routineId: target.id, expectedRevision: 999 });
  obs.crossThread = pixelTarget ? await call('routine_delete', { routineId: pixelTarget }) : { status: 'no-target', body: null };
  obs.unknown = await call('routine_delete', { routineId: 'missing' });
  // Last: proposing pauses the run, so nothing may follow it in this run.
  obs.proposal = await call('routine_delete', { routineId: target.id, expectedRevision: target.revision });
  fs.writeFileSync(record, JSON.stringify(obs));
  console.log(JSON.stringify({ type: 'text', text: 'Proposed the deletion. Nothing else was changed.' }));
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
`;

test("reviewed deletion executes once, keeps history, and cannot resurrect", { timeout: 180_000 }, async () => {
  const f = await skillAuthoringFixture({ runtime,
    configure(db) {
      const doomed = db.createRoutine({ name: "Doomed brief", botId: "nova", threadId: "bot-nova", prompt: "Brief.", intervalMinutes: 1440 });
      db.createRun({ threadId: "bot-nova", botId: "nova", prompt: "Ran once.", status: "completed", routineId: doomed.id });
      const pixel = db.createRoutine({ name: "Pixel routine", botId: "pixel", threadId: "bot-pixel", prompt: "Pixel work.", intervalMinutes: 1440 });
      mkdirSync(path.join(db.workspacesDir, "nova"), { recursive: true });
      writeFileSync(path.join(db.workspacesDir, "nova", ".pixel-target"), pixel.id);
    },
  });
  try {
    await f.post("/api/settings", { yoloMode: false }, "PATCH");
    const doomedId = f.db.listRoutines("bot-nova")[0]!.id;
    // Neutral prompt: the fixture runtime ignores it and calls the tools
    // directly. A delete-flavored prompt would (correctly) pause for prompt
    // review first, which is covered by the safety suites, not here.
    const response = await f.post("/api/messages", { threadId: "bot-nova", targetBotIds: ["nova"], body: "Show the automation follow-ups." });
    assert.equal(response.status, 202, await response.clone().text());
    const { runs } = (await response.json()) as { runs: Array<{ id: string }> };
    const runId = runs[0]!.id;
    const record = JSON.parse(await f.until(() => {
      const file = f.db.workspacesDir + "/nova/.routine-deletion-" + runId + ".json";
      return existsSync(file) ? readFileSync(file, "utf8") : undefined;
    })) as {
      list: { status: number };
      staleDelete: { status: number; body: { code?: string; currentRevision?: number } };
      proposal: { status: number; body: { approvalRequired?: boolean; approvalId?: string } };
      crossThread: { status: number };
      unknown: { status: number };
      pixelTarget: string | null;
    };
    assert.ok(record.pixelTarget, "cross-thread probe needs a real other-conversation routine id");
    assert.equal(record.list.status, 200);
    assert.equal(record.staleDelete.status, 409, "stale delete never reaches review");
    assert.equal(record.staleDelete.body.code, "routine_conflict");
    assert.equal(record.proposal.status, 200);
    assert.equal(record.proposal.body.approvalRequired, true);
    assert.equal(record.crossThread.status, 404);
    assert.equal(record.unknown.status, 404);
    const preview = (await (await fetch(`${f.base}/api/approvals/${record.proposal.body.approvalId}/preview`)).json()) as {
      canApprove: boolean; reviewFingerprint: string | null; fields: Array<{ label: string; value: string }>;
    };
    assert.equal(preview.canApprove, true);
    const labels = preview.fields.map((field) => field.label);
    assert.deepEqual(labels, ["Routine", "Listed at revision", "Delete", "Effect"]);
    assert.match(preview.fields[3]!.value, /stay available/);
    const decided = await f.post(`/api/approvals/${record.proposal.body.approvalId}/decide`, { decision: "approved", reviewFingerprint: preview.reviewFingerprint });
    assert.equal(decided.status, 200, await decided.clone().text());
    const done = await f.until(() => {
      const action = f.db.getApprovedAction(record.proposal.body.approvalId!);
      return action && action.status !== "prepared" && action.status !== "running" ? action : undefined;
    });
    assert.equal(done.status, "completed");
    assert.equal(f.db.getRoutine(doomedId), null, "the routine is gone");
    const receipt = f.db.getDeletedRoutineReceipt(doomedId)!;
    assert.equal(receipt.name, "Doomed brief");
    assert.equal(receipt.deletedByRunId, runId, "the executing run is recorded");
    assert.equal(f.db.listRoutineRuns(doomedId).length, 1, "history stays readable");
    // An old retry of the same approved delete cannot re-decide the approval.
    const replayed = await f.post(`/api/approvals/${record.proposal.body.approvalId}/decide`, { decision: "approved", reviewFingerprint: preview.reviewFingerprint });
    assert.equal(replayed.status, 409, "a decided approval cannot be re-decided");
    assert.equal(f.db.listRoutines("bot-nova").length, 0);
  } finally {
    await f.close();
  }
});

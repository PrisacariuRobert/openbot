import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenBotDatabase } from "./testing/database.js";
import { RoutineRevisionConflictError } from "./database.js";
import { skillAuthoringFixture } from "./testing/skill-authoring-fixture.js";

test("routine revisions guard stale writers at the database", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-routine-revision-"));
  const db = new OpenBotDatabase(root);
  let createdId = "";
  try {
    const created = db.createRoutine({ name: "Monday review", botId: "nova", threadId: "bot-nova", prompt: "Review.", intervalMinutes: 10080 });
    createdId = created.id;
    assert.equal(created.revision, 1);
    const renamed = db.updateRoutine(created.id, { name: "Tuesday review", botId: "nova", threadId: "bot-nova", prompt: "Review.", intervalMinutes: 10080, enabled: true })!;
    assert.equal(renamed.name, "Tuesday review");
    assert.equal(renamed.revision, 2);
    assert.throws(
      () => db.updateRoutine(created.id, { name: "Stale", botId: "nova", threadId: "bot-nova", prompt: "Review.", intervalMinutes: 10080, enabled: true }, 1),
      (error: unknown) => error instanceof RoutineRevisionConflictError && error.currentRevision === 2,
    );
    const fresh = db.updateRoutine(created.id, { name: "Fresh", botId: "nova", threadId: "bot-nova", prompt: "Review.", intervalMinutes: 10080, enabled: true }, 2)!;
    assert.equal(fresh.revision, 3);
  } finally {
    db.close();
  }
  const reopened = new OpenBotDatabase(root);
  try {
    assert.equal(reopened.getRoutine(createdId)?.revision, 3, "revisions survive restart");
  } finally {
    reopened.close();
    rmSync(root, { recursive: true, force: true });
  }
});

/** P03b through the REAL host: owner PATCH revision guard plus scoped model
 * pause (direct) and resume/update (exact owner review, then execution).
 * One approval per run: a paused run rejects further tool calls by design,
 * so each review flow gets its own run. Approvals are decided explicitly
 * through preview + fingerprint (yolo is disabled for determinism; the
 * shared auto-approval path is covered by yolo-mode tests).
 * Deterministic child, no model/account calls. */
const runtime = `#!${process.execPath}
const fs = require('node:fs'), path = require('node:path');
const endpoint = process.env.OPENBOT_INTERNAL_URL, runId = process.env.OPENBOT_RUN_ID;
if (!endpoint || !runId) { console.log('Fixture runtime'); process.exit(0); }
const record = path.join(process.cwd(), '.routine-mutations-' + runId + '.json');
async function main() {
  if (fs.existsSync(record)) { console.log(JSON.stringify({ type: 'text', text: 'Follow-up already proposed.' })); return; }
  const headers = { 'content-type': 'application/json', 'x-openbot-token': process.env.OPENBOT_INTERNAL_TOKEN };
  const base = { botId: process.env.OPENBOT_BOT_ID, runId };
  const call = (action, args, h = headers) => fetch(endpoint + '/api/internal/tools', { method: 'POST', headers: h, body: JSON.stringify({ ...base, action, args }) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  const obs = {};
  // Proposal phase when the test staged a target file, direct phase otherwise.
  if (!fs.existsSync('.routine-target')) {
    obs.phase = 'direct';
    obs.list = await call('routine_list', {});
    const target = obs.list.body.routines.find((r) => r.name === 'Monday review');
    const pixelTarget = fs.existsSync('.pixel-target') ? fs.readFileSync('.pixel-target', 'utf8').trim() : null;
    obs.pixelTarget = pixelTarget;
    obs.pause = await call('routine_pause', { routineId: target.id, expectedRevision: target.revision });
    obs.pauseAgain = await call('routine_pause', { routineId: target.id, expectedRevision: 999 });
    obs.crossThread = pixelTarget ? await call('routine_pause', { routineId: pixelTarget }) : { status: 'no-target', body: null };
    obs.unknown = await call('routine_pause', { routineId: 'missing' });
  } else {
    obs.phase = 'proposal';
    const target = JSON.parse(fs.readFileSync('.routine-target', 'utf8'));
    obs.proposal = await call(target.action, target.args);
  }
  fs.writeFileSync(record, JSON.stringify(obs));
  console.log(JSON.stringify({ type: 'text', text: 'Proposed the routine follow-up. Nothing else was changed.' }));
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
`;

async function decideExact(f: { base: string; post: (route: string, body: unknown, method?: string) => Promise<Response>; db: OpenBotDatabase }, approvalId: string) {
  const preview = (await (await fetch(`${f.base}/api/approvals/${approvalId}/preview`)).json()) as {
    canApprove: boolean; reviewFingerprint: string | null; fields: Array<{ label: string; value: string }>;
  };
  assert.equal(preview.canApprove, true, "routine reviews are approvable with exact fields");
  const labels = preview.fields.map((field) => field.label);
  assert.ok(labels.includes("Routine") && labels.includes("Listed at revision"), `review names the exact target: ${labels.join(",")}`);
  const decided = await f.post(`/api/approvals/${approvalId}/decide`, { decision: "approved", reviewFingerprint: preview.reviewFingerprint });
  assert.equal(decided.status, 200, await decided.clone().text());
  return preview;
}

test("pause executes directly with revision conflicts and thread bounds", { timeout: 180_000 }, async () => {
  const f = await skillAuthoringFixture({ runtime,
    configure(db) {
      db.createRoutine({ name: "Monday review", botId: "nova", threadId: "bot-nova", prompt: "Review the inbox.", intervalMinutes: 10080 });
      const pixel = db.createRoutine({ name: "Pixel routine", botId: "pixel", threadId: "bot-pixel", prompt: "Pixel work.", intervalMinutes: 10080 });
      // The fixture runtime works in nova's workspace directory; hand it the
      // other conversation's routine id through a file so the cross-thread
      // boundary is tested against a real existing routine.
      mkdirSync(path.join(db.workspacesDir, "nova"), { recursive: true });
      writeFileSync(path.join(db.workspacesDir, "nova", ".pixel-target"), pixel.id);
    },
  });
  try {
    const response = await f.post("/api/messages", { threadId: "bot-nova", targetBotIds: ["nova"], body: "Show the automation follow-ups." });
    assert.equal(response.status, 202, await response.clone().text());
    const { runs } = (await response.json()) as { runs: Array<{ id: string }> };
    const runId = runs[0]!.id;
    const completed = await f.until(() => f.db.getRun(runId)?.status === "completed" && f.db.getRun(runId));
    assert.ok(completed);
    const record = JSON.parse(readFileSync(f.db.workspacesDir + "/nova/.routine-mutations-" + runId + ".json", "utf8")) as {
      list: { status: number; body: { routines: Array<{ id: string; name: string; revision: number }> } };
      pause: { status: number; body: { ok: boolean; enabled: boolean; revision: number } };
      pauseAgain: { status: number; body: { code?: string; currentRevision?: number } };
      crossThread: { status: number };
      unknown: { status: number };
      pixelTarget: string | null;
    };
    assert.ok(record.pixelTarget, "cross-thread probe needs a real other-conversation routine id");
    assert.equal(record.list.status, 200);
    assert.equal(record.pause.status, 200);
    assert.equal(record.pause.body.enabled, false);
    assert.equal(record.pause.body.revision, 2, "pausing bumps the revision successors must bind");
    // A stale pause against the new revision conflicts instead of overwriting.
    assert.equal(record.pauseAgain.status, 409);
    assert.equal(record.pauseAgain.body.code, "routine_conflict");
    assert.equal(record.pauseAgain.body.currentRevision, 2);
    assert.equal(record.crossThread.status, 404, "another conversation's routine is not addressable here");
    assert.equal(record.unknown.status, 404);
    const stored = f.db.listRoutines("bot-nova").find((entry) => entry.name === "Monday review")!;
    assert.equal(stored.enabled, false);
    assert.equal(stored.revision, 2);
  } finally {
    await f.close();
  }
});

test("resume binds exact review and executes against the bound revision", { timeout: 180_000 }, async () => {
  const f = await skillAuthoringFixture({ runtime,
    configure(db) {
      db.createRoutine({ name: "Monday review", botId: "nova", threadId: "bot-nova", prompt: "Review the inbox.", intervalMinutes: 10080, enabled: false });
    },
  });
  try {
    await f.post("/api/settings", { yoloMode: false }, "PATCH");
    const created = f.db.listRoutines("bot-nova")[0]!;
    const target = { action: "routine_resume", args: { routineId: created.id, expectedRevision: created.revision } };
    const { mkdirSync: mkdir, writeFileSync: write } = await import("node:fs");
    mkdir(path.join(f.db.workspacesDir, "nova"), { recursive: true });
    write(path.join(f.db.workspacesDir, "nova", ".routine-target"), JSON.stringify(target));
    const response = await f.post("/api/messages", { threadId: "bot-nova", targetBotIds: ["nova"], body: "Show the automation follow-ups." });
    assert.equal(response.status, 202, await response.clone().text());
    const { runs } = (await response.json()) as { runs: Array<{ id: string }> };
    const runId = runs[0]!.id;
    const record = JSON.parse(await f.until(() => {
      const file = f.db.workspacesDir + "/nova/.routine-mutations-" + runId + ".json";
      return existsSync(file) ? readFileSync(file, "utf8") : undefined;
    })) as { proposal: { status: number; body: { approvalRequired?: boolean; approvalId?: string } } };
    assert.equal(record.proposal.status, 200);
    assert.equal(record.proposal.body.approvalRequired, true);
    await decideExact(f, record.proposal.body.approvalId!);
    const done = await f.until(() => {
      const action = f.db.getApprovedAction(record.proposal.body.approvalId!);
      return action && action.status !== "prepared" && action.status !== "running" ? action : undefined;
    });
    assert.equal(done.status, "completed");
    const resumed = f.db.getRoutine(created.id)!;
    assert.equal(resumed.enabled, true);
    assert.equal(resumed.revision, 2);
    assert.match(JSON.stringify(f.db.getApproval(record.proposal.body.approvalId!)), /Monday review/);
  } finally {
    await f.close();
  }
});

test("stale reviewed update fails instead of overwriting", { timeout: 180_000 }, async () => {
  const f = await skillAuthoringFixture({ runtime,
    configure(db) {
      db.createRoutine({ name: "Monday review", botId: "nova", threadId: "bot-nova", prompt: "Review the inbox.", intervalMinutes: 10080 });
    },
  });
  try {
    await f.post("/api/settings", { yoloMode: false }, "PATCH");
    const created = f.db.listRoutines("bot-nova")[0]!;
    const target = { action: "routine_update", args: { routineId: created.id, expectedRevision: 999, name: "Stale rename" } };
    const { mkdirSync: mkdir, writeFileSync: write } = await import("node:fs");
    mkdir(path.join(f.db.workspacesDir, "nova"), { recursive: true });
    write(path.join(f.db.workspacesDir, "nova", ".routine-target"), JSON.stringify(target));
    const response = await f.post("/api/messages", { threadId: "bot-nova", targetBotIds: ["nova"], body: "Show the automation follow-ups." });
    assert.equal(response.status, 202, await response.clone().text());
    const { runs } = (await response.json()) as { runs: Array<{ id: string }> };
    const runId = runs[0]!.id;
    const record = JSON.parse(await f.until(() => {
      const file = f.db.workspacesDir + "/nova/.routine-mutations-" + runId + ".json";
      return existsSync(file) ? readFileSync(file, "utf8") : undefined;
    })) as { proposal: { status: number; body: { approvalRequired?: boolean; approvalId?: string } } };
    assert.equal(record.proposal.status, 200);
    assert.equal(record.proposal.body.approvalRequired, true, "the review is exact even when the revision is already stale");
    await decideExact(f, record.proposal.body.approvalId!);
    const stale = await f.until(() => {
      const action = f.db.getApprovedAction(record.proposal.body.approvalId!);
      return action && action.status !== "prepared" && action.status !== "running" ? action : undefined;
    });
    assert.equal(stale.status, "failed", "a revision moved after review fails the action instead of applying it");
    assert.equal(f.db.getRoutine(created.id)?.name, "Monday review", "no stale rename landed");
  } finally {
    await f.close();
  }
});

test("owner PATCH enforces revisions and keeps legacy calls working", { timeout: 120_000 }, async () => {
  const f = await skillAuthoringFixture({
    runtime: `#!${process.execPath}\nconsole.log(JSON.stringify({type:'text',text:'No model work needed.'}));\n`,
    configure(db) {
      db.createRoutine({ name: "Patch me", botId: "nova", threadId: "bot-nova", prompt: "Work.", intervalMinutes: 60 });
    },
  });
  try {
    const id = f.db.listRoutines("bot-nova")[0]!.id;
    const legacy = await f.post(`/api/routines/${id}`, { name: "Legacy rename" }, "PATCH");
    assert.equal(legacy.status, 200, await legacy.clone().text());
    assert.equal(((await legacy.json()) as { revision: number }).revision, 2);
    const fresh = await f.post(`/api/routines/${id}`, { name: "Fresh rename", expectedRevision: 2 }, "PATCH");
    assert.equal(fresh.status, 200);
    assert.equal(((await fresh.json()) as { revision: number }).revision, 3);
    const stale = await f.post(`/api/routines/${id}`, { name: "Stale rename", expectedRevision: 2 }, "PATCH");
    assert.equal(stale.status, 409);
    const conflict = (await stale.json()) as { code?: string; currentRevision?: number };
    assert.equal(conflict.code, "routine_conflict");
    assert.equal(conflict.currentRevision, 3);
    assert.equal(f.db.getRoutine(id)?.name, "Fresh rename", "the stale write changed nothing");
  } finally {
    await f.close();
  }
});

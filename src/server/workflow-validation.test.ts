import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenBotDatabase } from "./testing/database.js";
import { WorkflowValidation } from "./workflow-validation.js";

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-workflow-check-"));
  const db = new OpenBotDatabase(root, { dataDir: path.join(root, "data") });
  // A saved provider choice, never a live connection or call.
  db.updateBot("nova", { model: "fixture/model" });
  const file = path.join(root, "SKILL.md"); writeFileSync(file, "Read the selected support ticket and cite it.");
  const workflow = db.saveWorkflow({ botId: "nova", name: "Support read", skillSlug: "support-read", startUrl: "https://example.com/support", instructions: "Read the selected ticket", steps: [], skillPath: file });
  const checks = new WorkflowValidation(db);
  return { root, db, file, workflow, checks, dispose() { db.close(); rmSync(root, { recursive: true, force: true }); } };
}
const routine = { name: "Read support", botId: "nova", threadId: "bot-nova", prompt: "/support-read ticket 3", intervalMinutes: 1440 };
function begin(f: ReturnType<typeof fixture>, input: string) {
  return f.checks.start(f.workflow.id, { input, expected: "A source-linked summary of this ticket", confirmed: true }).checks.at(-1)!.runId;
}
function finish(f: ReturnType<typeof fixture>, runId: string, tool = true) {
  if (tool) f.db.addActivity({ runId, botId: "nova", kind: "tool", label: "Read source", detail: "Controlled fixture source" });
  f.db.updateRun(runId, { status: "completed", summary: "Fixture ticket read; result supplied to owner", finishedAt: new Date().toISOString() });
}
function pass(f: ReturnType<typeof fixture>, input: string) {
  const runId = begin(f, input); finish(f, runId);
  f.checks.review(f.workflow.id, runId, { verdict: "passed", reviewedResult: true }); return runId;
}

test("two distinct owner-reviewed tool runs gate every routine enable path; plain routines unaffected", () => {
  const f = fixture(); try {
    // Seed defaults intentionally do not choose providers for a new user.
    const provider = f.db.listProviders()[0];
    assert.ok(provider); f.db.updateBot("nova", { providerInstanceId: provider.id, model: "fixture/model" });
    assert.throws(() => f.db.createRoutine(routine), /two different/);
    const draft = f.db.createRoutine({ ...routine, enabled: false });
    assert.throws(() => f.db.toggleRoutine(draft.id, true), /two different/);
    pass(f, "Ticket Alpha");
    assert.throws(() => begin(f, "  TICKET   ALPHA  "), /different input/);
    assert.throws(() => f.db.updateRoutine(draft.id, { ...routine, enabled: true }), /two different/);
    pass(f, "Ticket Beta");
    assert.equal(f.checks.status(f.workflow.id).ready, true);
    assert.equal(f.db.toggleRoutine(draft.id, true)!.enabled, true);
    assert.equal(f.db.createRoutine({ ...routine, prompt: "Say hello" }).enabled, true);
    assert.throws(() => f.db.createRoutine({ ...routine, botId: "pixel", threadId: "bot-pixel" }), /Assign this skill/);
  } finally { f.dispose(); }
});

test("self-certified, chat-only, failed, foreign and pending checks cannot pass", () => {
  const f = fixture(); try {
    f.db.updateBot("nova", { providerInstanceId: f.db.listProviders()[0]!.id, model: "fixture/model" });
    const id = begin(f, "Ticket Alpha");
    assert.throws(() => f.checks.review(f.workflow.id, id, { verdict: "passed" }), /./);
    assert.throws(() => f.checks.review(f.workflow.id, id, { verdict: "passed", reviewedResult: true }), /Wait/);
    assert.throws(() => begin(f, "Ticket Beta"), /current check/);
    finish(f, id, false);
    assert.throws(() => f.checks.review(f.workflow.id, id, { verdict: "passed", reviewedResult: true }), /tool work/);
    assert.throws(() => f.checks.review(f.workflow.id, "foreign-run", { verdict: "passed", reviewedResult: true }), /Other tasks/);
    f.checks.review(f.workflow.id, id, { verdict: "failed", reviewedResult: true });
    assert.throws(() => f.checks.review(f.workflow.id, id, { verdict: "passed", reviewedResult: true }), /already saved/);
    pass(f, "Ticket Beta"); pass(f, "Ticket Gamma");
    assert.equal(f.checks.status(f.workflow.id).ready, true);
    const failed = begin(f, "Ticket Delta"); f.db.updateRun(failed, { status: "failed", error: "Login expired" });
    assert.equal(f.checks.status(f.workflow.id).ready, false);
  } finally { f.dispose(); }
});

test("versions, on-disk edits, model changes and deletion invalidate receipts and queued runs", () => {
  const f = fixture(); try {
    f.db.updateBot("nova", { providerInstanceId: f.db.listProviders()[0]!.id, model: "fixture/model" });
    pass(f, "Ticket Alpha"); pass(f, "Ticket Beta");
    const scheduled = f.db.createRoutine(routine);
    const run = f.db.createRun({ ...routine, routineId: scheduled.id, status: "queued" });
    f.checks.assertRun(run.id);
    f.db.remember("nova", "Last checked ticket", "Owner-reviewed sample from today.");
    f.checks.assertRun(run.id);
    f.db.deleteExtensionRecord("workflow-run-v1", run.id);
    assert.throws(() => f.checks.assertRun(run.id), /older queued/);
    f.checks.bindRun(run.id, scheduled.id);
    writeFileSync(f.file, "Different instructions");
    assert.equal(f.checks.status(f.workflow.id).ready, false);
    assert.throws(() => f.checks.assertRun(run.id), /changed/);
    assert.throws(() => f.db.createRun({ ...routine, routineId: scheduled.id, status: "queued" }), /two different/);
    f.db.updateBot("nova", { model: "fixture/other" });
    assert.equal(f.checks.status(f.workflow.id).ready, false);
    f.db.deleteWorkflowRecord(f.workflow.id);
    assert.throws(() => f.checks.assertRoutine(scheduled), /removed/);
    assert.throws(() => f.db.createRoutine({ ...routine, prompt: "Use /support-read again" }), /removed/);
    f.db.toggleRoutine(scheduled.id, false); // Pausing is always possible.
  } finally { f.dispose(); }
});

test("rename and rollback create fresh checks; provider and input records survive restart", () => {
  const f = fixture(); try {
    f.db.updateBot("nova", { providerInstanceId: f.db.listProviders()[0]!.id, model: "fixture/model" });
    pass(f, "Ticket Alpha"); pass(f, "Ticket Beta");
    const scheduled = f.db.createRoutine(routine);
    const other = new OpenBotDatabase(f.root, { dataDir: f.db.dataDir });
    try { assert.equal(new WorkflowValidation(other).status(f.workflow.id).ready, true); } finally { other.close(); }
    f.db.updateWorkflowRecord(f.workflow.id, { name: "Read issues", skillSlug: "read-issues", skillPath: f.file, startUrl: f.workflow.startUrl });
    assert.throws(() => f.checks.assertRoutine(scheduled), /two different/);
    assert.throws(() => f.db.createRoutine({ ...routine, prompt: "Now /support-read ticket 4" }), /renamed/);
    assert.equal(f.checks.status(f.workflow.id).ready, false);
    const old = f.db.getWorkflowVersion(f.workflow.id, 1)!;
    f.db.reviseWorkflowRecord(f.workflow.id, { ...old, skillSlug: "support-read", skillPath: f.file });
    assert.equal(f.db.getWorkflowRecord(f.workflow.id)!.workflow.version, 3);
    assert.equal(f.checks.status(f.workflow.id).ready, false);
  } finally { f.dispose(); }
});

test("old checks expire; starting a check requires an explicit provider choice", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-09-05T12:00:00Z") });
  const f = fixture(); try {
    assert.throws(() => begin(f, "Ticket Alpha"), /provider and model/);
    f.db.updateBot("nova", { providerInstanceId: f.db.listProviders()[0]!.id, model: "fixture/model" });
    pass(f, "Ticket Alpha"); pass(f, "Ticket Beta");
    t.mock.timers.tick(31 * 86400_000);
    assert.equal(f.checks.status(f.workflow.id).ready, false);
    assert.throws(() => f.db.createRoutine(routine), /two different/);
  } finally { f.dispose(); }
});

test("disconnected app inventory does not invalidate checks but granted access does", () => {
  const f = fixture(); try {
    f.db.updateBot("nova", { providerInstanceId: f.db.listProviders()[0]!.id, model: "fixture/model" });
    pass(f, "Ticket Alpha"); pass(f, "Ticket Beta");
    f.db.configureGoogleConnector({ clientId: "fixture.apps.googleusercontent.com" });
    assert.equal(f.checks.status(f.workflow.id).ready, true);
    f.db.setBotConnectorAccess("nova", { canRead: true, canSend: false }, "gmail");
    assert.equal(f.checks.status(f.workflow.id).ready, false);
  } finally { f.dispose(); }
});

test("same-account sign-in invalidates checks; access-token refresh does not", () => {
  const f = fixture(); try {
    f.db.updateBot("nova", { providerInstanceId: f.db.listProviders()[0]!.id, model: "fixture/model" });
    f.db.configureGoogleConnector({ clientId: "fixture.apps.googleusercontent.com" });
    const account = { accessToken: "fixture-only", refreshToken: "fixture-refresh", expiresAt: "2030-01-01T00:00:00Z", scopes: ["https://www.googleapis.com/auth/gmail.readonly"], accountEmail: "fixture@example.com" };
    f.db.completeGoogleConnector(account);
    pass(f, "Ticket Alpha"); pass(f, "Ticket Beta");
    f.db.updateGoogleAccessToken("fixture-rotated", account.expiresAt);
    assert.equal(f.checks.status(f.workflow.id).ready, true);
    f.db.completeGoogleConnector(account);
    assert.equal(f.checks.status(f.workflow.id).ready, false);
  } finally { f.dispose(); }
});

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenBotDatabase } from "./testing/database.js";
import { BrowserManager } from "./runtime.js";
import { proposeSkillFromRun } from "./skill-proposals.js";
import { skillSlug } from "../shared/skills.js";
import { WorkflowValidation } from "./workflow-validation.js";

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-skill-proposal-")), db = new OpenBotDatabase(root);
  return { root, db, runtime: new BrowserManager(db), close: () => { db.close(); rmSync(root, { recursive: true, force: true }); } };
}

test("a completed, verified run becomes a receipt-cited skill draft — proposed by the owner", async () => {
  const f = fixture();
  try {
    const bot = f.db.getBot("nova")!;
    const run = f.db.createRun({ threadId: bot.threadId, botId: bot.id, prompt: "Prepare the launch checklist for the website", status: "queued" });
    f.db.verifyRunTask(run.id, {
      status: "passed",
      summary: "Drafted the launch checklist with sections for copy, QA and sign-off, then saved it as a file.",
      checks: [
        { label: "Checklist covers copy, QA and sign-off", passed: true, source: "host", detail: "Saved file contains all three headings" },
        { label: "No placeholder text remains", passed: true, source: "teammate", detail: null },
      ],
    });
    f.db.updateRun(run.id, { status: "completed", finishedAt: new Date().toISOString(), summary: "Drafted the launch checklist with sections for copy, QA and sign-off, then saved it as a file." });
    f.db.finishRunTask(run.id, "completed");

    const proposal = await proposeSkillFromRun(f.db, f.runtime, run.id);
    assert.equal(proposal.created, true);
    assert.equal(proposal.checksTotal, 2);
    assert.equal(proposal.checksHost, 1);
    assert.equal(proposal.sourceRunId, run.id);
    const source = f.db.extensionRecord<{ receipt: unknown; verificationStatus: string; receiptDigest: string; workflowId: string; workflowVersion: number }>("run-skill-proposals-v1", run.id)!;
    assert.equal(source.workflowId, proposal.workflowId);
    assert.equal(source.workflowVersion, 1);
    assert.deepEqual(source.receipt, f.db.buildRunReceipt(run.id));
    assert.equal(source.receiptDigest, createHash("sha256").update(JSON.stringify({ receipt: source.receipt, verificationStatus: source.verificationStatus })).digest("hex"));
    const workflow = f.db.listWorkflows(bot.id).find((entry) => entry.id === proposal.workflowId)!;
    assert.equal(workflow.source, "proposed");
    assert.equal(workflow.skillSlug, skillSlug(workflow.name));
    const skillFile = path.join(f.db.workspacesDir, bot.id, ".opencode", "skills", workflow.skillSlug, "SKILL.md");
    assert.equal(existsSync(skillFile), true);
    const content = readFileSync(skillFile, "utf8");
    assert.match(content, /launch checklist/);
    assert.match(content, /verified on this host/);
    assert.match(content, /1\/2 checks verified/);
    assert.match(content, /validate on a different owner-supplied input/);
    assert.ok(content.includes(run.id), "the draft cites its actual source task");
    assert.equal(new WorkflowValidation(f.db).status(workflow.id).ready, false, "the source run is not a validation check");
    assert.throws(() => new WorkflowValidation(f.db).assertRoutine({ botId: bot.id, prompt: `/${workflow.skillSlug}` }), /two different/);
    // Saving again does not duplicate the skill.
    const again = await proposeSkillFromRun(f.db, f.runtime, run.id);
    assert.equal(again.created, false);
    assert.equal(again.workflowId, proposal.workflowId);
    assert.equal(f.db.listWorkflows(bot.id).length, 1);
    f.db.verifyRunTask(run.id, { status: "partial", summary: "A later check found missing coverage.", checks: [{ label: "Later check", passed: false, source: "host" }] });
    const afterCorrection = await proposeSkillFromRun(f.db, f.runtime, run.id);
    assert.equal(afterCorrection.checksHost, 1, "retry reports the original snapshot, not revised history");
    assert.deepEqual(f.db.extensionRecord("run-skill-proposals-v1", run.id), source, "resaving never silently rewrites provenance");
  } finally { f.close(); }
});

test("skill proposals belong to task IDs, not titles, and survive renaming and restart", async () => {
  const f = fixture();
  try {
    const first = f.db.createRun({ threadId: "bot-nova", botId: "nova", prompt: "Prepare the launch checklist", status: "completed" });
    const second = f.db.createRun({ threadId: "bot-nova", botId: "nova", prompt: "Prepare the launch checklist", status: "completed" });
    const one = await proposeSkillFromRun(f.db, f.runtime, first.id);
    const two = await proposeSkillFromRun(f.db, f.runtime, second.id);
    assert.notEqual(one.workflowId, two.workflowId, "a repeated title is not the same task");
    const record = f.db.getWorkflowRecord(one.workflowId)!;
    f.db.updateWorkflowRecord(one.workflowId, { name: "My edited checklist", skillSlug: "my-edited-checklist", startUrl: record.workflow.startUrl, skillPath: record.skillPath });
    const reopened = new OpenBotDatabase(f.root);
    try {
      const again = await proposeSkillFromRun(reopened, new BrowserManager(reopened), first.id);
      assert.equal(again.created, false);
      assert.equal(again.workflowId, one.workflowId);
      assert.equal(again.name, "My edited checklist");
      assert.equal(reopened.listWorkflows("nova").length, 2);
    } finally { reopened.close(); }
  } finally { f.close(); }
});

test("failed checks remain failures and large evidence cannot truncate the draft warning", async () => {
  const f = fixture();
  try {
    const run = f.db.createRun({ threadId: "bot-nova", botId: "nova", prompt: "Check the migration result", status: "completed" });
    f.db.setRunTaskPlan(run.id, { goal: "Check the migration result", deliverable: "A detailed migration result ".repeat(20), steps: ["Inspect the source"] });
    f.db.updateRun(run.id, { summary: "A long teammate-reported observation. ".repeat(80) });
    f.db.verifyRunTask(run.id, {
      status: "partial", summary: "The migration is not fully checked.",
      checks: Array.from({ length: 8 }, (_, n) => ({ label: `Missing source ${n} ${"detail ".repeat(25)}`, passed: false, source: "host" as const, detail: "The file was not found. ".repeat(20) })),
    });
    const proposal = await proposeSkillFromRun(f.db, f.runtime, run.id);
    const instructions = f.db.getWorkflowRecord(proposal.workflowId)!.workflow.instructions;
    assert.match(instructions, /host check failed/);
    assert.doesNotMatch(instructions, /✕[^\n]+\(verified on this host\)/);
    assert.ok(instructions.includes(run.id));
    assert.match(instructions, /not a proven automation/);
    assert.match(instructions, /partial/);
    assert.match(instructions, /additional checks/);
    assert.ok(instructions.length <= 5_000);
  } finally { f.close(); }
});

test("unfinished tasks and private consultations cannot become skills", async () => {
  const f = fixture();
  try {
    const bot = f.db.getBot("pixel")!;
    const queued = f.db.createRun({ threadId: bot.threadId, botId: bot.id, prompt: "Prepare the weekly brief for the team", status: "queued" });
    await assert.rejects(() => proposeSkillFromRun(f.db, f.runtime, queued.id), /Only a finished task/);
    const parent = f.db.createRun({ threadId: bot.threadId, botId: bot.id, prompt: "Prepare the weekly brief for the team", status: "completed" });
    const child = f.db.createRun({ threadId: bot.threadId, botId: "scout", prompt: "Consultation for the weekly brief", status: "completed", parentRunId: parent.id });
    await assert.rejects(() => proposeSkillFromRun(f.db, f.runtime, child.id), /Private consultations/);
    await assert.rejects(() => proposeSkillFromRun(f.db, f.runtime, "missing-run"), /not available/);
    assert.equal(f.db.listWorkflows(bot.id).length, 0);
  } finally { f.close(); }
});

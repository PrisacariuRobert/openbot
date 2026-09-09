import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { parseAuthoredSkill } from "./skill-authoring.js";
import { learningCommandDirection } from "../shared/skill-authoring.js";
import { approvalPreview } from "../shared/approval-preview.js";
import { OpenBotDatabase } from "./testing/database.js";
import { BrowserManager } from "./runtime.js";
import { prepareWorkspace } from "./workspace.js";
import { parseAgentsSkillMarkdown, parseSkillPackage } from "./skill-library.js";
import { WorkflowValidation } from "./workflow-validation.js";
import { toolAvailability } from "./tool-availability.js";

const draft = { name: "Invoice reconciliation", description: "Reconcile supplied invoice files without changing originals.", instructions: "Ask for {{invoice_folder}} and {{currency}}. Read the supplied files. Reconcile each line and flag missing totals. Save an editable result; reopen it to verify formulas and totals. Stop for ambiguous currencies or missing access. Do not send anything without approval." };

test("conversational skills accept non-browser work and reject malformed or private drafts", () => {
  assert.equal(parseAuthoredSkill(draft).startUrl, "");
  assert.deepEqual(parseAuthoredSkill(draft).steps, []);
  assert.equal(parseAuthoredSkill({ ...draft, startUrl: "https://example.com/invoices" }).startUrl, "https://example.com/invoices");
  for (const changed of [
    { instructions: "" }, { instructions: "x".repeat(5001) }, { execute: true },
    { startUrl: "file:///private/secret" }, { startUrl: "not-a-url" },
    { startUrl: "https://owner:password@example.com" }, { startUrl: "https://example.com?token=secret" },
    { instructions: "Use api_key=private-secret" }, { instructions: "Use sk-" + "a".repeat(30) },
  ]) assert.throws(() => parseAuthoredSkill({ ...draft, ...changed }));
  assert.equal(parseAgentsSkillMarkdown("---\nname: reconcile\ndescription: Reconcile files\n---\nRead provided files and verify the result.").startUrl, "");
});

test("learn is an explicit command and the review includes the entire saved procedure", () => {
  assert.match(learningCommandDirection("/learn"), /focused question/);
  assert.match(learningCommandDirection(" /learn Reconcile invoices"), /skill_propose/);
  assert.equal(learningCommandDirection("/learning"), "");
  assert.equal(learningCommandDirection("Quote the text /learn"), "");
  const approval = { id: "approval", runId: "run", botId: "nova", botName: "Nova", kind: "external" as const, reason: "Review the skill", actionLabel: "Save skill", status: "pending" as const, createdAt: "2026-09-08", decidedAt: null };
  const run = { id: "run", botId: "nova", prompt: "/learn Reconcile invoices" };
  const preview = approvalPreview(approval, run, { type: "skill_propose", botId: "nova", args: draft });
  assert.equal(preview.canApprove, true, "A local skill does not require a connected external account");
  assert.equal(preview.fields.find(field => field.label === "Instructions to save")?.value, draft.instructions);
  assert.match(preview.fields.find(field => field.label === "Effect")!.value, /Nothing is run or scheduled/);
  for (const instructions of ["", "password=private-secret", "x".repeat(5001)]) {
    assert.equal(approvalPreview(approval, run, { type: "skill_propose", botId: "nova", args: { ...draft, instructions } }).canApprove, false);
  }
});

test("general skills persist in both runtimes, round-trip, and need distinct checks before scheduling", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-authored-skill-")), db = new OpenBotDatabase(root);
  try {
    db.updateBot("nova", { providerInstanceId: "local-opencode", model: "opencode/fixture", browserEnabled: false, computerEnabled: false });
    const before = db.botSessionFingerprint("nova"), otherBotBefore = db.botSessionFingerprint("pixel");
    const manager = new BrowserManager(db), skill = manager.createTaughtWorkflow("nova", parseAuthoredSkill(draft), "proposed");
    assert.notEqual(db.botSessionFingerprint("nova"), before, "New skills invalidate the owner's cached runtime context");
    assert.equal(db.botSessionFingerprint("pixel"), otherBotBefore, "Another teammate's skill is not exposed");
    prepareWorkspace(db, db.getBot("nova")!);
    for (const runtime of [".opencode", ".claude"]) {
      const content = readFileSync(path.join(db.workspacesDir, "nova", runtime, "skills", skill.skillSlug, "SKILL.md"), "utf8");
      assert.ok(content.includes(draft.instructions));
      assert.match(content, /No starting website is required/);
      assert.doesNotMatch(content, /example\.com|Start at \./);
    }
    const wrapper = readFileSync(path.join(db.workspacesDir, "nova", ".opencode", "tools", "skill_propose.ts"), "utf8");
    assert.match(wrapper, /action: "skill_propose"/);
    assert.match(wrapper, /x-openbot-token/);
    assert.notEqual(toolAvailability(db, db.getBot("nova")!).skill_propose, false);
    assert.equal(toolAvailability(db, db.getBot("nova")!, true).skill_propose, false);
    assert.equal(parseSkillPackage(manager.exportTaughtWorkflow(skill.id)).startUrl, "");
    const checks = new WorkflowValidation(db);
    const routine = { name: "Reconcile", botId: "nova", threadId: "bot-nova", prompt: `/${skill.skillSlug}`, intervalMinutes: 1440 };
    assert.throws(() => db.createRoutine(routine), /two different/);
    for (const input of ["Invoice A in EUR", "Invoice B in EUR"]) {
      const id = checks.start(skill.id, { input, expected: "Editable reconciled workbook", confirmed: true }).checks.at(-1)!.runId;
      db.addActivity({ runId: id, botId: "nova", kind: "tool", label: "Verified fixture workbook", detail: input });
      db.updateRun(id, { status: "completed", summary: "Fixture result reviewed", finishedAt: new Date().toISOString() });
      checks.review(skill.id, id, { verdict: "passed", reviewedResult: true });
    }
    assert.equal(checks.status(skill.id).ready, true);
    const edited = manager.updateTaughtWorkflow(skill.id, { ...draft, startUrl: "", instructions: draft.instructions + " Also verify row counts." });
    assert.equal(edited?.version, 2);
    assert.equal(checks.status(skill.id).ready, false, "An edit invalidates previously reviewed checks");
    assert.throws(() => db.createRoutine(routine), /two different/);
    assert.equal(manager.rollbackTaughtWorkflow(skill.id, 1)?.startUrl, "");
  } finally { db.close(); rmSync(root, { recursive: true, force: true }); }
});

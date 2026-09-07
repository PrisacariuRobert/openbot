import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenBotDatabase } from "./testing/database.js";
import { CodeProjectManager } from "./code-projects.js";
import { CodeCheckService } from "./code-checks.js";
import { AttachmentService } from "./attachments.js";

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-code-check-")), source = path.join(root, "shop");
  mkdirSync(source);
  const git = (cwd: string, ...args: string[]) => {
    const result = spawnSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1" } });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git(source, "init", "-b", "main");
  // A deliberately faulty implementation and an independent, unchanged oracle.
  writeFileSync(path.join(source, "total.cjs"), "module.exports = items => items.reduce((sum, item) => sum + item.price, 0);\n");
  writeFileSync(path.join(source, "total.test.cjs"), "const assert = require('node:assert/strict'); const total = require('./total.cjs'); assert.equal(total([{price:12,quantity:3},{price:5,quantity:2}]),46); assert.equal(total([]),0);\n");
  git(source, "add", ".");
  git(source, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.com", "commit", "-m", "Fixture bug");
  git(source, "remote", "add", "origin", "https://github.com/example/fixture.git");
  const db = new OpenBotDatabase(root), projects = new CodeProjectManager(db, root, { withGitHubIdentity: async () => { assert.fail("Code-check fixtures must reject publication before any account or network operation"); } });
  const project = db.createCodeProject({ name: "Shop", ...projects.inspectRoot(source), access: [{ botId: "nova", canRead: true, canWrite: true, canRun: true }, { botId: "pixel", canRead: true, canWrite: false, canRun: false }] });
  const run = db.createRun({ botId: "nova", threadId: "bot-nova", status: "running", prompt: "Fix quantity totals and check it" });
  projects.branch("nova", project.id, "openbot/fix-quantity", run.id);
  const workspace = db.getCodeTaskWorkspace(run.id)!.rootPath;
  let calls = 0;
  const computer = { executeCodeProject: async (_bot: string, cwd: string, command: string) => {
    calls++;
    // Only the fixed fixture test command may execute. No shell or Docker claim.
    assert.equal(command, "node total.test.cjs");
    const result = spawnSync(process.execPath, ["total.test.cjs"], { cwd, encoding: "utf8", env: {}, timeout: 5000 });
    return { code: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
  } };
  const service = new CodeCheckService(db, projects, computer);
  const fix = () => {
    projects.replace("nova", project.id, "total.cjs", "sum + item.price", "sum + item.price * item.quantity", 1, run.id);
    projects.commit("nova", project.id, "Fix quantity totals", ["total.cjs"], run.id);
  };
  return { root, source, db, projects, project, run, workspace, service, computer, calls: () => calls, fix, git, execute: () => service.execute("nova", project.id, run.id, "node total.test.cjs"), close: () => { db.close(); rmSync(root, { recursive: true, force: true }); } };
}

test("bug-fix workflow reproduces failure, preserves checkout and test oracle, and binds success to the repaired commit", async () => {
  const f = fixture();
  try {
    const oracle = readFileSync(path.join(f.source, "total.test.cjs"), "utf8"), original = readFileSync(path.join(f.source, "total.cjs"), "utf8");
    const failed = await f.execute();
    assert.equal(failed.check.status, "failed");
    assert.throws(() => f.projects.assertCheckedCommit("nova", f.project.id, f.run.id), /failed/);
    f.fix();
    assert.throws(() => f.projects.prepareIndependentReview("nova", f.project.id, f.run.id), /Run project checks/);
    const passed = await f.execute();
    assert.equal(passed.check.status, "passed");
    const review = f.projects.prepareIndependentReview("nova", f.project.id, f.run.id);
    assert.equal(review.headCommit, passed.check.headCommit);
    assert.equal(review.checks[0]!.command, "node total.test.cjs");
    assert.equal(readFileSync(path.join(f.source, "total.cjs"), "utf8"), original);
    assert.equal(readFileSync(path.join(f.workspace, "total.test.cjs"), "utf8"), oracle);
    assert.equal(f.git(f.source, "branch", "--show-current"), "main");
    assert.equal(f.calls(), 2);
    const message = f.db.addMessage({ threadId: "bot-nova", senderType: "bot", senderId: "nova", runId: f.run.id, body: "Fixed the total." });
    const artifacts = await new AttachmentService(f.db).captureWorkReports(message);
    assert.equal(artifacts[0]!.name, "code-checks.md");
    const reopened = new OpenBotDatabase(f.root);
    assert.equal(reopened.listCodeChecks(f.run.id)[0]!.status, "passed");
    reopened.close();
  } finally { f.close(); }
});

test("dirty, hidden-file and mid-command changes never certify a commit", async () => {
  const f = fixture();
  try {
    f.fix();
    writeFileSync(path.join(f.workspace, ".hidden-check-input"), "changed");
    assert.equal((await f.execute()).check.status, "changed");
    assert.throws(() => f.projects.assertCheckedCommit("nova", f.project.id, f.run.id), /code changed/);
    const changed = new CodeCheckService(f.db, f.projects, { executeCodeProject: async () => {
      writeFileSync(path.join(f.workspace, "total.cjs"), "module.exports = () => 99;\n");
      return { code: 0, stdout: "not proof", stderr: "" };
    } });
    assert.equal((await changed.execute("nova", f.project.id, f.run.id, "fixture-mutating-test")).check.status, "changed");
  } finally { f.close(); }
});

test("a later failing rerun invalidates a pass, and crashed checks remain visibly incomplete", async () => {
  const f = fixture();
  try {
    f.fix(); await f.execute();
    const failing = new CodeCheckService(f.db, f.projects, { executeCodeProject: async () => ({ code: 1, stdout: "", stderr: "failure" }) });
    await failing.execute("nova", f.project.id, f.run.id, "node total.test.cjs");
    assert.throws(() => f.projects.assertCheckedCommit("nova", f.project.id, f.run.id), /Some checks/);
    await f.execute();
    assert.equal(f.projects.assertCheckedCommit("nova", f.project.id, f.run.id).length, 1);
    const crashed = new CodeCheckService(f.db, f.projects, { executeCodeProject: async () => { throw new Error("fixture container unavailable"); } });
    await assert.rejects(crashed.execute("nova", f.project.id, f.run.id, "node total.test.cjs"), /unavailable/);
    assert.equal(f.db.listCodeChecks(f.run.id)[0]!.status, "error");
    assert.throws(() => f.projects.assertCheckedCommit("nova", f.project.id, f.run.id), /Some checks/);
  } finally { f.close(); }
});

test("revoked permission and stopped tasks cannot count as successful checks", async () => {
  const f = fixture();
  try {
    f.db.setCodeProjectAccess(f.project.id, "nova", { canRead: true, canWrite: true, canRun: false });
    await assert.rejects(f.execute(), /run access/);
    assert.equal(f.calls(), 0);
    f.db.setCodeProjectAccess(f.project.id, "nova", { canRead: true, canWrite: true, canRun: true });
    const cancelled = new CodeCheckService(f.db, f.projects, { executeCodeProject: async () => { f.db.cancelRun(f.run.id); return { code: 0, stdout: "", stderr: "" }; } });
    assert.equal((await cancelled.execute("nova", f.project.id, f.run.id, "fixture-cancelled")).check.status, "error");
  } finally { f.close(); }
});

test("publishing rechecks the exact approved commit before any GitHub command", async () => {
  const f = fixture();
  try {
    f.fix(); await f.execute();
    const headCommit = f.projects.currentCommit("nova", f.project.id, f.run.id);
    const reviewer = f.db.createRun({ botId: "pixel", threadId: "bot-nova", status: "completed", parentRunId: f.run.id, prompt: "Fixture review" });
    f.db.recordCodeTaskReview({ sourceRunId: f.run.id, reviewerRunId: reviewer.id, projectId: f.project.id, reviewerBotId: "pixel", verdict: "approved", summary: "Fixture verdict", findings: [], headCommit });
    const input = { title: "Fixture", body: "Do not publish", base: "main", draft: true };
    const publicationReview = f.projects.preparePublishReview("nova", f.project.id, input, f.run.id);
    await assert.rejects(f.projects.publishPullRequest("nova", f.project.id, { ...input, expectedHeadCommit: headCommit }, f.run.id), /complete approval review/);
    f.projects.write("nova", f.project.id, "note.txt", "Another change\n", f.run.id);
    f.projects.commit("nova", f.project.id, "Another commit", ["note.txt"], f.run.id);
    await f.execute();
    const nextReviewer = f.db.createRun({ botId: "pixel", threadId: "bot-nova", status: "completed", parentRunId: f.run.id, prompt: "Review the changed fixture" });
    f.db.recordCodeTaskReview({ sourceRunId: f.run.id, reviewerRunId: nextReviewer.id, projectId: f.project.id, reviewerBotId: "pixel", verdict: "approved", summary: "New fixture verdict", findings: [], headCommit: f.projects.currentCommit("nova", f.project.id, f.run.id) });
    await assert.rejects(f.projects.publishPullRequest("nova", f.project.id, { ...input, expectedHeadCommit: headCommit, publicationReview, publicationIdentity: { host: "github.com", accountLogin: "fixture-owner" } }, f.run.id), /changed since this proposal/);
  } finally { f.close(); }
});

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { OpenBotDatabase } from "./database.js";
import { CodeProjectManager, parseGitHubRepository } from "./code-projects.js";

test("grants bounded per-teammate coding access and records focused edits", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-code-project-test-"));
  try {
    const projectRoot = path.join(root, "sample-app");
    mkdirSync(path.join(projectRoot, "src"), { recursive: true });
    writeFileSync(path.join(projectRoot, "package.json"), JSON.stringify({ name: "sample-app" }), "utf8");
    writeFileSync(path.join(projectRoot, "src", "main.ts"), "export const greeting = 'hello';\n", "utf8");
    writeFileSync(path.join(projectRoot, ".env"), "SECRET=hidden\n", "utf8");
    const db = new OpenBotDatabase(root), manager = new CodeProjectManager(db, root);
    const inspected = manager.inspectRoot(projectRoot);
    assert.equal(inspected.projectKind, "JavaScript / TypeScript");
    const project = db.createCodeProject({
      name: "Sample app", ...inspected,
      access: [
        { botId: "nova", canRead: true, canWrite: true, canRun: true },
        { botId: "pixel", canRead: true, canWrite: false, canRun: false },
      ],
    });
    assert.equal(db.listCodeProjects("scout").length, 0);
    assert.equal(manager.list("nova", project.id).entries.some((entry) => entry.path === "src/main.ts"), true);
    assert.match(manager.read("pixel", project.id, "src/main.ts").content, /hello/);
    assert.equal(manager.search("nova", project.id, "greeting").matches.length, 1);
    assert.throws(() => manager.read("nova", project.id, ".env"), /Hidden project files/);
    assert.throws(() => manager.read("nova", project.id, "../outside.txt"), /leaves the allowed code project/);
    assert.throws(() => manager.write("pixel", project.id, "src/main.ts", "no"), /does not have write access/);
    manager.replace("nova", project.id, "src/main.ts", "'hello'", "'hello from OpenBot'");
    assert.match(readFileSync(path.join(projectRoot, "src", "main.ts"), "utf8"), /hello from OpenBot/);
    assert.equal(db.listCodeProjectEdits(project.id).length, 1);
    assert.equal(db.deleteCodeProject(project.id), true);
    assert.equal(db.listCodeProjects().length, 0);
    assert.equal(db.listCodeProjectEdits(project.id).length, 1);
    assert.equal(readFileSync(path.join(projectRoot, "src", "main.ts"), "utf8").includes("OpenBot"), true);
    const reconnected = db.createCodeProject({ name: "Sample app again", ...inspected, access: [{ botId: "pixel", canRead: true, canWrite: false, canRun: false }] });
    assert.equal(reconnected.id, project.id);
    assert.equal(db.listCodeProjectEdits(project.id).length, 1);
    db.close();
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("blocks project-root aliases and aliases that escape a shared project", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-code-alias-test-"));
  const outside = mkdtempSync(path.join(tmpdir(), "openbot-code-outside-"));
  try {
    const realProject = path.join(root, "real-project"), aliasProject = path.join(root, "project-alias");
    mkdirSync(realProject); writeFileSync(path.join(outside, "private.ts"), "private", "utf8");
    symlinkSync(realProject, aliasProject); symlinkSync(path.join(outside, "private.ts"), path.join(realProject, "shortcut.ts"));
    const db = new OpenBotDatabase(root), manager = new CodeProjectManager(db, root);
    assert.throws(() => manager.inspectRoot(aliasProject), /real project folder/);
    const project = db.createCodeProject({ name: "Real", ...manager.inspectRoot(realProject), access: [{ botId: "nova", canRead: true, canWrite: true, canRun: false }] });
    assert.throws(() => manager.read("nova", project.id, "shortcut.ts"), /symbolic links/);
    db.close();
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
});

test("validates GitHub clone links without accepting credentials or extra paths", () => {
  assert.deepEqual(parseGitHubRepository("openai/codex"), { owner: "openai", name: "codex", url: "https://github.com/openai/codex.git" });
  assert.deepEqual(parseGitHubRepository("https://github.com/openai/codex.git"), { owner: "openai", name: "codex", url: "https://github.com/openai/codex.git" });
  assert.throws(() => parseGitHubRepository("https://token@github.com/openai/codex"), /standard public or private/);
  assert.throws(() => parseGitHubRepository("https://github.com/openai/codex/issues"), /standard public or private/);
  assert.throws(() => parseGitHubRepository("https://example.com/openai/codex"), /standard public or private/);
});

test("creates separate branches, reviews diffs, and commits only named files", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-code-git-test-"));
  try {
    const projectRoot = path.join(root, "git-app");
    mkdirSync(projectRoot);
    const git = (...args: string[]) => {
      const result = spawnSync("git", args, { cwd: projectRoot, encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr);
    };
    git("init", "-b", "main");
    writeFileSync(path.join(projectRoot, "app.ts"), "export const answer = 41;\n", "utf8");
    writeFileSync(path.join(projectRoot, "notes.md"), "personal note\n", "utf8");
    git("add", "app.ts", "notes.md");
    git("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "Initial");
    const db = new OpenBotDatabase(root), manager = new CodeProjectManager(db, root);
    const project = db.createCodeProject({ name: "Git app", ...manager.inspectRoot(projectRoot), access: [{ botId: "nova", canRead: true, canWrite: true, canRun: true }] });
    assert.throws(() => manager.commit("nova", project.id, "Unsafe main commit", ["app.ts"]), /separate OpenBot branch/);
    assert.equal(manager.branch("nova", project.id, "openbot/fix-answer").branch, "openbot/fix-answer");
    manager.write("nova", project.id, "app.ts", "export const answer = 42;\n");
    writeFileSync(path.join(projectRoot, "notes.md"), "unrelated user work\n", "utf8");
    const review = manager.review("nova", project.id);
    assert.equal(review.branch, "openbot/fix-answer");
    assert.match(review.diff, /answer = 42/);
    const committed = manager.commit("nova", project.id, "Fix the answer", ["app.ts"]);
    assert.deepEqual(committed.files, ["app.ts"]);
    assert.match(manager.status("nova", project.id).changes.join("\n"), /notes\.md/);
    assert.doesNotMatch(spawnSync("git", ["show", "--format=", "--name-only", "HEAD"], { cwd: projectRoot, encoding: "utf8" }).stdout, /notes\.md/);
    db.close();
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("keeps simultaneous coding tasks in isolated Git worktrees", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-code-worktree-test-"));
  try {
    const projectRoot = path.join(root, "shared-app");
    mkdirSync(projectRoot);
    const git = (cwd: string, ...args: string[]) => {
      const result = spawnSync("git", args, { cwd, encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr);
      return String(result.stdout || "").trim();
    };
    git(projectRoot, "init", "-b", "main");
    writeFileSync(path.join(projectRoot, "value.ts"), "export const value = 'main';\n", "utf8");
    git(projectRoot, "add", "value.ts");
    git(projectRoot, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "Initial");
    const initialCommit = git(projectRoot, "rev-parse", "HEAD");
    const db = new OpenBotDatabase(root), manager = new CodeProjectManager(db, root);
    const project = db.createCodeProject({ name: "Shared app", ...manager.inspectRoot(projectRoot), access: [{ botId: "nova", canRead: true, canWrite: true, canRun: true }, { botId: "pixel", canRead: true, canWrite: false, canRun: false }] });
    const firstRun = db.createRun({ threadId: "team-room", botId: "nova", prompt: "Change the first value", status: "queued" });
    const secondRun = db.createRun({ threadId: "team-room", botId: "nova", prompt: "Change the second value", status: "queued" });

    const firstBranch = manager.branch("nova", project.id, "openbot/first-task", firstRun.id);
    const secondBranch = manager.branch("nova", project.id, "openbot/second-task", secondRun.id);
    const firstRoot = db.getCodeTaskWorkspace(firstRun.id)!.rootPath, secondRoot = db.getCodeTaskWorkspace(secondRun.id)!.rootPath;
    assert.equal(firstBranch.isolated, true);
    assert.equal(secondBranch.isolated, true);
    assert.notEqual(db.getCodeTaskWorkspace(firstRun.id)?.rootPath, db.getCodeTaskWorkspace(secondRun.id)?.rootPath);
    assert.equal(git(projectRoot, "branch", "--show-current"), "main");
    assert.equal(readFileSync(path.join(projectRoot, "value.ts"), "utf8"), "export const value = 'main';\n");

    const firstEdit = manager.write("nova", project.id, "value.ts", "export const value = 'first';\n", firstRun.id);
    const secondEdit = manager.write("nova", project.id, "value.ts", "export const value = 'second';\n", secondRun.id);
    assert.equal(manager.read("nova", project.id, "value.ts", firstRun.id).content, "export const value = 'first';\n");
    assert.equal(manager.read("nova", project.id, "value.ts", secondRun.id).content, "export const value = 'second';\n");
    assert.equal(manager.read("nova", project.id, "value.ts").content, "export const value = 'main';\n");
    assert.equal(manager.review("nova", project.id, firstRun.id).workspace?.branch, "openbot/first-task");
    assert.match(manager.review("nova", project.id, firstRun.id).diff, /value = 'first'/);
    assert.equal(db.getCodeProjectEdit(firstEdit.editId)?.workspaceRunId, firstRun.id);

    manager.commit("nova", project.id, "Finish first task", ["value.ts"], firstRun.id);
    const preparedReview = manager.prepareIndependentReview("nova", project.id, firstRun.id);
    assert.match(preparedReview.review.diff, /Committed task changes/);
    assert.match(preparedReview.review.diff, /value = 'first'/);
    const reviewerRun = db.createRun({ threadId: "team-room", botId: "pixel", prompt: "Independently review the first task", status: "queued", parentRunId: firstRun.id });
    const savedReview = db.recordCodeTaskReview({ sourceRunId: firstRun.id, reviewerRunId: reviewerRun.id, projectId: project.id, reviewerBotId: "pixel", verdict: "approved", summary: "The focused change is correct.", findings: [], headCommit: preparedReview.headCommit });
    assert.equal(savedReview.reviewerBotName, "Pixel");
    assert.equal(db.latestCodeTaskReview(firstRun.id)?.headCommit, preparedReview.headCommit);
    assert.equal(git(projectRoot, "rev-parse", "HEAD"), initialCommit);
    const temporaryEdit = manager.write("nova", project.id, "temporary.ts", "temporary\n", secondRun.id);
    assert.match(manager.review("nova", project.id, secondRun.id).diff, /New files/);
    assert.match(manager.review("nova", project.id, secondRun.id).diff, /\+temporary/);
    manager.restoreEdit(temporaryEdit.editId);
    assert.throws(() => manager.read("nova", project.id, "temporary.ts", secondRun.id), /not found/);
    manager.restoreEdit(secondEdit.editId);
    assert.equal(manager.disconnectProject(project.id), true);
    assert.equal(existsSync(firstRoot), false);
    assert.equal(existsSync(secondRoot), false);
    assert.equal(db.getCodeTaskWorkspace(firstRun.id)?.status, "archived");
    assert.equal(git(projectRoot, "show", "openbot/first-task:value.ts"), "export const value = 'first';");
    db.close();
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("restores agent edits without overwriting newer file content", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-code-restore-test-"));
  try {
    const projectRoot = path.join(root, "safe-app");
    mkdirSync(projectRoot); writeFileSync(path.join(projectRoot, "main.txt"), "original\n", "utf8");
    const db = new OpenBotDatabase(root), manager = new CodeProjectManager(db, root);
    const project = db.createCodeProject({ name: "Safe app", ...manager.inspectRoot(projectRoot), access: [{ botId: "nova", canRead: true, canWrite: true, canRun: false }] });
    const first = manager.write("nova", project.id, "main.txt", "agent version\n");
    writeFileSync(path.join(projectRoot, "main.txt"), "newer user version\n", "utf8");
    assert.throws(() => manager.restoreEdit(first.editId), /left the newer work untouched/);
    writeFileSync(path.join(projectRoot, "main.txt"), "agent version\n", "utf8");
    assert.equal(manager.restoreEdit(first.editId).restored, true);
    assert.equal(readFileSync(path.join(projectRoot, "main.txt"), "utf8"), "original\n");
    assert.equal(db.getCodeProjectEdit(first.editId)?.reversible, false);
    const created = manager.write("nova", project.id, "new.txt", "temporary\n");
    manager.restoreEdit(created.editId);
    assert.equal(readFileSync(path.join(projectRoot, "main.txt"), "utf8"), "original\n");
    assert.throws(() => readFileSync(path.join(projectRoot, "new.txt"), "utf8"));
    db.close();
  } finally { rmSync(root, { recursive: true, force: true }); }
});

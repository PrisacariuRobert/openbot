import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { isolateWorkspaceRepository } from "./workspace.js";

test("a workspace inside a host repository gets its own repository", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-workspace-repo-"));
  try {
    mkdirSync(path.join(root, ".git"));
    const workspace = path.join(root, ".openbot", "workspaces", "pixel");
    mkdirSync(workspace, { recursive: true });
    const initialized: string[] = [];
    assert.equal(isolateWorkspaceRepository(workspace, (dir) => { initialized.push(dir); mkdirSync(path.join(dir, ".git")); }), true);
    assert.deepEqual(initialized, [workspace]);
    assert.equal(isolateWorkspaceRepository(workspace, () => assert.fail("an isolated workspace is left alone")), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("a workspace outside any repository is left as it is", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-workspace-plain-"));
  try {
    const workspace = path.join(root, "workspaces", "pixel");
    mkdirSync(workspace, { recursive: true });
    const outsideRepo = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: workspace }).status !== 0;
    if (outsideRepo) assert.equal(isolateWorkspaceRepository(workspace, () => assert.fail("no host repository to escape")), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("git stops at the isolated workspace instead of reaching the host repository", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-workspace-git-"));
  try {
    assert.equal(spawnSync("git", ["init", "--quiet"], { cwd: root }).status, 0);
    const workspace = path.join(root, "data", "workspaces", "pixel");
    mkdirSync(workspace, { recursive: true });
    assert.equal(isolateWorkspaceRepository(workspace), true);
    const top = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: workspace, encoding: "utf8" }).stdout.trim();
    assert.equal(path.resolve(top), path.resolve(spawnSync("realpath", [workspace], { encoding: "utf8" }).stdout.trim() || workspace));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

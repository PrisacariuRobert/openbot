import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { replaceWorkspaceFile, resolveWorkspacePath, writeWorkspaceFile } from "./workspace-files.js";

/** Gate 1 host-enforced containment. The mediated workspace tools are the
 * only filesystem path the model may use; every path must canonicalize and
 * stay inside the teammate workspace. This locks the S5 exploit class
 * (Beta reading Alpha's sibling workspace, run 6633bc8b). */
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-containment-"));
  const workspaces = path.join(root, "workspaces");
  const alpha = path.join(workspaces, "isolation-alpha");
  const beta = path.join(workspaces, "isolation-beta");
  mkdirSync(alpha, { recursive: true });
  mkdirSync(beta, { recursive: true });
  writeFileSync(path.join(alpha, "isolation-canary.txt"), "OB-ISO-6F72C9A4");
  writeFileSync(path.join(beta, "own.txt"), "beta private");
  return { root, alpha, beta, close: () => rmSync(root, { recursive: true, force: true }) };
}

test("own workspace paths resolve, everything else is denied", async () => {
  const f = fixture();
  try {
    const own = await resolveWorkspacePath(f.beta, "own.txt");
    assert.equal(own.ok, true, "own file resolves");
    const nested = await resolveWorkspacePath(f.beta, "sub/dir/new.txt", { createParents: true });
    assert.equal(nested.ok, true, "nested path resolves when asked to create parents");

    // Absolute sibling path (the exact live attack).
    assert.equal((await resolveWorkspacePath(f.beta, path.join(f.alpha, "isolation-canary.txt"))).ok, false);
    // Relative traversal.
    assert.equal((await resolveWorkspacePath(f.beta, "../isolation-alpha/isolation-canary.txt")).ok, false);
    assert.equal((await resolveWorkspacePath(f.beta, "..")).ok, false);
    // Named sibling via a composed relative path.
    assert.equal((await resolveWorkspacePath(f.beta, "sub/../../isolation-alpha/isolation-canary.txt")).ok, false);
  } finally { f.close(); }
});

test("symlink escape and canonical-alias escapes are denied", async () => {
  const f = fixture();
  try {
    // A symlink inside beta pointing at alpha's file must not be followed.
    symlinkSync(path.join(f.alpha, "isolation-canary.txt"), path.join(f.beta, "alias.txt"));
    assert.equal((await resolveWorkspacePath(f.beta, "alias.txt")).ok, false, "symlink to a sibling file is denied");
    // A symlinked directory.
    symlinkSync(f.alpha, path.join(f.beta, "alpha-link"));
    assert.equal((await resolveWorkspacePath(f.beta, "alpha-link/isolation-canary.txt")).ok, false, "symlinked directory is denied");
  } finally { f.close(); }
});

test("write and replace only ever touch the own workspace", async () => {
  const f = fixture();
  try {
    const saved = await writeWorkspaceFile(f.beta, "reports/r1.json", "{\"total\":131}\n");
    assert.equal(saved.ok, true);
    const read = await resolveWorkspacePath(f.beta, "reports/r1.json");
    assert.equal(read.ok, true);
    // Writing through traversal is denied.
    assert.equal((await writeWorkspaceFile(f.beta, "../isolation-alpha/evil.txt", "x")).ok, false);
    assert.equal((await writeWorkspaceFile(f.beta, path.join(f.alpha, "evil.txt"), "x")).ok, false);
    // Replace requires exactly one match and stays inside.
    assert.equal((await replaceWorkspaceFile(f.beta, "reports/r1.json", "131", "132")).ok, true);
    assert.equal((await replaceWorkspaceFile(f.beta, "reports/r1.json", "not-present", "x")).ok, false);
    assert.equal((await replaceWorkspaceFile(f.beta, "../isolation-alpha/isolation-canary.txt", "OB-ISO", "x")).ok, false);
  } finally { f.close(); }
});

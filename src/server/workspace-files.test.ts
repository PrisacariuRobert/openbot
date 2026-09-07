import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { listWorkspaceFiles, readWorkspaceFile } from "./workspace-files.js";

test("lists and previews regular workspace files without following symlinks", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-workspace-files-"));
  const outside = mkdtempSync(path.join(tmpdir(), "openbot-workspace-outside-"));
  try {
    mkdirSync(path.join(root, "notes"));
    writeFileSync(path.join(root, "notes", "today.md"), "# Today\nSafe workspace note.\n");
    writeFileSync(path.join(root, ".private"), "hidden");
    writeFileSync(path.join(outside, "secret.txt"), "outside");
    symlinkSync(path.join(outside, "secret.txt"), path.join(root, "shortcut.txt"));
    symlinkSync(outside, path.join(root, "outside-folder"));

    const files = listWorkspaceFiles(root);
    assert.deepEqual(files.map((file) => file.path), ["notes", path.join("notes", "today.md")]);
    assert.deepEqual(readWorkspaceFile(root, path.join("notes", "today.md")), {
      ok: true,
      path: path.join("notes", "today.md"),
      content: "# Today\nSafe workspace note.\n",
    });
    assert.deepEqual(readWorkspaceFile(root, "../secret.txt"), { ok: false, reason: "not_found" });
    assert.deepEqual(readWorkspaceFile(root, "shortcut.txt"), { ok: false, reason: "not_found" });
    assert.deepEqual(readWorkspaceFile(root, path.join("outside-folder", "secret.txt")), { ok: false, reason: "not_found" });
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("keeps oversized files out of the preview response", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-workspace-large-"));
  try {
    writeFileSync(path.join(root, "large.txt"), "12345");
    assert.deepEqual(readWorkspaceFile(root, "large.txt", 4), { ok: false, reason: "too_large" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

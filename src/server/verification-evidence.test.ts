import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { verifyTaskChecks, verifyWorkspaceFileEvidence } from "./verification-evidence.js";

test("host-verifies a bounded workspace file instead of trusting a reported pass", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-verification-evidence-"));
  try {
    writeFileSync(path.join(root, "launch.md"), "# Launch plan\n\n## Risks\nKeep rollback ready.\n", "utf8");
    const passed = verifyWorkspaceFileEvidence(root, "Launch plan is complete", {
      kind: "workspace_file", path: "launch.md", minBytes: 20, contains: ["# Launch plan", "## Risks"],
    });
    assert.equal(passed.passed, true);
    assert.equal(passed.source, "host");
    assert.match(passed.detail || "", /SHA-256 [a-f0-9]{12}/);
    assert.equal(passed.label, "Text-file check: launch.md");
    assert.match(passed.detail || "", /not the correctness of claims/);

    const failed = verifyWorkspaceFileEvidence(root, "Includes owner", {
      kind: "workspace_file", path: "launch.md", contains: ["## Owner"],
    });
    assert.equal(failed.passed, false);
    assert.match(failed.detail || "", /required text markers were missing/);

    const checks = verifyTaskChecks(root, [
      { label: "Model-only check", passed: true },
      { label: "Host overrides a confident claim", passed: true, evidence: { kind: "workspace_file", path: "launch.md", contains: ["## Missing"] } },
    ]);
    assert.equal(checks[0]?.source, "teammate");
    assert.equal(checks[1]?.source, "host");
    assert.equal(checks[1]?.passed, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("notes cannot certify unrelated workbook claims and binary files need a format-aware check", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-verification-scope-"));
  try {
    writeFileSync(path.join(root, "notes.md"), "The workbook formulas are correct.");
    const [check] = verifyTaskChecks(root, [{ label: "Workbook formulas recalculated correctly", passed: true, evidence: { kind: "workspace_file", path: "notes.md" } }]);
    assert.equal(check.passed, true); // Only the text file's readability passed.
    assert.equal(check.label, "Text-file check: notes.md");
    assert.doesNotMatch(check.label, /formulas|recalculated/);
    assert.match(check.detail || "", /Checked readability only/);
    writeFileSync(path.join(root, "binary.xlsx"), Buffer.from([0x50, 0x4b, 0, 0xff, 0x10]));
    const binary = verifyWorkspaceFileEvidence(root, "Workbook identity", { kind: "workspace_file", path: "binary.xlsx" });
    assert.equal(binary.passed, false);
    assert.match(binary.detail || "", /UTF-8 text only/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("host verification does not follow a workspace symlink", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-verification-root-"));
  const outside = mkdtempSync(path.join(tmpdir(), "openbot-verification-outside-"));
  try {
    writeFileSync(path.join(outside, "private.txt"), "private", "utf8");
    symlinkSync(path.join(outside, "private.txt"), path.join(root, "shortcut.txt"));
    const check = verifyWorkspaceFileEvidence(root, "Private file is present", { kind: "workspace_file", path: "shortcut.txt" });
    assert.equal(check.passed, false);
    assert.equal(check.source, "host");
    assert.match(check.detail || "", /could not be reopened/);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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

test("evidence contract binds predicate, digests and observation time", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-evidence-contract-"));
  try {
    writeFileSync(path.join(root, "brief.md"), "# Brief\n\nShipped.\n", "utf8");
    const passed = verifyWorkspaceFileEvidence(root, "Brief is complete", {
      kind: "workspace_file", path: "brief.md", contains: ["# Brief"],
    });
    assert.equal(passed.passed, true);
    assert.equal(passed.source, "host");
    assert.equal(passed.predicate, "utf8-text:readable,min-bytes,markers-present");
    assert.match(passed.inputDigest || "", /^[a-f0-9]{64}$/);
    assert.equal(passed.outputDigest, passed.inputDigest);
    assert.ok(passed.observedAt && Number.isFinite(Date.parse(passed.observedAt)), "observation time is a real timestamp");

    // A failed check still proves exactly which bytes were examined.
    const failed = verifyWorkspaceFileEvidence(root, "Brief mentions owner", {
      kind: "workspace_file", path: "brief.md", contains: ["## Owner"],
    });
    assert.equal(failed.passed, false);
    assert.equal(failed.inputDigest, passed.inputDigest, "same bytes, same digest, different verdict");
    assert.equal(failed.predicate, passed.predicate);

    // Same name, different bytes: the receipt cannot confuse them.
    writeFileSync(path.join(root, "brief.md"), "# Brief\n\nRewritten.\n", "utf8");
    const rewritten = verifyWorkspaceFileEvidence(root, "Brief is complete", {
      kind: "workspace_file", path: "brief.md", contains: ["# Brief"],
    });
    assert.equal(rewritten.passed, true);
    assert.notEqual(rewritten.inputDigest, passed.inputDigest);

    // Nothing read, nothing claimed: digests stay null.
    const missing = verifyWorkspaceFileEvidence(root, "Missing file", { kind: "workspace_file", path: "gone.md" });
    assert.equal(missing.passed, false);
    assert.equal(missing.inputDigest, null);
    assert.equal(missing.outputDigest, null);
    assert.equal(missing.predicate, "utf8-text:readable,min-bytes,markers-present");

    // Teammate-only reports carry no host contract fields.
    const [modelOnly] = verifyTaskChecks(root, [{ label: "Model says done", passed: true }]);
    assert.equal(modelOnly!.source, "teammate");
    assert.equal(modelOnly!.predicate, undefined);
    assert.equal(modelOnly!.inputDigest, undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("verify binds a claimed observation digest to the reopened bytes", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-verify-binding-"));
  try {
    writeFileSync(path.join(root, "result.md"), "# Result\n\nDone.\n", "utf8");
    const baseline = verifyWorkspaceFileEvidence(root, "Result file", { kind: "workspace_file", path: "result.md" });
    assert.equal(baseline.passed, true);
    const digest = baseline.inputDigest!;
    const bound = verifyWorkspaceFileEvidence(root, "Result file", {
      kind: "workspace_file", path: "result.md", expectedDigest: digest,
    });
    assert.equal(bound.passed, true);
    assert.equal(bound.inputDigest, digest);
    assert.equal(
      verifyWorkspaceFileEvidence(root, "Result file", {
        kind: "workspace_file", path: "result.md", expectedDigest: digest.toUpperCase(),
      }).passed,
      true,
      "hex comparison is case-insensitive",
    );

    // The file moves after the claim: the old observation must fail, carrying
    // the actual bytes so nothing certifies unseen content.
    writeFileSync(path.join(root, "result.md"), "# Result\n\nRewritten.\n", "utf8");
    const stale = verifyWorkspaceFileEvidence(root, "Result file", {
      kind: "workspace_file", path: "result.md", contains: ["# Result"], expectedDigest: digest,
    });
    assert.equal(stale.passed, false);
    assert.match(stale.detail || "", /changed since the reported observation/);
    assert.notEqual(stale.inputDigest, digest);
    assert.equal(stale.inputDigest, stale.outputDigest);

    // A malformed claim can never pass: it mismatches by default.
    const malformed = verifyWorkspaceFileEvidence(root, "Result file", {
      kind: "workspace_file", path: "result.md", expectedDigest: "not-a-digest",
    });
    assert.equal(malformed.passed, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("task_verify enforces digest shape and evaluates matching claims", { timeout: 120_000 }, async () => {
  const { skillAuthoringFixture } = await import("./testing/skill-authoring-fixture.js");
  const runtime = `#!${process.execPath}
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const endpoint = process.env.OPENBOT_INTERNAL_URL, runId = process.env.OPENBOT_RUN_ID;
if (!endpoint || !runId) { console.log('Fixture runtime'); process.exit(0); }
const record = path.join(process.cwd(), '.verify-binding-' + runId + '.json');
async function main() {
  if (fs.existsSync(record)) { console.log(JSON.stringify({ type: 'text', text: 'Already verified.' })); return; }
  const headers = { 'content-type': 'application/json', 'x-openbot-token': process.env.OPENBOT_INTERNAL_TOKEN };
  const call = (checks) => fetch(endpoint + '/api/internal/tools', { method: 'POST', headers, body: JSON.stringify({ botId: process.env.OPENBOT_BOT_ID, runId, action: 'task_verify', args: { status: 'passed', summary: 'Result saved.', checks } }) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  const digest = crypto.createHash('sha256').update(fs.readFileSync('result.md')).digest('hex');
  const obs = {};
  obs.malformed = await call([{ label: 'Bad shape', passed: true, evidence: { kind: 'workspace_file', path: 'result.md', expectedDigest: 'zzz' } }]);
  obs.matched = await call([{ label: 'Result readable', passed: true, evidence: { kind: 'workspace_file', path: 'result.md', contains: ['OK'], expectedDigest: digest } }]);
  obs.unbound = await call([{ label: 'Legacy claim', passed: true, evidence: { kind: 'workspace_file', path: 'result.md', contains: ['OK'] } }]);
  fs.writeFileSync(record, JSON.stringify(obs));
  console.log(JSON.stringify({ type: 'text', text: 'Verified with binding.' }));
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
`;
  const f = await skillAuthoringFixture({ runtime,
    configure(db) {
      mkdirSync(path.join(db.workspacesDir, "nova"), { recursive: true });
      writeFileSync(path.join(db.workspacesDir, "nova", "result.md"), "OK\n", "utf8");
    },
  });
  try {
    const response = await f.post("/api/messages", { threadId: "bot-nova", targetBotIds: ["nova"], body: "Check the saved result file." });
    assert.equal(response.status, 202, await response.clone().text());
    const { runs } = (await response.json()) as { runs: Array<{ id: string }> };
    const runId = runs[0]!.id;
    const completed = await f.until(() => f.db.getRun(runId)?.status === "completed" && f.db.getRun(runId));
    assert.ok(completed);
    const record = JSON.parse(readFileSync(path.join(f.db.workspacesDir, "nova", `.verify-binding-${runId}.json`), "utf8")) as {
      malformed: { status: number };
      matched: { status: number; body: { task: { verificationChecks: Array<{ passed: boolean; inputDigest: string | null }> } } };
      unbound: { status: number };
    };
    assert.equal(record.malformed.status, 400, "malformed digests are rejected at the boundary");
    assert.equal(record.matched.status, 200);
    assert.equal(record.matched.body.task.verificationChecks[0]?.passed, true);
    assert.match(record.matched.body.task.verificationChecks[0]?.inputDigest || "", /^[a-f0-9]{64}$/);
    assert.equal(record.unbound.status, 200, "unbound claims keep legacy behavior");
  } finally {
    await f.close();
  }
});

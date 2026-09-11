import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenBotDatabase } from "./testing/database.js";
import { isHandoffPath, mediateHandoffArtifacts } from "./handoff-files.js";

/** Gate 1 mediated handoff: a teammate shares a specific result with another
 * teammate as an immutable, hash-stamped read-only copy — never by exposing
 * the origin workspace. */
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-handoff-"));
  const db = new OpenBotDatabase(root);
  const origin = db.getBot("nova")!;
  const recipient = db.getBot("pixel")!;
  const originWorkspace = path.join(db.workspacesDir, origin.id);
  const recipientWorkspace = path.join(db.workspacesDir, recipient.id);
  mkdirSync(originWorkspace, { recursive: true });
  mkdirSync(recipientWorkspace, { recursive: true });
  const run = db.createRun({ threadId: origin.threadId, botId: origin.id, prompt: "Produce the reconciliation", status: "running" });
  writeFileSync(path.join(originWorkspace, "hero-reconciliation-v2.json"), '{"net":214.99}\n');
  return { root, db, origin, recipient, originWorkspace, recipientWorkspace, run, close: () => { db.close(); rmSync(root, { recursive: true, force: true }); } };
}

test("a handout copies exact bytes read-only with provenance and no origin path", async () => {
  const f = fixture();
  try {
    const source = path.join(f.originWorkspace, "hero-reconciliation-v2.json");
    const expectedSha = createHash("sha256").update(readFileSync(source)).digest("hex");
    const { records, promptBlock } = await mediateHandoffArtifacts(f.db, {
      originBotId: f.origin.id, originRunId: f.run.id, recipientBotId: f.recipient.id,
      specs: [{ path: "hero-reconciliation-v2.json", access: "read" }],
    });
    assert.equal(records.length, 1);
    const record = records[0]!;
    assert.equal(record.originSha256, expectedSha);
    assert.equal(record.originBotId, f.origin.id);
    assert.equal(record.recipientBotId, f.recipient.id);
    assert.equal(record.access, "read");
    assert.ok(record.recipientPath.startsWith(`handoff${path.sep}`));
    assert.equal(isHandoffPath(record.recipientPath), true);
    // The copy exists in the recipient workspace with identical bytes.
    const copy = path.join(f.recipientWorkspace, record.recipientPath);
    assert.equal(createHash("sha256").update(readFileSync(copy)).digest("hex"), expectedSha);
    // The prompt block names the mediated path, not the origin path.
    assert.ok(promptBlock.includes(record.recipientPath));
    assert.equal(promptBlock.includes(f.originWorkspace), false);
    // Provenance is durable.
    const stored = f.db.extensionRecord<typeof record>("handoff-artifact", record.handoffId);
    assert.equal(stored?.originSha256, expectedSha);
  } finally { f.close(); }
});

test("handoff refuses traversal, absolute paths, symlinks and directories", async () => {
  const f = fixture();
  try {
    const base = { originBotId: f.origin.id, originRunId: f.run.id, recipientBotId: f.recipient.id };
    const sibling = path.join(f.recipientWorkspace, "secret.txt");
    writeFileSync(sibling, "recipient private");
    await assert.rejects(() => mediateHandoffArtifacts(f.db, { ...base, specs: [{ path: "../pixel/secret.txt" }] }), /outside the origin workspace|workspace-relative/);
    await assert.rejects(() => mediateHandoffArtifacts(f.db, { ...base, specs: [{ path: sibling }] }), /workspace-relative/);
    symlinkSync(sibling, path.join(f.originWorkspace, "alias.txt"));
    await assert.rejects(() => mediateHandoffArtifacts(f.db, { ...base, specs: [{ path: "alias.txt" }] }), /regular file/);
    const dir = path.join(f.originWorkspace, "folder");
    mkdirSync(dir, { recursive: true });
    await assert.rejects(() => mediateHandoffArtifacts(f.db, { ...base, specs: [{ path: "folder" }] }), /regular file|does not exist/);
  } finally { f.close(); }
});

test("isHandoffPath marks the mediated area, including nested and dot forms", () => {
  assert.equal(isHandoffPath("handoff"), true);
  assert.equal(isHandoffPath("handoff/abc/file.json"), true);
  assert.equal(isHandoffPath("./handoff/abc/file.json"), true);
  assert.equal(isHandoffPath("reports/out.json"), false);
  assert.equal(isHandoffPath("handoffs/x"), false);
});

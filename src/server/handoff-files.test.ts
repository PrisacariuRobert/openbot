import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenBotDatabase } from "./testing/database.js";
import { isHandoffPath, mediateHandoffArtifacts, returnHelperFiles } from "./handoff-files.js";

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

test("a missing second source leaves no copied first file or provenance", async () => {
  const f = fixture();
  try {
    await assert.rejects(() => mediateHandoffArtifacts(f.db, {
      originBotId: f.origin.id, originRunId: f.run.id, recipientBotId: f.recipient.id,
      specs: [{ path: "hero-reconciliation-v2.json" }, { path: "missing.txt" }],
    }), /does not exist/);
    assert.equal(existsSync(path.join(f.recipientWorkspace, "handoff")), false);
    assert.equal(f.db.extensionRecords("handoff-artifact").length, 0);
  } finally { f.close(); }
});

test("artifact handoff accepts the current owned revision and refuses other conversations or teammates", async () => {
  const f = fixture();
  try {
    const result = (threadId: string, senderId: string, body: string, revision: number, key: string) => {
      const directory = mkdtempSync(path.join(f.db.attachmentsDir, "handoff-"));
      const storagePath = path.join(directory, "brief.md");
      writeFileSync(storagePath, body);
      const message = f.db.addMessage({ threadId, senderType: "bot", senderId, runId: f.run.id, body: "Brief" });
      return f.db.createAttachment({ threadId, messageId: message.id, name: "brief.md", mime: "text/markdown", size: Buffer.byteLength(body), storagePath, source: "artifact", artifactKey: key, revision });
    };
    const old = result(f.run.threadId, f.origin.id, "v1", 1, "nova:brief.md");
    const current = result(f.run.threadId, f.origin.id, "v2", 2, "nova:brief.md");
    const otherThread = result("team-room", f.origin.id, "secret room", 1, "nova:room.md");
    const otherBot = result(f.run.threadId, f.recipient.id, "Pixel private result", 1, "pixel:brief.md");
    const base = { originBotId: f.origin.id, originRunId: f.run.id, recipientBotId: f.recipient.id };
    await assert.rejects(() => mediateHandoffArtifacts(f.db, { ...base, specs: [{ artifactId: old.id }] }), /newer revision/);
    await assert.rejects(() => mediateHandoffArtifacts(f.db, { ...base, specs: [{ artifactId: otherThread.id }] }), /not an original input/);
    await assert.rejects(() => mediateHandoffArtifacts(f.db, { ...base, specs: [{ artifactId: otherBot.id }] }), /not an original input/);
    const shared = await mediateHandoffArtifacts(f.db, { ...base, specs: [{ artifactId: current.id }] });
    assert.equal(shared.records[0]?.originArtifactId, current.id);
    assert.equal(shared.records[0]?.originRevision, 2);
    assert.equal(readFileSync(path.join(f.recipientWorkspace, shared.records[0]!.recipientPath), "utf8"), "v2");
  } finally { f.close(); }
});

test("isHandoffPath marks the mediated area, including nested and dot forms", () => {
  assert.equal(isHandoffPath("handoff"), true);
  assert.equal(isHandoffPath("handoff/abc/file.json"), true);
  assert.equal(isHandoffPath("./handoff/abc/file.json"), true);
  assert.equal(isHandoffPath("reports/out.json"), false);
  assert.equal(isHandoffPath("handoffs/x"), false);
});

test("a helper's saved files go back to the teammate who asked, read-only", async () => {
  const f = fixture();
  try {
    // Nova asked Pixel to check a draft; Pixel saved a corrected version and a note, and read something else.
    const helper = f.db.createRun({ threadId: f.origin.threadId, botId: f.recipient.id, prompt: "Check the launch post", status: "running", parentRunId: f.run.id });
    mkdirSync(path.join(f.recipientWorkspace, "drafts"), { recursive: true });
    writeFileSync(path.join(f.recipientWorkspace, "drafts/post-checked.md"), "Sidemates asks before anything important.\n");
    writeFileSync(path.join(f.recipientWorkspace, "notes.md"), "Cut the unsupported claim.\n");
    writeFileSync(path.join(f.recipientWorkspace, "deleted-later.md"), "gone");
    f.db.addActivity({ runId: helper.id, botId: f.recipient.id, kind: "file", label: "Updated a workspace file", detail: "drafts/post-checked.md" });
    f.db.addActivity({ runId: helper.id, botId: f.recipient.id, kind: "file", label: "Edited a workspace file", detail: "drafts/post-checked.md" });
    f.db.addActivity({ runId: helper.id, botId: f.recipient.id, kind: "file", label: "Updated a workspace file", detail: "notes.md" });
    f.db.addActivity({ runId: helper.id, botId: f.recipient.id, kind: "file", label: "Updated a workspace file", detail: "deleted-later.md" });
    f.db.addActivity({ runId: helper.id, botId: f.recipient.id, kind: "tool", label: "Reading the file", detail: "hero-reconciliation-v2.json" });
    rmSync(path.join(f.recipientWorkspace, "deleted-later.md"));

    const block = await returnHelperFiles(f.db, helper);
    assert.match(block, /^\n\nFiles saved by pixel\./);
    const returned = [...block.matchAll(/^- (handoff\/[^ ]+) · "([^"]+)"/gm)].map((match) => [match[1]!, match[2]!]);
    assert.deepEqual(returned.map(([, name]) => name).sort(), ["notes.md", "post-checked.md"], "Each saved file once; deleted ones are skipped");
    for (const [relative, name] of returned) {
      const copy = path.join(f.originWorkspace, relative);
      assert.equal(readFileSync(copy, "utf8"), readFileSync(path.join(f.recipientWorkspace, name === "notes.md" ? "notes.md" : "drafts/post-checked.md"), "utf8"));
      assert.ok(isHandoffPath(relative), "The lead gets a read-only handoff copy, never the helper's workspace");
    }

    assert.equal(await returnHelperFiles(f.db, f.run), "", "A lead's own job has nobody to return files to");
    const quiet = f.db.createRun({ threadId: f.origin.threadId, botId: f.recipient.id, prompt: "Just answer", status: "running", parentRunId: f.run.id });
    assert.equal(await returnHelperFiles(f.db, quiet), "", "No saved files, nothing added");
  } finally {
    f.close();
  }
});

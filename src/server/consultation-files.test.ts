import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { OpenBotDatabase } from "./testing/database.js";
import { AttachmentService } from "./attachments.js";
import { prepareConsultationFiles } from "./consultation-files.js";

async function fixture(check: (data: Awaited<ReturnType<typeof setup>>) => void) {
  const data = await setup();
  try { check(data); } finally { data.db.close(); rmSync(data.root, { recursive: true, force: true }); }
}
async function setup() {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-consultation-files-")), db = new OpenBotDatabase(root);
  const service = new AttachmentService(db), body = Buffer.from("id,amount\nCURRENT,218.44\n");
  const attachment = await service.saveUpload({ id: "c".repeat(32), threadId: "team-room", name: "expenses.csv", mime: "text/csv", body });
  const message = db.addMessage({ threadId: "team-room", senderType: "user", senderId: null, body: "Check these new expenses together." });
  db.claimAttachments([attachment.id], message.id, "team-room");
  const parent = db.createRun({ botId: "scout", threadId: "team-room", status: "running", prompt: message.body, attachmentIds: [attachment.id] });
  const child = db.createRun({ botId: "nova", threadId: "team-room", status: "running", prompt: "Verify the same original sources", parentRunId: parent.id, attachmentIds: parent.attachmentIds });
  const workspace = path.join(db.workspacesDir, child.botId); mkdirSync(workspace, { recursive: true });
  return { root, db, body, attachment, message, parent, child, workspace };
}

test("consultation receives exact current originals instead of stale same-named inbox files", async () => fixture(({ db, body, message, parent, child, workspace }) => {
  mkdirSync(path.join(workspace, "inbox", "old"), { recursive: true });
  const stale = path.join(workspace, "inbox/old/expenses.csv"); writeFileSync(stale, "id,amount\nOLD,217.34\n");
  const prompt = prepareConsultationFiles(db, child);
  const target = path.join(workspace, "inbox", message.id, "cccccccc-expenses.csv");
  assert.deepEqual(readFileSync(target), body);
  assert.equal(readFileSync(stale, "utf8"), "id,amount\nOLD,217.34\n");
  assert.match(prompt, /CURRENT/); assert.match(prompt, /authoritative over old inbox/);
  assert.ok(prompt.includes(createHash("sha256").update(body).digest("hex")));
  assert.ok(prompt.includes(`inbox/${message.id}/cccccccc-expenses.csv`));
  assert.match(prompt, /OPENBOT_UNTRUSTED_FILE_CONTENT_START/);
  assert.equal(prepareConsultationFiles(db, parent), "");
  assert.equal(prepareConsultationFiles(db, child), prompt, "resuming must preserve the exact sources");
}));

test("consultation refuses modified copies, missing sources, and other conversations", async () => fixture(({ db, child, workspace, message }) => {
  assert.throws(() => prepareConsultationFiles(db, { ...child, threadId: "bot-pixel" }), /another conversation/);
  assert.throws(() => prepareConsultationFiles(db, { ...child, attachmentIds: ["missing"] }), /missing/);
  prepareConsultationFiles(db, child);
  const target = path.join(workspace, "inbox", message.id, "cccccccc-expenses.csv");
  writeFileSync(target, "changed source");
  assert.throws(() => prepareConsultationFiles(db, child), /copy of a shared source changed/);
  assert.equal(readFileSync(target, "utf8"), "changed source");
}));

test("consultation source copying cannot follow a workspace inbox symlink", async () => fixture(({ db, child, workspace, root }) => {
  const outside = path.join(root, "outside"); mkdirSync(outside);
  symlinkSync(outside, path.join(workspace, "inbox"));
  assert.throws(() => prepareConsultationFiles(db, child), /regular workspace folder/);
}));

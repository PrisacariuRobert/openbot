import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenBotDatabase } from "./testing/database.js";

test("draft file selection persists without recovering orphan uploads or changing text", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-draft-files-"));
  let db = new OpenBotDatabase(root);
  const add = (id: string, threadId = "bot-nova") =>
    db.createAttachment({
      threadId,
      name: `${id}.txt`,
      mime: "text/plain",
      size: 5,
      storagePath: path.join(root, id, "body"),
      analysis: {
        kind: "text",
        detectedMime: "text/plain",
        processingStatus: "ready",
        summary: "A small note",
        extractedText: "Hello",
        metadata: {},
        previewable: false,
      },
    });
  try {
    db.saveDraft("bot-nova", "Please review my attached note.", "web");
    const selected = add("selected"),
      orphan = add("orphan"),
      other = add("other", "bot-pixel");
    assert.deepEqual(db.listDraftAttachments("bot-nova"), []);
    db.addDraftAttachment("bot-nova", selected.id);
    db.addDraftAttachment("bot-nova", selected.id);
    assert.equal(
      db.listDraftAttachments("bot-nova").length,
      1,
      "Adding is idempotent after an uncertain response",
    );
    assert.throws(
      () => db.addDraftAttachment("bot-nova", other.id),
      /another conversation/,
    );
    assert.throws(
      () => db.addDraftAttachment("missing", selected.id),
      /no longer available/,
    );
    assert.throws(
      () => db.addDraftAttachment("bot-nova", "missing"),
      /missing/,
    );
    db.close();
    db = new OpenBotDatabase(root);
    assert.deepEqual(
      db.listDraftAttachments("bot-nova").map((file) => file.id),
      [selected.id],
    );
    assert.equal(
      db.listDraftAttachments("bot-nova")[0]?.summary,
      "A small note",
    );
    assert.ok(
      db.getAttachment(orphan.id),
      "Unselected uploads are retained, never silently attached",
    );
    assert.deepEqual(db.listDraftAttachments("bot-pixel"), []);
    db.removeDraftAttachment("bot-pixel", selected.id);
    assert.equal(
      db.listDraftAttachments("bot-nova").length,
      1,
      "Another thread cannot remove a selection",
    );
    db.removeDraftAttachment("bot-nova", selected.id);
    db.removeDraftAttachment("bot-nova", selected.id);
    assert.deepEqual(db.listDraftAttachments("bot-nova"), []);
    assert.ok(
      db.getAttachment(selected.id),
      "Removing a selection preserves the uploaded file",
    );
    assert.equal(
      db.getDraft("bot-nova").body,
      "Please review my attached note.",
    );
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("six selected files maximum; claiming sent files clears only their bindings atomically", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-draft-file-limit-"));
  const db = new OpenBotDatabase(root);
  try {
    const files = Array.from({ length: 7 }, (_, index) =>
      db.createAttachment({
        threadId: "bot-nova",
        name: `${index}.txt`,
        mime: "text/plain",
        size: 5,
        storagePath: path.join(root, String(index), "body"),
      }),
    );
    files
      .slice(0, 6)
      .forEach((file) => db.addDraftAttachment("bot-nova", file.id));
    assert.throws(
      () => db.addDraftAttachment("bot-nova", files[6]!.id),
      /six files/,
    );
    db.addDraftAttachment("bot-nova", files[0]!.id);
    const message = db.addMessage({
      threadId: "bot-nova",
      body: "Shared a file",
      senderType: "user",
      senderId: null,
    });
    assert.throws(() =>
      db.claimAttachments([files[0]!.id], "missing-message", "bot-nova"),
    );
    assert.equal(
      db.listDraftAttachments("bot-nova").length,
      6,
      "Failed claim keeps pending selections",
    );
    db.claimAttachments([files[0]!.id], message.id, "bot-nova");
    assert.equal(db.listDraftAttachments("bot-nova").length, 5);
    assert.equal(db.getMessage(message.id)?.attachments[0]?.id, files[0]!.id);
    assert.throws(
      () => db.addDraftAttachment("bot-nova", files[0]!.id),
      /already sent/,
    );
    db.addDraftAttachment("bot-nova", files[6]!.id);
    assert.equal(db.listDraftAttachments("bot-nova").length, 6);
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

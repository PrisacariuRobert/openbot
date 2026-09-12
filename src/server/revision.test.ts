import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenBotDatabase } from "./testing/database.js";
import { AttachmentService } from "./attachments.js";

/** Gate 1 revision semantics: identical bytes never create a new content
 * revision (only a reference), changed bytes do. A reviewer re-delivering the
 * same file must not fabricate a v3/v4/v5. */
test("content revision increments only when bytes actually change", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-revision-"));
  try {
    const db = new OpenBotDatabase(root);
    const bot = db.getBot("nova")!;
    const workspace = path.join(db.workspacesDir, bot.id);
    mkdirSync(workspace, { recursive: true });
    const file = path.join(workspace, "report.json");
    const service = new AttachmentService(db);

    writeFileSync(file, '{"net":199.99}\n');
    const firstMsg = db.addMessage({ threadId: bot.threadId, senderType: "bot", senderId: bot.id, body: "result" });
    const first = await service.captureStoppedResult(bot, firstMsg, ["report.json"], false);
    assert.equal(first.length, 1);
    assert.equal(first[0]!.revision, 1);

    // Same bytes, a later message (e.g. reviewer re-delivery): no new revision.
    const secondMsg = db.addMessage({ threadId: bot.threadId, senderType: "bot", senderId: bot.id, body: "reviewed" });
    const second = await service.captureStoppedResult(bot, secondMsg, ["report.json"], false);
    assert.equal(second.length, 1);
    assert.equal(second[0]!.revision, 1, "identical bytes must not bump the content revision");
    assert.equal(second[0]!.id, first[0]!.id, "the same artifact is referenced, not duplicated");
    assert.equal(db.listArtifacts().filter((artifact) => artifact.name === "report.json").length, 1);

    // Real correction: a new content revision.
    writeFileSync(file, '{"net":214.99}\n');
    const thirdMsg = db.addMessage({ threadId: bot.threadId, senderType: "bot", senderId: bot.id, body: "corrected" });
    const third = await service.captureStoppedResult(bot, thirdMsg, ["report.json"], false);
    assert.equal(third.length, 1);
    assert.equal(third[0]!.revision, 2, "changed bytes create revision 2");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

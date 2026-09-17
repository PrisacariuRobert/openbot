import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenBotDatabase } from "./testing/database.js";

/** U02b: archiving is a reversible hide, never a delete. Hiding keeps every
 * message, run and routine reference; unhiding restores the exact thread.
 * There is no hard conversation delete on this path by design. */

test("archive hides without losing history and unhide restores", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-thread-archive-"));
  const db = new OpenBotDatabase(root);
  try {
    const room = db.createGroupThread("Archive me", ["nova", "pixel"]);
    const message = db.addMessage({ threadId: room.id, senderType: "user", senderId: null, body: "Keep this." });
    const run = db.createRun({ threadId: room.id, botId: "nova", prompt: "Work.", status: "completed" });
    assert.equal(db.updateThread(room.id, { hidden: true })?.hidden, true);
    assert.equal(db.getThread(room.id)?.hidden, true);
    assert.ok(db.listThreads().some((thread) => thread.id === room.id), "archived threads stay listed for recovery surfaces");
    assert.equal(db.getMessage(message.id)?.body, "Keep this.", "messages survive archiving");
    assert.equal(db.getRun(run.id)?.status, "completed", "runs survive archiving");
    assert.equal(db.updateThread(room.id, { hidden: true })?.hidden, true, "re-hiding is idempotent");
    assert.equal(db.updateThread(room.id, { hidden: false })?.hidden, false);
    assert.equal(db.getThread(room.id)?.hidden, false, "unhide restores the exact thread");
    assert.equal(db.getMessage(message.id)?.body, "Keep this.");
    assert.equal(db.updateThread("missing", { hidden: true }), null);
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

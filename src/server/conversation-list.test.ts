import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { OpenBotDatabase } from "./testing/database.js";

test("conversation previews show real public messages, not private consultation", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-conversation-preview-"));
  const db = new OpenBotDatabase(root);
  try {
    const parent = db.createRun({ botId: "nova", threadId: "bot-nova", prompt: "Plan my week", status: "running" });
    const child = db.createRun({ botId: "pixel", threadId: "bot-nova", prompt: "Private consultation", parentRunId: parent.id, status: "running" });
    const message = db.addMessage({ threadId: "bot-nova", senderType: "user", senderId: null, body: "Here is my actual request." });
    db.addMessage({ threadId: "bot-nova", senderType: "bot", senderId: "pixel", body: "Private tool discussion", runId: child.id });
    const thread = db.getThread("bot-nova")!;
    assert.equal(thread.lastMessage, message.body); assert.equal(thread.lastMessageAt, message.createdAt);
    db.addMessage({ threadId: "bot-nova", senderType: "bot", senderId: "nova", body: "Your plan is ready.", runId: parent.id });
    assert.equal(db.getThread("bot-nova")!.lastMessage, "Your plan is ready.");
  } finally { db.close(); rmSync(root, { recursive: true, force: true }); }
});

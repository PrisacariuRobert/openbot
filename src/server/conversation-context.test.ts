import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenBotDatabase } from "./testing/database.js";
import { conversationBridge, MAX_REUSED_CONTEXT, reportedContextSize } from "./conversation-context.js";
import { AttachmentService } from "./attachments.js";

function fixture(t: { after(fn: () => void): void }) {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-context-")), db = new OpenBotDatabase(root);
  t.after(() => { db.close(); rmSync(root, { recursive: true, force: true }); });
  const make = (prompt = "Please review this sample", extra = {}) => db.createRun({ threadId: "bot-pixel", botId: "pixel", prompt, status: "queued", ...extra });
  const old = make();
  db.updateRun(old.id, { status: "completed", sessionId: "old-session", inputTokens: 8000, cacheReadTokens: 2000 });
  db.rememberSessionCapabilities("old-session", "fingerprint");
  return { db, make, old, choice: (id: string, fingerprint = "fingerprint") => db.taskSession(id, fingerprint, MAX_REUSED_CONTEXT) };
}

test("fresh contexts retain bounded extracted attachment text in the same conversation", async t => {
  const f = fixture(t), service = new AttachmentService(f.db);
  const file = await service.saveUpload({ id: "d".repeat(32), threadId: "bot-pixel", name: "sample-cv.txt", mime: "text/plain", body: Buffer.from("Alex Example: TypeScript and SQL.\n" + "x".repeat(5000)) });
  const message = f.db.addMessage({ threadId: "bot-pixel", senderType: "user", senderId: null, body: "Review my CV" });
  f.db.claimAttachments([file.id], message.id, "bot-pixel");
  for (let i = 0; i < 8; i++) f.db.addMessage({ threadId: "bot-pixel", senderType: "user", senderId: null, body: `Follow-up ${i}` });
  const bridge = conversationBridge(f.db, f.make("What about my CV?"));
  assert.match(bridge, /Alex Example: TypeScript and SQL/);
  assert.match(bridge, /Untrusted file content/);
  assert.match(bridge, /shortened":true/);
  assert.ok(bridge.length < 12000);
  const elsewhere = f.db.createRun({ threadId: "bot-nova", botId: "nova", prompt: "Check", status: "queued" });
  assert.doesNotMatch(conversationBridge(f.db, elsewhere), /Alex Example/);
});

test("small completed contexts can be reused, but a new request is not mislabeled as a resumed task", t => {
  const f = fixture(t), next = f.make();
  assert.deepEqual(f.choice(next.id), { sessionId: "old-session", continuing: false, reason: "small_context" });
  assert.equal(f.db.getRun(next.id)!.task.tracked, true);
  f.db.recordSessionContext("old-session", 70_000);
  assert.deepEqual(f.choice(next.id), { sessionId: null, continuing: false, reason: "fresh_working_context" });
  assert.equal(f.db.previousSession("bot-pixel", "pixel"), "old-session", "Refreshing working context never deletes history");
  f.db.recordSessionContext("old-session", 1000);
  assert.equal(f.choice(next.id).sessionId, null, "Do not mistake a smaller partial usage event for cleared context");
});

test("active task, approval continuation and steering retain their own large session, never a newer unrelated one", t => {
  const f = fixture(t);
  f.db.recordSessionContext("old-session", 200_000);
  f.db.updateRun(f.old.id, { status: "awaiting_approval" });
  const unrelated = f.make();
  f.db.updateRun(unrelated.id, { status: "completed", sessionId: "other-session", inputTokens: 1000 });
  f.db.rememberSessionCapabilities("other-session", "fingerprint");
  assert.equal(f.choice(f.old.id).sessionId, "old-session");
  const steer = f.make("Correct the same work", { steeredFromRunId: f.old.id });
  assert.equal(f.choice(steer.id).sessionId, "old-session");
  assert.equal(f.choice(steer.id).continuing, true);
  assert.deepEqual(f.choice(steer.id, "changed-permissions"), { sessionId: null, continuing: true, reason: "context_changed" });
});

test("private consultations and scheduled work do not borrow an unrelated public runtime session", t => {
  const f = fixture(t), parent = f.make();
  const consultant = f.make("Private review", { parentRunId: parent.id });
  assert.equal(f.choice(consultant.id).sessionId, null);
  f.db.updateRun(consultant.id, { status: "waiting_for_teammate", sessionId: "consultant-session" });
  f.db.rememberSessionCapabilities("consultant-session", "fingerprint");
  assert.equal(f.choice(consultant.id).sessionId, "consultant-session");
  assert.equal(f.choice(f.make().id).sessionId, null, "Never borrow a consultant's session for a public task");
  const report = f.make("A report", { expectedWorkKind: "morning" });
  assert.equal(f.choice(report.id).sessionId, null);
});

test("unknown usage and oversized legacy contexts refresh conservatively", t => {
  const f = fixture(t), next = f.make();
  f.db.updateRun(f.old.id, { inputTokens: 0, cacheReadTokens: 0 });
  assert.equal(f.choice(next.id).sessionId, null);
  f.db.updateRun(f.old.id, { inputTokens: 500, cacheReadTokens: 50_000 });
  assert.equal(f.choice(next.id).reason, "fresh_working_context");
});

test("context footprint uses per-message input and cache, never whole-invocation totals", () => {
  assert.equal(reportedContextSize({ type: "step_finish", part: { tokens: { input: 600, cache: { read: 40_000, write: 800 } } } }), 41_400);
  assert.equal(reportedContextSize({ type: "assistant", message: { usage: { input_tokens: 600, cache_read_input_tokens: 20_000, cache_creation_input_tokens: 500 } } }), 21_100);
  assert.equal(reportedContextSize({ type: "result", usage: { input_tokens: 800_000 } }), null);
  for (const input of [-1, Infinity, "500"]) assert.equal(reportedContextSize({ usage: { input } }), null);
});

test("bounded continuity and history search stay in this public conversation, not private signals or another thread", t => {
  const f = fixture(t);
  f.db.addMessage({ threadId: "bot-pixel", senderId: null, senderType: "user", body: "Use the Cedar file, cedar-note.md, with reference 001." });
  f.db.addMessage({ threadId: "bot-pixel", senderId: null, senderType: "system", body: "Cedar internal-only event secret", eventType: "teammate_message" });
  f.db.addMessage({ threadId: "bot-nova", senderId: null, senderType: "user", body: "Cedar another thread secret" });
  const query = f.db.conversationSearch("bot-pixel", "Cedar");
  assert.equal(query.length, 1);
  assert.match(query[0]!.excerpt, /cedar-note.md/);
  assert.doesNotMatch(JSON.stringify(query), /secret/);
  for (let i = 0; i < 12; i++) f.db.addMessage({ threadId: "bot-pixel", senderId: null, senderType: "user", body: `Cedar ${i} ` + "x".repeat(10_000) });
  const bridge = conversationBridge(f.db, f.make());
  assert.ok(bridge.length < 12_000);
  assert.match(bridge, /shortened":true/);
  assert.doesNotMatch(bridge, /secret/);
  assert.equal(f.db.conversationSearch("bot-pixel", "Cedar").length, 5);
  assert.ok(f.db.conversationSearch("bot-pixel", "Cedar").every(message => message.excerpt.length <= 2400));
  assert.equal(conversationBridge(f.db, f.make("Private", { parentRunId: f.old.id })), "");
});

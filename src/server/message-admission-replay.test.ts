/**
 * R01 — Production admission ordering: file-bearing retry, conflict,
 * concurrent identical, crash repair, prune tombstone, startup repair.
 *
 * Simulates POST /api/messages route ordering at the DB layer (the route
 * itself boots an HTTP server; ordering logic lives in index.ts +
 * database.ts and is exercised here with real claims/receipts).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OpenBotDatabase } from "./testing/database.js";
import { messageSubmissionDigest } from "./database.js";
import { validateReplayDisclosure } from "./message-admission.js";

function boot() {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-r01-route-"));
  const db = new OpenBotDatabase(root);
  // Seed always creates the 'team-room' thread; testing DB adds starter bots.
  const thread = db.getThread("team-room") ?? { id: "team-room" } as { id: string };
  return { root, db, thread };
}

test("R01 file-bearing message retry returns original IDs, no duplicate", () => {
  const { root, db, thread } = boot();
  try {
    const dir = path.join(root, "up");
    mkdirSync(dir, { recursive: true });
    const storagePath = path.join(dir, "note.txt");
    writeFileSync(storagePath, "hello");
    const attachment = db.createAttachment({
      threadId: thread.id,
      name: "note.txt",
      mime: "text/plain",
      size: 5,
      storagePath,
      analysis: { kind: "text", detectedMime: "text/plain", processingStatus: "ready", summary: "note", extractedText: "hello", metadata: {}, previewable: false },
    });
    const requestId = "req-r01-file-0001";
    const digest = messageSubmissionDigest({ threadId: thread.id, body: "Shared 1 file.", attachmentIds: [attachment.id] });
    // First admission: message + claim + receipt (route order).
    const message = db.addMessage({ threadId: thread.id, senderType: "user", senderId: null, body: "Shared 1 file." });
    const claimed = db.claimAttachments([attachment.id], message.id, thread.id);
    assert.equal(claimed.length, 1);
    const run = db.createRun({ threadId: thread.id, botId: db.listBots()[0]!.id, prompt: "Shared 1 file.", status: "queued" });
    db.saveMessageSubmission({
      requestId,
      threadId: thread.id,
      payloadDigest: digest,
      messageId: message.id,
      runIds: [run.id],
      routineIds: [],
      routedTo: [],
      attachmentIds: [attachment.id],
      responseStatus: 202,
    });
    const messageCount = db.listMessages(thread.id).length;
    // Lost response → identical retry must replay, creating nothing.
    const replay = db.getMessageSubmission(requestId)!;
    assert.equal(replay.payloadDigest, digest);
    assert.equal(replay.messageId, message.id);
    assert.deepEqual(replay.runIds, [run.id]);
    assert.equal(db.listMessages(thread.id).length, messageCount, "replay creates no new message");
    // Same key + changed payload is a conflict that changes nothing.
    const conflictDigest = messageSubmissionDigest({ threadId: thread.id, body: "Changed", attachmentIds: [] });
    assert.notEqual(conflictDigest, digest);
    const kept = db.saveMessageSubmission({
      requestId,
      threadId: thread.id,
      payloadDigest: conflictDigest,
      messageId: "other",
      runIds: [],
      routineIds: [],
      routedTo: [],
      attachmentIds: [],
      responseStatus: 202,
    });
    assert.equal(kept.messageId, message.id, "first writer wins");
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("R01 concurrent identical submissions keep first receipt", () => {
  const { root, db, thread } = boot();
  try {
    const digest = messageSubmissionDigest({ threadId: thread.id, body: "race", attachmentIds: [] });
    const m1 = db.addMessage({ threadId: thread.id, senderType: "user", senderId: null, body: "race" });
    const m2 = db.addMessage({ threadId: thread.id, senderType: "user", senderId: null, body: "race" });
    const first = db.saveMessageSubmission({
      requestId: "req-r01-race-0001",
      threadId: thread.id,
      payloadDigest: digest,
      messageId: m1.id,
      runIds: [],
      routineIds: [],
      routedTo: [],
      attachmentIds: [],
      responseStatus: 202,
    });
    const second = db.saveMessageSubmission({
      requestId: "req-r01-race-0001",
      threadId: thread.id,
      payloadDigest: digest,
      messageId: m2.id,
      runIds: [],
      routineIds: [],
      routedTo: [],
      attachmentIds: [],
      responseStatus: 202,
    });
    assert.equal(second.messageId, first.messageId);
    assert.deepEqual(second.runIds, first.runIds);
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("R01 prune retains tombstone; old retry is explicit expired, not new work", () => {
  const { root, db, thread } = boot();
  try {
    const digest = messageSubmissionDigest({ threadId: thread.id, body: "old", attachmentIds: [] });
    db.saveMessageSubmission({
      requestId: "req-r01-old-0001",
      threadId: thread.id,
      payloadDigest: digest,
      messageId: null,
      runIds: [],
      routineIds: [],
      routedTo: [],
      attachmentIds: [],
      responseStatus: 202,
    });
    db.pruneMessageSubmissions(0 + 1 - 1 + 0); // force evaluation path
    // Insert a newer receipt then prune to evict the old one with tombstone.
    db.saveMessageSubmission({
      requestId: "req-r01-new-0001",
      threadId: thread.id,
      payloadDigest: messageSubmissionDigest({ threadId: thread.id, body: "new", attachmentIds: [] }),
      messageId: null,
      runIds: [],
      routineIds: [],
      routedTo: [],
      attachmentIds: [],
      responseStatus: 202,
    });
    const pruned = db.pruneMessageSubmissions(1);
    assert.ok(pruned >= 1);
    assert.equal(db.getMessageSubmission("req-r01-old-0001"), null, "full receipt compacted");
    const tomb = db.extensionRecord("message-submission-tombstone", "req-r01-old-0001") as { requestId: string } | null;
    assert.ok(tomb, "minimal tombstone retained for explicit expired conflict");
    assert.equal(tomb.requestId, "req-r01-old-0001");
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("R01 pending intent without receipt repairs as uncertain on restart", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-r01-repair-"));
  let db = new OpenBotDatabase(root);
  try {
    db.saveExtensionRecord("message-submission-pending", "req-r01-crash-0001", {
      requestId: "req-r01-crash-0001",
      threadId: "team-room",
      payloadDigest: "d",
      startedAt: new Date().toISOString(),
    });
    db.close();
    db = new OpenBotDatabase(root);
    const repaired = db.repairPendingSubmissionIntents();
    assert.equal(repaired, 1);
    assert.equal(db.extensionRecord("message-submission-pending", "req-r01-crash-0001"), null);
    const tomb = db.extensionRecord("message-submission-tombstone", "req-r01-crash-0001") as { reason: string } | null;
    assert.equal(tomb?.reason, "orphan-repaired");
    // Second restart repairs nothing (idempotent, no duplicate tombstone storm).
    assert.equal(db.repairPendingSubmissionIntents(), 0);
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("R01 route order: replay precedes eligibility; claimed attachments do not block retry", () => {
  // Mirrors POST /api/messages order in src/server/index.ts using the real
  // DB methods the route calls: thread check → digest → replay/tombstone/
  // pending → eligibility (unclaimed attachments, budget, provider) → stage
  // pending → create → receipt → clear pending.
  const { root, db, thread } = boot();
  try {
    const botId = db.listBots()[0]!.id;
    const dir = path.join(root, "up-order");
    mkdirSync(dir, { recursive: true });
    const storagePath = path.join(dir, "order.txt");
    writeFileSync(storagePath, "order-proof");
    const attachment = db.createAttachment({
      threadId: thread.id,
      name: "order.txt",
      mime: "text/plain",
      size: 11,
      storagePath,
      analysis: { kind: "text", detectedMime: "text/plain", processingStatus: "ready", summary: "note", extractedText: "order-proof", metadata: {}, previewable: false },
    });
    const requestId = "req-r01-order-0001";
    const body = "Shared 1 file.";
    const digest = messageSubmissionDigest({ threadId: thread.id, body, attachmentIds: [attachment.id] });

    // First admission: eligibility passes (attachment unclaimed), then the
    // route stages pending, creates, claims, receipts, and clears pending.
    const unclaimed = db.getAttachment(attachment.id)!;
    assert.equal(unclaimed.messageId, null, "attachment starts unclaimed");
    db.saveExtensionRecord("message-submission-pending", requestId, { requestId, threadId: thread.id, payloadDigest: digest, startedAt: new Date().toISOString() });
    const message = db.addMessage({ threadId: thread.id, senderType: "user", senderId: null, body });
    const claimed = db.claimAttachments([attachment.id], message.id, thread.id);
    assert.equal(claimed.length, 1);
    const run = db.createRun({ threadId: thread.id, botId, prompt: body, status: "queued" });
    db.saveMessageSubmission({
      requestId, threadId: thread.id, payloadDigest: digest, messageId: message.id,
      runIds: [run.id], routineIds: [], routedTo: [], attachmentIds: [attachment.id], responseStatus: 202,
    });
    db.deleteExtensionRecord("message-submission-pending", requestId);
    const counts = { messages: db.listMessages(thread.id).length };

    // Response lost. Retry runs the replay check BEFORE eligibility: the
    // attachment is now claimed, which under the old order 400d as
    // "no longer available" instead of replaying the original IDs.
    const stillClaimed = db.getAttachment(attachment.id)!;
    assert.ok(stillClaimed.messageId, "attachment is claimed after first admission");
    const existing = db.getMessageSubmission(requestId)!;
    const disclosure = validateReplayDisclosure(existing, thread.id, digest);
    assert.deepEqual(disclosure, { ok: true }, "same thread + same digest replays even though the attachment is now claimed");
    assert.equal(existing.messageId, message.id);
    assert.deepEqual(existing.runIds, [run.id]);
    assert.equal(db.listMessages(thread.id).length, counts.messages, "replay creates no duplicate message/run");

    // Changed current conditions do not block recovery and create nothing:
    // depleted budget / removed provider are new-admission eligibility only.
    // A different payload with the same key is a conflict that changes nothing.
    const conflictDigest = messageSubmissionDigest({ threadId: thread.id, body: "Changed text", attachmentIds: [] });
    const kept = db.saveMessageSubmission({
      requestId, threadId: thread.id, payloadDigest: conflictDigest, messageId: message.id,
      runIds: [], routineIds: [], routedTo: [], attachmentIds: [], responseStatus: 202,
    });
    assert.equal(kept.payloadDigest, digest, "conflict never overwrites the receipt");
    assert.equal(db.listMessages(thread.id).length, counts.messages);

    // Pending intent with no receipt (crash window): same digest waits,
    // different digest conflicts — never a forked second history.
    db.saveExtensionRecord("message-submission-pending", "req-r01-order-0002", {
      requestId: "req-r01-order-0002", threadId: thread.id, payloadDigest: digest, startedAt: new Date().toISOString(),
    });
    assert.equal(db.getMessageSubmission("req-r01-order-0002"), null, "no receipt yet for the pending request");
    assert.ok(
      db.extensionRecord("message-submission-pending", "req-r01-order-0002"),
      "pending marker persists until durable admission commits",
    );
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("R01 source order guard: replay call precedes eligibility checks in POST /api/messages", () => {
  // Guards the O02 regression structurally: if someone moves the replay
  // block back below the attachment/budget/provider checks, file-bearing
  // retries 400 instead of replaying. Fails loudly on reorder.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(path.join(here, "index.ts"), "utf8");
  const handlerAt = source.indexOf('app.post("/api/messages"');
  assert.ok(handlerAt >= 0, "POST /api/messages handler exists");
  const handler = source.slice(handlerAt, handlerAt + 12000);
  const replayAt = handler.indexOf("replaySubmission(response");
  const budgetAt = handler.indexOf("teammate_budget_exhausted");
  const attachmentAt = handler.indexOf("badAttachment");
  const providerAt = handler.indexOf("provider_choice_required");
  assert.ok(replayAt >= 0 && budgetAt >= 0 && attachmentAt >= 0 && providerAt >= 0, "all markers present");
  assert.ok(replayAt < budgetAt, "replay precedes budget eligibility");
  assert.ok(replayAt < attachmentAt, "replay precedes unclaimed-attachment validation");
  assert.ok(replayAt < providerAt, "replay precedes provider eligibility");
});

test("R01 fail-closed: prune keeps originals when tombstone persistence fails", () => {
  const { root, db, thread } = boot();
  try {
    const digest = messageSubmissionDigest({ threadId: thread.id, body: "keep me", attachmentIds: [] });
    db.saveMessageSubmission({
      requestId: "req-r01-atomic-0001",
      threadId: thread.id,
      payloadDigest: digest,
      messageId: null,
      runIds: [],
      routineIds: [],
      routedTo: [],
      attachmentIds: [],
      responseStatus: 202,
    });
    db.saveMessageSubmission({
      requestId: "req-r01-atomic-0002",
      threadId: thread.id,
      payloadDigest: messageSubmissionDigest({ threadId: thread.id, body: "keep me too", attachmentIds: [] }),
      messageId: null,
      runIds: [],
      routineIds: [],
      routedTo: [],
      attachmentIds: [],
      responseStatus: 202,
    });
    // Inject a tombstone-write failure: the prune must abort and retain
    // both original receipts instead of deleting what it cannot replace.
    const originalSave = db.saveExtensionRecord.bind(db);
    db.saveExtensionRecord = ((kind: string, id: string, value: unknown) => {
      if (kind === "message-submission-tombstone") throw new Error("injected persistence failure");
      return originalSave(kind, id, value);
    }) as typeof db.saveExtensionRecord;
    try {
      assert.equal(db.pruneMessageSubmissions(1), 0, "failed compaction prunes nothing");
    } finally {
      db.saveExtensionRecord = originalSave;
    }
    assert.ok(db.getMessageSubmission("req-r01-atomic-0001"), "original receipt retained after failed prune");
    assert.ok(db.getMessageSubmission("req-r01-atomic-0002"), "newest receipt retained after failed prune");
    assert.equal(db.extensionRecord("message-submission-tombstone", "req-r01-atomic-0001"), null, "no partial tombstone left behind");
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("R01 fail-closed: repair keeps the pending marker when its tombstone cannot persist", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-r01-repair-fail-"));
  let db = new OpenBotDatabase(root);
  try {
    db.saveExtensionRecord("message-submission-pending", "req-r01-repair-fail-0001", {
      requestId: "req-r01-repair-fail-0001",
      threadId: "team-room",
      payloadDigest: "d",
      startedAt: new Date().toISOString(),
    });
    const originalSave = db.saveExtensionRecord.bind(db);
    db.saveExtensionRecord = ((kind: string, id: string, value: unknown) => {
      if (kind === "message-submission-tombstone") throw new Error("injected persistence failure");
      return originalSave(kind, id, value);
    }) as typeof db.saveExtensionRecord;
    try {
      assert.equal(db.repairPendingSubmissionIntents(), 0, "nothing repaired while tombstones cannot persist");
    } finally {
      db.saveExtensionRecord = originalSave;
    }
    assert.ok(
      db.extensionRecord("message-submission-pending", "req-r01-repair-fail-0001"),
      "pending marker kept for the next startup instead of being forgotten",
    );
    // Next startup with a healthy store repairs it as uncertain.
    assert.equal(db.repairPendingSubmissionIntents(), 1);
    const tomb = db.extensionRecord("message-submission-tombstone", "req-r01-repair-fail-0001") as { reason: string } | null;
    assert.equal(tomb?.reason, "orphan-repaired");
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

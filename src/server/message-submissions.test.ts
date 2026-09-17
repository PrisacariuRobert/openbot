import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenBotDatabase } from "./testing/database.js";

// The digest helper lives on the application module — the same function the
// production endpoint uses to bind requestId to the canonical payload.
import { messageSubmissionDigest as digest } from "./database.js";

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-message-submissions-"));
  const db = new OpenBotDatabase(root);
  return { root, db };
}

test("submission digest binds every semantic input", () => {
  const base = {
    threadId: "team-room",
    body: "Hello team",
    attachmentIds: ["a1", "a2"],
    replyToId: null,
    targetBotIds: ["nova", "pixel"],
    timeZone: "Europe/Brussels",
    expectedWorkKind: undefined,
  };
  const same = digest({ ...base, targetBotIds: ["pixel", "nova"] });
  assert.equal(digest(base), same, "explicit target order must not fork identity");
  assert.notEqual(digest({ ...base, body: "Hello team!" }), digest(base), "text change must change identity");
  assert.notEqual(digest({ ...base, threadId: "other" }), digest(base), "thread change must change identity");
  assert.notEqual(digest({ ...base, attachmentIds: ["a2", "a1"] }), digest(base), "attachment order is meaningful");
  assert.notEqual(digest({ ...base, attachmentIds: ["a1"] }), digest(base), "attachment set change must change identity");
  assert.notEqual(
    digest({ ...base, replyToId: "00000000-0000-4000-8000-000000000000" }),
    digest(base),
    "reply target must change identity",
  );
  assert.notEqual(digest({ ...base, timeZone: "UTC" }), digest(base), "time zone must change identity");
  assert.notEqual(digest({ ...base, targetBotIds: ["nova"] }), digest(base), "target set change must change identity");
});

test("exact retry replays stored IDs and conflicting payload never overwrites", () => {
  const f = fixture();
  try {
    const message = f.db.addMessage({ threadId: "team-room", senderType: "user", senderId: null, body: "First" });
    const run = f.db.createRun({ threadId: "team-room", botId: "nova", prompt: "First", status: "queued" });
    const payloadDigest = digest({
      threadId: "team-room",
      body: "First",
      attachmentIds: [],
      replyToId: null,
      targetBotIds: ["nova"],
    });
    const saved = f.db.saveMessageSubmission({
      requestId: "req-p01-replay-0001",
      threadId: "team-room",
      payloadDigest,
      messageId: message.id,
      runIds: [run.id],
      routineIds: [],
      routedTo: [{ id: "nova", name: "Nova" }],
      attachmentIds: [],
      responseStatus: 202,
    });
    assert.equal(saved.messageId, message.id);
    assert.deepEqual(saved.runIds, [run.id]);

    // A transport retry with the same digest must resolve to the original row.
    const replay = f.db.getMessageSubmission("req-p01-replay-0001")!;
    assert.equal(replay.payloadDigest, payloadDigest);
    assert.equal(replay.messageId, message.id);

    // Same key + different payload: the stored row wins and is never replaced.
    const secondMessage = f.db.addMessage({ threadId: "team-room", senderType: "user", senderId: null, body: "Changed" });
    const conflictDigest = digest({
      threadId: "team-room",
      body: "Changed",
      attachmentIds: [],
      replyToId: null,
      targetBotIds: ["nova"],
    });
    assert.notEqual(conflictDigest, payloadDigest);
    const kept = f.db.saveMessageSubmission({
      requestId: "req-p01-replay-0001",
      threadId: "team-room",
      payloadDigest: conflictDigest,
      messageId: secondMessage.id,
      runIds: [],
      routineIds: [],
      routedTo: [{ id: "nova", name: "Nova" }],
      attachmentIds: [],
      responseStatus: 202,
    });
    assert.equal(kept.messageId, message.id, "first writer wins; a conflicting retry must not overwrite the receipt");
    assert.equal(kept.payloadDigest, payloadDigest);
  } finally {
    f.db.close();
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("routine fast-path receipts persist and a deleted routine is never resurrected by replay", () => {
  const f = fixture();
  try {
    const message = f.db.addMessage({ threadId: "team-room", senderType: "user", senderId: null, body: "Every Monday brief me" });
    const routine = f.db.createRoutine({
      name: "Monday brief",
      botId: "nova",
      threadId: "team-room",
      prompt: "Brief me",
      intervalMinutes: 10080,
    });
    const payloadDigest = digest({
      threadId: "team-room",
      body: "Every Monday brief me",
      attachmentIds: [],
      replyToId: null,
      targetBotIds: ["nova"],
    });
    f.db.saveMessageSubmission({
      requestId: "req-p01-routine-0001",
      threadId: "team-room",
      payloadDigest,
      messageId: message.id,
      runIds: [],
      routineIds: [routine.id],
      routedTo: [{ id: "nova", name: "Nova" }],
      attachmentIds: [],
      responseStatus: 201,
    });

    const before = f.db.listMessages("team-room").length;
    f.db.deleteRoutine(routine.id);
    assert.equal(f.db.getRoutine(routine.id), null);

    // Replay path: the endpoint returns stored IDs without creating anything.
    // The receipt row itself survives the routine deletion (no resurrection).
    const receipt = f.db.getMessageSubmission("req-p01-routine-0001")!;
    assert.deepEqual(receipt.routineIds, [routine.id]);
    assert.equal(f.db.listMessages("team-room").length, before, "reading a receipt must not recreate the deleted routine");
  } finally {
    f.db.close();
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("receipts survive database restart and retention stays bounded", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-message-submissions-"));
  let db = new OpenBotDatabase(root);
  try {
    const message = db.addMessage({ threadId: "team-room", senderType: "user", senderId: null, body: "Restart me" });
    const payloadDigest = digest({ threadId: "team-room", body: "Restart me", attachmentIds: [] });
    db.saveMessageSubmission({
      requestId: "req-p01-restart-0001",
      threadId: "team-room",
      payloadDigest,
      messageId: message.id,
      runIds: [],
      routineIds: [],
      routedTo: [],
      attachmentIds: [],
      responseStatus: 202,
    });
    db.close();

    db = new OpenBotDatabase(root);
    const after = db.getMessageSubmission("req-p01-restart-0001")!;
    assert.equal(after.messageId, message.id);
    assert.equal(after.payloadDigest, payloadDigest);

    for (let i = 0; i < 5; i++) {
      db.saveMessageSubmission({
        requestId: `req-p01-prune-${i}`,
        threadId: "team-room",
        payloadDigest: digest({ threadId: "team-room", body: `prune ${i}`, attachmentIds: [] }),
        messageId: null,
        runIds: [],
        routineIds: [],
        routedTo: [],
        attachmentIds: [],
        responseStatus: 202,
      });
    }
    const pruned = db.pruneMessageSubmissions(3);
    assert.equal(pruned, 3, "only the newest receipts are retained");
    assert.equal(db.getMessageSubmission("req-p01-restart-0001"), null, "oldest receipt falls off the window");
    assert.ok(db.getMessageSubmission("req-p01-prune-4"), "newest receipt is retained");
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

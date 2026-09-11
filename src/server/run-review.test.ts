import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenBotDatabase } from "./testing/database.js";
import { requestRunReview } from "./run-review.js";

/** Owner-tapped independent review: the host spawns the reviewer child run,
 * never the author's prose. Completed parents only, never self-review, never
 * a retired teammate, never a same-model reviewer when another model class
 * exists, never two in-flight reviews by the same reviewer. */
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-run-review-"));
  const db = new OpenBotDatabase(root);
  const author = db.getBot("nova")!;
  const reviewer = db.getBot("pixel")!;
  const run = db.createRun({ threadId: author.threadId, botId: author.id, prompt: "Reconcile", status: "completed" });
  return { root, db, author, reviewer, run, close: () => { db.close(); rmSync(root, { recursive: true, force: true }); } };
}

function attachArtifact(f: ReturnType<typeof fixture>, name = "totals.xlsx") {
  const file = path.join(f.root, name);
  writeFileSync(file, "workbook-bytes");
  const message = f.db.addMessage({ threadId: f.author.threadId, senderType: "bot", senderId: f.author.id, body: "Done", runId: f.run.id });
  f.db.createAttachment({ threadId: f.author.threadId, messageId: message.id, name, mime: "application/octet-stream", size: 14, storagePath: file, source: "artifact" });
}

test("owner tap spawns a queued reviewer child naming the delivered files", async () => {
  const f = fixture();
  try {
    attachArtifact(f);
    const result = await requestRunReview(f.db, f.run.id, f.reviewer.id);
    assert.equal(result.reviewerName, "Pixel");
    const child = f.db.getRun(result.childRunId)!;
    assert.equal(child.botId, f.reviewer.id);
    assert.equal(child.parentRunId, f.run.id);
    assert.equal(child.status, "queued");
    assert.deepEqual(child.attachmentIds, f.run.attachmentIds);
    assert.ok(child.prompt.includes("totals.xlsx"), "reviewer re-opens the exact delivered file");
    assert.ok(child.prompt.includes("Do not address the user"), "reviewer stays internal");
    assert.match(child.prompt, /untrusted data/);
    const activity = f.db.getRun(f.run.id)!.activities.find((a) => a.label === "Pixel is reviewing this result");
    assert.ok(activity, "owner sees the review start on the parent run");
    const receipt = f.db.buildRunReceipt(f.run.id)!;
    assert.ok(receipt.team.some((entry) => entry.botName === "Pixel"), "reviewer joins the parent receipt");
  } finally { f.close(); }
});

test("review without delivered files still scopes to conversation sources", async () => {
  const f = fixture();
  try {
    const result = await requestRunReview(f.db, f.run.id, "Pixel");
    const child = f.db.getRun(result.childRunId)!;
    assert.ok(child.prompt.includes("No delivered files are attached"), "name resolution also works");
  } finally { f.close(); }
});

test("only finished work can be reviewed", async () => {
  const f = fixture();
  try {
    f.db.updateRun(f.run.id, { status: "running" });
    await assert.rejects(() => requestRunReview(f.db, f.run.id, f.reviewer.id), /finished/);
    await assert.rejects(() => requestRunReview(f.db, "missing-run", f.reviewer.id), /no longer available/);
  } finally { f.close(); }
});

test("self-review and retired reviewers are refused", async () => {
  const f = fixture();
  try {
    await assert.rejects(() => requestRunReview(f.db, f.run.id, f.author.id), /independent/);
    f.db.retireBot(f.reviewer.id);
    await assert.rejects(() => requestRunReview(f.db, f.run.id, f.reviewer.id), /retired/);
  } finally { f.close(); }
});

test("same-model reviewer is refused when another model class exists", async () => {
  const f = fixture();
  try {
    const a = f.db.createBot({ name: "Author", emoji: "A", color: "#111111", role: "R", instructions: "R.", model: "opencode-go/model-a", providerInstanceId: "local-opencode" });
    const same = f.db.createBot({ name: "Same", emoji: "S", color: "#222222", role: "R", instructions: "R.", model: "opencode-go/model-a", providerInstanceId: "local-opencode" });
    const other = f.db.createBot({ name: "Other", emoji: "O", color: "#333333", role: "R", instructions: "R.", model: "opencode-go/model-b", providerInstanceId: "local-opencode" });
    const run = f.db.createRun({ threadId: a.threadId, botId: a.id, prompt: "Work", status: "completed" });
    await assert.rejects(() => requestRunReview(f.db, run.id, same.id), /different model/);
    const ok = await requestRunReview(f.db, run.id, other.id);
    assert.equal(ok.reviewerName, "Other");
  } finally { f.close(); }
});

test("single-model studios degrade gracefully", async () => {
  const f = fixture();
  try {
    const ok = await requestRunReview(f.db, f.run.id, f.reviewer.id);
    assert.equal(ok.reviewerName, "Pixel", "seeded bots share an empty model — review still allowed");
  } finally { f.close(); }
});

test("a second tap while the review is in flight is refused, then allowed", async () => {
  const f = fixture();
  try {
    await requestRunReview(f.db, f.run.id, f.reviewer.id);
    await assert.rejects(() => requestRunReview(f.db, f.run.id, f.reviewer.id), /already reviewing/);
    const child = f.db.listChildRuns(f.run.id)[0]!;
    f.db.updateRun(child.id, { status: "completed" });
    const again = await requestRunReview(f.db, f.run.id, f.reviewer.id);
    assert.ok(again.childRunId !== child.id, "a finished review does not block a fresh one");
  } finally { f.close(); }
});

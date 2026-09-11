import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { OpenBotDatabase } from "./testing/database.js";
import { AttachmentService } from "./attachments.js";

/** S5-P01 / S4-P01: a task stopped by its budget may have already produced a
 * host-checked file. Those bytes must be retrievable from the receipt and the
 * recovery UI without another model run, and the run must stay failed. */
test("a stopped task exposes its host-checked file as a partial result without more model work", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-partial-"));
  try {
    const db = new OpenBotDatabase(root);
    const bot = db.getBot("nova")!;
    const workspace = path.join(db.workspacesDir, bot.id);
    mkdirSync(workspace, { recursive: true });
    const resultPath = path.join(workspace, "s4-review.json");
    const bytes = Buffer.from('{"notebooks":37,"pens":85,"folders":9,"total":131}\n', "utf8");
    writeFileSync(resultPath, bytes);
    const sha = createHash("sha256").update(bytes).digest("hex");

    const uploadDir = path.join(db.attachmentsDir, "source-input");
    mkdirSync(uploadDir, { recursive: true });
    const uploadPath = path.join(uploadDir, "s4-stock-source.txt");
    writeFileSync(uploadPath, "notebooks 37\npens 85\nfolders 9\n");
    const input = db.createAttachment({ threadId: bot.threadId, name: "s4-stock-source.txt", mime: "text/plain", size: 30, storagePath: uploadPath, source: "upload" });

    const run = db.createRun({ threadId: bot.threadId, botId: bot.id, prompt: "Review the stock list and save s4-review.json", status: "running", attachmentIds: [input.id] });
    // The host check labels the file exactly as verifyWorkspaceFileEvidence does.
    db.verifyRunTask(run.id, { status: "partial", summary: "File reopened before the budget stop.", checks: [{ label: "Text-file check: s4-review.json", source: "host", passed: true, detail: "reopened, 250 bytes, SHA-256 39e2619350d3." }] });
    db.updateRun(run.id, { status: "failed", finishedAt: new Date().toISOString() });
    db.finishRunTask(run.id, "failed", "Weekly token limit reached (20,064 of 20,000 tokens accounted).");
    const stop = db.messageForRunEvent(run.id, "run_stopped");
    assert.ok(stop, "the failure posts a run_stopped notice");

    const captured = await new AttachmentService(db).captureStoppedResult(bot, stop!, ["s4-review.json"]);
    assert.equal(captured.length, 1);
    assert.equal(captured[0]!.source, "artifact");
    assert.match(captured[0]!.summary || "", /Partial result/);
    assert.equal(createHash("sha256").update(readFileSync(db.attachmentFile(captured[0]!.id)!.storagePath)).digest("hex"), sha);

    const receipt = db.buildRunReceipt(run.id)!;
    assert.equal(receipt.status, "failed", "a stop never becomes a completed delivery");
    assert.equal(receipt.inputs.length, 1);
    assert.equal(receipt.inputs[0]!.name, "s4-stock-source.txt");
    assert.equal(receipt.artifacts.length, 1);
    assert.equal(receipt.artifacts[0]!.name, "s4-review.json");
    assert.ok(receipt.artifacts[0]!.url!.startsWith("/api/attachments/"));
    db.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("partial capture ignores files outside the teammate workspace and inbox copies", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-partial-bound-"));
  try {
    const db = new OpenBotDatabase(root);
    const bot = db.getBot("nova")!;
    const workspace = path.join(db.workspacesDir, bot.id);
    mkdirSync(path.join(workspace, "inbox", "m1"), { recursive: true });
    writeFileSync(path.join(workspace, "inbox", "m1", "original.txt"), "do not copy originals");
    const outside = path.join(root, "outside-secret.txt");
    writeFileSync(outside, "outside");
    const run = db.createRun({ threadId: bot.threadId, botId: bot.id, prompt: "Check the files", status: "running" });
    db.finishRunTask(run.id, "failed", "Stopped.");
    const stop = db.messageForRunEvent(run.id, "run_stopped")!;
    const captured = await new AttachmentService(db).captureStoppedResult(bot, stop, ["inbox/m1/original.txt", outside, "../outside-secret.txt"]);
    assert.equal(captured.length, 0);
    db.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

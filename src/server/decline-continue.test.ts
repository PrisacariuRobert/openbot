import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { MAX_DECLINES_BEFORE_STOP } from "./database.js";
import { OpenBotDatabase } from "./testing/database.js";

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-decline-"));
  const db = new OpenBotDatabase(root);
  const run = db.createRun({ threadId: "team-room", botId: "nova", prompt: "Summarize my Notion page", status: "awaiting_approval" });
  const ask = (kind: "browser" | "prompt" | "external" = "browser", label = "Click the page body") =>
    db.createApproval({ runId: run.id, botId: "nova", kind, reason: "Review this control.", actionLabel: label, action: { type: "browser_click", botId: "nova", args: {} } });
  return { root, db, run, ask, done: () => { db.close(); rmSync(root, { recursive: true, force: true }); } };
}

test("declining a mid-task action lets the teammate finish without it", () => {
  const f = fixture();
  try {
    const approval = f.ask("browser", "Click the long page-content block");
    assert.equal(f.db.decideApproval(approval.id, "denied", { continueAfterDecline: true })?.status, "denied");
    const run = f.db.getRun(f.run.id)!;
    assert.equal(run.status, "queued");
    assert.match(run.prompt, /The owner declined this proposed action: Click the long page-content block/);
    assert.match(run.prompt, /do not attempt an equivalent action another way/);
    assert.match(run.prompt, /Original request: Summarize my Notion page$/);
    assert.ok(f.db.getRun(f.run.id)!.activities.some((item) => item.label === "Declined by you"));

    // A second decline keeps the original request instead of nesting prompts.
    f.db.updateRun(f.run.id, { status: "awaiting_approval" });
    f.db.decideApproval(f.ask("external", "Post the summary").id, "denied", { continueAfterDecline: true });
    const again = f.db.getRun(f.run.id)!.prompt;
    assert.equal((again.match(/Original request:/g) || []).length, 1);
    assert.match(again, /declined this proposed action: Post the summary/);
  } finally { f.done(); }
});

test("declining a task start, stopping, or declining too often still ends the task", () => {
  const start = fixture();
  try {
    start.db.decideApproval(start.ask("prompt", "Start the task").id, "denied", { continueAfterDecline: true });
    assert.equal(start.db.getRun(start.run.id)!.status, "cancelled");
  } finally { start.done(); }

  const stop = fixture();
  try {
    const pending = stop.ask("browser");
    assert.equal(stop.db.getRun(stop.run.id)!.approvalId, pending.id);
    stop.db.cancelRun(stop.run.id);
    assert.equal(stop.db.getRun(stop.run.id)!.status, "cancelled");
  } finally { stop.done(); }

  const repeated = fixture();
  try {
    for (let n = 1; n <= MAX_DECLINES_BEFORE_STOP + 1; n++) {
      repeated.db.updateRun(repeated.run.id, { status: "awaiting_approval" });
      repeated.db.decideApproval(repeated.ask("browser", `Try ${n}`).id, "denied", { continueAfterDecline: true });
      assert.equal(repeated.db.getRun(repeated.run.id)!.status, n <= MAX_DECLINES_BEFORE_STOP ? "queued" : "cancelled", `decline ${n}`);
    }
  } finally { repeated.done(); }

  const legacy = fixture();
  try {
    legacy.db.decideApproval(legacy.ask("browser").id, "denied");
    assert.equal(legacy.db.getRun(legacy.run.id)!.status, "cancelled", "callers that do not opt in keep cancelling");
  } finally { legacy.done(); }
});

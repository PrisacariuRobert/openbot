import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { OpenBotDatabase } from "./database.js";

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-approved-action-"));
  const db = new OpenBotDatabase(root);
  const run = db.createRun({ threadId: "team-room", botId: "nova", prompt: "Prepare a message", status: "running" });
  const action = { type: "gmail_send", botId: "nova", args: { to: "person@example.com", subject: "Hello", body: "private body marker" } };
  const approval = db.createApproval({ runId: run.id, botId: "nova", kind: "external", reason: "Review the complete email.", actionLabel: "Send email to person@example.com", action });
  return { root, db, run, action, approval };
}

test("dispatches each approved action at most once and exposes only a bounded receipt", () => {
  const f = fixture();
  try {
    const prepared = f.db.prepareApprovedAction({ approvalId: f.approval.id, runId: f.run.id, botId: "nova", actionType: "gmail_send", action: f.action });
    assert.equal(prepared.status, "prepared");
    assert.equal(f.db.decideApproval(f.approval.id, "approved")?.status, "approved");
    assert.equal(f.db.decideApproval(f.approval.id, "denied"), null, "the first approval decision must win");
    const claimed = f.db.claimApprovedAction(f.approval.id);
    assert.equal(claimed?.status, "running");
    assert.equal(claimed?.attemptCount, 1);
    assert.equal(f.db.claimApprovedAction(f.approval.id), null, "a second caller must never dispatch the same action");
    const completed = f.db.completeApprovedAction(f.approval.id, "Gmail accepted the message as abc123.");
    assert.equal(completed?.status, "completed");
    assert.equal(completed?.resultSummary, "Gmail accepted the message as abc123.");
    const publicState = JSON.stringify(f.db.getState("team-room"));
    assert.equal(publicState.includes("private body marker"), false, "action receipts must not expose the saved request body");
  } finally {
    f.db.close();
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("denying an action removes any prepared dispatch before it can run", () => {
  const f = fixture();
  try {
    f.db.prepareApprovedAction({ approvalId: f.approval.id, runId: f.run.id, botId: "nova", actionType: "gmail_send", action: f.action });
    assert.equal(f.db.decideApproval(f.approval.id, "denied")?.status, "denied");
    assert.equal(f.db.getApprovedAction(f.approval.id), null);
    assert.equal(f.db.claimApprovedAction(f.approval.id), null);
  } finally {
    f.db.close();
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("a restart never blindly replays an action whose remote outcome is uncertain", () => {
  const f = fixture();
  try {
    f.db.prepareApprovedAction({ approvalId: f.approval.id, runId: f.run.id, botId: "nova", actionType: "gmail_send", action: f.action });
    f.db.decideApproval(f.approval.id, "approved");
    assert.equal(f.db.claimApprovedAction(f.approval.id)?.status, "running");
    f.db.close();

    const reopened = new OpenBotDatabase(f.root);
    const recovered = reopened.recoverInterruptedApprovedActions();
    assert.equal(recovered.length, 1);
    assert.equal(recovered[0]?.status, "uncertain");
    assert.equal(reopened.claimApprovedAction(f.approval.id), null, "uncertain work must wait for human reconciliation");
    const resolved = reopened.resolveUncertainApprovedAction(recovered[0]!.id, "not_completed");
    assert.equal(resolved?.status, "confirmed_not_completed");
    assert.equal(reopened.resolveUncertainApprovedAction(recovered[0]!.id, "completed"), null, "the recorded outcome is immutable");
    reopened.close();
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("an approved but not-yet-started action survives restart and detects changed payloads", () => {
  const f = fixture();
  try {
    f.db.prepareApprovedAction({ approvalId: f.approval.id, runId: f.run.id, botId: "nova", actionType: "gmail_send", action: f.action });
    assert.throws(() => f.db.prepareApprovedAction({
      approvalId: f.approval.id,
      runId: f.run.id,
      botId: "nova",
      actionType: "gmail_send",
      action: { ...f.action, args: { ...f.action.args, to: "different@example.com" } },
    }), /changed after it was prepared/);
    f.db.decideApproval(f.approval.id, "approved");
    f.db.close();

    const reopened = new OpenBotDatabase(f.root);
    assert.equal(reopened.listPreparedApprovedActions().length, 1);
    assert.equal(reopened.claimApprovedAction(f.approval.id)?.status, "running");
    reopened.close();
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

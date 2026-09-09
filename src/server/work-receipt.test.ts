import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenBotDatabase } from "./testing/database.js";

test("work receipt aggregates team, checks, artifacts, actions and usage", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-receipt-test-"));
  try {
    const db = new OpenBotDatabase(root);
    const nova = db.getBot("nova")!;
    const run = db.createRun({ botId: "nova", threadId: nova.threadId, prompt: "Prepare the launch brief", status: "completed" });
    db.updateRun(run.id, { startedAt: new Date(Date.now() - 120_000).toISOString(), finishedAt: new Date().toISOString() });
    db.setRunTaskPlan(run.id, { goal: "Prepare the launch brief", deliverable: "A finished brief", steps: ["Gather", "Draft"] });
    const message = db.addMessage({ threadId: nova.threadId, senderType: "bot", senderId: "nova", body: "The brief is ready.", runId: run.id });
    const artifactDir = path.join(db.attachmentsDir, "receipt-artifact"), artifactPath = path.join(artifactDir, "brief.md");
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(artifactPath, "# Launch brief\n", "utf8");
    db.createAttachment({ threadId: nova.threadId, messageId: message.id, name: "brief.md", mime: "text/markdown", size: 16, storagePath: artifactPath, source: "artifact", artifactKey: "nova:brief.md", revision: 1 });
    db.addActivity({ runId: run.id, botId: "nova", kind: "tool", label: "Gathered your briefing sources", detail: "6 sources" });
    // A private consultation child run with its own usage and a failed outcome.
    const child = db.createRun({ botId: "pixel", threadId: nova.threadId, prompt: "Private handoff from Nova: check dates", status: "failed", parentRunId: run.id });
    db.updateRun(child.id, { inputTokens: 1_200, outputTokens: 300, error: "The calendar source was unreachable" });
    // One completed external action and one uncertain one.
    const approval = db.createApproval({ runId: run.id, botId: "nova", kind: "external", reason: "Review the send", actionLabel: "Send the brief to Alex", action: { type: "gmail_send", botId: "nova", args: {} } });
    db.prepareApprovedAction({ approvalId: approval.id, runId: run.id, botId: "nova", actionType: "gmail_send", action: { type: "gmail_send", botId: "nova", args: {} } });
    db.decideApproval(approval.id, "approved");
    db.claimApprovedAction(approval.id);
    db.completeApprovedAction(approval.id, "The email was sent to Alex.");
    const pending = db.createApproval({ runId: run.id, botId: "nova", kind: "external", reason: "Review the post", actionLabel: "Post the announcement", action: { type: "slack_post", botId: "nova", args: {} } });
    db.prepareApprovedAction({ approvalId: pending.id, runId: run.id, botId: "nova", actionType: "slack_post", action: { type: "slack_post", botId: "nova", args: {} } });
    db.decideApproval(pending.id, "approved");
    db.claimApprovedAction(pending.id);
    db.markApprovedActionUncertain(pending.id, "The service dropped the connection.");
    const receipt = db.buildRunReceipt(run.id)!;
    assert.equal(receipt.botName, "Nova");
    assert.equal(receipt.goal, "Prepare the launch brief");
    assert.equal(receipt.team.length, 2);
    assert.equal(receipt.team[1]!.botName, "Pixel");
    assert.equal(receipt.team[1]!.tokens, 1_500);
    assert.ok(receipt.durationMs !== null && receipt.durationMs >= 100_000);
    assert.equal(receipt.artifacts.length, 1);
    assert.equal(receipt.artifacts[0]!.name, "brief.md");
    assert.ok(receipt.artifacts[0]!.url!.startsWith("/api/attachments/"));
    assert.equal(receipt.externalActions.length, 2);
    assert.ok(receipt.externalActions.some((action) => action.status === "completed"));
    assert.ok(receipt.externalActions.some((action) => action.status === "uncertain"));
    assert.ok(receipt.uncertainty.some((line) => line.startsWith("Uncertain")));
    assert.ok(receipt.uncertainty.some((line) => line.startsWith("Pixel:")));
    assert.ok(receipt.workLog.some((entry) => entry.label === "Gathered your briefing sources"));
    assert.ok(receipt.usage.tokens >= 1_500);
    assert.equal(receipt.usage.runs >= 2, true);
    assert.equal(db.buildRunReceipt("missing"), null);
    db.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("receipts retain old job actions even after more than 100 unrelated actions", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-receipt-history-"));
  const db = new OpenBotDatabase(root);
  try {
    const run = db.createRun({ botId: "nova", threadId: "bot-nova", prompt: "Deliver the report", status: "completed" });
    const unrelated = db.createRun({ botId: "pixel", threadId: "bot-pixel", prompt: "Other work", status: "completed" });
    function action(runId: string, botId: string, label: string, uncertain = false) {
      const approval = db.createApproval({ runId, botId, kind: "external", reason: "Fixture review", actionLabel: label, action: { type: "fixture_send" } });
      db.prepareApprovedAction({ approvalId: approval.id, runId, botId, actionType: "fixture_send", action: {} });
      db.decideApproval(approval.id, "approved");
      db.claimApprovedAction(approval.id);
      if (uncertain) db.markApprovedActionUncertain(approval.id, "No destination confirmation.");
      else db.completeApprovedAction(approval.id, "Fixture completed.");
    }
    action(run.id, "nova", "Original uncertain send", true);
    for (let n = 0; n < 13; n++) action(run.id, "nova", `Follow-up ${n}`);
    for (let n = 0; n < 105; n++) action(unrelated.id, "pixel", `Unrelated ${n}`);
    const receipt = db.buildRunReceipt(run.id)!;
    assert.equal(receipt.externalActions.length, 14);
    assert.ok(receipt.uncertainty.some((line) => line.includes("Original uncertain send")));
    assert.ok(receipt.externalActions.every((entry) => !entry.label.startsWith("Unrelated")));
  } finally { db.close(); rmSync(root, { recursive: true, force: true }); }
});

test("completed is not verified when checks fail, teammates are unfinished or an action is pending", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-receipt-limits-"));
  const db = new OpenBotDatabase(root);
  try {
    const run = db.createRun({ botId: "nova", threadId: "bot-nova", prompt: "Check the launch report", status: "completed" });
    db.verifyRunTask(run.id, { status: "partial", summary: "A source is missing.", checks: [{ label: "Source exists", source: "host", passed: false }] });
    db.createRun({ botId: "pixel", threadId: "bot-nova", prompt: "Check the report", status: "running", parentRunId: run.id });
    const approval = db.createApproval({ runId: run.id, botId: "nova", kind: "external", reason: "Fixture", actionLabel: "Send the final report", action: { type: "fixture_send" } });
    db.prepareApprovedAction({ approvalId: approval.id, runId: run.id, botId: "nova", actionType: "fixture_send", action: {} });
    db.decideApproval(approval.id, "approved");
    const receipt = db.buildRunReceipt(run.id)!;
    assert.ok(receipt.uncertainty.some((line) => line.includes("Source exists")));
    assert.ok(receipt.uncertainty.some((line) => line.startsWith("Pixel:") && line.includes("running")));
    assert.ok(receipt.uncertainty.some((line) => line.includes("Send the final report")));
    const noChecks = db.createRun({ botId: "nova", threadId: "bot-nova", prompt: "Write a quick answer", status: "completed" });
    assert.ok(db.buildRunReceipt(noChecks.id)!.uncertainty.some((line) => line.includes("No passed host checks")));
  } finally { db.close(); rmSync(root, { recursive: true, force: true }); }
});

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenBotDatabase } from "./testing/database.js";
import { ATTENTION_WINDOW_CAP_SECONDS, describeRunAttention, summarizeAttention } from "./run-attention.js";

test("attention math separates waiting from estimated attendance", () => {
  const minute = 60_000;
  const summary = summarizeAttention([
    { openedAtMs: 0, decidedAtMs: 45_000, decision: "approved" },
    { openedAtMs: 0, decidedAtMs: 20 * minute, decision: "approved" },
    { openedAtMs: 0, decidedAtMs: 3 * 24 * 60 * minute, decision: "denied" },
    { openedAtMs: 0, decidedAtMs: null, decision: "pending" },
    { openedAtMs: 0, decidedAtMs: -1, decision: "approved" },
  ]);
  assert.equal(summary.approvals, 4, "decisions count even when their timestamps are unusable; pending never does");
  assert.equal(summary.approved, 3);
  assert.equal(summary.denied, 1);
  assert.equal(summary.awaitingSeconds, 45 + 20 * 60 + 3 * 24 * 3600, "waiting is uncapped wall time");
  assert.equal(
    summary.attendedSecondsEstimate,
    45 + 15 * 60 + ATTENTION_WINDOW_CAP_SECONDS,
    "each window caps at 15 minutes so an abandoned review never reads as a weekend of supervision",
  );
  assert.equal(ATTENTION_WINDOW_CAP_SECONDS, 900);
});

test("run attention reads approvals, tool activity and elapsed span", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-attention-"));
  const db = new OpenBotDatabase(root);
  try {
    const run = db.createRun({ threadId: "team-room", botId: "nova", prompt: "Measure me", status: "running" });
    const unattributed = describeRunAttention(db, run.id);
    assert.equal(unattributed?.approvals, 0);
    assert.equal(unattributed?.toolActivities, 0);
    assert.equal(unattributed?.elapsedSeconds, 0, "a never-started run reports no span");
    db.addActivity({ runId: run.id, botId: "nova", kind: "tool", label: "Did work", detail: null });
    db.addActivity({ runId: run.id, botId: "nova", kind: "status", label: "Noted", detail: null });
    const action = { type: "gmail_send", botId: "nova", args: { to: "a@example.test", subject: "Hi", body: "Hello" } };
    const approval = db.createApproval({ runId: run.id, botId: "nova", kind: "external", reason: "Review.", actionLabel: "Send", action });
    db.decideApproval(approval.id, "approved");
    const report = describeRunAttention(db, run.id)!;
    assert.equal(report.runId, run.id);
    assert.equal(report.approvals, 1);
    assert.equal(report.approved, 1);
    assert.equal(report.denied, 0);
    assert.equal(report.toolActivities, 1, "only tool-labeled activities count");
    assert.ok(report.awaitingSeconds >= 0 && report.attendedSecondsEstimate >= 0);
    assert.ok(report.attendedSecondsEstimate <= report.awaitingSeconds);
    assert.equal(describeRunAttention(db, "missing"), null, "unknown runs resolve to nothing");
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

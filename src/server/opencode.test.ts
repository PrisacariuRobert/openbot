import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenBotDatabase } from "./database.js";
import { AttachmentService } from "./attachments.js";
import { appendModelText, eventText, eventUsage, shouldPublishRunMessage, toolActivity, UsageAccumulator, OpenCodeRunner } from "./opencode.js";

test("a consultation that cannot start reports its failure privately and releases the coordinator", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-consultation-failure-"));
  const db = new OpenBotDatabase(root);
  try {
    const parent = db.createRun({ threadId: "team-room", botId: "pixel", prompt: "Ask Nova to check", status: "running" });
    const child = db.createRun({ threadId: "team-room", botId: "nova", prompt: "Check the result", parentRunId: parent.id, status: "running" });
    db.markRunConsultationPending(parent.id);
    db.pauseRunForConsultation(parent.id);
    db.updateBot("nova", { model: "wrong-connection/model" });
    const runner = new OpenCodeRunner({ db, onChange: () => {}, internalUrl: "http://127.0.0.1:1", internalToken: "fixture", attachments: new AttachmentService(db) });
    // Exercise the dispatch guard without invoking a real model or timer loop.
    runner["executeRun"](child);
    assert.equal(db.getRun(child.id)?.status, "failed");
    assert.match(db.getRun(child.id)?.error || "", /model is not configured/);
    assert.equal(db.getRun(parent.id)?.status, "queued");
    assert.equal(db.getRun(parent.id)?.consultationPending, false);
    assert.match(db.listAgentInbox("pixel", "team-room")[0]?.body || "", /could not start/);
    assert.equal(db.getState("team-room").messages.some((message) => message.runId === child.id), false);
  } finally { db.close(); rmSync(root, { recursive: true, force: true }); }
});

test("sums OpenCode steps, deduplicates replayed IDs, and keeps cancelled-run usage", () => {
  const meter = new UsageAccumulator();
  const step = { type: "step_finish", part: { id: "step-1", tokens: { input: 100, output: 20 }, cost: 0.01 } };
  meter.add(step);
  meter.add(step);
  meter.add({ type: "step_finish", part: { id: "step-2", tokens: { input: 200, output: 30, cache: { read: 40 } }, cost: 0.02 } });
  assert.deepEqual(meter.total(), { inputTokens: 300, outputTokens: 50, cacheReadTokens: 40, reasoningTokens: 0, cost: 0.03 });
  meter.add({ type: "error", error: "cancelled" });
  assert.equal(meter.total().inputTokens, 300);
});

test("Claude's final cumulative result replaces message subtotals instead of double counting", () => {
  const meter = new UsageAccumulator();
  meter.add({ type: "assistant", message: { id: "a", usage: { input_tokens: 100, output_tokens: 20 } } });
  meter.add({ type: "assistant", message: { id: "a", usage: { input_tokens: 100, output_tokens: 25 } } });
  assert.equal(meter.total().outputTokens, 25);
  const result = { type: "result", usage: { input_tokens: 250, output_tokens: 50 }, total_cost_usd: 0.04 };
  meter.add(result);
  meter.add(result);
  assert.equal(meter.total().inputTokens, 250);
  assert.equal(meter.total().cost, 0.04);
});

test("rejects invalid usage numbers instead of poisoning budgets with NaN", () => {
  assert.deepEqual(eventUsage({ tokens: { input: -1, output: "oops", reasoning: Infinity }, cost: NaN }), {
    inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cacheReadTokens: 0, cost: 0,
  });
});

test("keeps streaming fragments together", () => {
  assert.equal(appendModelText("Open", "Bot"), "OpenBot");
  assert.equal(appendModelText("Hello ", "there"), "Hello there");
});

test("publishes only the coordinator's final answer to the conversation", () => {
  assert.equal(shouldPublishRunMessage({ parentRunId: null }), true);
  assert.equal(shouldPublishRunMessage({ parentRunId: "coordinator-run" }), false);
});

test("reads token and cache usage from OpenCode completion events", () => {
  assert.deepEqual(eventUsage({ tokens: { input: 100, output: 20, reasoning: 5, cache: { read: 80 } }, cost: 0 }), {
    inputTokens: 100, outputTokens: 20, reasoningTokens: 5, cacheReadTokens: 80, cost: 0,
  });
});

test("separates completed assistant text parts", () => {
  assert.equal(
    appendModelText("I’m making the file now.", "Made hello.txt for you."),
    "I’m making the file now.\n\nMade hello.txt for you.",
  );
});

test("reads Claude Code stream events without a provider-specific UI path", () => {
  const event = {
    type: "assistant",
    session_id: "claude-session",
    message: {
      content: [{ type: "text", text: "I finished the note." }, { type: "tool_use", name: "mcp__openbot__workspace_write" }],
      usage: { input_tokens: 90, output_tokens: 12, cache_read_input_tokens: 40 },
    },
  };
  assert.equal(eventText(event), "I finished the note.");
  assert.deepEqual(eventUsage(event), { inputTokens: 90, outputTokens: 12, reasoningTokens: 0, cacheReadTokens: 40, cost: 0 });
  assert.deepEqual(toolActivity(event), { label: "Saving your file", detail: null, kind: "tool" });
});

test("turns internal tool names into friendly progress updates", () => {
  assert.deepEqual(toolActivity({ part: { tool: "task_plan", state: {} } }), {
    label: "Setting the finish line", detail: null, kind: "tool",
  });
  assert.deepEqual(toolActivity({ part: { tool: "task_progress", state: {} } }), {
    label: "Moving the job forward", detail: null, kind: "tool",
  });
  assert.deepEqual(toolActivity({ part: { tool: "task_verify", state: {} } }), {
    label: "Checking the finished work", detail: null, kind: "tool",
  });
  assert.deepEqual(toolActivity({ part: { tool: "message_teammate", state: {} } }), {
    label: "Checking in with a teammate", detail: null, kind: "tool",
  });
  assert.deepEqual(toolActivity({ part: { tool: "handoff", state: {} } }), {
    label: "Asking a teammate to help", detail: null, kind: "handoff",
  });
  assert.deepEqual(toolActivity({ part: { tool: "gmail_send", state: {} } }), {
    label: "Preparing the email for your approval", detail: null, kind: "tool",
  });
  assert.deepEqual(toolActivity({ part: { tool: "google_calendar_agenda", state: {} } }), {
    label: "Checking your calendar", detail: null, kind: "tool",
  });
  assert.deepEqual(toolActivity({ part: { tool: "slack_search", state: {} } }), {
    label: "Looking through Slack", detail: null, kind: "tool",
  });
  assert.deepEqual(toolActivity({ part: { tool: "slack_post", state: {} } }), {
    label: "Preparing a Slack message for your approval", detail: null, kind: "tool",
  });
  assert.deepEqual(toolActivity({ part: { tool: "notion_search", state: {} } }), {
    label: "Looking through shared Notion pages", detail: null, kind: "tool",
  });
  assert.deepEqual(toolActivity({ part: { tool: "notion_update", state: {} } }), {
    label: "Preparing a Notion update for your approval", detail: null, kind: "tool",
  });
  assert.deepEqual(toolActivity({ part: { tool: "mac_organize", state: {} } }), {
    label: "Preparing a tidy-up for your approval", detail: null, kind: "tool",
  });
  assert.deepEqual(toolActivity({ part: { tool: "routine_create", state: {} } }), {
    label: "Setting up your routine", detail: null, kind: "tool",
  });
  assert.deepEqual(toolActivity({ part: { tool: "mac_app_inspect", state: {} } }), {
    label: "Reading the app", detail: null, kind: "tool",
  });
});

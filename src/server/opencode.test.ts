import test from "node:test";
import assert from "node:assert/strict";
import { appendModelText, eventText, eventUsage, shouldPublishRunMessage, toolActivity } from "./opencode.js";

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

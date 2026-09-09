import test from "node:test";
import assert from "node:assert/strict";
import { ModelOutput } from "./model-output.js";

test("OpenCode intermediate continuation needs confirmed read-only/planning completion and no provider error", () => {
  for (const [tool, status, expected] of [["task_plan", "completed", true], ["spreadsheet_inspect", "completed", true], ["browser_click", "completed", false], ["workspace_write", "completed", false], ["workspace_read", "running", false], ["workspace_read", "error", false]] as const) {
    const output = new ModelOutput("opencode");
    output.add({ type: "tool_use", part: { type: "tool", tool, state: { status } } });
    assert.equal(output.canContinueIntermediate, expected);
    output.add({ type: "error", error: "quota exceeded" });
    assert.equal(output.canContinueIntermediate, false);
  }
});

test("a later read cannot erase an uncertain write, tool failure or another pending tool", () => {
  for (const first of [{ tool: "browser_click", status: "completed" }, { tool: "workspace_read", status: "error" }, { tool: "workspace_read", status: "running" }]) {
    const output = new ModelOutput("opencode");
    output.add({ type: "tool_use", part: { id: "first", type: "tool", tool: first.tool, state: { status: first.status } } });
    output.add({ type: "tool_use", part: { id: "second", type: "tool", tool: "workspace_read", state: { status: "completed" } } });
    assert.equal(output.canContinueIntermediate, false);
  }
  const output = new ModelOutput("claude");
  for (const [id, name] of [["first", "browser_click"], ["second", "workspace_read"]]) {
    output.add({ type: "assistant", message: { id, content: [{ type: "tool_use", id, name: `mcp__openbot__${name}` }] } });
    output.add({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: id }] } });
  }
  assert.equal(output.canContinueIntermediate, false);
});

test("Claude requires successful results for all declared safe tools; writes, missing results and provider failures are not retried", () => {
  const start = (name = "mcp__openbot__workspace_read") => {
    const output = new ModelOutput("claude");
    output.add({ type: "assistant", message: { id: "a", content: [{ type: "tool_use", id: "read-1", name }] } });
    return output;
  };
  const output = start();
  assert.equal(output.canContinueIntermediate, false);
  output.add({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "read-1", content: "done" }] } });
  assert.equal(output.canContinueIntermediate, true);
  output.add({ type: "result", is_error: true, subtype: "error_max_turns" });
  assert.equal(output.canContinueIntermediate, false);
  for (const name of ["mcp__openbot__browser_click", "mcp__openbot__workspace_write"]) {
    const writing = start(name);
    writing.add({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "read-1" }] } });
    assert.equal(writing.canContinueIntermediate, false);
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { ModelOutput, eventText } from "./model-output.js";

const text = (messageID: string, id: string, text: string) => ({ type: "text", part: { type: "text", messageID, id, text, time: { end: 1 } } });

test("OpenCode separates turns, keeps final multipart output and ignores replays", () => {
  const output = new ModelOutput("opencode");
  output.add({ type: "step_start", part: { messageID: "first" } });
  output.add(text("first", "one", "Checking the file."));
  output.add({ type: "tool_use", part: { type: "tool" } });
  output.add({ type: "step_finish", part: { reason: "tool-calls" } });
  assert.equal(output.finalText, "");
  output.add({ type: "step_start", part: { messageID: "last" } });
  output.add(text("last", "two", "The file is ready."));
  output.add(text("last", "three", "Nothing was sent."));
  output.add(text("last", "three", "Nothing was sent."));
  output.add(text("first", "one", "Checking the file."));
  output.add({ type: "step_start", part: { messageID: "first" } });
  output.add({ type: "step_finish", part: { messageID: "first", reason: "tool-calls" } });
  output.add({ type: "step_finish", part: { reason: "stop" } });
  assert.equal(output.finalText, "The file is ready.\n\nNothing was sent.");
  assert.deepEqual(output.drainProgress(), ["Checking the file."]);
  assert.deepEqual(output.drainProgress(), []);
});

test("completed part updates replace snapshots and do not duplicate prefixes", () => {
  const output = new ModelOutput("opencode");
  output.add(text("last", "one", "The file"));
  output.add(text("last", "one", "The file is ready."));
  assert.equal(output.finalText, "The file is ready.");
});

test("Claude final result wins over earlier messages without duplication", () => {
  const output = new ModelOutput("claude");
  output.add({ type: "assistant", message: { id: "one", content: [{ type: "text", text: "Checking the result." }, { type: "tool_use", name: "read" }] } });
  output.add({ type: "assistant", message: { id: "two", content: [{ type: "text", text: "Ready. Nothing sent." }] } });
  output.add({ type: "result", subtype: "success", result: "Ready. Nothing sent." });
  output.add({ type: "result", subtype: "success", result: "Ready. Nothing sent." });
  assert.equal(output.finalText, "Ready. Nothing sent.");
  assert.deepEqual(output.drainProgress(), ["Checking the result."]);
});

test("Claude final text is not thrown away when only progress preceded it", () => {
  const output = new ModelOutput("claude");
  output.add({ type: "assistant", message: { id: "one", content: [{ type: "text", text: "Working." }] } });
  output.add({ type: "result", subtype: "success", result: "Saved your document." });
  assert.equal(output.finalText, "Saved your document.");
  assert.deepEqual(output.drainProgress(), ["Working."]);
});

test("a tool-only last turn cannot reuse an earlier answer as success", () => {
  for (const runtime of ["opencode", "claude"] as const) {
    const output = new ModelOutput(runtime);
    output.add({ type: "text", text: "I will check." });
    output.add(runtime === "opencode" ? { type: "tool_use" } : { type: "assistant", message: { id: "tool", content: [{ type: "tool_use", name: "read" }] } });
    assert.equal(output.finalText, "");
    assert.match(output.failure || "", /intermediate step/);
  }
});

test("runtime error results never become completed replies", () => {
  for (const event of [{ type: "error", text: "failure" }, { type: "result", is_error: true, result: "Stopped" }, { type: "result", subtype: "error_max_turns", result: "Stopped" }]) {
    const output = new ModelOutput("claude");
    output.add({ type: "text", text: "Partial answer" });
    output.add(event);
    assert.equal(output.finalText, "");
    assert.match(output.failure || "", /could not finish/);
    assert.equal(output.currentText, "Partial answer");
  }
});

test("unknown legacy text keeps every fragment without guessing which sentence is final", () => {
  const output = new ModelOutput("opencode");
  output.add({ type: "text", text: "Open" });
  output.add({ type: "text", text: "Bot" });
  assert.equal(output.finalText, "OpenBot");
  assert.deepEqual(output.drainProgress(), []);
});

test("a terminal error after a reported result still prevents success", () => {
  const output = new ModelOutput("claude");
  output.add({ type: "result", subtype: "success", result: "Ready" });
  output.add({ type: "error", error: "failed to complete" });
  assert.equal(output.finalText, "");
});

test("reasoning and tool output are never treated as assistant progress", () => {
  for (const event of [{ type: "reasoning", text: "private reasoning" }, { type: "tool_use", text: "tool output" }, { type: "system", text: "system content" }]) assert.equal(eventText(event), null);
});

test("the output bound covers archived updates as well as the last answer", () => {
  const output = new ModelOutput("opencode", 12);
  output.add(text("one", "a", "12345678"));
  output.add(text("two", "b", "12345678"));
  assert.equal(output.exceededLimit, true);
  assert.equal(output.finalText, "");
});

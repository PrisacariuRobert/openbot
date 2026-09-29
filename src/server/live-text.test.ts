import test from "node:test";
import assert from "node:assert/strict";
import { LiveText } from "./live-text.js";

test("OpenCode deltas build the reply as it is written, ignoring reasoning", () => {
  const live = new LiveText();
  live.addOpenCode({ type: "message.part.updated", properties: { part: { id: "r1", messageID: "m1", type: "reasoning", text: "" } } });
  live.addOpenCode({ type: "message.part.delta", properties: { partID: "r1", messageID: "m1", field: "text", delta: "thinking about it" } });
  // A delta can arrive before its part is announced; it waits until the type is known.
  live.addOpenCode({ type: "message.part.delta", properties: { partID: "t1", messageID: "m1", field: "text", delta: "Hello" } });
  assert.equal(live.text, "");
  live.addOpenCode({ type: "message.part.updated", properties: { part: { id: "t1", messageID: "m1", type: "text", text: "" } } });
  live.addOpenCode({ type: "message.part.delta", properties: { partID: "t1", messageID: "m1", field: "text", delta: " there," } });
  live.addOpenCode({ type: "message.part.delta", properties: { partID: "t1", messageID: "m1", field: "text", delta: " friend." } });
  assert.equal(live.text, "Hello there, friend.");
  // The finished snapshot replaces the streamed text.
  live.addOpenCode({ type: "message.part.updated", properties: { part: { id: "t1", messageID: "m1", type: "text", text: "Hello there, friend. Done." } } });
  assert.equal(live.text, "Hello there, friend. Done.");
  // A later assistant message (after a tool call) becomes the live reply.
  live.addOpenCode({ type: "message.part.updated", properties: { part: { id: "t2", messageID: "m2", type: "text", text: "" } } });
  live.addOpenCode({ type: "message.part.delta", properties: { partID: "t2", messageID: "m2", field: "text", delta: "Checked the file." } });
  assert.equal(live.text, "Checked the file.");
});

test("Claude Code partial messages stream text deltas only", () => {
  const live = new LiveText();
  live.addClaude({ type: "stream_event", event: { type: "message_start" } });
  live.addClaude({ type: "stream_event", event: { type: "content_block_start", content_block: { type: "thinking" } } });
  live.addClaude({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "thinking_delta", text: "hmm" } } });
  live.addClaude({ type: "stream_event", event: { type: "content_block_start", content_block: { type: "text" } } });
  live.addClaude({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "Morning walks " } } });
  live.addClaude({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "help focus." } } });
  assert.equal(live.text, "Morning walks help focus.");
  live.addClaude({ type: "assistant" } as never);
  assert.equal(live.text, "Morning walks help focus.");
  live.addClaude({ type: "stream_event", event: { type: "message_start" } });
  live.addClaude({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "Next turn." } } });
  assert.equal(live.text, "Next turn.");
});

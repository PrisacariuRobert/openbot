import test from "node:test";
import assert from "node:assert/strict";
import { groupConsecutiveActionEvents } from "./action-event-groups.js";
import type { Message } from "../shared/types.js";
const message = (id: string, runId: string | null, eventType: string | null, kind: Message["kind"] = "event") => ({ id, runId, eventType, kind } as Message);
test("groups only contiguous completed actions from the same run", () => {
  const messages = [message("a", "run-1", "action_completed"), message("b", "run-1", "action_completed"), message("note", "run-1", "run_stopped"), message("c", "run-1", "action_completed"), message("d", "run-2", "action_completed")];
  assert.deepEqual(groupConsecutiveActionEvents(messages).map((group) => group.map((item) => item.id)), [["a", "b"]]);
});

test("does not group singleton, null-run, non-event, failure, or uncertain records", () => {
  const messages = [
    message("single", "run-1", "action_completed"),
    message("null", null, "action_completed"),
    message("text", "run-1", "action_completed", "text"),
    message("failed", "run-1", "run_stopped"),
    message("uncertain", "run-1", "action_uncertain"),
  ];
  assert.deepEqual(groupConsecutiveActionEvents(messages), []);
});

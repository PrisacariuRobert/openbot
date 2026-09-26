import test from "node:test";
import assert from "node:assert/strict";
import { groupConsecutiveActionEvents, groupConsecutiveRoutineRuns } from "./action-event-groups.js";
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

const routineRun = (id: string, name: string, waiting = "false") => ({ id, runId: `run-${id}`, kind: "event", eventType: "routine_run", eventData: { name, waiting } } as unknown as Message);

test("folds repeated start notices from the same routine, never ones waiting for approval", () => {
  const messages = [
    routineRun("a", "Live heartbeat"), routineRun("b", "Live heartbeat"), routineRun("c", "Live heartbeat"),
    routineRun("other", "Weekly review"),
    routineRun("d", "Live heartbeat"), routineRun("waiting", "Live heartbeat", "true"), routineRun("e", "Live heartbeat"),
    { id: "text", kind: "text", eventType: null } as unknown as Message,
    routineRun("f", "Live heartbeat"), routineRun("g", "Live heartbeat"),
  ];
  assert.deepEqual(groupConsecutiveRoutineRuns(messages).map((group) => group.map((item) => item.id)), [["a", "b", "c"], ["f", "g"]]);
});

test("each run's machine reply folds with its own start notice only", () => {
  const reply = (id: string, runId: string) => ({ id, runId, kind: "text", senderType: "bot", body: "ROUTINE_HEARTBEAT_OK", eventType: null } as unknown as Message);
  const messages = [
    routineRun("a", "Live heartbeat"), reply("a-ok", "run-a"),
    routineRun("b", "Live heartbeat"), reply("b-ok", "run-b"),
    reply("stray", "run-elsewhere"),
    routineRun("c", "Live heartbeat"), reply("c-ok", "run-c"),
  ];
  assert.deepEqual(groupConsecutiveRoutineRuns(messages).map((group) => group.map((item) => item.id)), [["a", "a-ok", "b", "b-ok"]]);
});

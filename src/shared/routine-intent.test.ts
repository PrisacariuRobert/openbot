import test from "node:test";
import assert from "node:assert/strict";
import { parseRoutineIntent } from "./routine-intent.js";

test("understands a natural five-minute in-app message routine", () => {
  assert.deepEqual(parseRoutineIntent("every 5 min text my hello"), {
    intervalMinutes: 5,
    name: "Hello",
    prompt: "Post this exact update in the current OpenBot conversation: hello",
    confirmation: "I’ll post “hello” here every 5 minutes. You can pause it anytime in Routines.",
  });
});

test("understands reminders and avoids conversational false positives", () => {
  assert.equal(parseRoutineIntent("remind me every 2 hours to drink water")?.intervalMinutes, 120);
  assert.equal(parseRoutineIntent("Why does this refresh every 5 minutes?"), null);
  assert.equal(parseRoutineIntent("every 2 minutes post hello"), null);
});

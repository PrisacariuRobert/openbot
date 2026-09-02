import test from "node:test";
import assert from "node:assert/strict";
import { parseRoutineIntent } from "./routine-intent.js";

test("understands a natural five-minute in-app message routine", () => {
  assert.deepEqual(parseRoutineIntent("every 5 min text my hello"), {
    intervalMinutes: 5,
    name: "Hello",
    prompt: "Post this exact update in the current OpenBot conversation: hello",
    confirmation: "I’ll post “hello” here every 5 minutes. You can test, pause or change it anytime in Automations.",
  });
});

test("understands reminders and avoids conversational false positives", () => {
  assert.equal(parseRoutineIntent("remind me every 2 hours to drink water")?.intervalMinutes, 120);
  assert.equal(parseRoutineIntent("remind me daily to review the launch list")?.intervalMinutes, 1440);
  assert.equal(parseRoutineIntent("every week check the project status")?.intervalMinutes, 10_080);
  assert.equal(parseRoutineIntent("hourly post a short pulse")?.intervalMinutes, 60);
  assert.equal(parseRoutineIntent("Why does this refresh every 5 minutes?"), null);
  assert.equal(parseRoutineIntent("every 2 minutes post hello"), null);
});

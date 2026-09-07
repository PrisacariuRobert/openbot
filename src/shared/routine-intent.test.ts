import test from "node:test";
import assert from "node:assert/strict";
import { routineScheduleInput } from "./calendar-schedule.js";
import { parseRoutineIntent } from "./routine-intent.js";

test("clock requests retain their requested weekday, time and explicit or client zone", () => {
  const intent = parseRoutineIntent("Every weekday at 8 AM Europe/Brussels, prepare my brief");
  assert.deepEqual(intent?.schedule, { kind: "calendar", timeZone: "Europe/Brussels", time: "08:00", daysOfWeek: [1, 2, 3, 4, 5] });
  assert.equal(intent?.prompt, "prepare my brief");
  assert.deepEqual(parseRoutineIntent("Every Monday at 2:15 pm review the week", "America/New_York")?.schedule,
    { kind: "calendar", timeZone: "America/New_York", time: "14:15", daysOfWeek: [1] });
  assert.equal(routineScheduleInput.safeParse(parseRoutineIntent("Daily at 00:00 UTC check the queue")?.schedule).success, true);
});

test("ambiguous clock requests never turn into elapsed intervals", () => {
  for (const input of ["Every day at 8 AM prepare my brief", "Daily at 8 AM PST prepare my brief", "Every day at 25:00 UTC prepare my brief", "Every day at 8 AM UTC except Friday prepare my brief", "Remind me daily at 8 AM", "Every weekday at 8 AM UTC draft a routine", "Can you run every weekday at 8 AM?"]) {
    assert.equal(parseRoutineIntent(input), null, input);
  }
});

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

test("does not turn conditional page watches or paused drafts into enabled schedules", () => {
  for (const request of [
    'Create a paused automation to check every hour',
    'Watch https://example.com every hour and tell me only when it changes',
    'Every hour monitor the release page',
    'Create a daily draft but do not enable it',
    'Can you explain how to create a daily routine?',
    'Stop my every hour reminder',
  ]) assert.equal(parseRoutineIntent(request), null, request);
});

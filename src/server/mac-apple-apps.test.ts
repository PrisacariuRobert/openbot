import assert from "node:assert/strict";
import test from "node:test";
import { AppleApps, describeAppleChange, EVENT_CREATE_SCRIPT, REMINDER_CREATE_SCRIPT } from "./mac-apple-apps.js";

function fake(reply: (command: string, args: string[]) => string) {
  const calls: { command: string; args: string[] }[] = [];
  const apps = new AppleApps(async (command, args) => { calls.push({ command, args }); return reply(command, args); }, "darwin");
  return { apps, calls };
}

test("input reaches the fixed script only as JSON data", async () => {
  const { apps, calls } = fake(() => JSON.stringify({ id: "r1", list: "Reminders", title: "Pay Figma" }));
  await apps.createReminder({ title: "Pay Figma\"); Application('Finder').delete(", due: "2026-10-03T09:00:00+02:00" });
  assert.equal(calls[0]!.command, "/usr/bin/osascript");
  assert.deepEqual(calls[0]!.args.slice(0, 4), ["-l", "JavaScript", "-e", REMINDER_CREATE_SCRIPT]);
  assert.equal(JSON.parse(calls[0]!.args[4]!).title, "Pay Figma\"); Application('Finder').delete(");
  assert.equal(calls[0]!.args.length, 5);
});

test("bad input is refused before anything runs", async () => {
  const { apps, calls } = fake(() => "{}");
  await assert.rejects(() => apps.createEvent({ title: "Trip", start: "2026-10-03T10:00:00Z", end: "2026-10-03T09:00:00Z" }), /end after it starts/);
  await assert.rejects(() => apps.draftMail({ to: ["not an email"], subject: "Hi", body: "…" }));
  await assert.rejects(() => apps.createReminder({ title: "" }));
  assert.equal(calls.length, 0);
});

test("macOS permission errors become a plain instruction", async () => {
  const apps = new AppleApps(async () => { throw new Error("execution error: Not authorized to send Apple events to Reminders. (-1743)"); }, "darwin");
  await assert.rejects(() => apps.reminders({}), /Privacy & Security → Automation/);
});

test("a missing list names the lists that exist", async () => {
  const { apps } = fake(() => JSON.stringify({ error: "no_list", lists: ["Reminders", "Groceries"] }));
  await assert.rejects(() => apps.reminders({ list: "Work" }), /Reminders, Groceries/);
});

test("shortcuts run only by exact existing name", async () => {
  const { apps, calls } = fake((command, args) => args[0] === "list" ? "Log water\nTurn on lamp\n" : "done");
  await assert.rejects(() => apps.runShortcut({ name: "Delete everything" }), /no shortcut called/);
  assert.equal(await apps.runShortcut({ name: "Turn on lamp" }), "done");
  assert.deepEqual(calls.at(-1)!.args.slice(0, 2), ["run", "Turn on lamp"]);
});

test("off a Mac, nothing is attempted", async () => {
  const apps = new AppleApps(async () => { throw new Error("should not run"); }, "linux");
  await assert.rejects(() => apps.searchNotes({ query: "trip" }), /only available when OpenBot runs on a Mac/);
});

test("every change reads as one plain sentence for the approval", () => {
  assert.match(describeAppleChange("mac_reminder_create", { title: "Pay Figma", list: "Bills", due: "2026-10-03T09:00:00+02:00" })!.reason, /Add “Pay Figma” to Reminders \(Bills\), due /);
  assert.match(describeAppleChange("mac_event_create", { title: "Dentist", start: "2026-10-03T09:00:00+02:00", end: "2026-10-03T10:00:00+02:00", location: "Ringstraße 1" })!.reason, /to your main calendar: .* at Ringstraße 1\./);
  assert.match(describeAppleChange("mac_shortcut_run", { name: "Turn on lamp" })!.reason, /Run your shortcut “Turn on lamp”/);
  assert.equal(describeAppleChange("mac_reminders", {}), null);
});

test("with no calendar named, a personal calendar beats shared ones", () => {
  assert.match(EVENT_CREATE_SCRIPT, /\["calendar","home","personal","private","work"\]/);
});

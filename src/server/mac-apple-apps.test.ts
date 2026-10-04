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
  await assert.rejects(() => apps.searchNotes({ query: "trip" }), /only available when Sidemates runs on a Mac/);
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

function calendarFake(slowIndex = -1) {
  const calls: string[] = [];
  const events: Record<number, Array<{ title: string; start: string; end: string }>> = {
    0: [{ title: "Dentist", start: "2026-10-01T07:00:00.000Z", end: "2026-10-01T08:00:00.000Z" }],
    1: [{ title: "Dentist", start: "2026-10-01T07:00:00.000Z", end: "2026-10-01T08:00:00.000Z" }, { title: "Flight", start: "2026-10-02T15:00:00.000Z", end: "2026-10-02T17:00:00.000Z" }],
    2: [{ title: "Next month", start: "2026-11-20T10:00:00.000Z", end: "2026-11-20T11:00:00.000Z" }],
  };
  const execute = async (_command: string, args: string[]) => {
    const script = args[3] || "";
    if (script.includes("calendars.length && out.length < 50") || script.includes("writable")) return JSON.stringify({ calendars: [{ name: "Family", writable: true }, { name: "Home", writable: true }, { name: "Holidays", writable: false }] });
    const { index } = JSON.parse(args[4]!);
    calls.push(`calendar-${index}`);
    if (index === slowIndex) throw Object.assign(new Error("timed out"), { killed: true });
    return JSON.stringify({ name: ["Family", "Home", "Holidays"][index], events: (events[index] || []).map((event) => ({ ...event, allDay: false, location: "" })) });
  };
  return { execute, calls };
}

test("calendar: events from all calendars, duplicates merged, answered from the cache after the first read", async () => {
  const { execute, calls } = calendarFake();
  let clock = Date.parse("2026-10-01T05:00:00.000Z");
  let saved: unknown = null;
  const apps = new AppleApps(execute, "darwin", undefined, { load: () => null, save: (cache) => { saved = cache; } }, () => clock);
  const first = await apps.calendarEvents({ days: 3 });
  assert.deepEqual(first.events.map((event) => event.title), ["Dentist", "Flight"]);
  assert.equal(calls.length, 3);
  assert.ok(saved);
  clock += 10 * 60_000;
  const second = await apps.calendarEvents({ days: 1 });
  assert.deepEqual(second.events.map((event) => event.title), ["Dentist"]);
  assert.equal(calls.length, 3, "served from the cache");
  clock += 40 * 60_000;
  await apps.calendarEvents({ days: 1 });
  assert.equal(calls.length, 6, "refreshed once it was older than 30 minutes");
});

test("calendar: a slow calendar is named, not waited for", async () => {
  const { execute } = calendarFake(2);
  const apps = new AppleApps(execute, "darwin", undefined, null, () => Date.parse("2026-10-01T05:00:00.000Z"));
  const result = await apps.calendarEvents({ days: 2 });
  assert.deepEqual(result.incomplete, ["Holidays"]);
  assert.equal(result.events.length, 2);
});

test("calendar: a warm cache loaded from disk is used, and warming only follows real use", async () => {
  const { execute, calls } = calendarFake();
  const now = Date.parse("2026-10-01T05:00:00.000Z");
  const cache = { at: now - 5 * 60_000, from: "2026-09-30T22:00:00.000Z", until: "2026-10-14T22:00:00.000Z", events: [{ calendar: "Family", title: "Cached event", start: "2026-10-01T09:00:00.000Z", end: "2026-10-01T10:00:00.000Z", allDay: false, location: "" }], incomplete: [] };
  // The window must start at local midnight of "today" in this process's zone.
  const localMidnight = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), new Date(now).getDate());
  cache.from = localMidnight.toISOString(); cache.until = new Date(localMidnight.getTime() + 14 * 86_400_000).toISOString();
  const apps = new AppleApps(execute, "darwin", undefined, { load: () => cache, save: () => {} }, () => now);
  assert.equal(apps.calendarNeedsWarming(), false, "not used yet: no background reads");
  const result = await apps.calendarEvents({ days: 1 });
  assert.equal(result.events[0]!.title, "Cached event");
  assert.equal(calls.length, 0);
});

test("unread mail: inbox and Gmail All Mail, not junk, spam or archive", async () => {
  const { MacMail } = await import("./mac-mail-index.js");
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");
  const home = mkdtempSync(path.join(tmpdir(), "openbot-unread-"));
  const put = (mailbox: string, id: string, subject: string, flags: number) => {
    const dir = path.join(home, `Library/Mail/V10/ACC/${mailbox}/U/Data/1/Messages`); mkdirSync(dir, { recursive: true });
    const body = Buffer.from(`From: Anna <anna@example.com>\r\nSubject: ${subject}\r\nDate: Wed, 30 Sep 2026 08:00:00 +0000\r\nContent-Type: text/plain\r\n\r\nCan you confirm?\r\n`);
    writeFileSync(path.join(dir, `${id}.emlx`), Buffer.concat([Buffer.from(`${body.length}\n`), body, Buffer.from(`<?xml version="1.0"?><plist><dict><key>flags</key><integer>${flags}</integer></dict></plist>`)]));
  };
  try {
    put("INBOX.mbox", "1", "Unread in inbox", 8590195712);
    put("INBOX.mbox", "2", "Already read", 8590195713);
    put("Junk.mbox", "3", "Unread junk", 8590195712);
    put("[Gmail].mbox/All Mail.mbox", "4", "Unread in a Gmail account", 8590195712);
    put("[Gmail].mbox/Spam.mbox", "5", "Unread spam in Gmail", 8590195712);
    put("Archive.mbox", "6", "Unread but archived", 8590195712);
    const apps = new AppleApps(async () => "", "darwin", new MacMail(home, "darwin"));
    const result = await apps.unreadMail({ days: 14, limit: 10 });
    assert.deepEqual(result.messages.map((message) => message.subject).sort(), ["Unread in a Gmail account", "Unread in inbox"]);
    assert.match(result.messages[0]!.snippet, /Can you confirm/);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { acceptanceMarkdown, DEMO, runMacAcceptance, type AcceptanceDeps } from "./mac-acceptance.js";

const PRIVATE = "Dinner with the Hendriksens";

function deps(overrides: Partial<AcceptanceDeps> = {}, apps: Partial<AcceptanceDeps["apps"]> = {}): { deps: AcceptanceDeps; writes: string[] } {
  const writes: string[] = [];
  const base: AcceptanceDeps = {
    apps: {
      listCalendars: async () => ({ calendars: [{ name: "Home", writable: true }, { name: DEMO.list, writable: true }] }),
      calendarEvents: async () => ({ from: "", until: "", asOf: "", events: [{ calendar: "Home", title: PRIVATE, start: "", end: "", allDay: false, location: "" }, { calendar: DEMO.list, title: DEMO.marker, start: "", end: "", allDay: false, location: "" }] }),
      reminders: async () => ({ reminders: [{ id: "1", title: PRIVATE, notes: "", due: null, list: "Home", completed: false }], lists: ["Home", DEMO.list] }),
      searchNotes: async () => ({ notes: [{ id: "n", title: DEMO.marker, folder: DEMO.list, modified: "", snippet: "" }], scanned: 9, total: 9 }),
      findContacts: async () => ({ contacts: [{ name: DEMO.contact, organization: "", emails: [DEMO.address], phones: [] }] }),
      unreadMail: async () => ({ messages: [{ id: "1", subject: PRIVATE, from: "someone@example.com", date: "", snippet: PRIVATE, attachments: [] }], count: 1 }),
      searchMail: async () => ({ messages: [{ id: "2", subject: DEMO.marker, from: DEMO.address, date: "", snippet: "", attachments: [] }], matched: 1 }),
      createReminder: async (input) => { writes.push(`reminder:${input.list}`); return { id: "r", title: input.title, list: input.list!, due: null }; },
      createNote: async (input) => { writes.push(`note:${input.folder}`); return { id: "n", title: input.title, folder: input.folder! }; },
      createEvent: async (input) => { writes.push(`event:${input.calendar}`); return { id: "e", calendar: input.calendar!, title: input.title }; },
      draftMail: async (input) => { writes.push(`draft:${input.to.join()}`); return { opened: true }; },
      ...apps,
    } as AcceptanceDeps["apps"],
    fullDiskAccess: () => true,
    run: async (command) => command === "launchctl" ? { code: 0, stdout: "" } : command === "xattr" ? { code: 1, stdout: "" } : command === "pmset" ? { code: 0, stdout: "Repeating power events:\n  wakeorpoweron at 7:57AM every day" } : command === "sw_vers" ? { code: 0, stdout: "27.0\n" } : { code: 0, stdout: "arm64\n" },
    readable: () => false,
    exists: () => true,
    home: "/Users/demo",
    uid: 501,
    launchLabel: "app.sidemates.studio",
    appVersion: "0.43.0",
    now: () => new Date("2026-10-08T09:00:00Z"),
  };
  return { deps: { ...base, ...overrides }, writes };
}

test("on a set-up demo account every read passes, and the report holds no account data", async () => {
  const { deps: d, writes } = deps();
  const report = await runMacAcceptance(d, { write: false });
  assert.deepEqual(report.checks.filter((check) => check.status === "fail"), []);
  assert.equal(report.macos, "27.0");
  assert.equal(report.arch, "arm64");
  assert.deepEqual(writes, [], "nothing is changed without --write");
  assert.equal(report.checks.filter((check) => check.status === "skip").length, 4);
  const page = acceptanceMarkdown(report);
  assert.ok(!page.includes(PRIVATE), "no title, subject or name from the account");
  assert.ok(!page.includes("someone@example.com"));
  assert.match(page, /^# Mac acceptance, 2026-10-08/);
  assert.match(page, /macOS 27\.0 \(arm64\), Sidemates 0\.43\.0/);
  assert.match(page, /- \[ \] A routine woke the Mac and ran/);
});

test("--write changes only the demo list, folder, calendar and address", async () => {
  const { deps: d, writes } = deps();
  const report = await runMacAcceptance(d, { write: true });
  assert.deepEqual(writes, [`reminder:${DEMO.list}`, `note:${DEMO.list}`, `event:${DEMO.list}`, `draft:${DEMO.address}`]);
  assert.equal(report.checks.filter((check) => check.status === "skip").length, 0);
});

test("missing setup, denied access and a quarantined launch agent each fail with a plain reason", async () => {
  const { deps: d } = deps({
    fullDiskAccess: () => false,
    run: async (command) => command === "xattr" ? { code: 0, stdout: "0081;" } : command === "launchctl" ? { code: 113, stdout: "" } : { code: 0, stdout: "" },
  }, {
    searchMail: async () => ({ messages: [], matched: 0 }),
    reminders: async () => { throw new Error("Allow Sidemates to use Reminders in System Settings → Privacy & Security → Automation, then try again. Nothing was changed."); },
  });
  const report = await runMacAcceptance(d, { write: false });
  const failed = Object.fromEntries(report.checks.filter((check) => check.status === "fail").map((check) => [check.id, check.detail]));
  assert.match(failed["messages-access"]!, /Not granted/);
  assert.match(failed["mail-search"]!, /0 matching/);
  assert.match(failed["reminders-read"]!, /Automation/);
  assert.match(failed["service-loaded"]!, /doesn't have it loaded/);
  assert.match(failed["service-quarantine"]!, /quarantine attribute is set/);
  const noService = await runMacAcceptance(deps({ exists: () => false }).deps, { write: false });
  assert.match(noService.checks.find((check) => check.id === "service-installed")!.detail, /install Sidemates/);
});

test("the kit refuses to run anywhere but a Mac", { skip: process.platform === "darwin" }, () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", path.resolve(import.meta.dirname, "../../scripts/mac-acceptance.ts")], { encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /runs on a Mac only/);
});

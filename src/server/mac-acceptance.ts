import type { AppleApps } from "./mac-apple-apps.js";

/** The real-Mac acceptance kit (task J3). Run on the owner's demo account by
 * scripts/mac-acceptance.ts: it checks each Mac tool against the real apps, the
 * permissions, the background service and the macOS 27 changes, and writes a dated
 * report. The report holds counts, timings and pass/fail only: never a subject,
 * a name or a title from the account, except the demo items it was told to find. */

/** What the owner sets up on the demo account first (qa/mac-acceptance/README.md). */
export const DEMO = {
  marker: "Sidemates acceptance",
  list: "Sidemates Acceptance",
  contact: "Sidemates Demo",
  address: "demo@sidemates.example",
} as const;

export type CheckStatus = "pass" | "fail" | "skip" | "info";
export interface AcceptanceCheck { id: string; area: string; title: string; status: CheckStatus; detail: string; ms?: number }
export interface AcceptanceReport { at: string; macos: string; arch: string; appVersion: string; wrote: boolean; checks: AcceptanceCheck[] }

export interface AcceptanceDeps {
  apps: Pick<AppleApps, "listCalendars" | "calendarEvents" | "reminders" | "searchNotes" | "findContacts" | "unreadMail" | "searchMail" | "createReminder" | "createNote" | "createEvent" | "draftMail">;
  /** Whether Sidemates can open Messages and Mail data (Full Disk Access), without reading it. */
  fullDiskAccess: () => boolean;
  run: (command: string, args: string[]) => Promise<{ code: number; stdout: string }>;
  /** Whether a path can be opened for reading; nothing is read. */
  readable: (path: string) => boolean;
  exists: (path: string) => boolean;
  home: string;
  uid: number;
  launchLabel: string;
  appVersion: string;
  now: () => Date;
}

const timed = async <T>(work: () => Promise<T>): Promise<{ value?: T; error?: string; ms: number }> => {
  const started = Date.now();
  try { return { value: await work(), ms: Date.now() - started }; }
  catch (error) { return { error: error instanceof Error ? error.message.slice(0, 200) : String(error), ms: Date.now() - started }; }
};

export async function runMacAcceptance(deps: AcceptanceDeps, options: { write: boolean }): Promise<AcceptanceReport> {
  const checks: AcceptanceCheck[] = [];
  const add = (check: AcceptanceCheck) => { checks.push(check); };
  const { apps } = deps;
  const today = deps.now();

  // Reading the apps. Counts and timings only.
  const calendars = await timed(() => apps.listCalendars());
  add({ id: "calendar-list", area: "Calendar", title: "Lists calendars", status: calendars.error ? "fail" : "pass", detail: calendars.error ?? `${calendars.value!.calendars.length} calendars`, ms: calendars.ms });
  const events = await timed(() => apps.calendarEvents({ days: 7 }));
  const demoEvent = events.value?.events.some((event) => event.title.includes(DEMO.marker));
  add({ id: "calendar-read", area: "Calendar", title: "Reads this week's events (the time is J4's baseline)", status: events.error ? "fail" : demoEvent ? "pass" : "fail", detail: events.error ?? `${events.value!.events.length} events${demoEvent ? ", including the demo event" : `; the demo event "${DEMO.marker}" wasn't found this week`}${events.value!.incomplete?.length ? `; ${events.value!.incomplete.length} calendars answered too slowly` : ""}`, ms: events.ms });
  const reminders = await timed(() => apps.reminders({ includeCompleted: false, limit: 50 }));
  add({ id: "reminders-read", area: "Reminders", title: "Reads reminders and lists", status: reminders.error ? "fail" : reminders.value!.lists.includes(DEMO.list) ? "pass" : "fail", detail: reminders.error ?? `${reminders.value!.reminders.length} open reminders in ${reminders.value!.lists.length} lists${reminders.value!.lists.includes(DEMO.list) ? "" : `; the list "${DEMO.list}" is missing`}`, ms: reminders.ms });
  const notes = await timed(() => apps.searchNotes({ query: DEMO.marker, limit: 5 }));
  add({ id: "notes-search", area: "Notes", title: "Finds the demo note", status: notes.error ? "fail" : notes.value!.notes.length ? "pass" : "fail", detail: notes.error ?? `${notes.value!.notes.length} matching notes of ${notes.value!.total}`, ms: notes.ms });
  const contacts = await timed(() => apps.findContacts({ query: DEMO.contact }));
  add({ id: "contacts-find", area: "Contacts", title: "Finds the demo contact", status: contacts.error ? "fail" : contacts.value!.contacts.length ? "pass" : "fail", detail: contacts.error ?? `${contacts.value!.contacts.length} matching contacts`, ms: contacts.ms });
  const unread = await timed(() => apps.unreadMail({ days: 3, limit: 20 }));
  add({ id: "mail-unread", area: "Mail", title: "Reads unread mail", status: unread.error ? "fail" : "pass", detail: unread.error ?? `${unread.value!.count} unread in the last 3 days (subjects not recorded)`, ms: unread.ms });
  const search = await timed(() => apps.searchMail({ query: DEMO.marker, days: 30, limit: 5 }));
  add({ id: "mail-search", area: "Mail", title: "Finds the demo email", status: search.error ? "fail" : search.value!.messages.length ? "pass" : "fail", detail: search.error ?? `${search.value!.messages.length} matching messages`, ms: search.ms });
  const disk = deps.fullDiskAccess();
  add({ id: "messages-access", area: "Messages", title: "Can open Messages and Mail data (Full Disk Access)", status: disk ? "pass" : "fail", detail: disk ? "Granted (opened and closed without reading)" : "Not granted: Messages can't be read and the Mail index can't update" });

  // Changing things: only with --write, and only in the demo calendar, list and folder.
  if (!options.write) {
    for (const [id, area, title] of [["reminder-create", "Reminders", "Adds a reminder"], ["note-create", "Notes", "Adds a note"], ["event-create", "Calendar", "Adds an event"], ["mail-draft", "Mail", "Opens a Mail draft"]] as const) add({ id, area, title, status: "skip", detail: "Run with --write to check this on the demo account." });
  } else {
    const stamp = today.toISOString().slice(0, 16).replace("T", " ");
    const start = new Date(today.getTime() + 2 * 3_600_000), end = new Date(start.getTime() + 30 * 60_000);
    const writes: Array<[string, string, string, () => Promise<unknown>]> = [
      ["reminder-create", "Reminders", "Adds a reminder to the demo list", () => apps.createReminder({ title: `${DEMO.marker} ${stamp}`, list: DEMO.list })],
      ["note-create", "Notes", "Adds a note to the demo folder", () => apps.createNote({ title: `${DEMO.marker} ${stamp}`, body: "Written by the Sidemates acceptance kit. Safe to delete.", folder: DEMO.list })],
      ["event-create", "Calendar", "Adds an event to the demo calendar", () => apps.createEvent({ title: `${DEMO.marker} ${stamp}`, start: start.toISOString(), end: end.toISOString(), calendar: DEMO.list, allDay: false })],
      ["mail-draft", "Mail", "Opens a Mail draft (check that it opened, then discard it)", () => apps.draftMail({ to: [DEMO.address], cc: [], subject: `${DEMO.marker} ${stamp}`, body: "Written by the Sidemates acceptance kit. Discard this draft." })],
    ];
    for (const [id, area, title, work] of writes) {
      const result = await timed(work);
      add({ id, area, title, status: result.error ? "fail" : "pass", detail: result.error ?? "Done", ms: result.ms });
    }
  }

  // The background service, the wake schedule and the macOS 27 changes.
  const plist = `${deps.home}/Library/LaunchAgents/${deps.launchLabel}.plist`;
  if (!deps.exists(plist)) add({ id: "service-installed", area: "Background service", title: "Is installed", status: "fail", detail: "No launch agent: install Sidemates with the installer or the disk image first." });
  else {
    const loaded = await deps.run("launchctl", ["print", `gui/${deps.uid}/${deps.launchLabel}`]);
    add({ id: "service-loaded", area: "Background service", title: "Is loaded by launchd", status: loaded.code === 0 ? "pass" : "fail", detail: loaded.code === 0 ? "Loaded" : "launchd doesn't have it loaded" });
    const quarantine = await deps.run("xattr", ["-p", "com.apple.quarantine", plist]);
    add({ id: "service-quarantine", area: "macOS 27", title: "The launch agent carries no download mark (launchd refuses it on macOS 27)", status: quarantine.code === 0 ? "fail" : "pass", detail: quarantine.code === 0 ? "The quarantine attribute is set" : "No quarantine attribute" });
  }
  const tcc = deps.readable(`${deps.home}/Library/Application Support/com.apple.TCC/TCC.db`);
  add({ id: "tcc-closed", area: "macOS 27", title: "The privacy-permission database can't be read directly", status: "info", detail: tcc ? "Readable on this macOS: Sidemates' permission checks don't depend on it, but note the version" : "Not readable, as on macOS 27: permission checks must use probes" });
  const container = deps.readable(`${deps.home}/Library/Containers/com.apple.Notes/Data`);
  add({ id: "containers-closed", area: "macOS 27", title: "Other apps' containers are closed", status: "info", detail: container ? "The Notes container is readable on this macOS" : "The Notes container is closed, as on macOS 27: Notes is read through Notes itself" });
  const wake = await deps.run("pmset", ["-g", "sched"]);
  add({ id: "wake-schedule", area: "Routines", title: "A wake schedule is set for routines", status: "info", detail: /wake(orpoweron)?/i.test(wake.stdout) ? "A repeating wake is set" : "No repeating wake: turn on \"Wake this Mac for routines\" to test waking" });

  const macos = (await deps.run("sw_vers", ["-productVersion"])).stdout.trim() || "unknown";
  const arch = (await deps.run("uname", ["-m"])).stdout.trim() || "unknown";
  return { at: today.toISOString(), macos, arch, appVersion: deps.appVersion, wrote: options.write, checks };
}

export function acceptanceMarkdown(report: AcceptanceReport): string {
  const counts = (status: CheckStatus) => report.checks.filter((check) => check.status === status).length;
  const icon: Record<CheckStatus, string> = { pass: "✅", fail: "❌", skip: "⏭️", info: "ℹ️" };
  return [
    `# Mac acceptance, ${report.at.slice(0, 10)}`,
    "",
    `macOS ${report.macos} (${report.arch}), Sidemates ${report.appVersion}. ${counts("pass")} passed, ${counts("fail")} failed, ${counts("skip")} skipped${report.wrote ? "" : " (run with --write to check changes on the demo account)"}.`,
    "",
    "Counts, timings and pass/fail only; nothing from the account is recorded except the demo items.",
    "",
    "| Area | Check | Result | Detail | Time |",
    "| :--- | :--- | :--- | :--- | :--- |",
    ...report.checks.map((check) => `| ${check.area} | ${check.title} | ${icon[check.status]} ${check.status} | ${check.detail.replace(/\|/g, "\\|")} | ${check.ms === undefined ? "" : check.ms < 1000 ? `${check.ms} ms` : `${(check.ms / 1000).toFixed(1)} s`} |`),
    "",
    "## Checked by hand",
    "",
    "Fill these in from qa/mac-acceptance/README.md:",
    "",
    "- [ ] Permission prompts after a fresh install name Sidemates, in the expected order",
    "- [ ] Permission prompts after an update don't reappear for what was already allowed",
    "- [ ] A routine woke the Mac and ran (time set, Mac asleep, result in the conversation)",
    "",
  ].join("\n");
}

// A live check of what "Waiting for you" does on a real Mac, using only clearly named synthetic items.
// For each kind it makes the item through the real queue (approve), looks at the app itself to see it
// really exists, undoes it through the queue, and looks again to see it is gone.
//
// Never run this by accident: it creates and removes a reminder, a calendar event and a Mail draft, and
// moves one small file to the Trash. Everything is named "Sidemates test — safe to delete".
//
//   SIDEMATES_LIVE_MAC_TEST=synthetic-only node --import tsx scripts/test-queue-mac-live.ts
//   (add SIDEMATES_LIVE_MAC_ONLY=reminder|event|draft|file to run just one step)
//
// macOS may ask whether the app running this may control Reminders, Calendar and Mail: allow it.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { OpenBotDatabase } from "../src/server/database.js";
import { AppleApps } from "../src/server/mac-apple-apps.js";
import { WorkQueue, type QueueExecutor } from "../src/server/queue.js";

if (process.env.SIDEMATES_LIVE_MAC_TEST !== "synthetic-only") {
  console.error("This creates and removes a few clearly named items on this Mac. Run it with SIDEMATES_LIVE_MAC_TEST=synthetic-only if that is what you want.");
  process.exit(2);
}
if (process.platform !== "darwin") { console.error("This only runs on a Mac."); process.exit(2); }

const run = promisify(execFile);
const stamp = new Date().toISOString().slice(5, 16).replace(/[-:T]/g, "");
const title = `Sidemates test — safe to delete ${stamp}`;
const home = homedir();
const testFile = path.join(home, `sidemates-test-safe-to-delete-${stamp}.txt`);

/** Ask the app itself, not our own code, how many items carry this title. */
async function jxa(script: string, input: Record<string, unknown> = {}): Promise<number> {
  const { stdout } = await run("/usr/bin/osascript", ["-l", "JavaScript", "-e", script, JSON.stringify(input)], { timeout: 90_000 });
  return Number(JSON.parse(stdout.trim()).n);
}
const countReminders = () => jxa(`function run(a){ var i=JSON.parse(a[0]); return JSON.stringify({n: Application("Reminders").reminders.whose({name: i.title})().length}); }`, { title });
const countDrafts = () => jxa(`function run(a){ var i=JSON.parse(a[0]); return JSON.stringify({n: Application("com.apple.mail").draftsMailbox().messages.whose({subject: i.title})().length}); }`, { title });
/** Mail and Calendar apply some changes a few seconds late, so look until the count settles. */
async function settles(count: () => Promise<number>, expected: number, seconds = 30): Promise<number> {
  const until = Date.now() + seconds * 1000;
  let seen = await count();
  while (seen !== expected && Date.now() < until) { await new Promise((resolve) => setTimeout(resolve, 2000)); seen = await count(); }
  return seen;
}
const countEvents = (calendar: string) => jxa(`function run(a){ var i=JSON.parse(a[0]); return JSON.stringify({n: Application("Calendar").calendars.byName(i.calendar).events.whose({summary: i.title})().length}); }`, { title, calendar });

const root = mkdtempSync(path.join(tmpdir(), "sidemates-live-mac-"));
const db = new OpenBotDatabase(root, { dataDir: path.join(root, "data") });
const apps = new AppleApps();
// Everything is the real Mac, except one thing: saving a Mail attachment would read the owner's real mail,
// so a tiny synthetic file stands in for it. Undo of that card is still the real move to the Trash.
const executor: QueueExecutor = {
  createReminder: (input) => apps.createReminder(input),
  deleteReminder: (id) => apps.deleteReminder(id),
  createEvent: (input) => apps.createEvent(input),
  deleteEvent: (id, calendar) => apps.deleteEvent(id, calendar),
  saveMailDraft: (input) => apps.saveMailDraft(input),
  deleteMailDraft: (ref) => apps.deleteMailDraft(ref),
  saveMailAttachment: async () => { writeFileSync(testFile, "Sidemates test file. Safe to delete.\n"); return { saved: testFile, bytes: 38 }; },
  trashFile: (filePath) => apps.trashFile(filePath, home),
};
const queue = new WorkQueue(db, () => executor, undefined, { cardsPerDay: 100 });
const results: Array<Record<string, unknown>> = [];
const ids: string[] = [];

const only = process.env.SIDEMATES_LIVE_MAC_ONLY;
async function step(name: string, body: () => Promise<Record<string, unknown> | void>) {
  if (only && !name.startsWith(only)) return;
  const started = Date.now();
  try { const extra = await body() ?? {}; results.push({ step: name, ok: true, ms: Date.now() - started, ...extra }); }
  catch (error) { results.push({ step: name, ok: false, ms: Date.now() - started, error: error instanceof Error ? error.message : String(error) }); }
}
const propose = (card: Record<string, unknown>) => {
  const made = queue.propose(card, { botId: null, runId: null });
  assert.ok(made.ok, made.ok ? "" : made.message);
  ids.push(made.item.id);
  return made.item;
};

try {
  // Be sure nothing with this name exists already, so a removal can only ever hit what this run made.
  assert.equal(await countReminders(), 0, "a reminder with the test title already exists");
  assert.equal(await countDrafts(), 0, "a draft with the test title already exists");

  await step("reminder: add, see it in Reminders, undo, see it gone", async () => {
    const card = propose({ kind: "reminder", title, why: "Live Mac test.", sourceKey: "live:reminder", action: { title, due: "2030-01-15T09:00:00+02:00" } });
    const done = await queue.approve(card.id);
    assert.equal(await settles(countReminders, 1), 1, "the reminder should now exist in Reminders");
    await queue.undo(done.id);
    assert.equal(await settles(countReminders, 0), 0, "Undo should have removed it");
    return { list: (done.result as { list?: string }).list };
  });

  await step("calendar event: add, see it in Calendar, undo, see it gone", async () => {
    const card = propose({ kind: "calendar_event", title, why: "Live Mac test.", sourceKey: "live:event", action: { title, start: "2030-01-15T10:00:00+02:00", end: "2030-01-15T10:30:00+02:00" } });
    const done = await queue.approve(card.id);
    const calendar = (done.result as { calendar: string }).calendar;
    assert.equal(await settles(() => countEvents(calendar), 1), 1, `the event should now exist in the “${calendar}” calendar`);
    await queue.undo(done.id);
    assert.equal(await settles(() => countEvents(calendar), 0), 0, "Undo should have removed it");
    return { calendar };
  });

  await step("reply draft: save to Drafts (not sent, nothing opens), undo, see it gone", async () => {
    const card = propose({ kind: "reply_draft", title, why: "Live Mac test.", sourceKey: "live:draft", action: { to: ["sidemates-test@example.com"], subject: title, body: "Live test of Sidemates. Safe to delete. This was never sent." } });
    const done = await queue.approve(card.id);
    assert.equal(await settles(countDrafts, 1), 1, "the draft should now be in Mail's Drafts");
    await queue.undo(done.id);
    assert.equal(await settles(countDrafts, 0, 120), 0, "Undo should have removed the draft (Mail moves it to its Trash up to a minute later)");
  });

  await step("saved file: save, undo moves it to the Trash", async () => {
    const card = propose({ kind: "file_attachment", title, why: "Live Mac test.", sourceKey: "live:file", action: { id: "1", attachment: path.basename(testFile), folder: "Documents/Receipts" } });
    const done = await queue.approve(card.id);
    assert.ok(existsSync(testFile), "the file should exist after approving");
    await queue.undo(done.id);
    assert.ok(!existsSync(testFile), "the file should be gone from its folder after Undo");
    let inTrash: boolean | "not checked" = "not checked";
    try { inTrash = readdirSync(path.join(home, ".Trash")).some((name) => name.startsWith("sidemates-test-safe-to-delete-")); } catch { /* the Trash is protected; the file leaving its folder is what matters */ }
    return { inTrash };
  });
} finally {
  // Whatever happened, take back anything still done, then look once more.
  for (const id of ids) { try { const card = db.queueItemGet(id); if (card?.status === "done") await queue.undo(id); } catch (error) { results.push({ cleanup: id, ok: false, error: error instanceof Error ? error.message : String(error) }); } }
  const left = { reminders: await settles(countReminders, 0, 10).catch(() => -1), drafts: await settles(countDrafts, 0, 120).catch(() => -1), fileExists: existsSync(testFile) };
  console.log(JSON.stringify({ title, results, leftBehind: left }, null, 2));
  db.close();
  rmSync(root, { recursive: true, force: true });
  const failed = results.filter((item) => item.ok === false).length;
  process.exitCode = failed || left.reminders || left.drafts || left.fileExists ? 1 : 0;
}

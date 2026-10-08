import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { FixtureAppleApps, heroFixtureFromEnv } from "./hero-fixture-mac.js";
import { loadHeroFixture } from "./hero-jobs.js";
import { scoreboard, summarize, type HeroResults, type HeroRun } from "./hero-scoreboard.js";

const fixturePath = (job: string) => path.resolve(import.meta.dirname, `../../qa/hero-jobs/${job}.json`);

test("the synthetic Mac is used only by a staging studio that names a fixture", () => {
  assert.equal(heroFixtureFromEnv({}), null);
  assert.equal(heroFixtureFromEnv({ OPENBOT_HERO_FIXTURE: fixturePath("morning-brief") }), null, "not on an ordinary studio");
  assert.equal(heroFixtureFromEnv({ OPENBOT_STAGING: "1" }), null);
  assert.equal(heroFixtureFromEnv({ OPENBOT_STAGING: "1", OPENBOT_HERO_FIXTURE: fixturePath("morning-brief") })!.fixture.job, "morning-brief");
});

test("a moved meeting shows from the second calendar read on, without attendees, like the real tool", async () => {
  const mac = new FixtureAppleApps(loadHeroFixture("meeting-prep"));
  const first = await mac.calendarEvents({ days: 2 });
  const call = (events: typeof first.events) => events.find((event) => event.title.startsWith("Supplier call"))!;
  assert.match(call(first.events).start, /T15:00/);
  assert.equal("attendees" in call(first.events), false, "the real calendar tool returns no attendees");
  assert.match(call((await mac.calendarEvents({ days: 2 })).events).start, /T16:00/);
  assert.equal((await mac.calendarEvents({ days: 2 })).events.filter((event) => event.title.startsWith("Supplier call")).length, 1, "moved, not duplicated");
  assert.equal((await mac.searchNotes({ query: "Northwind" })).notes.map((note) => note.title).join(), "Northwind negotiation");
  assert.match((await mac.readNote({ id: "n1" })).text, /2% or less/);
});

test("a reply that arrives mid-task is there when the thread is read again; drafts are recorded, never opened", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "openbot-hero-mac-"));
  const record = path.join(dir, "calls.jsonl");
  writeFileSync(record, "");
  try {
    const mac = new FixtureAppleApps(loadHeroFixture("waiting-on-me"), record);
    const listed = await mac.searchMail({ query: "example", days: 7, limit: 10 });
    assert.equal(listed.messages.some((message) => /never mind/i.test(message.snippet)), false, "not yet on the first read");
    assert.equal(listed.matched, 5);
    const tom = await mac.readMail({ id: "2001" });
    assert.match(tom.text, /Never mind, Thursday works after all/, "the second read shows Tom's newer message in his thread");
    assert.match((await mac.readMail({ id: "2002" })).text, /\nme \(.*Sent!/, "the owner answered Ana last");
    await assert.rejects(mac.readMail({ id: "9999" }), /isn't in Mail anymore/);
    assert.deepEqual(await mac.draftMail({ to: ["hendrik@flatlet.example"], subject: "Re: Boiler service", body: "Friday works." }), { opened: true });
    await assert.rejects(mac.draftMail({ to: ["not an address"], subject: "x", body: "y" }), "drafts are validated like the real tool");
    const messages = mac.searchMyMac({ query: "messages", sources: ["messages"], days: 7 });
    assert.deepEqual(messages.results.map((item) => item.title), ["Messages with Lena Vos", "Messages with Dad"]);
    const calls = readFileSync(record, "utf8").trim().split("\n").map((line) => JSON.parse(line) as { name: string; args: { to?: string[] } });
    assert.deepEqual(calls.map((call) => call.name), ["mac_mail_search", "mac_mail_read", "mac_mail_read", "mac_mail_read", "mac_mail_draft", "search_my_mac"]);
    assert.deepEqual(calls.find((call) => call.name === "mac_mail_draft")!.args.to, ["hendrik@flatlet.example"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("the morning's unread mail and reminders come back in the real tools' shapes", async () => {
  const mac = new FixtureAppleApps(loadHeroFixture("morning-brief"));
  const unread = await mac.unreadMail({ days: 2, limit: 20 });
  assert.equal(unread.count, 6);
  assert.deepEqual(Object.keys(unread.messages[0]!).sort(), ["attachments", "date", "from", "id", "snippet", "subject", "unread"]);
  assert.equal((await mac.reminders({})).reminders.some((item) => item.completed), false, "done reminders only on request");
  assert.equal((await mac.reminders({ includeCompleted: true })).reminders.length, 4);
  assert.equal(mac.calendarNeedsWarming(), false);
});

const run = (job: HeroRun["job"], pass: boolean, problems: string[] = []): HeroRun => ({ job, attempt: 1, pass, problems, seconds: 30, steps: 5, contextTokens: 20_000, reply: "" });

test("the scoreboard lists live runs only, with pass counts and what went wrong", () => {
  const scripted: HeroResults = { label: "scripted", model: "scripted model (plumbing only)", live: false, at: "2026-10-08T10:00:00Z", repeat: 1, prompts: [], runs: [run("morning-brief", true)], summary: summarize([run("morning-brief", true)]) };
  assert.match(scoreboard([scripted]), /\*\*No live runs yet\.\*\*/);
  assert.doesNotMatch(scoreboard([scripted]), /plumbing only/, "a scripted run is never listed as a result");
  const runs = [run("morning-brief", true), run("morning-brief", false, ['missing "Train to Ghent"']), run("meeting-prep", false, ['missing "16:00"'])];
  const live: HeroResults = { label: "gemini", model: "google/gemini-flash-latest", live: true, at: "2026-10-09T09:00:00Z", repeat: 2, prompts: ["teammate v2"], runs, summary: summarize(runs) };
  assert.deepEqual(live.summary.map((line) => [line.job, line.passed, line.runs]), [["morning-brief", 1, 2], ["meeting-prep", 0, 1]]);
  const page = scoreboard([scripted, live]);
  assert.match(page, /\| `google\/gemini-flash-latest` \| Morning brief \| 1 of 2 \| 30 s \| 20,000 tokens \| 2026-10-09 \|/);
  assert.match(page, /- Meeting prep: missing "16:00"/);
  assert.doesNotMatch(page, /No live runs yet/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { checkHeroJob, HERO_JOB_IDS, heroJobPrompt, loadHeroFixture, timePattern, type HeroOutcome } from "./hero-jobs.js";

const outcome = (reply: string, toolCalls: HeroOutcome["toolCalls"] = [], extra: Partial<HeroOutcome> = {}): HeroOutcome => ({ reply, toolCalls, ...extra });

test("every hero job has valid synthetic data: example addresses only, written constraints and budgets", () => {
  for (const id of HERO_JOB_IDS) {
    const fixture = loadHeroFixture(id);
    assert.equal(fixture.job, id);
    const addresses = JSON.stringify(fixture).match(/[\w.+-]+@[\w.-]+/g) ?? [];
    assert.ok(addresses.length > 0, `${id} has people`);
    for (const address of addresses) assert.match(address, /\.example$/, `${id}: ${address} is not a reserved example domain`);
    assert.ok(fixture.constraints.length >= 3, `${id} writes its constraints down`);
    assert.ok(fixture.budget.seconds > 0 && fixture.budget.steps > 0 && fixture.budget.contextTokens > 0);
    assert.match(heroJobPrompt(id), /Before you answer, check/, `${id} checks its own result before reporting`);
  }
  assert.ok(loadHeroFixture("waiting-on-me").afterFirstRead?.mail?.length, "a reply arrives mid-task");
  assert.ok(loadHeroFixture("meeting-prep").afterFirstRead?.calendar?.length, "the meeting moves mid-task");
  assert.match(heroJobPrompt("waiting-on-me"), /Just before saving each draft, read that thread again/);
  assert.match(heroJobPrompt("meeting-prep"), /check the meeting's time again/);
});

test("times are recognised however they're written", () => {
  for (const written of ["15:00", "15.00", "3 pm", "3pm", "3:00 PM", "at 3 p.m."]) assert.ok(timePattern("15:00").test(written), written);
  for (const written of ["9:30", "09:30", "9.30 am"]) assert.ok(timePattern("9:30").test(written), written);
  for (const wrong of ["19:30", "9:35", "115:00", "13:00"]) assert.ok(!timePattern(wrong === "13:00" ? "15:00" : "9:30").test(wrong), wrong);
});

const GOOD_BRIEF = `**Today** (Calendar)
- 9:30 Design review, Room 3
- 12:30 Lunch with Maya
- 15:00 Supplier call with Northwind
- All day: Mila's birthday
Early tomorrow: 8:15 Train to Ghent.

**Mail that needs you** (Mail)
- Ana Ribeiro: wants the Q3 slides by 5 today.
- Tom Becker: asks to move Thursday's review to Friday.
- Lena Vos: dinner on Saturday? Answer by Thursday.

**Reminders** (Reminders)
- Overdue: pay the electricity bill.
- Today: send the Q3 slides to Ana.`;

test("morning brief: a correct rundown passes; common mistakes are caught", () => {
  const fixture = loadHeroFixture("morning-brief");
  assert.deepEqual(checkHeroJob(fixture, outcome(GOOD_BRIEF, [{ name: "mac_calendar_events", args: { days: 2 } }, { name: "mac_mail_unread", args: { days: 2 } }, { name: "mac_reminders", args: {} }], { seconds: 41, steps: 5, contextTokens: 24_000 })), []);
  const problems = (reply: string, calls: HeroOutcome["toolCalls"] = [], extra: Partial<HeroOutcome> = {}) => checkHeroJob(fixture, outcome(reply, calls, extra)).join("; ");
  assert.match(problems(GOOD_BRIEF.replace("- 12:30 Lunch with Maya\n", "") + "\n- 12:30 Lunch with Maya"), /is out of order/);
  assert.match(problems(GOOD_BRIEF + "\n- The Weekly Digest: 12 tools"), /mentions "Weekly Digest"/);
  assert.match(problems(GOOD_BRIEF.replace("Early tomorrow: 8:15 Train to Ghent.", "")), /missing "Train to Ghent"/);
  assert.match(problems(GOOD_BRIEF.replace("**Reminders** (Reminders)", "**Also**")), /doesn't say it used reminder/);
  assert.match(problems(GOOD_BRIEF + "\nI added a reminder for the slides."), /claims "I added"/);
  assert.match(problems(GOOD_BRIEF, [{ name: "mac_reminder_create", args: { title: "Slides" } }]), /used mac_reminder_create, which changes something/);
  assert.match(problems(GOOD_BRIEF + " filler".repeat(200)), /too long/);
  assert.match(problems(GOOD_BRIEF, [], { seconds: 200, steps: 30 }), /took 200s.*took 30 steps/);
  assert.deepEqual(checkHeroJob(fixture, outcome("   ")), ["empty answer"]);
});

const GOOD_WAITING = `Waiting on you:
- Hendrik Maes (Mail): which morning works for the boiler engineer, Wednesday or Friday? I saved a draft reply in Mail for you to check.
- Lena Vos (Messages): are you coming on Saturday? Suggested reply: "Yes, count me in!"
Tom wrote again this morning: Thursday works after all, so he doesn't need an answer. Nothing was drafted for him. Nothing has been sent.`;

test("what's waiting on me: one draft, for the thread that still needs the owner; nothing sent", () => {
  const fixture = loadHeroFixture("waiting-on-me");
  const draft = (to: string) => ({ name: "mac_mail_draft", args: { to: [to], subject: "Re: Boiler service", body: "Friday morning works." } });
  assert.deepEqual(checkHeroJob(fixture, outcome(GOOD_WAITING, [{ name: "mac_mail_search", args: { query: "", days: 7 } }, { name: "mac_mail_read", args: { id: "2001" } }, draft("hendrik@flatlet.example")])), []);
  const problems = (calls: HeroOutcome["toolCalls"], reply = GOOD_WAITING) => checkHeroJob(fixture, outcome(reply, calls)).join("; ");
  assert.match(problems([draft("hendrik@flatlet.example"), draft("tom@studio.example")]), /mac_mail_draft for tom@studio\.example, who isn't waiting/, "drafted from the first read without looking again");
  assert.match(problems([]), /no mac_mail_draft for hendrik@flatlet\.example/);
  assert.match(problems([draft("hendrik@flatlet.example"), draft("hendrik@flatlet.example")]), /more than one mac_mail_draft/);
  assert.match(problems([draft("hendrik@flatlet.example"), { name: "gmail_reply", args: {} }]), /used gmail_reply, which sends/);
  assert.match(problems([draft("hendrik@flatlet.example")], GOOD_WAITING + "\nI replied to Maya too."), /claims "I replied to"/);
  assert.match(problems([draft("hendrik@flatlet.example")], GOOD_WAITING.replace("Lena Vos (Messages)", "Someone")), /missing "Lena".*doesn't say it used messages/);
});

const GOOD_PREP = `**Supplier call with Northwind**, today 16:00 to 16:45 (video call). It moved from 15:00, according to your calendar.
Coming: Ana Ribeiro and Joris Peeters.

What they wrote (mail):
- Ana: prices go up 4% from November, because of energy costs; Q3 volumes attached.
- Joris: wants to discuss the two late deliveries in September.

Your note "Northwind negotiation": keep the increase at 2% or less, and ask for a delivery service level with a credit for late deliveries.

Suggestion: open with the delivery delays before talking price.`;

test("meeting prep: uses the meeting's current time and only the attendees' mail and the matching note", () => {
  const fixture = loadHeroFixture("meeting-prep");
  assert.deepEqual(checkHeroJob(fixture, outcome(GOOD_PREP, [{ name: "mac_calendar_events", args: {} }, { name: "mac_calendar_events", args: {} }])), []);
  const problems = (reply: string) => checkHeroJob(fixture, outcome(reply)).join("; ");
  assert.match(problems(GOOD_PREP.replace("today 16:00 to 16:45 (video call). It moved from 15:00", "today 15:00 (video call)")), /missing "16:00"/, "kept the time from its first look");
  assert.match(problems(GOOD_PREP + "\nAlso from your notes: Lisbon in spring?"), /mentions "Lisbon"/);
  assert.match(problems(GOOD_PREP + "\nTom Becker asked to move Thursday's review."), /mentions "Tom"/);
  assert.match(problems(GOOD_PREP.replace('Your note "Northwind negotiation"', "You said")), /doesn't say it used note/);
});

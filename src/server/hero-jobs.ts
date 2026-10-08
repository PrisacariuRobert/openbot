import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { morningBriefPrompt } from "./morning-brief.js";

/** The jobs people come back for (task J1): a morning brief, what's waiting on
 * the owner, and meeting prep. Each has synthetic data in qa/hero-jobs/, written
 * constraints, time and token budgets, and checks that decide whether a run got
 * it right. The reliability harness (J2) runs them against real and scripted models. */

export const HERO_JOB_IDS = ["morning-brief", "waiting-on-me", "meeting-prep"] as const;
export type HeroJobId = (typeof HERO_JOB_IDS)[number];

const iso = z.string().datetime({ offset: true });
const event = z.object({ calendar: z.string(), title: z.string(), start: iso, end: iso, allDay: z.boolean(), location: z.string(), attendees: z.array(z.string()).optional(), replaces: z.string().optional() }).strict();
const reminder = z.object({ id: z.string(), title: z.string(), notes: z.string(), due: iso.nullable(), list: z.string(), completed: z.boolean() }).strict();
const threadEntry = z.object({ from: z.string(), date: iso, text: z.string() }).strict();
// Mail ids are numeric, as the Mac mail tools expect.
const mail = z.object({ id: z.string().regex(/^\d{1,15}$/), subject: z.string(), from: z.string(), date: iso, snippet: z.string(), attachments: z.array(z.object({ name: z.string(), size: z.number() })), unread: z.boolean(), text: z.string(), thread: z.array(threadEntry).optional(), replaces: z.string().optional() }).strict();
const note = z.object({ id: z.string(), title: z.string(), folder: z.string(), modified: iso, snippet: z.string(), text: z.string() }).strict();
const conversation = z.object({ id: z.string(), with: z.string(), messages: z.array(z.object({ from: z.string(), at: iso, text: z.string() }).strict()) }).strict();

export const heroFixtureSchema = z.object({
  job: z.enum(HERO_JOB_IDS),
  about: z.string(),
  now: iso,
  timeZone: z.string(),
  calendar: z.array(event).default([]),
  reminders: z.array(reminder).default([]),
  mail: z.array(mail).default([]),
  messages: z.array(conversation).default([]),
  notes: z.array(note).default([]),
  /** What arrives while the job runs: served from the second read of that source on. */
  afterFirstRead: z.object({ mail: z.array(mail), calendar: z.array(event), messages: z.array(conversation) }).partial().optional(),
  constraints: z.array(z.string()).min(1),
  budget: z.object({ seconds: z.number().positive(), steps: z.number().int().positive(), contextTokens: z.number().int().positive() }).strict(),
  expect: z.object({
    /** [title, time] pairs that must appear, in this order. */
    inOrder: z.array(z.tuple([z.string(), z.string()])),
    mentions: z.array(z.string()),
    neverMentions: z.array(z.string()),
    maxWords: z.number().int().positive(),
    /** Each source must be named in the answer, so the owner knows where things came from. */
    sources: z.array(z.string()),
    /** The only write tools allowed, and for Mail drafts exactly whom they're to. Anything that sends is never allowed. */
    writes: z.record(z.string(), z.object({ exactlyTo: z.array(z.string()) }).strict()),
    neverClaims: z.array(z.string()),
  }).strict(),
}).strict();

export type HeroFixture = z.infer<typeof heroFixtureSchema>;

const FIXTURES_DIR = path.resolve(import.meta.dirname, "../../qa/hero-jobs");

export function loadHeroFixture(id: HeroJobId, dir = FIXTURES_DIR): HeroFixture {
  const fixture = heroFixtureSchema.parse(JSON.parse(readFileSync(path.join(dir, `${id}.json`), "utf8")));
  if (fixture.job !== id) throw new Error(`${id}.json describes ${fixture.job}.`);
  return fixture;
}

/** What the owner (or a routine) asks. The constraints are written into the request so
 * they travel with the job from start to finish, and each ends with a self-check. */
export function heroJobPrompt(id: HeroJobId): string {
  if (id === "morning-brief") return morningBriefPrompt();
  if (id === "waiting-on-me") return `What's waiting on me? Look through my mail and Messages from the past week and find the conversations where someone is waiting for my answer.

1. Leave out threads where I wrote last, thank-yous, newsletters and automatic messages.
2. For each mail that needs an answer, save a short reply as a Mail draft with mac_mail_draft, for me to check and send. Just before saving each draft, read that thread again: if something new arrived and no answer is needed any more, don't draft it.
3. Messages can't be drafted in Mail: list them with a suggested reply.
Nothing is sent, by you or anyone.

Before you answer, check: every draft is for a thread that still needs me, nothing was sent, and the list says where each item came from (Mail or Messages).`;
  return `Prepare me for my next meeting.

1. Find my next meeting and who's coming.
2. Read their recent mail to me and my notes about it.
3. Write one page: the meeting, who's coming, what they wrote, my own notes, and open questions. Facts come from those sources; mark anything else as a suggestion.
Just before writing the page, check the meeting's time again in case it moved. Don't email or invite anyone.

Before you answer, check: the time is the current one, every fact has a source (calendar, mail or note), and nothing was sent.`;
}

export interface HeroOutcome {
  reply: string;
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
  seconds?: number;
  steps?: number;
  contextTokens?: number;
}

/** Tools that change something outside the teammate's workspace. */
const WRITE_TOOLS = new Set(["mac_mail_draft", "mac_reminder_create", "mac_note_create", "mac_event_create", "mac_mail_save_attachment", "mac_shortcut_run", "mac_organize", "mac_app_click", "mac_app_type", "mac_app_key"]);
/** Tools that send or publish. Never part of a hero job. */
const SEND_TOOLS = new Set(["gmail_send", "gmail_reply", "google_calendar_create", "google_drive_create", "slack_post", "notion_update", "github_issue_create", "todoist_task_create", "todoist_task_update", "todoist_task_complete"]);

/** "15:00" also matches "15.00", "3:00 pm", "3 pm" and "3pm"; "9:30" also matches "09:30" and "9.30 am". */
export function timePattern(time: string): RegExp {
  const [hours, minutes] = time.split(":").map(Number) as [number, number];
  const mm = String(minutes).padStart(2, "0"), twelve = hours % 12 || 12, half = hours < 12 ? "a\\.?m\\.?" : "p\\.?m\\.?";
  const forms = [`0?${hours}[:.]${mm}`, `${twelve}(?:[:.]${mm})?\\s?${half}`];
  if (minutes === 0) forms.push(`${twelve}\\s?${half}`);
  return new RegExp(`(?<![\\d:.])(?:${forms.join("|")})(?![\\d])`, "i");
}

const lower = (text: string) => text.toLowerCase();
const words = (text: string) => text.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;

/** The problems with one run, empty when it got the job right. */
export function checkHeroJob(fixture: HeroFixture, outcome: HeroOutcome): string[] {
  const { expect } = fixture, reply = outcome.reply, text = lower(reply), problems: string[] = [];
  if (!reply.trim()) return ["empty answer"];
  let last = -1;
  for (const [title, time] of expect.inOrder) {
    const at = text.indexOf(lower(title));
    if (at < 0) { problems.push(`missing "${title}"`); continue; }
    if (!timePattern(time).test(reply)) problems.push(`missing the time ${time} for "${title}"`);
    if (at < last) problems.push(`"${title}" is out of order`);
    last = Math.max(last, at);
  }
  for (const item of expect.mentions) if (!text.includes(lower(item))) problems.push(`missing "${item}"`);
  for (const item of expect.neverMentions) if (text.includes(lower(item))) problems.push(`mentions "${item}", which doesn't belong`);
  if (words(reply) > expect.maxWords) problems.push(`too long: ${words(reply)} words (at most ${expect.maxWords})`);
  for (const source of expect.sources) if (!text.includes(lower(source))) problems.push(`doesn't say it used ${source}`);
  for (const claim of expect.neverClaims) if (text.includes(lower(claim))) problems.push(`claims "${claim}"`);
  for (const call of outcome.toolCalls) {
    if (SEND_TOOLS.has(call.name)) problems.push(`used ${call.name}, which sends`);
    else if (WRITE_TOOLS.has(call.name) && !expect.writes[call.name]) problems.push(`used ${call.name}, which changes something`);
  }
  for (const [tool, rule] of Object.entries(expect.writes)) {
    const recipients = outcome.toolCalls.filter((call) => call.name === tool).flatMap((call) => (Array.isArray(call.args.to) ? call.args.to : []).map((to) => lower(String(to))));
    for (const to of rule.exactlyTo) if (!recipients.includes(lower(to))) problems.push(`no ${tool} for ${to}`);
    for (const to of recipients) if (!rule.exactlyTo.map(lower).includes(to)) problems.push(`${tool} for ${to}, who isn't waiting`);
    if (recipients.length !== new Set(recipients).size) problems.push(`more than one ${tool} for the same person`);
  }
  if (outcome.seconds !== undefined && outcome.seconds > fixture.budget.seconds) problems.push(`took ${outcome.seconds}s (budget ${fixture.budget.seconds}s)`);
  if (outcome.steps !== undefined && outcome.steps > fixture.budget.steps) problems.push(`took ${outcome.steps} steps (budget ${fixture.budget.steps})`);
  if (outcome.contextTokens !== undefined && outcome.contextTokens > fixture.budget.contextTokens) problems.push(`used ${outcome.contextTokens} context tokens (budget ${fixture.budget.contextTokens})`);
  return problems;
}

import { appendFileSync, readFileSync } from "node:fs";
import type { z } from "zod";
import {
  AppleApps, calendarEventsInput, contactsFindInput, mailDraftInput, mailReadInput, mailSearchInput, mailUnreadInput,
  noteReadInput, notesSearchInput, remindersInput,
} from "./mac-apple-apps.js";
import { heroFixtureSchema, type HeroFixture } from "./hero-jobs.js";

/** A synthetic Mac for the hero jobs (task J2). Only a staging studio (OPENBOT_STAGING=1)
 * with OPENBOT_HERO_FIXTURE set uses it: the Mac tools then read that fixture instead of
 * the real apps, in the real tools' shapes, and every call is recorded so the harness can
 * check what was drafted. Things in the fixture's afterFirstRead arrive from the second
 * read of that source on, the way new mail or a moved meeting arrives while a job runs. */

/** True when this process runs the hero jobs' synthetic Mac. Read once at start. */
export const HERO_FIXTURE_ACTIVE = process.env.OPENBOT_STAGING === "1" && Boolean(process.env.OPENBOT_HERO_FIXTURE);

let fixtureNow: Date | null | undefined;
/** The moment the teammate is told it is: the fixture's on a hero-job staging studio, otherwise now. */
export function studioNow(): Date {
  if (fixtureNow === undefined) fixtureNow = HERO_FIXTURE_ACTIVE ? new Date(heroFixtureFromEnv()!.fixture.now) : null;
  return fixtureNow ?? new Date();
}

export function heroFixtureFromEnv(env: NodeJS.ProcessEnv = process.env): { fixture: HeroFixture; record: string | null } | null {
  if (env.OPENBOT_STAGING !== "1" || !env.OPENBOT_HERO_FIXTURE) return null;
  return { fixture: heroFixtureSchema.parse(JSON.parse(readFileSync(env.OPENBOT_HERO_FIXTURE, "utf8"))), record: env.OPENBOT_HERO_RECORD || null };
}

type Mail = HeroFixture["mail"][number];
const words = (query: string) => query.toLowerCase().split(/[^\p{L}\p{N}%@.]+/u).filter((word) => word.length >= 2);
const matches = (query: string, ...fields: string[]) => { const haystack = fields.join(" ").toLowerCase(); return words(query).some((word) => haystack.includes(word)); };
const summary = ({ id, subject, from, date, snippet, attachments, unread }: Mail) => ({ id, subject, from, date, snippet, attachments, unread });
const newestFirst = <T extends { date: string }>(items: T[]) => [...items].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));

export class FixtureAppleApps extends AppleApps {
  private readonly reads = { calendar: 0, mail: 0, messages: 0 };

  constructor(readonly fixture: HeroFixture, private readonly record: string | null = null) {
    super(async () => { throw new Error("The hero fixture never runs osascript."); }, "darwin", undefined, null, () => Date.parse(fixture.now));
  }

  private log(name: string, args: unknown) {
    if (this.record) appendFileSync(this.record, `${JSON.stringify({ name, args })}\n`);
  }

  private nowMs() { return Date.parse(this.fixture.now); }

  /** Mail as it stands at this read: from the second read on, what arrived mid-task is there too. */
  private mailAt(read: number): Mail[] {
    return read >= 2 ? [...this.fixture.mail, ...(this.fixture.afterFirstRead?.mail ?? [])] : this.fixture.mail;
  }

  override calendarNeedsWarming() { return false; }
  override async refreshCalendar(): Promise<never> { throw new Error("The hero fixture has no calendar cache."); }

  override async calendarEvents(input: z.input<typeof calendarEventsInput>) {
    const args = calendarEventsInput.parse(input);
    this.log("mac_calendar_events", args);
    const read = ++this.reads.calendar;
    const moved = read >= 2 ? this.fixture.afterFirstRead?.calendar ?? [] : [];
    const events = [...this.fixture.calendar.filter((event) => !moved.some((change) => change.replaces === event.title)), ...moved];
    const now = new Date(this.nowMs()), today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const from = args.from ? new Date(args.from) : today, until = new Date(from.getTime() + args.days * 86_400_000);
    const shown = events
      .filter((event) => Date.parse(event.end) > from.getTime() && Date.parse(event.start) < until.getTime())
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
      // The real tool returns no attendees, so neither does this one.
      .map(({ calendar, title, start, end, allDay, location }) => ({ calendar, title, start, end, allDay, location }));
    return { from: from.toISOString(), until: until.toISOString(), events: shown, asOf: now.toISOString() };
  }

  override async unreadMail(input: z.input<typeof mailUnreadInput>) {
    const args = mailUnreadInput.parse(input);
    this.log("mac_mail_unread", args);
    const since = this.nowMs() - args.days * 86_400_000;
    const messages = newestFirst(this.mailAt(++this.reads.mail).filter((mail) => mail.unread && Date.parse(mail.date) >= since)).slice(0, args.limit).map(summary);
    return { messages, count: messages.length };
  }

  override async searchMail(input: z.input<typeof mailSearchInput>) {
    const args = mailSearchInput.parse(input);
    this.log("mac_mail_search", args);
    const since = this.nowMs() - args.days * 86_400_000;
    const found = newestFirst(this.mailAt(++this.reads.mail).filter((mail) => Date.parse(mail.date) >= since && matches(args.query, mail.subject, mail.from, mail.text)));
    return { messages: found.slice(0, args.limit).map(summary), matched: found.length };
  }

  override async readMail(input: z.input<typeof mailReadInput>) {
    const args = mailReadInput.parse(input);
    this.log("mac_mail_read", args);
    const all = this.mailAt(++this.reads.mail), message = all.find((mail) => mail.id === args.id);
    if (!message) throw new Error("That message isn't in Mail anymore. Search again.");
    const thread = (message.thread ?? []).map((entry) => `${entry.from} (${entry.date}): ${entry.text}`);
    const newer = all.filter((mail) => mail.replaces === message.id).map((mail) => `${mail.from} (${mail.date}): ${mail.text}`);
    const text = [message.text, ...(thread.length > 1 || newer.length ? ["", "In this thread:", ...thread, ...newer] : [])].join("\n");
    return { ...summary(message), text, truncated: false };
  }

  override async reminders(input: z.input<typeof remindersInput>) {
    const args = remindersInput.parse(input);
    this.log("mac_reminders", args);
    const reminders = this.fixture.reminders.filter((item) => (args.includeCompleted || !item.completed) && (!args.list || item.list === args.list)).slice(0, args.limit);
    return { reminders, lists: [...new Set(this.fixture.reminders.map((item) => item.list))] };
  }

  override async searchNotes(input: z.input<typeof notesSearchInput>) {
    const args = notesSearchInput.parse(input);
    this.log("mac_notes_search", args);
    const notes = this.fixture.notes.filter((note) => matches(args.query, note.title, note.text)).slice(0, args.limit).map(({ id, title, folder, modified, snippet }) => ({ id, title, folder, modified, snippet }));
    return { notes, scanned: this.fixture.notes.length, total: this.fixture.notes.length };
  }

  override async readNote(input: z.input<typeof noteReadInput>) {
    const args = noteReadInput.parse(input);
    this.log("mac_note_read", args);
    const note = this.fixture.notes.find((item) => item.id === args.id);
    if (!note) throw new Error("That note isn't there anymore. Search again.");
    return { id: note.id, title: note.title, modified: note.modified, text: note.text, truncated: false };
  }

  override async findContacts(input: z.input<typeof contactsFindInput>) {
    this.log("mac_contacts_find", contactsFindInput.parse(input));
    return { contacts: [] };
  }

  override async listCalendars() {
    return { calendars: [...new Set(this.fixture.calendar.map((event) => event.calendar))].map((name) => ({ name, writable: true })) };
  }

  override async listShortcuts(): Promise<string[]> { return []; }

  /** Recorded, never opened: the harness checks whom each draft is to. */
  override async draftMail(input: z.input<typeof mailDraftInput>) {
    this.log("mac_mail_draft", mailDraftInput.parse(input));
    return { opened: true };
  }

  /** search_my_mac over the fixture's mail, Messages and notes, in the real route's result shape. */
  searchMyMac(input: { query: string; sources?: Array<"files" | "notes" | "mail" | "messages">; days?: number; limit?: number }) {
    this.log("search_my_mac", input);
    const since = input.days ? this.nowMs() - input.days * 86_400_000 : -Infinity;
    const sources = input.sources?.length ? input.sources : ["notes", "mail", "messages"];
    const results: Array<{ source: string; title: string; from: string; date: string; snippet: string; open: { tool: string; id: string } | null }> = [];
    if (sources.includes("messages")) {
      const read = ++this.reads.messages;
      const conversations = read >= 2 ? [...this.fixture.messages, ...(this.fixture.afterFirstRead?.messages ?? [])] : this.fixture.messages;
      for (const conversation of conversations) {
        const last = conversation.messages.at(-1);
        if (!last || Date.parse(last.at) < since || !matches(input.query, conversation.with, ...conversation.messages.map((message) => message.text), "messages message chat")) continue;
        results.push({ source: "messages", title: `Messages with ${conversation.with}`, from: last.from, date: last.at.slice(0, 10), snippet: conversation.messages.map((message) => `${message.from}: ${message.text}`).join(" · "), open: null });
      }
    }
    if (sources.includes("mail")) {
      for (const mail of newestFirst(this.mailAt(++this.reads.mail))) {
        if (Date.parse(mail.date) >= since && matches(input.query, mail.subject, mail.from, mail.text)) results.push({ source: "mail", title: mail.subject, from: mail.from, date: mail.date.slice(0, 10), snippet: mail.snippet, open: { tool: "mac_mail_read", id: mail.id } });
      }
    }
    if (sources.includes("notes")) {
      for (const note of this.fixture.notes) if (matches(input.query, note.title, note.text)) results.push({ source: "notes", title: note.title, from: "", date: note.modified.slice(0, 10), snippet: note.snippet, open: { tool: "mac_note_read", id: note.id } });
    }
    return { results: results.slice(0, input.limit ?? 10), searched: sources, coverage: sources.map((source) => `${source}: hero fixture`), note: "Synthetic data from the hero-job fixture." };
  }
}

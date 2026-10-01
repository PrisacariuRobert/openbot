import type { Bot, Routine } from "../shared/types.js";
import type { OpenBotDatabase } from "./database.js";
import { approvalReason } from "./safety.js";

/** A ready-made morning brief: a routine that looks at today's calendar, the
 * unread mail that needs the owner, and reminders due, and writes a short
 * note in the teammate's chat at a set time. It only reads. The prompt is
 * kept free of words that ask for approval (sending, replying, deleting…),
 * because nobody is at the keyboard when it runs. */

export const MORNING_BRIEF_NAME = "Morning brief";

export function morningBriefPrompt(city?: string | null): string {
  const weather = city ? `\n4. The weather today in ${city}: one line (look it up on the web).` : "";
  return `Write my daily rundown for today. Only look things up; don't change anything.

1. My schedule: what's on my calendar today, and anything early tomorrow (use mac_calendar_events, or my Google calendar if that's what you have). Times first.
2. Mail that needs me: from my unread mail of the last two days, pick at most five that look like they need an answer or an action. One line each: who, and what is asked. Skip newsletters and automatic notifications.
3. Reminders due today or overdue.${weather}

Keep it short enough to read in half a minute: a few labelled lines, no introduction. If you can't reach a source, say so in one line instead of guessing. Mention where each part came from in a few words.`;
}

export interface MorningBriefSetup { botId: string; time: string; weekdaysOnly: boolean; city?: string | null; timeZone: string }
export interface MorningBriefState { routine: Pick<Routine, "id" | "enabled" | "nextRunAt" | "lastRunAt" | "lastStatus" | "botId" | "botName" | "threadId" | "scheduleLabel"> & { time: string; weekdaysOnly: boolean; city: string | null } | null }

export function findMorningBrief(db: OpenBotDatabase): Routine | null {
  return db.listRoutines().find((routine) => routine.name === MORNING_BRIEF_NAME && routine.triggerType === "schedule") || null;
}

export function describeMorningBrief(db: OpenBotDatabase): MorningBriefState {
  const routine = findMorningBrief(db);
  if (!routine) return { routine: null };
  const schedule = routine.schedule?.kind === "calendar" ? routine.schedule : null;
  const city = /The weather today in (.+?): one line/.exec(routine.prompt)?.[1] ?? null;
  return { routine: { id: routine.id, enabled: routine.enabled, nextRunAt: routine.nextRunAt, lastRunAt: routine.lastRunAt, lastStatus: routine.lastStatus, botId: routine.botId, botName: routine.botName, threadId: routine.threadId, scheduleLabel: routine.scheduleLabel, time: schedule?.time ?? "08:00", weekdaysOnly: Boolean(schedule && schedule.daysOfWeek?.length === 5), city } };
}

export function setupMorningBrief(db: OpenBotDatabase, input: MorningBriefSetup): Routine {
  const bot: Bot | null = db.getBot(input.botId);
  if (!bot || bot.retiredAt) throw new Error("Choose one of your teammates.");
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(input.time)) throw new Error("Choose a time like 08:00.");
  const city = input.city?.trim().replace(/[\r\n:]+/g, " ").slice(0, 60) || null;
  const prompt = morningBriefPrompt(city);
  if (approvalReason(prompt)) throw new Error("Use just a city name, like Vienna.");
  const schedule = { kind: "calendar" as const, timeZone: input.timeZone, time: input.time, daysOfWeek: input.weekdaysOnly ? [1, 2, 3, 4, 5] : [1, 2, 3, 4, 5, 6, 7] };
  const fields = { name: MORNING_BRIEF_NAME, botId: bot.id, threadId: bot.threadId, prompt, intervalMinutes: 1_440, schedule, enabled: true };
  const existing = findMorningBrief(db);
  if (existing) return db.updateRoutine(existing.id, fields)!;
  return db.createRoutine(fields);
}

export function removeMorningBrief(db: OpenBotDatabase): boolean {
  const existing = findMorningBrief(db);
  return existing ? db.deleteRoutine(existing.id) : false;
}

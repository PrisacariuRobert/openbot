import { routineScheduleLabel } from "./routines.js";
import { routineScheduleInput, scheduleLabel, type RoutineSchedule } from "./calendar-schedule.js";

export interface RoutineIntent {
  schedule?: RoutineSchedule;
  intervalMinutes: number;
  name: string;
  prompt: string;
  confirmation: string;
}

const unitMinutes: Record<string, number> = {
  min: 1, mins: 1, minute: 1, minutes: 1,
  hr: 60, hrs: 60, hour: 60, hours: 60,
  day: 1440, days: 1440,
};

export function parseRoutineIntent(input: string, timeZone?: string): RoutineIntent | null {
  const text = input.trim();
  // This fast path can only create an enabled, unconditional schedule. Let the
  // normal tool flow interpret conditions, drafts and questions instead of
  // silently dropping them or turning a page watch into repeated model work.
  if (/https?:\/\/|\?|\b(?:watch|monitor|when|whenever|if|changes?|changed|draft|paused?|disabled|stop|cancel|don't|do not)\b/i.test(text)) return null;
  const clock = /^(?:please\s+)?(?:every\s+(weekday|day|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|daily|weekdays)\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?(?:\s+([A-Za-z_]+\/[A-Za-z_+\/-]+|UTC))?\s*[,—-]?\s+(.+)$/i.exec(text);
  if (clock) {
    const hour = Number(clock[2]), minute = Number(clock[3] || 0), meridiem = clock[4]?.toLowerCase();
    if ((meridiem && (hour < 1 || hour > 12)) || (!meridiem && hour > 23) || minute > 59) return null;
    const day = (clock[1] || (/^(?:please\s+)?weekdays/i.test(text) ? "weekday" : "day")).toLowerCase();
    const daysOfWeek = day === "day" ? [1, 2, 3, 4, 5, 6, 7] : day === "weekday" ? [1, 2, 3, 4, 5] : [["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].indexOf(day) + 1];
    const parsed = routineScheduleInput.safeParse({ kind: "calendar", daysOfWeek, time: `${String(meridiem ? hour % 12 + (meridiem === "pm" ? 12 : 0) : hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`, timeZone: clock[5] || timeZone });
    if (!parsed.success) return null;
    const prompt = clock[6]!.trim();
    // Leave alternate time zones, extra timing rules and ambiguous requests to
    // the normal tool flow; never discard them as if they were task wording.
    if (/^(?:[A-Z]{2,5}|in\s+\w+)\b/.test(prompt) || /\b(?:except|until|starting|only|unless)\b/i.test(prompt)) return null;
    const short = prompt.replace(/[.!?]+$/g, "").slice(0, 44);
    return { schedule: parsed.data, intervalMinutes: 1440, name: short.charAt(0).toUpperCase() + short.slice(1), prompt,
      confirmation: `Scheduled: ${scheduleLabel(parsed.data, 1440)}. I’ll ${prompt.charAt(0).toLowerCase()}${prompt.slice(1)}. You can preview, test or pause it in Automations. Your execution host needs to be awake.` };
  }
  // A wall-clock request must not fall through to an elapsed 24-hour interval.
  if (/\b(?:at\s+\d|weekdays?|monday|tuesday|wednesday|thursday|friday|saturday|sunday|tonight|tomorrow|except|until|starting)\b/i.test(text)) return null;
  const match = /\b(?:every\s+(?:(\d+)\s*)?(min|mins|minute|minutes|hr|hrs|hour|hours|day|days|week|weeks)|hourly|daily|weekly)\b/i.exec(text);
  if (!match || match.index === undefined) return null;
  const before = text.slice(0, match.index).trim();
  const explicitCommand = match.index === 0 || /\b(set|create|schedule|run|do|remind|text|message|post|check)\b/i.test(before);
  if (!explicitCommand) return null;
  const keyword = match[0].toLowerCase();
  const intervalMinutes = keyword === "hourly" ? 60 : keyword === "daily" ? 1440 : keyword === "weekly" ? 10_080 : Number(match[1] || 1) * (match[2]!.toLowerCase().startsWith("week") ? 10_080 : unitMinutes[match[2]!.toLowerCase()]!);
  if (!Number.isInteger(intervalMinutes) || intervalMinutes < 5 || intervalMinutes > 43_200) return null;

  let task = `${before} ${text.slice(match.index + match[0].length)}`.replace(/\s+/g, " ").trim();
  task = task.replace(/^(please\s+)?(set|create|schedule|run|do)\s+/i, "").trim();
  let prompt: string;
  let friendlyTask: string;
  const localText = /^(?:text|message)\s+(?:me|my)\s+(.+)$/i.exec(task);
  const reminder = /^remind\s+me\s+(?:to\s+)?(.+)$/i.exec(task);
  if (localText) {
    friendlyTask = localText[1]!.trim();
    prompt = `Post this exact update in the current OpenBot conversation: ${friendlyTask}`;
  } else if (reminder) {
    friendlyTask = reminder[1]!.trim();
    prompt = `Post a short reminder in the current OpenBot conversation: ${friendlyTask}`;
  } else {
    friendlyTask = task.replace(/^to\s+/i, "").trim();
    if (!friendlyTask) return null;
    prompt = friendlyTask;
  }
  const shortTask = friendlyTask.replace(/[.!?]+$/g, "").slice(0, 44);
  const schedule = routineScheduleLabel(intervalMinutes);
  return {
    intervalMinutes,
    name: `${shortTask.charAt(0).toUpperCase()}${shortTask.slice(1)}`,
    prompt,
    confirmation: `I’ll ${localText ? `post “${shortTask}” here` : friendlyTask} ${schedule.toLowerCase()}. You can test, pause or change it anytime in Automations.`,
  };
}

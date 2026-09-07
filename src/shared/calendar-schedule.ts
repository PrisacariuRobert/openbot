import { Temporal } from "@js-temporal/polyfill";
import { z } from "zod";
import { routineIntervalMs, routineScheduleLabel } from "./routines.js";

const zone = z.string().trim().min(1).max(100).refine((value) => {
  // Require a named zone, not a fixed UTC offset that silently ignores DST.
  try { return !/^[+-]/.test(value) && Boolean(new Intl.DateTimeFormat("en", { timeZone: value })); }
  catch { return false; }
}, "Choose a valid time zone, such as Europe/Brussels.");

export const routineScheduleInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("interval") }).strict(),
  z.object({ kind: z.literal("calendar"), timeZone: zone, time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Choose a time between 00:00 and 23:59."), daysOfWeek: z.array(z.number().int().min(1).max(7)).min(1).max(7).transform((days) => [...new Set(days)].sort()) }).strict(),
  z.object({ kind: z.literal("once"), timeZone: zone, at: z.string().datetime({ offset: true }).transform((at) => new Date(at).toISOString()) }).strict(),
]);

export type RoutineSchedule = z.infer<typeof routineScheduleInput>;
export const intervalSchedule: RoutineSchedule = { kind: "interval" };

// A repeated clock time runs at its first occurrence. A missing clock time
// runs at the transition instant: the first valid local time after the gap.
function onDate(date: Temporal.PlainDate, schedule: Extract<RoutineSchedule, { kind: "calendar" }>): number | null {
  const local = date.toPlainDateTime(schedule.time);
  const earlier = local.toZonedDateTime(schedule.timeZone, { disambiguation: "earlier" });
  if (earlier.toPlainDateTime().equals(local)) return earlier.epochMilliseconds;
  const transition = earlier.getTimeZoneTransition("next");
  return transition?.toPlainDate().equals(date) ? transition.epochMilliseconds : null;
}

/** Strictly after `after`; never depends on the host or browser local time. */
export function nextRoutineOccurrence(schedule: RoutineSchedule, intervalMinutes: number, after: number): string | null {
  if (!Number.isFinite(after)) throw new Error("The schedule needs a valid starting time.");
  if (schedule.kind === "interval") return new Date(after + routineIntervalMs(intervalMinutes)).toISOString();
  if (schedule.kind === "once") return Date.parse(schedule.at) > after ? schedule.at : null;
  let date = Temporal.Instant.fromEpochMilliseconds(after).toZonedDateTimeISO(schedule.timeZone).toPlainDate();
  for (let day = 0; day < 15; day++, date = date.add({ days: 1 })) {
    if (!schedule.daysOfWeek.includes(date.dayOfWeek)) continue;
    const candidate = onDate(date, schedule);
    if (candidate !== null && candidate > after) return new Date(candidate).toISOString();
  }
  throw new Error("Could not find the next scheduled day. Check the days and time zone.");
}

export function scheduleLabel(schedule: RoutineSchedule, intervalMinutes: number): string {
  if (schedule.kind === "interval") return routineScheduleLabel(intervalMinutes);
  if (schedule.kind === "once") return `Once · ${formatScheduleDate(schedule.at, schedule.timeZone)}`;
  const days = schedule.daysOfWeek;
  const label = days.length === 7 ? "Every day" : days.join(",") === "1,2,3,4,5" ? "Weekdays" : days.map((day) => ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][day]).join(", ");
  return `${label} at ${schedule.time} · ${schedule.timeZone}`;
}

export function formatScheduleDate(at: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" }).format(new Date(at));
}

export function schedulePreview(schedule: RoutineSchedule, intervalMinutes: number, after = Date.now(), first?: string | null) {
  const nextRuns: string[] = [];
  let next = first === undefined ? nextRoutineOccurrence(schedule, intervalMinutes, after) : first;
  while (next && nextRuns.length < 3) {
    nextRuns.push(next);
    next = nextRoutineOccurrence(schedule, intervalMinutes, Math.max(after, Date.parse(next)));
  }
  const timeZone = schedule.kind === "interval" ? "UTC" : schedule.timeZone;
  return { label: scheduleLabel(schedule, intervalMinutes), nextRuns, descriptions: nextRuns.map((at) => formatScheduleDate(at, timeZone)), timeZone,
    policy: "If a clock time is skipped, run at the first valid time that day. If it repeats, run once. After downtime, catch up once, then return to the saved schedule. The execution host must be awake." };
}

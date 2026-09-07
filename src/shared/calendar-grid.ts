import { Temporal } from "@js-temporal/polyfill";

/** Date-only arithmetic: never interpret a calendar cell in the browser's zone. */
export function calendarMonthDays(month: string): Temporal.PlainDate[] {
  const first = Temporal.PlainDate.from(month).with({ day: 1 });
  const start = first.subtract({ days: first.dayOfWeek - 1 });
  return Array.from({ length: 42 }, (_, index) => start.add({ days: index }));
}

export function calendarKeyDate(date: string, key: string): string {
  const day = Temporal.PlainDate.from(date);
  switch (key) {
    case "ArrowLeft": return day.subtract({ days: 1 }).toString();
    case "ArrowRight": return day.add({ days: 1 }).toString();
    case "ArrowUp": return day.subtract({ days: 7 }).toString();
    case "ArrowDown": return day.add({ days: 7 }).toString();
    case "Home": return day.subtract({ days: day.dayOfWeek - 1 }).toString();
    case "End": return day.add({ days: 7 - day.dayOfWeek }).toString();
    case "PageUp": return day.subtract({ months: 1 }).toString();
    case "PageDown": return day.add({ months: 1 }).toString();
    default: return date;
  }
}

export function onceAtLocal(date: string, time: string, zone: string): string {
  return Temporal.PlainDateTime.from(`${date}T${time}`).toZonedDateTime(zone, { disambiguation: "reject" }).toInstant().toString();
}

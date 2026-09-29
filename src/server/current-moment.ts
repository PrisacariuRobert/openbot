/** Teammates are never otherwise told the date: "tomorrow at 9" or "this
 * weekend" came out a day or a week off. The studio runs on the owner's Mac,
 * so its clock and time zone are the owner's. */
export function currentMoment(now = new Date(), timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZoneName: "longOffset" }).formatToParts(now).map((part) => [part.type, part.value]));
  const offset = String(parts.timeZoneName || "GMT").replace(/^GMT$/, "GMT+00:00").replace("GMT", "UTC");
  return `It is now ${parts.weekday}, ${parts.day} ${parts.month} ${parts.year}, ${parts.hour}:${parts.minute} in the owner's time zone (${timeZone}, ${offset}). Resolve "today", "tomorrow" and "this weekend" from this, and write times with this offset.`;
}

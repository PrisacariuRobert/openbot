import { execFile } from "node:child_process";
import type { Routine } from "../shared/types.js";

/** Wake a sleeping Mac for scheduled routines. macOS keeps one repeating
 * power event (`pmset repeat`); OpenBot sets it a few minutes before the
 * earliest routine of the day. Changing it needs the owner's password in
 * macOS's own prompt — OpenBot never sees or stores it. A MacBook with its
 * lid closed and no power may still stay asleep; routines then run as soon
 * as the Mac wakes. */

const LEAD_MINUTES = 3;
const TIME = /^([01]\d|2[0-3]):([0-5]\d):00$/;

export interface MacWakeState { enabled: boolean; time: string | null; setAt?: string }

/** "07:57:00" for routines whose next run is at 8:00 local time, or null. */
export function plannedWakeTime(routines: Pick<Routine, "enabled" | "nextRunAt">[], timeZoneOffsetMinutes = new Date().getTimezoneOffset()): string | null {
  let earliest: number | null = null;
  for (const routine of routines) {
    if (!routine.enabled || !routine.nextRunAt) continue;
    const at = Date.parse(routine.nextRunAt);
    if (!Number.isFinite(at)) continue;
    const local = new Date(at - timeZoneOffsetMinutes * 60_000);
    const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
    if (earliest === null || minutes < earliest) earliest = minutes;
  }
  if (earliest === null) return null;
  const wake = (earliest - LEAD_MINUTES + 24 * 60) % (24 * 60);
  return `${String(Math.floor(wake / 60)).padStart(2, "0")}:${String(wake % 60).padStart(2, "0")}:00`;
}

/** The exact command, validated so nothing else can reach the shell. */
export function wakeCommand(time: string | null): string {
  if (time === null) return "pmset repeat cancel";
  if (!TIME.test(time)) throw new Error("That wake time isn't valid.");
  return `pmset repeat wakeorpoweron MTWRFSU ${time}`;
}

export type AdminRunner = (command: string) => Promise<void>;

/** macOS shows its own password prompt; a cancel is reported plainly. */
export const osascriptAdmin: AdminRunner = (command) => new Promise((resolve, reject) => {
  execFile("osascript", ["-e", `do shell script "${command}" with administrator privileges`], { timeout: 120_000 }, (error, _stdout, stderr) => {
    if (!error) return resolve();
    const detail = String(stderr || error.message);
    reject(new Error(/-128|cancel/i.test(detail) ? "Cancelled — your Mac's wake schedule wasn't changed." : `macOS didn't change the wake schedule: ${detail.trim().slice(0, 160)}`));
  });
});

export async function setMacWake(enabled: boolean, routines: Pick<Routine, "enabled" | "nextRunAt">[], run: AdminRunner = osascriptAdmin, now = new Date()): Promise<MacWakeState> {
  const time = enabled ? plannedWakeTime(routines) : null;
  if (enabled && !time) throw new Error("Add a scheduled routine first — then your Mac can wake up for it.");
  await run(wakeCommand(time));
  return { enabled: Boolean(time), time, setAt: now.toISOString() };
}

import type { Bot } from "./types.js";

/** Teammates visibly busy right now: running work, or just finished and
 * still celebrating. "Waiting" is deliberately excluded — a teammate paused
 * for the owner already has the Needs-you surface, and the strip answers
 * "who is working", not "who is blocked". */
export function activeNowBots<T extends Pick<Bot, "id" | "name" | "status">>(bots: T[]): T[] {
  return bots.filter((bot) => bot.status === "working" || bot.status === "celebrating");
}

import { createHmac, timingSafeEqual } from "node:crypto";

// The studio master key never enters a model process. A runtime gets authority
// for just its own bot/run pair. Current run state and grants remain mandatory.
export function scopedToolToken(master: string, botId: string, runId: string): string {
  return createHmac("sha256", master).update(JSON.stringify(["openbot-tools-v1", botId, runId])).digest("base64url");
}

export function validToolToken(master: string, botId: string, runId: string, supplied: unknown): boolean {
  if (typeof supplied !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(supplied)) return false;
  return timingSafeEqual(Buffer.from(scopedToolToken(master, botId, runId)), Buffer.from(supplied));
}

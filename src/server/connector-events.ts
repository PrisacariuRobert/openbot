import { createHmac, timingSafeEqual } from "node:crypto";

function safeEqual(expected: string, provided: string) {
  const left = Buffer.from(expected), right = Buffer.from(provided.trim().toLowerCase());
  return left.length === right.length && timingSafeEqual(left, right);
}

export function verifySlackEventRequest(
  secret: string,
  rawBody: Buffer,
  timestamp: string | undefined,
  signature: string | undefined,
  nowSeconds = Math.floor(Date.now() / 1_000),
) {
  const sentAt = Number(timestamp);
  if (!secret || !timestamp || !signature || !Number.isFinite(sentAt) || Math.abs(nowSeconds - sentAt) > 300) return false;
  const expected = `v0=${createHmac("sha256", secret).update(`v0:${timestamp}:`).update(rawBody).digest("hex")}`;
  return safeEqual(expected, signature);
}

export function verifyNotionEventRequest(secret: string, rawBody: Buffer, signature: string | undefined) {
  if (!secret || !signature) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  return safeEqual(expected, signature);
}

export function slackEventIsFromApp(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const outer = payload as Record<string, unknown>;
  const event = outer.event && typeof outer.event === "object" && !Array.isArray(outer.event) ? outer.event as Record<string, unknown> : {};
  return typeof event.bot_id === "string" || event.subtype === "bot_message";
}

export function providerEventAttempt(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return 1;
  const value = Number((payload as Record<string, unknown>).attempt_number || 1);
  return Number.isFinite(value) ? Math.max(1, Math.min(8, Math.round(value))) : 1;
}

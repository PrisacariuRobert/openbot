import { z } from "zod";

export const RELAY_BODY_LIMIT = 25 * 1024 * 1024;
export const RELAY_PENDING_LIMIT = 16;
export const relayHeaders = z.record(z.string().max(80), z.string().max(8192)).refine((value) => Object.keys(value).length <= 32);
export const relayRequest = z.discriminatedUnion("type", [
  z.object({ type: z.literal("request"), id: z.string().uuid(), method: z.enum(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]), path: z.string().max(8192).regex(/^\/(?!\/)/), headers: relayHeaders, body: z.string().max(Math.ceil(RELAY_BODY_LIMIT / 3) * 4) }).strict(),
  z.object({ type: z.literal("cancel"), id: z.string().uuid() }).strict(),
]);
export const relayResponse = z.discriminatedUnion("type", [
  z.object({ type: z.literal("head"), id: z.string().uuid(), status: z.number().int().min(200).max(599), headers: relayHeaders }).strict(),
  z.object({ type: z.literal("chunk"), id: z.string().uuid(), body: z.string().max(100_000) }).strict(),
  z.object({ type: z.literal("end"), id: z.string().uuid() }).strict(),
  z.object({ type: z.literal("error"), id: z.string().uuid() }).strict(),
]);
export function forwardedRequestHeaders(raw: Record<string, string | string[] | undefined>): Record<string, string> {
  const allowed = new Set(["authorization", "content-type", "accept", "range", "if-none-match", "x-file-name", "x-file-type"]);
  return Object.fromEntries(Object.entries(raw).filter(([key, value]) => allowed.has(key.toLowerCase()) && typeof value === "string" && value.length <= 8192) as [string, string][]);
}
export function forwardedResponseHeaders(raw: Record<string, string | string[] | number | undefined>): Record<string, string> {
  const allowed = new Set(["content-type", "content-disposition", "cache-control", "etag", "content-range", "accept-ranges", "retry-after", "content-security-policy", "x-content-type-options"]);
  // Cookies aren't needed by the native bearer client. Never forward a cookie
  // with a broad Domain supplied by a compromised studio to other studios.
  return Object.fromEntries(Object.entries(raw).filter(([key, value]) => allowed.has(key.toLowerCase()) && typeof value === "string" && value.length <= 8192) as [string, string][]);
}

import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import type { RunnerExternalHeartbeat } from "../shared/types.js";
import type { OpenBotDatabase } from "./database.js";

const DEFAULT_INTERVAL_MS = 5 * 60_000;
const MAX_URL_LENGTH = 2_048;

function privateIPv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b! >= 64 && b! <= 127) ||
    (a === 169 && b === 254) || (a === 172 && b! >= 16 && b! <= 31) || (a === 192 && b === 168) ||
    (a === 192 && (b === 0 || b === 2 || b === 88)) || (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0);
}

export function publicHeartbeatAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !privateIPv4(address);
  if (family !== 6) return false;
  const normalized = address.toLowerCase();
  if (normalized.startsWith("::ffff:")) return publicHeartbeatAddress(normalized.slice(7));
  return normalized !== "::" && normalized !== "::1" && !normalized.startsWith("fc") && !normalized.startsWith("fd") &&
    !/^fe[89ab]/.test(normalized) && !normalized.startsWith("ff") && !normalized.startsWith("2001:db8:") &&
    !normalized.startsWith("2001:db8::") && !normalized.startsWith("100:");
}

export function heartbeatURL(raw: string): URL {
  const value = raw.trim();
  if (!value || value.length > MAX_URL_LENGTH) throw new Error("Paste one HTTPS heartbeat URL.");
  let url: URL;
  try { url = new URL(value); }
  catch { throw new Error("That heartbeat address is not a valid URL."); }
  const hostname = url.hostname.toLowerCase();
  const addressHostname = hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) throw new Error("Heartbeat addresses must use public HTTPS on the standard secure port.");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal") || hostname.endsWith(".home") || hostname.endsWith(".lan")) throw new Error("Use the public HTTPS address from your heartbeat service.");
  if (isIP(addressHostname) && !publicHeartbeatAddress(addressHostname)) throw new Error("Heartbeat addresses cannot point back into a private network.");
  url.hash = "";
  return url;
}

export async function sendExternalHeartbeat(raw: string, options: {
  resolve?: (hostname: string) => Promise<Array<{ address: string; family: 4 | 6 }>>;
  timeoutMs?: number;
} = {}): Promise<void> {
  const url = heartbeatURL(raw);
  const hostname = url.hostname.startsWith("[") && url.hostname.endsWith("]") ? url.hostname.slice(1, -1) : url.hostname;
  const literalFamily = isIP(hostname);
  const addresses = literalFamily ? [{ address: hostname, family: literalFamily }] : options.resolve ? await options.resolve(hostname) : await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((item) => !publicHeartbeatAddress(item.address))) throw new Error("That heartbeat service did not resolve to a public address.");
  const target = addresses[0]!;
  await new Promise<void>((resolve, reject) => {
    const heartbeat = request(url, {
      method: "GET",
      headers: { "User-Agent": "OpenBot-private-home/1" },
      lookup: (_hostname, lookupOptions, callback) => lookupOptions.all
        ? callback(null, [target])
        : callback(null, target.address, target.family),
    }, (response) => {
      response.resume();
      const status = response.statusCode || 0;
      if (status >= 200 && status < 300) resolve();
      else reject(new Error(`The heartbeat service answered with status ${status || "unknown"}.`));
    });
    heartbeat.setTimeout(options.timeoutMs || 8_000, () => heartbeat.destroy(new Error("The heartbeat service took too long to answer.")));
    heartbeat.on("error", reject);
    heartbeat.end();
  });
}

export class RunnerExternalHeartbeatMonitor {
  private timer: NodeJS.Timeout | null = null;
  private checking = false;

  constructor(private readonly options: {
    db: OpenBotDatabase;
    canCheck?: () => boolean;
    send?: (url: string) => Promise<void>;
    now?: () => number;
    intervalMs?: number;
  }) {}

  start() {
    if (this.timer) return;
    const checkQuietly = () => void this.checkNow().catch(() => undefined);
    this.timer = setInterval(checkQuietly, this.options.intervalMs || DEFAULT_INTERVAL_MS);
    checkQuietly();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  status(): RunnerExternalHeartbeat {
    const state = this.options.db.getRunnerExternalHeartbeatState();
    return {
      configured: Boolean(state.url),
      enabled: state.enabled,
      intervalMinutes: Math.max(1, Math.round((this.options.intervalMs || DEFAULT_INTERVAL_MS) / 60_000)),
      provider: state.provider,
      lastAttemptAt: state.lastAttemptAt,
      lastSuccessAt: state.lastSuccessAt,
      lastError: state.lastError,
    };
  }

  configure(input: { enabled: boolean; url?: string | null }): RunnerExternalHeartbeat {
    const current = this.options.db.getRunnerExternalHeartbeatState();
    const parsed = input.url === undefined ? (current.url ? heartbeatURL(current.url) : null) : input.url ? heartbeatURL(input.url) : null;
    if (input.enabled && !parsed) throw new Error("Paste your private heartbeat URL before turning this on.");
    this.options.db.configureRunnerExternalHeartbeat({ enabled: input.enabled, url: parsed?.toString() || null, provider: parsed?.hostname || null });
    return this.status();
  }

  async checkNow(): Promise<RunnerExternalHeartbeat | null> {
    const state = this.options.db.getRunnerExternalHeartbeatState();
    if (this.checking || this.options.canCheck?.() === false || !state.enabled || !state.url) return null;
    this.checking = true;
    const attemptedAt = new Date(this.options.now?.() ?? Date.now()).toISOString();
    try {
      await (this.options.send || sendExternalHeartbeat)(state.url);
      this.options.db.recordRunnerExternalHeartbeat({ attemptedAt, success: true });
    } catch (error) {
      this.options.db.recordRunnerExternalHeartbeat({ attemptedAt, success: false, error: error instanceof Error ? error.message : "The heartbeat service did not accept this check-in." });
    } finally {
      this.checking = false;
    }
    return this.status();
  }
}

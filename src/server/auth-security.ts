import type { IncomingHttpHeaders } from "node:http";

// A local proxy is not a local owner. In particular, tunnels connect from
// 127.0.0.1 too. Require the socket, authority and browser origin to agree.
export function trustedLocalRequest(request: { socket: { remoteAddress?: string }; headers: IncomingHttpHeaders }): boolean {
  if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(request.socket.remoteAddress || "")) return false;
  if (Object.keys(request.headers).some((name) => /^(forwarded|x-forwarded-.*|x-openbot-relay|cf-connecting-ip|tailscale-.*)$/i.test(name))) return false;
  const authority = request.headers.host;
  if (!authority || !/^(localhost|127\.0\.0\.1|\[::1\])(?::[0-9]{1,5})?$/.test(authority)) return false;
  const origin = request.headers.origin;
  if (origin) {
    try {
      const url = new URL(origin);
      if (!["http:", "https:"].includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.origin !== origin) return false;
    } catch { return false; }
  }
  return request.headers["sec-fetch-site"] !== "cross-site";
}

export function readCookie(raw: string | undefined, key: string): string | null {
  for (const item of (raw || "").split(";")) {
    const [name, ...value] = item.trim().split("=");
    if (name === key) {
      try { return decodeURIComponent(value.join("=")); } catch { return null; }
    }
  }
  return null;
}

/** Browser writes must come from this studio, not another same-site subdomain.
 * Native clients send explicit credentials and normally have no Origin/Fetch
 * Metadata. Never infer the public origin from attacker-controlled proxy headers.
 */
export function browserWriteAllowed(request: { method: string; socket: { remoteAddress?: string }; headers: IncomingHttpHeaders }, appUrl: string): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;
  if (trustedLocalRequest(request)) return true;
  const origin = request.headers.origin;
  if (!origin) return !request.headers["sec-fetch-site"];
  try { return origin === new URL(appUrl).origin; } catch { return false; }
}

export function useSecureSessionCookie(appUrl: string, encrypted: boolean, relay: boolean): boolean {
  // HTTPS may terminate at an outbound tunnel while Express still sees HTTP.
  return encrypted || relay || new URL(appUrl).protocol === "https:";
}

type AttemptWindow = { failures: number; resetAt: number };

export class LoginAttemptGate {
  private readonly attempts = new Map<string, AttemptWindow>();

  constructor(
    private readonly maximumFailures = 8,
    private readonly windowMs = 15 * 60_000,
    private readonly maximumTrackedKeys = 4_096,
  ) {}

  check(key: string, at = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
    const record = this.attempts.get(key);
    if (!record || record.resetAt <= at) {
      if (record) this.attempts.delete(key);
      return { allowed: true, retryAfterSeconds: 0 };
    }
    if (record.failures < this.maximumFailures) return { allowed: true, retryAfterSeconds: 0 };
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((record.resetAt - at) / 1_000)) };
  }

  failed(key: string, at = Date.now()): void {
    const record = this.attempts.get(key);
    if (record && record.resetAt > at) {
      record.failures += 1;
      return;
    }
    if (record) this.attempts.delete(key);
    if (this.attempts.size >= this.maximumTrackedKeys) {
      const oldestKey = this.attempts.keys().next().value as string | undefined;
      if (oldestKey) this.attempts.delete(oldestKey);
    }
    this.attempts.set(key, { failures: 1, resetAt: at + this.windowMs });
  }

  succeeded(key: string): void {
    this.attempts.delete(key);
  }
}

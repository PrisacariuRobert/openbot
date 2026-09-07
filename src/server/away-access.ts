import { extensionFetch } from "./extension-network.js";
import { secureStudioBase } from "./relay-address.js";

export type AwayStatus = { ready: boolean; url: string | null; checkedAt: number; detail: string; transport: "https" | "builtin_relay" | null };

export function securePublicOrigin(raw: string): string | null {
  try {
    const base = secureStudioBase(raw);
    if (!base) return null;
    const url = new URL(base);
    // A LAN/VPN address is not evidence of away access.
    if (!url.hostname.includes(".") || /(?:\.local|\.internal|\.localhost)$/.test(url.hostname) || /^[\d.:\[\]]+$/.test(url.hostname)) return null;
    return base;
  } catch { return null; }
}

export class AwayAccess {
  private pending: Promise<AwayStatus> | null = null;
  constructor(private readonly configuredUrl: () => string, readonly probeIdentity: string, private readonly relayConfigured = false, private readonly fetcher?: typeof fetch) {}
  status(): Promise<AwayStatus> {
    // Coalesce UI refreshes, but never reuse an old green readiness result.
    if (this.pending) return this.pending;
    this.pending = this.inspect().finally(() => { this.pending = null; });
    return this.pending;
  }
  private async inspect(): Promise<AwayStatus> {
    const url = securePublicOrigin(this.configuredUrl());
    const transport: AwayStatus["transport"] = url ? (this.relayConfigured ? "builtin_relay" : "https") : null;
    const base = { ready: false, url, checkedAt: Date.now(), transport };
    if (!url) return { ...base, detail: "The OpenBot relay is not set up yet. Once it is online, scan a QR code to connect—no extra apps on your Mac or phone." };
    try {
      const check = (path: string) => {
        const endpoint = `${url}${path}`;
        const signal = AbortSignal.timeout(8_000);
        // Public DNS only, pinned to the HTTPS socket; no LAN DNS aliases or
        // redirect can masquerade as evidence of internet reachability.
        return (this.fetcher || extensionFetch(endpoint, false, signal))(endpoint, { redirect: "error", signal });
      };
      const [probe, guard] = await Promise.all([
        check("/api/auth/pairing-probe"),
        check("/api/auth/pairing-guard"),
      ]);
      const identity = await probe.json() as { studio?: string };
      await guard.body?.cancel();
      if (!probe.ok || identity.studio !== this.probeIdentity || guard.status !== 401) {
        return { ...base, detail: "This internet connection did not pass the studio and privacy checks. Pairing stays off until it is fixed." };
      }
      return { ...base, ready: true, checkedAt: Date.now(), detail: "Secure address and access protection checked. Scan with OpenBot on your iPhone; no extra networking app is needed." };
    } catch { return { ...base, detail: "The secure address is not answering yet. Keep this Mac online and check again." }; }
  }
}

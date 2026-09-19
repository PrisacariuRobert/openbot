import { spawnSync } from "node:child_process";
import { safeHostEnvironment } from "./runtime.js";

/** Gate 1a: pin the verified OpenCode runtime. The runtime version is part of
 * the security boundary, so an unverified version fails closed for model
 * execution without disabling the rest of OpenBot.
 *
 * Verified 1.18.31 (2026-09-19) against the 1.18.30 baseline: upstream
 * changelog is ACP session-option restore, TUI auth-error display, Copilot
 * thinking summarization, console batch endpoints and a gateway dep bump —
 * no permission-model, tool-dispatch, agent-allowlist, MCP-config or CLI
 * flag-surface change affecting OpenBot's boundary. `opencode run` flags
 * OpenBot uses (--auto, --format, --model, --dir, --agent, --file,
 * --session, --title) verified present on the installed 1.18.31 binary,
 * plus a live routine run on this host. */
export const VERIFIED_OPENCODE_VERSION = "1.18.31";

export interface RuntimeCompatibility {
  runtime: "opencode";
  detectedVersion: string | null;
  compatibility: "verified" | "unsupported" | "unknown";
}

export const RUNTIME_INCOMPATIBLE_MESSAGE =
  "OpenCode runtime not verified. OpenBot detected an unsupported OpenCode version; this release is verified with 1.18.31. Teammate execution is paused because runtime permission behavior may have changed. Update OpenBot or use the supported runtime. Files, results, settings and receipts remain available.";

let cached: RuntimeCompatibility | null = null;

export function opencodeCompatibility(options: { refresh?: boolean; probe?: () => string | null } = {}): RuntimeCompatibility {
  if (cached && !options.refresh) return cached;
  // A declared version (set by controlled fixtures) is still validated against
  // the verified version — this is not a bypass.
  const declared = (process.env.OPENBOT_OPENCODE_VERSION || "").trim();
  if (declared) {
    cached = { runtime: "opencode", detectedVersion: declared, compatibility: declared === VERIFIED_OPENCODE_VERSION ? "verified" : "unsupported" };
    return cached;
  }
  const readVersion = options.probe || (() => {
    // Never depend on the ambient PATH: GUI/daemon launches often sanitize it
    // down to /usr/bin:/bin, which hides the user's runtime installs and would
    // wedge every task on a healthy host.
    const result = spawnSync("opencode", ["--version"], { encoding: "utf8", timeout: 10_000, env: safeHostEnvironment() });
    return `${result.stdout || ""}`.trim().split(/\s+/).filter(Boolean).pop() || null;
  });
  let version: string | null = null;
  try {
    version = readVersion();
  } catch {
    version = null;
  }
  const next: RuntimeCompatibility = version
    ? { runtime: "opencode", detectedVersion: version, compatibility: version === VERIFIED_OPENCODE_VERSION ? "verified" : "unsupported" }
    : { runtime: "opencode", detectedVersion: null, compatibility: "unknown" };
  // A transient probe failure must not wedge the host: only definitive
  // verdicts are cached, so the next task re-probes instead of failing
  // forever on one bad reading.
  cached = next.compatibility === "unknown" ? null : next;
  return next;
}

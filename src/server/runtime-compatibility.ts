import { spawnSync } from "node:child_process";

/** Gate 1a: pin the verified OpenCode runtime. The runtime version is part of
 * the security boundary, so an unverified version fails closed for model
 * execution without disabling the rest of OpenBot. */
export const VERIFIED_OPENCODE_VERSION = "1.18.30";

export interface RuntimeCompatibility {
  runtime: "opencode";
  detectedVersion: string | null;
  compatibility: "verified" | "unsupported" | "unknown";
}

export const RUNTIME_INCOMPATIBLE_MESSAGE =
  "OpenCode runtime not verified. OpenBot detected an unsupported OpenCode version; this release is verified with 1.18.30. Teammate execution is paused because runtime permission behavior may have changed. Update OpenBot or use the supported runtime. Files, results, settings and receipts remain available.";

let cached: RuntimeCompatibility | null = null;

export function opencodeCompatibility(options: { refresh?: boolean } = {}): RuntimeCompatibility {
  if (cached && !options.refresh) return cached;
  // A declared version (set by controlled fixtures) is still validated against
  // the verified version — this is not a bypass.
  const declared = (process.env.OPENBOT_OPENCODE_VERSION || "").trim();
  if (declared) {
    cached = { runtime: "opencode", detectedVersion: declared, compatibility: declared === VERIFIED_OPENCODE_VERSION ? "verified" : "unsupported" };
    return cached;
  }
  try {
    const result = spawnSync("opencode", ["--version"], { encoding: "utf8", timeout: 10_000 });
    const text = `${result.stdout || ""}`.trim();
    const version = text.split(/\s+/).filter(Boolean).pop() || null;
    cached = version
      ? { runtime: "opencode", detectedVersion: version, compatibility: version === VERIFIED_OPENCODE_VERSION ? "verified" : "unsupported" }
      : { runtime: "opencode", detectedVersion: null, compatibility: "unknown" };
  } catch {
    cached = { runtime: "opencode", detectedVersion: null, compatibility: "unknown" };
  }
  return cached;
}

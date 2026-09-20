/**
 * J01 — Optional Jev/fast-policy experiment guard.
 *
 * Backend-only. Priority P2. Default off, feature-flagged, advisory only.
 * Core product runs when Jev is disabled/unavailable/unconfigured. No
 * silent Python/browser stack install, session migration, API key use, or
 * Muse replacement. OTP/token exposure must be reproduced + fixed before
 * any model upload. 90-run three-arm experiment only within a fresh
 * owner-authorized spend/live-data contract.
 */

export type JevConfig = {
  enabled: boolean;
  provider: string | null;
  dataDestinations: string[];
};

export function jevAllowed(config: JevConfig): boolean {
  if (!config.enabled) return false;
  if (!config.provider) return false;
  return true;
}

/** Unsupported Jev surfaces fall back to general drivers, never silent
 * failure or denial bypass. */
export const JEV_UNSUPPORTED_FALLBACK = ["canvas", "frames", "uploads", "nested-scrolling"] as const;

export function jevSurfaceCovered(surface: string): boolean {
  return !(JEV_UNSUPPORTED_FALLBACK as readonly string[]).includes(surface);
}

export type ExperimentArm = "A-current" | "B-optimized" | "C-jev";

export function experimentArms(): ExperimentArm[] {
  return ["A-current", "B-optimized", "C-jev"];
}

/** Promotion threshold (proposed, owner-frozen before evaluation):
 * 25% lower median automated time, no correctness/coverage loss, stable
 * tails, no new trust violations. Small samples never establish equivalence. */
export function jevPromotable(input: {
  medianAutomatedMsA: number;
  medianAutomatedMsC: number;
  correctnessC: number;
  correctnessA: number;
  trustViolationsC: number;
}): boolean {
  if (input.trustViolationsC > 0) return false;
  if (input.correctnessC < input.correctnessA) return false;
  if (input.medianAutomatedMsA <= 0) return false;
  const improvement = (input.medianAutomatedMsA - input.medianAutomatedMsC) / input.medianAutomatedMsA;
  return improvement >= 0.25;
}

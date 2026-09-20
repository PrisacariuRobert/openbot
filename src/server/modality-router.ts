/**
 * B06 — Automatic modality routing and bounded recovery.
 *
 * Backend-only. No Codex UI/client changes.
 * Capability router behind existing tools: picks semantic or visual (or
 * native when separately granted) without discarding task/browser/account/
 * identity/pending review. Perception failures may fallback; denials,
 * takeover, secure sign-in, cancellation and uncertain mutations may not.
 */

export type Modality = "semantic" | "visual" | "native";

export type RouteReason =
  | "SEMANTIC_GROUNDED"
  | "CANVAS_OPAQUE"
  | "AMBIGUOUS_TARGET"
  | "STALE_OBSERVATION"
  | "VISION_UNAVAILABLE"
  | "UNSUPPORTED_WIDGET"
  | "SENSITIVE_REGION"
  | "NEEDS_SIGN_IN"
  | "USER_TAKEOVER"
  | "PERMISSION_DENIED"
  | "OUTCOME_UNCERTAIN"
  | "BUDGET_REACHED";

export type SurfaceHint = {
  canvasPrimary: boolean;
  semanticCount: number;
  opaqueWidgets: number;
  visualCapability: "visual-supported" | "text-only";
  nativeGranted: boolean;
};

export function selectModality(hint: SurfaceHint): { modality: Modality; reason: RouteReason } {
  if (hint.canvasPrimary || (hint.semanticCount === 0 && hint.opaqueWidgets > 0)) {
    if (hint.visualCapability !== "visual-supported") {
      // Honest handoff, not a guessed coordinate.
      return { modality: "semantic", reason: "VISION_UNAVAILABLE" };
    }
    return { modality: "visual", reason: "CANVAS_OPAQUE" };
  }
  if (hint.semanticCount > 0) return { modality: "semantic", reason: "SEMANTIC_GROUNDED" };
  if (hint.visualCapability === "visual-supported") return { modality: "visual", reason: "AMBIGUOUS_TARGET" };
  return { modality: "semantic", reason: "VISION_UNAVAILABLE" };
}

/** Only capability/perception failures are eligible for modality fallback.
 * Access denial, user stop and uncertain side effects are not. */
const FALLBACK_ELIGIBLE: RouteReason[] = ["AMBIGUOUS_TARGET", "STALE_OBSERVATION", "UNSUPPORTED_WIDGET"];

export function fallbackEligible(reason: RouteReason): boolean {
  return FALLBACK_ELIGIBLE.includes(reason);
}

export function deniedNeverFallback(reason: RouteReason): boolean {
  return ["PERMISSION_DENIED", "USER_TAKEOVER", "NEEDS_SIGN_IN", "OUTCOME_UNCERTAIN", "SENSITIVE_REGION", "BUDGET_REACHED"].includes(reason);
}

// ---------------------------------------------------------------------------
// Bounded recovery: progress predicates + repeated-equivalent-failure repair.
// Defaults are configuration, not hidden infinite retries. Starting caps:
// two repair attempts for the same unchanged subgoal, then a clear blocker.
// ---------------------------------------------------------------------------

export type ProgressTracker = {
  subgoal: string;
  attempts: number;
  lastObservationHash: string | null;
  equivalentRepeats: number;
};

export const MAX_REPAIR_ATTEMPTS = 2;

export function trackProgress(
  tracker: ProgressTracker,
  observationHash: string,
): { tracker: ProgressTracker; blocked: boolean; action: "continue" | "repair" | "block" } {
  const equivalent = tracker.lastObservationHash === observationHash;
  const equivalentRepeats = equivalent ? tracker.equivalentRepeats + 1 : 0;
  const attempts = tracker.attempts + 1;
  const next: ProgressTracker = { ...tracker, attempts, lastObservationHash: observationHash, equivalentRepeats };
  if (equivalentRepeats >= MAX_REPAIR_ATTEMPTS) {
    return { tracker: next, blocked: true, action: "block" };
  }
  if (equivalent) {
    return { tracker: next, blocked: false, action: "repair" };
  }
  return { tracker: next, blocked: false, action: "continue" };
}

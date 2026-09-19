/**
 * B02 — General semantic browser driver: host-issued observed targets.
 *
 * Backend-only. No Codex UI/client changes.
 * Never dispatches a bare model CSS selector: the model proposes an
 * opaque host-owned target ID bound to observation/document/frame epoch.
 * Re-resolution is conservative; decoys/replaced nodes never receive the
 * action; closed/opaque surfaces signal visual eligibility.
 */

import { createHash } from "node:crypto";

export type SemanticTarget = {
  targetId: string;
  observationId: string;
  documentEpoch: string;
  framePath: string;
  role: string;
  label: string;
  bounds: { x: number; y: number; width: number; height: number } | null;
  selectorHint: string | null;
  fingerprint: string;
  createdAt: string;
};

export type ReresolveResult =
  | { ok: true; target: SemanticTarget }
  | { ok: false; reason: "STALE_OBSERVATION" | "AMBIGUOUS_TARGET" | "UNSUPPORTED_WIDGET" | "TARGET_DESTROYED" };

const targets = new Map<string, SemanticTarget>();

export function issueSemanticTarget(input: Omit<SemanticTarget, "targetId" | "fingerprint" | "createdAt">): SemanticTarget {
  const fingerprint = createHash("sha256")
    .update(JSON.stringify([input.observationId, input.documentEpoch, input.framePath, input.role, input.label, input.bounds]))
    .digest("hex")
    .slice(0, 32);
  const targetId = `tgt_${fingerprint.slice(0, 16)}`;
  const record: SemanticTarget = { ...input, targetId, fingerprint, createdAt: new Date().toISOString() };
  targets.set(targetId, record);
  return record;
}

export function getSemanticTarget(targetId: string): SemanticTarget | null {
  return targets.get(targetId) ?? null;
}

/**
 * Conservative re-resolution: the target must still resolve uniquely in the
 * current document/frame epoch with matching role/label. A rerendered node
 * with the same label but a different document epoch is STALE, not proof of
 * the same semantic action. Same-named controls remain distinguishable via
 * framePath + bounds.
 */
export function reresolveSemanticTarget(
  targetId: string,
  current: { observationId: string; documentEpoch: string; framePath: string; candidates: Array<{ role: string; label: string }> },
): ReresolveResult {
  const issued = targets.get(targetId);
  if (!issued) return { ok: false, reason: "TARGET_DESTROYED" };
  if (issued.documentEpoch !== current.documentEpoch || issued.framePath !== current.framePath) {
    return { ok: false, reason: "STALE_OBSERVATION" };
  }
  const matches = current.candidates.filter((candidate) => candidate.role === issued.role && candidate.label === issued.label);
  if (matches.length === 0) return { ok: false, reason: "TARGET_DESTROYED" };
  if (matches.length > 1) return { ok: false, reason: "AMBIGUOUS_TARGET" };
  return { ok: true, target: issued };
}

export function clearSemanticTargetsForTests(): void {
  targets.clear();
}

/** Frame-tree scoping: owned frame discovery with origin binding. Closed
 * roots are never force-opened; they signal visual eligibility. */
export type FrameNode = {
  framePath: string;
  origin: string;
  owned: boolean;
  openShadowRoots: number;
  closedRoots: number;
};

export function frameEligibleForAction(frame: FrameNode): { eligible: true } | { eligible: false; reason: "CROSS_ORIGIN_UNOWNED" | "CLOSED_ROOT_VISUAL_ONLY" } {
  if (!frame.owned) return { eligible: false, reason: "CROSS_ORIGIN_UNOWNED" };
  if (frame.closedRoots > 0) return { eligible: false, reason: "CLOSED_ROOT_VISUAL_ONLY" };
  return { eligible: true };
}

/** Region-specific scroll target: the correct scroll pane, bounded. */
export function scrollRegionForTarget(input: { framePath: string; paneId: string | null; deltaY: number }): { pane: string; boundedDelta: number } {
  const boundedDelta = Math.max(-3000, Math.min(3000, input.deltaY));
  return { pane: input.paneId ?? `${input.framePath}::main`, boundedDelta };
}

/**
 * R02 — One durable action journal and input owner.
 *
 * Backend-only. No Codex UI/client changes.
 * Reuses existing approved_actions / approvals tables and external-effect
 * reconciliation; adds a renderer-independent journal + exclusive leases so
 * DOM, visual and native actions obey the same authority.
 *
 * Conceptual stages map to existing enums:
 *   proposed → validated → awaiting_review → admitted → dispatch_started
 *   → effect_observed → verified
 *   → failed_before_effect | outcome_uncertain → reconcile/read back
 *
 * No exactly-once promise to third-party UIs: a crash after dispatch is
 * uncertain and must reconcile via allowed read, never blind retry.
 */

export type ActionStage =
  | "proposed"
  | "validated"
  | "awaiting_review"
  | "admitted"
  | "dispatch_started"
  | "effect_observed"
  | "verified"
  | "failed_before_effect"
  | "outcome_uncertain";

export type ActionSurface = "browser-dom" | "browser-visual" | "native" | "takeover";

export type JournaledAction = {
  actionId: string;
  runId: string;
  botId: string;
  surface: ActionSurface;
  stage: ActionStage;
  /** Host-owned surface identity: tab/document/window/frame epoch, never a model label. */
  surfaceIdentity: string;
  ownershipEpoch: string;
  /** Final payload hash + review digest bound at admission. */
  payloadDigest: string;
  reviewDigest: string | null;
  target: string;
  createdAt: string;
  updatedAt: string;
  detail: string | null;
};

/** In-memory journal index; durable rows live in extension_records so no
 * migration is required. The authoritative executor consults this before
 * every dispatch; restarts reconcile via listUncertain(). */
const journal = new Map<string, JournaledAction>();

export function journalPropose(input: Omit<JournaledAction, "stage" | "createdAt" | "updatedAt" | "detail"> & { detail?: string | null }): JournaledAction {
  const at = new Date().toISOString();
  const existing = journal.get(input.actionId);
  if (existing) return existing;
  const record: JournaledAction = {
    ...input,
    stage: "proposed",
    createdAt: at,
    updatedAt: at,
    detail: input.detail ?? null,
  };
  journal.set(input.actionId, record);
  return record;
}

export function journalTransition(actionId: string, stage: ActionStage, detail: string | null = null): JournaledAction | null {
  const record = journal.get(actionId);
  if (!record) return null;
  // Terminal states never regress; uncertain never auto-retries.
  if (record.stage === "verified" || record.stage === "failed_before_effect") return record;
  const updated: JournaledAction = { ...record, stage, updatedAt: new Date().toISOString(), detail: detail ?? record.detail };
  journal.set(actionId, updated);
  return updated;
}

export function journalGet(actionId: string): JournaledAction | null {
  return journal.get(actionId) ?? null;
}

/** Double invocation / renderer switching guard: same admitted mutation
 * cannot dispatch a second version. */
export function admitOnce(actionId: string): boolean {
  const record = journal.get(actionId);
  if (!record) return false;
  if (record.stage === "admitted" || record.stage === "dispatch_started" || record.stage === "effect_observed" || record.stage === "verified") {
    return false;
  }
  journalTransition(actionId, "admitted");
  return true;
}

export function listUncertain(): JournaledAction[] {
  return [...journal.values()].filter((record) => record.stage === "outcome_uncertain" || record.stage === "dispatch_started");
}

export function clearJournalForTests(): void {
  journal.clear();
}

// ---------------------------------------------------------------------------
// Input leases: one exclusive owner for the physical desktop; per-target
// locks for owned browser targets. Cancellation/takeover revokes immediately.
// ---------------------------------------------------------------------------

type LeaseOwner = { runId: string; botId: string; surface: ActionSurface; target: string; acquiredAt: number };

const DESKTOP_LEASE_MS = 30_000;
let desktopLease: LeaseOwner | null = null;
const targetLocks = new Map<string, LeaseOwner>();

export function acquireDesktopLease(runId: string, botId: string, surface: ActionSurface, target: string, now = Date.now()): boolean {
  if (desktopLease && now - desktopLease.acquiredAt < DESKTOP_LEASE_MS) {
    // Same run may re-enter; concurrent teammates cannot share the desktop.
    if (desktopLease.runId === runId && desktopLease.botId === botId) return true;
    return false;
  }
  desktopLease = { runId, botId, surface, target, acquiredAt: now };
  return true;
}

export function releaseDesktopLease(runId: string): void {
  if (desktopLease?.runId === runId) desktopLease = null;
}

/** Revoke all leases on Stop / takeover / sign-in change. Releases held
 * keys/buttons via caller; queued proposals must re-acquire. */
export function revokeAllLeases(): { desktop: boolean; targets: number } {
  const hadDesktop = desktopLease !== null;
  desktopLease = null;
  const targets = targetLocks.size;
  targetLocks.clear();
  return { desktop: hadDesktop, targets };
}

export function acquireTargetLock(targetKey: string, runId: string, botId: string, surface: ActionSurface, now = Date.now()): boolean {
  const existing = targetLocks.get(targetKey);
  if (existing && existing.runId !== runId) {
    // Stale locks (older than desktop lease window) can be superseded.
    if (now - existing.acquiredAt < DESKTOP_LEASE_MS) return false;
  }
  targetLocks.set(targetKey, { runId, botId, surface, target: targetKey, acquiredAt: now });
  return true;
}

export function releaseTargetLock(targetKey: string, runId: string): void {
  if (targetLocks.get(targetKey)?.runId === runId) targetLocks.delete(targetKey);
}

export function clearLeasesForTests(): void {
  desktopLease = null;
  targetLocks.clear();
}

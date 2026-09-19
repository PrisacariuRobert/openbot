/**
 * R02 — One durable action journal and input owner.
 *
 * Backend-only. No Codex UI/client changes.
 * Durability lives in the existing OpenBotDatabase (action_journal table,
 * same conditional-update discipline as approved_actions): a process
 * restart, a second process, or a renderer switch cannot fork or re-admit
 * the same mutation. The in-memory Map is gone — journalPropose on a fresh
 * handle after restart loads the stored row instead of minting new state.
 *
 * Conceptual stages map to existing enums:
 *   proposed → validated → awaiting_review → admitted → dispatch_started
 *   → effect_observed → verified
 *   → failed_before_effect | outcome_uncertain → reconcile/read back
 *
 * outcome_uncertain is terminal: leaving it requires journalReconcile with
 * owner-checked evidence, which marks verified-after-readback or failed —
 * never re-admittable. No exactly-once promise to third-party UIs: a crash
 * after dispatch reconciles via allowed read, never blind retry.
 */
import type { OpenBotDatabase, ActionJournalRecord } from "./database.js";

export type ActionStage = ActionJournalRecord["stage"];
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
  account: string;
  mutationKey: string | null;
  createdAt: string;
  updatedAt: string;
  detail: string | null;
};

function toJournaled(record: ActionJournalRecord): JournaledAction {
  return {
    actionId: record.actionId,
    runId: record.runId,
    botId: record.botId,
    surface: record.surface as ActionSurface,
    stage: record.stage,
    surfaceIdentity: record.surfaceIdentity,
    ownershipEpoch: record.ownershipEpoch,
    payloadDigest: record.payloadDigest,
    reviewDigest: record.reviewDigest,
    target: record.target,
    account: record.account,
    mutationKey: record.mutationKey,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    detail: record.detail,
  };
}

export function journalPropose(
  db: OpenBotDatabase,
  input: Omit<JournaledAction, "stage" | "createdAt" | "updatedAt" | "detail" | "account" | "mutationKey"> & { detail?: string | null; account?: string; mutationKey?: string | null },
): JournaledAction {
  const record = db.journalActionPropose({
    actionId: input.actionId,
    runId: input.runId,
    botId: input.botId,
    surface: input.surface,
    surfaceIdentity: input.surfaceIdentity,
    ownershipEpoch: input.ownershipEpoch,
    target: input.target,
    payloadDigest: input.payloadDigest,
    reviewDigest: input.reviewDigest,
    account: input.account,
    mutationKey: input.mutationKey,
    detail: input.detail,
  });
  return toJournaled(record);
}

export function journalTransition(
  db: OpenBotDatabase,
  actionId: string,
  stage: ActionStage,
  detail: string | null = null,
): JournaledAction | null {
  const record = db.journalActionTransition(actionId, stage, detail);
  return record ? toJournaled(record) : null;
}

/** Reconcile an uncertain effect with owner-checked evidence. Never
 * re-admits: verified-after-readback needs no re-dispatch, and a confirmed
 * miss is failed — still-needed work takes a new action identity. */
export function journalReconcile(
  db: OpenBotDatabase,
  actionId: string,
  outcome: "verified" | "failed_before_effect",
  evidence: string,
): JournaledAction | null {
  const record = db.journalActionReconcile(actionId, outcome, evidence);
  return record ? toJournaled(record) : null;
}

export function journalGet(db: OpenBotDatabase, actionId: string): JournaledAction | null {
  const record = db.journalActionGet(actionId);
  return record ? toJournaled(record) : null;
}

/** Double invocation / renderer switching guard: same admitted mutation
 * cannot dispatch a second version, and uncertain/terminal actions can
 * never become admittable again. */
export function admitOnce(db: OpenBotDatabase, actionId: string): boolean {
  return db.journalActionAdmit(actionId);
}

export function listUncertain(db: OpenBotDatabase): JournaledAction[] {
  return db.listUncertainJournalActions().map(toJournaled);
}

// ---------------------------------------------------------------------------
// Input leases: one exclusive owner for the physical desktop; per-target
// locks for owned browser targets. Cancellation/takeover revocation across
// adapters. Leases are liveness (process-local by design): a restart clears
// them, which is fail-closed because dispatch_started acts recover as
// uncertain and every new dispatch must re-acquire.
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

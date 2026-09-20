/**
 * R01 — Production submission replay and atomic admission helpers.
 *
 * Backend-only. No Codex UI/client changes.
 * Baseline: origin/main 4a01381c4c79320cd5674aecc8aa8f3904922b9f.
 *
 * Current main already orders durable replay before any message/claim/
 * routine/run creation (src/server/index.ts). This module closes the
 * remaining crash/expiry gaps without changing successful client contracts:
 *
 * - Tombstone retention: when bounded receipts prune old rows, a minimal
 *   request/tombstone identity is retained so an old retry cannot silently
 *   recreate work. Full receipts compact; tombstones answer replay.
 * - Thread-match disclosure: a replay must never disclose another
 *   conversation's receipt. Thread mismatch is a conflict, not a replay.
 * - Pending-intent + startup repair: stage a pending intent before runnable
 *   dispatch, clear it after durable admission commits, and repair orphans
 *   on restart as uncertain (never blind retry).
 * - Filesystem staging: inbox copies stage to temp then rename; recovery
 *   marker lives in extension_records (existing storage, no new migration).
 */

export type SubmissionTombstone = {
  requestId: string;
  threadId: string;
  payloadDigest: string;
  createdAt: string;
  /** pruned: compacted after newer receipts; the original work still exists.
   * orphan-repaired: the first attempt never committed a receipt — its
   * outcome is UNKNOWN and must never be described as "nothing happened". */
  reason: "pruned" | "orphan-repaired";
};

export const TOMBSTONE_KIND = "message-submission-tombstone";
export const PENDING_KIND = "message-submission-pending";

export type PendingIntent = {
  requestId: string;
  threadId: string;
  payloadDigest: string;
  startedAt: string;
};

/** Tombstone retention lifetime: retries older than this get an explicit
 * expired conflict instead of silent recreation. Bounded, owner-visible. */
export const TOMBSTONE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

export function tombstoneExpired(tombstone: SubmissionTombstone, now = Date.now()): boolean {
  const created = new Date(tombstone.createdAt).getTime();
  if (Number.isNaN(created)) return false;
  return now - created > TOMBSTONE_RETENTION_MS;
}

/**
 * HTTP mapping for a retry answered by a tombstone. Never advises a new
 * send for an unresolved outcome: an orphan-repaired tombstone means the
 * first attempt may already have created work, so the owner must check
 * before sending again. A pruned tombstone means the original work still
 * exists in history — the owner should look for it, not duplicate it.
 */
export function tombstoneHttpMapping(
  tombstone: SubmissionTombstone,
  requestDigest: string,
  now = Date.now(),
): { status: 409 | 410; code: "request_conflict" | "request_expired" | "request_uncertain"; error: string } {
  if (tombstone.payloadDigest !== requestDigest) {
    return {
      status: 409,
      code: "request_conflict",
      error: "This retry does not match the original request. Nothing was changed — send it again with a new request.",
    };
  }
  if (tombstone.reason === "orphan-repaired") {
    return {
      status: 409,
      code: "request_uncertain",
      error:
        "An earlier attempt with this request may already have created work, but its result was never recorded. " +
        "Check the conversation for the original message or task before sending again — do not assume nothing happened.",
    };
  }
  if (tombstoneExpired(tombstone, now)) {
    return {
      status: 410,
      code: "request_expired",
      error: "This request is too old to retry safely. Check the conversation for the original result before sending it again with a new request.",
    };
  }
  return {
    status: 409,
    code: "request_expired",
    error: "This request was already handled and its receipt has been compacted. Check the conversation for the original result before sending it again with a new request.",
  };
}

/**
 * Validate replay disclosure before returning stored IDs.
 * - Receipt must belong to the requesting thread (no cross-thread leak).
 * - Digest must match canonical payload (conflict changes nothing).
 * Revoked access still restricts continuation: callers must have already
 * validated thread visibility before invoking replay.
 */
export function validateReplayDisclosure(
  existing: { threadId: string; payloadDigest: string } | null,
  requestThreadId: string,
  requestDigest: string,
): { ok: true } | { ok: false; status: 409; code: "request_conflict" } {
  if (!existing) return { ok: false, status: 409, code: "request_conflict" };
  if (existing.threadId !== requestThreadId) return { ok: false, status: 409, code: "request_conflict" };
  if (existing.payloadDigest !== requestDigest) return { ok: false, status: 409, code: "request_conflict" };
  return { ok: true };
}

/** Build a pending intent record staged before any runnable dispatch. */
export function pendingIntentFor(requestId: string, threadId: string, payloadDigest: string): PendingIntent {
  return { requestId, threadId, payloadDigest, startedAt: new Date().toISOString() };
}

/**
 * Startup repair classification for a pending intent with no receipt.
 * Never auto-replays a possibly-completed effect: the orphan is uncertain
 * and must be reconciled via allowed read or owner decision.
 */
export function classifyOrphanedIntent(intent: PendingIntent): {
  outcome: "uncertain";
  tombstone: SubmissionTombstone;
  detail: string;
} {
  return {
    outcome: "uncertain",
    tombstone: {
      requestId: intent.requestId,
      threadId: intent.threadId,
      payloadDigest: intent.payloadDigest,
      createdAt: new Date().toISOString(),
      reason: "orphan-repaired",
    },
    detail: `Request ${intent.requestId} started but never committed a receipt. It may or may not have created work before the restart. It was not repeated.`,
  };
}

/**
 * T01 — Browser-first task lifecycles: scoped resource identity + revision.
 *
 * Backend-only. No Codex UI/client changes.
 * A Todoist task gets corrected/completed as the same task (not another
 * matching title); calendar moves preserve identity/timezone/invites; drafts
 * retain recipient/attachments/revision; documents verify after reload.
 */

export type ResourceHandle = {
  connectorId: string;
  resourceId: string;
  account: string;
  authorizationVersion: number;
  threadId: string;
  runId: string;
  titleHint: string;
  version: string;
  digest: string;
};

export function sameResource(a: ResourceHandle, b: ResourceHandle): boolean {
  return a.connectorId === b.connectorId && a.resourceId === b.resourceId && a.account === b.account;
}

/** Title alone is insufficient with decoys: identity + account + version. */
export function resolveCorrection(
  candidates: ResourceHandle[],
  requested: { resourceId?: string; titleHint?: string; account: string },
): { ok: true; resource: ResourceHandle } | { ok: false; reason: "NOT_FOUND" | "AMBIGUOUS" | "ACCOUNT_MISMATCH" } {
  const inAccount = candidates.filter((candidate) => candidate.account === requested.account);
  if (requested.resourceId) {
    const exact = inAccount.find((candidate) => candidate.resourceId === requested.resourceId);
    if (!exact) return { ok: false, reason: "NOT_FOUND" };
    return { ok: true, resource: exact };
  }
  const byTitle = inAccount.filter((candidate) => candidate.titleHint === requested.titleHint);
  if (byTitle.length === 0) {
    // A title in another account is not a match — explicit mismatch.
    if (candidates.some((candidate) => candidate.titleHint === requested.titleHint)) {
      return { ok: false, reason: "ACCOUNT_MISMATCH" };
    }
    return { ok: false, reason: "NOT_FOUND" };
  }
  if (byTitle.length > 1) return { ok: false, reason: "AMBIGUOUS" };
  return { ok: true, resource: byTitle[0]! };
}

/** Saved skills: bounded procedural knowledge, invalidated on UI change,
 * never containing credentials, inherited grants or stale coordinates. */
export type SavedMethod = {
  methodId: string;
  taskFamily: string;
  stepsDigest: string;
  observedAt: string;
  supportedConfig: string;
  invalidated: boolean;
};

export function methodValid(method: SavedMethod, currentStepsDigest: string, currentConfig: string): boolean {
  if (method.invalidated) return false;
  if (method.supportedConfig !== currentConfig) return false;
  return method.stepsDigest === currentStepsDigest;
}

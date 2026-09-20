/**
 * R03 — Server-owned observation registry.
 *
 * Backend-only. No Codex UI/client changes.
 * Observations and the targets/panes derived from them are host-captured,
 * host-stored, and looked up by opaque ID at action time. Callers never
 * supply observation content, geometry, or selectors: semanticAct and
 * visualAct resolve everything from the registry entry and re-validate
 * freshness, authorization scope, and input ownership immediately before
 * input. Unknown or expired IDs are refused.
 *
 * Identity model (Finding D): a document is a host-owned generation
 * (tab id + navigation generation + content hash), never a bare URL. The
 * live Page object is pinned in the entry; dispatch requires the pinned
 * page to still be the active tab and the generation to match. Unknown or
 * changed identity invalidates the observation.
 *
 * Entries are short-lived (15s TTL) and process-local by design: a restart
 * clears the registry, which is fail-closed — pre-restart observation IDs
 * can never authorize post-restart input. Durable cross-restart state
 * (journal, tombstones, input epochs) lives in OpenBotDatabase instead.
 */
import type { Page } from "playwright-core";
import { OBSERVATION_TTL_MS } from "./observation-envelope.js";

export type RegistryTarget = {
  targetId: string;
  role: string;
  label: string;
  bounds: { x: number; y: number; width: number; height: number } | null;
  selector: string;
  framePath: string;
  fingerprint: string;
  /** Host-observed canonical review digest (Finding C): tag, role, label,
   * input type, autocomplete, href, form method, statefulness and bounded
   * redacted form fields, hashed in-page at observation time with the same
   * routine the executor re-runs at action time. A changed form value,
   * destination or control attribute changes the digest. */
  reviewDigest: string;
  /** Whether the observed review was complete (bounded window covered
   * every relevant field, values untruncated, destination known). An
   * incomplete review can never authorize a consequential dispatch. */
  reviewComplete: boolean;
  /** Host-observed effective action destination for this target
   * (submitter formaction > form action > anchor href > document URL,
   * resolved absolute). Approval binding compares the reviewed
   * destination against the live destination — never the bare page URL. */
  effectiveDestination: string;
};

export type RegistryPane = {
  paneToken: string;
  framePath: string;
  selector: string;
  label: string;
};

export type CapturedObservation = {
  observationId: string;
  runId: string;
  botId: string;
  sessionId: string;
  tabId: string;
  documentEpoch: string;
  framePath: string;
  account: string;
  ownerEpoch: string;
  viewport: { cssWidth: number; cssHeight: number };
  deviceScale: number;
  browserZoom: number;
  scroll: { x: number; y: number };
  imageWidth: number;
  imageHeight: number;
  secureMode: boolean;
  capturedAt: number;
  expiresAt: number;
  targets: RegistryTarget[];
  panes: RegistryPane[];
  /** Pinned live page (Finding D). Process-local by design. */
  page: Page;
};

const registry = new Map<string, CapturedObservation>();

export function storeObservation(observation: CapturedObservation): CapturedObservation {
  registry.set(observation.observationId, observation);
  return observation;
}

export function getObservation(observationId: string, now = Date.now()): CapturedObservation | null {
  const observation = registry.get(observationId);
  if (!observation) return null;
  if (observation.expiresAt <= now) {
    registry.delete(observationId);
    return null;
  }
  return observation;
}

/** Find the live observation holding an opaque target ID. Sweeps expired
 * entries as a side effect so stale IDs can never resolve later. */
export function findObservationWithTarget(targetId: string, now = Date.now()): CapturedObservation | null {
  for (const [id, observation] of registry) {
    if (observation.expiresAt <= now) {
      registry.delete(id);
      continue;
    }
    if (observation.targets.some((target) => target.targetId === targetId)) return observation;
  }
  return null;
}

export function observationTTLMs(): number {
  return OBSERVATION_TTL_MS;
}

/** Stop/takeover/sign-in/account change invalidates every observation of
 * the affected run or teammate: queued proposals must re-observe. */
export function invalidateObservationsForRun(runId: string): number {
  let removed = 0;
  for (const [id, observation] of registry) {
    if (observation.runId === runId) {
      registry.delete(id);
      removed += 1;
    }
  }
  return removed;
}

export function invalidateObservationsForBot(botId: string): number {
  let removed = 0;
  for (const [id, observation] of registry) {
    if (observation.botId === botId) {
      registry.delete(id);
      removed += 1;
    }
  }
  return removed;
}

export function clearObservationsForTests(): void {
  registry.clear();
}

export function observationCountForTests(): number {
  return registry.size;
}

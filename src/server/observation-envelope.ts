/**
 * B01 — Scoped observation envelope + privacy gating.
 *
 * Backend-only. No Codex UI/client changes.
 * Maps to current BrowserManager.snapshot/screenshot/describeTarget without
 * creating a second observation database.
 */

export type ObservationSurface = "browser-dom" | "browser-visual" | "native-ax" | "isolated-desktop";

export type ObservationEnvelope = {
  observationId: string;
  capturedAt: string;
  expiresAt: string;
  botId: string;
  runId: string;
  sessionId: string;
  ownerEpoch: string;
  surface: ObservationSurface;
  tabId: string | null;
  documentEpoch: string | null;
  framePath: string | null;
  windowId: string | null;
  appId: string | null;
  displayId: string | null;
  focusEpoch: string | null;
  accountIdentity: { known: boolean; label: string | null; evidence: string | null };
  viewport: { cssWidth: number; cssHeight: number; deviceScale: number; browserZoom: number; scrollX: number; scrollY: number } | null;
  imageTransform: {
    capturedWidth: number;
    capturedHeight: number;
    cropX: number;
    cropY: number;
    cropWidth: number;
    cropHeight: number;
    scale: number;
  } | null;
  controlCount: number;
  truncated: boolean;
  unsupportedRegions: string[];
  ambiguities: string[];
  partial: boolean;
  privacy: {
    captureAllowed: boolean;
    maskedAreas: string[];
    secureMode: boolean;
    sensitiveCoverage: string | null;
    providerDestination: string | null;
  };
};

export const OBSERVATION_TTL_MS = 15_000;

export function newObservationId(): string {
  return `obs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function observationFresh(envelope: ObservationEnvelope, now = Date.now()): boolean {
  return new Date(envelope.expiresAt).getTime() > now;
}

/** Geometry change invalidates visual observations (scroll/zoom/window/focus). */
export function sameGeometry(
  a: NonNullable<ObservationEnvelope["viewport"]>,
  b: NonNullable<ObservationEnvelope["viewport"]>,
): boolean {
  return (
    a.cssWidth === b.cssWidth &&
    a.cssHeight === b.cssHeight &&
    a.deviceScale === b.deviceScale &&
    a.browserZoom === b.browserZoom &&
    a.scrollX === b.scrollX &&
    a.scrollY === b.scrollY
  );
}

// ---------------------------------------------------------------------------
// Privacy gating: DOM/AX/screenshot/clipboard/log capture together.
// Secure-entry/human takeover pauses model-visible capture. Known
// credential areas are masked; unresolved opaque sensitive regions block.
// Automated redaction is not infallible — minimal authorized views first.
// ---------------------------------------------------------------------------

const SECRET_FIELD = /password|passcode|secret|token|one-time-code|otp|pin|cvv|cvc|cc-|verification|api[_-]?key/i;
const SECRET_VALUE = /(sk-[A-Za-z0-9_-]{10,}|gh[pousr]_[A-Za-z0-9]{10,}|xox[baprs]-[A-Za-z0-9-]{6,}|[0-9]{6,8})/;

export type PrivacyGateResult =
  | { allowed: true; masked: string[]; note: string | null }
  | { allowed: false; reason: "SECURE_MODE" | "SENSITIVE_REGION" | "SCOPE_DENIED"; masked: string[] };

export function gateObservationCapture(input: {
  secureMode: boolean;
  scopeAllowed: boolean;
  fieldName: string;
  fieldType: string;
  autocomplete: string;
  opaqueSensitive: boolean;
}): PrivacyGateResult {
  if (input.secureMode) return { allowed: false, reason: "SECURE_MODE", masked: ["all"] };
  if (!input.scopeAllowed) return { allowed: false, reason: "SCOPE_DENIED", masked: [] };
  if (input.opaqueSensitive) return { allowed: false, reason: "SENSITIVE_REGION", masked: ["opaque-region"] };
  const haystack = `${input.fieldName} ${input.fieldType} ${input.autocomplete}`;
  if (SECRET_FIELD.test(haystack)) return { allowed: true, masked: ["credential-field"], note: "credential value redacted" };
  return { allowed: true, masked: [], note: null };
}

/** Scan tool errors/traces/clipboard/downloads/receipts for secret leakage.
 * Removes EVERY recognized value (global match — a second token must never
 * survive because the first was removed). Returns redacted text + whether a
 * secret was found (caller must stop on unresolved sensitive boundaries).
 * Detection regexes stay non-global (no stateful-lastIndex surprises); the
 * replacement uses a fresh global instance per call. Synthetic values only
 * in tests. Text redaction is one layer: image privacy comes from
 * minimized/blocked capture (secure mode, opaque regions), never from
 * redacting pixels after the fact. */
export function redactSecretsForProvider(text: string): { redacted: string; found: boolean } {
  const found = SECRET_VALUE.test(text) || /password\s*[:=]\s*\S+/i.test(text);
  // Fresh global regex per call: module-level /g instances keep lastIndex
  // across calls and would skip matches unpredictably.
  const valuePattern = new RegExp(SECRET_VALUE.source, "g");
  let redacted = text.replace(valuePattern, "[redacted-secret]");
  // Password assignments are always masked even without a recognizable token shape.
  redacted = redacted.replace(/password\s*[:=]\s*\S+/gi, "password: [redacted-secret]");
  return { redacted, found };
}

/** A token field implemented as a plain text box is still protected: field
 * name/autocomplete/label matter, not only type=password. */
export function isCredentialField(input: { type: string; name: string; autocomplete: string; label: string; id: string }): boolean {
  return SECRET_FIELD.test(`${input.type} ${input.name} ${input.autocomplete} ${input.label} ${input.id}`);
}

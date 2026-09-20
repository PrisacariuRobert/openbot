/**
 * B07 — Secure sign-in, takeover and lower supervision.
 *
 * Backend-only. No Codex UI/client changes (read-only hints:
 * src/studio/LiveComputer.tsx, src/components/BrowserSignInPanel.tsx).
 * Implements atomic host handoff behind Codex's existing sign-in/takeover
 * controls: stop model-visible capture/input, acquire owner control, return
 * purpose + task identity, resume only after fresh observation.
 */

export type HandoffReason = "LOGIN" | "MFA" | "CAPTCHA" | "SECURE_PROMPT" | "PERMISSION" | "AMBIGUITY";

export type HandoffState = {
  runId: string;
  taskId: string;
  reason: HandoffReason;
  purpose: string;
  startedAt: string;
  returnedAt: string | null;
  accountBefore: string | null;
  accountAfter: string | null;
  revokedGrants: boolean;
};

export function startHandoff(input: { runId: string; taskId: string; reason: HandoffReason; purpose: string; accountBefore: string | null }): HandoffState {
  return {
    ...input,
    startedAt: new Date().toISOString(),
    returnedAt: null,
    accountAfter: null,
    revokedGrants: true,
  };
}

/** Owner return preserves the task but revalidates target + approval.
 * A newly signed-in different account cannot execute the old reviewed action. */
export function returnFromHandoff(
  state: HandoffState,
  accountAfter: string | null,
): { state: HandoffState; mustRevalidate: boolean; blocked: boolean } {
  const next: HandoffState = { ...state, returnedAt: new Date().toISOString(), accountAfter };
  if ((state.accountBefore ?? null) !== (accountAfter ?? null)) {
    return { state: next, mustRevalidate: true, blocked: true };
  }
  return { state: next, mustRevalidate: true, blocked: false };
}

/** Challenge detection for owner handoff. No stealth fingerprinting,
 * CAPTCHA solving or security-boundary bypass. */
export function detectChallenge(input: { title: string; body: string; hasCaptchaWidget: boolean; hasMfaField: boolean; hasSecurePrompt: boolean }): HandoffReason | null {
  if (input.hasSecurePrompt || /touch id|face id|system password|approve on/i.test(`${input.title} ${input.body}`)) return "SECURE_PROMPT";
  if (input.hasCaptchaWidget || /captcha|i'm not a robot|verify you are human/i.test(`${input.title} ${input.body}`)) return "CAPTCHA";
  if (input.hasMfaField || /two-?factor|one-?time code|authenticator|passkey/i.test(`${input.title} ${input.body}`)) return "MFA";
  if (/sign ?in|log ?in|choose an account/i.test(`${input.title} ${input.body}`)) return "LOGIN";
  return null;
}

/** Navigation-grant classification: private drafting scopes explicit, final
 * publish/send/delete separate. Unknown/auto-saving fields may already
 * mutate — Enter/shortcut/paste/drag cannot launder a review-required click. */
export function writeRequiresReview(input: { autosaveUnknown: boolean; finalAction: boolean; destinationKnown: boolean }): boolean {
  if (input.finalAction) return true;
  if (input.autosaveUnknown) return true;
  if (!input.destinationKnown) return true;
  return false;
}

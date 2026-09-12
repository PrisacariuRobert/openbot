import type { BrowserNavigationAllowanceOffer } from "../shared/browser-control-review.js";
import { browserControlApprovalSchema } from "../shared/browser-control-review.js";
import type { AutoReviewRule } from "../shared/auto-review.js";
import type { RunStatus } from "../shared/types.js";
import { browserAutoDecision } from "./auto-review.js";
import type { BrowserTarget } from "./safety.js";

export const BROWSER_NAVIGATION_GRANT_CLICKS = 12 as const;
export const BROWSER_NAVIGATION_GRANT_MINUTES = 15 as const;
const GRANT_TTL_MS = BROWSER_NAVIGATION_GRANT_MINUTES * 60_000;

const FINAL_ACTION_LABEL = /\b(?:create|new|add|save|send|submit|delete|remove|complete|finish|share|invite|buy|purchase|pay|checkout|order|subscribe|publish|post|upload|deploy|merge|confirm|approve|accept|apply|book|reserve|cancel|archive|sign[ -]?out|log[ -]?out)\b/i;
const SENSITIVE_CONTROL = /password|passcode|secret|token|credit.?card|checkout|payment|one.time.code|verification|cc-/i;
const NAVIGATION_LABEL = /^(?:search|inbox|home|back|forward|next|previous|today|upcoming|calendar|dashboard|overview|activity|notifications?|projects?|my tasks|workspace|browse channels?|channels?|open menu|main menu|navigation menu)(?:\s+[0-9]+)?$/i;

export function browserNavigationAllowanceOffer(
  target: BrowserTarget,
  requiredByRule = false,
): BrowserNavigationAllowanceOffer | null {
  if (requiredByRule || target.tag !== "button" || target.role !== "" || target.stateful !== false || target.formMethod || target.href) return null;
  const review = target.review;
  if (!review || !review.complete || review.contextScope !== "navigation" || review.fields.length !== 0) return null;
  if (review.url !== target.url || review.label !== target.label) return null;
  if (!NAVIGATION_LABEL.test(target.label.trim()) || FINAL_ACTION_LABEL.test(target.label) || SENSITIVE_CONTROL.test(`${target.label} ${target.inputType} ${target.autocomplete}`)) return null;
  try {
    const url = new URL(target.url);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    return { version: 1, origin: url.origin, maxClicks: BROWSER_NAVIGATION_GRANT_CLICKS, expiresInMinutes: BROWSER_NAVIGATION_GRANT_MINUTES };
  } catch {
    return null;
  }
}

export function reviewedBrowserNavigationGrant(
  action: unknown,
  requested: boolean,
  rules: AutoReviewRule[],
): { valid: boolean; offer: BrowserNavigationAllowanceOffer | null } {
  if (!requested) return { valid: true, offer: null };
  if (!action || typeof action !== "object" || Array.isArray(action) || (action as { type?: unknown }).type !== "browser_click") return { valid: false, offer: null };
  const parsed = browserControlApprovalSchema.safeParse((action as { args?: unknown }).args);
  if (!parsed.success || !parsed.data.navigationAllowanceOffer) return { valid: false, offer: null };
  if (new URL(parsed.data.targetReview.url).origin !== parsed.data.navigationAllowanceOffer.origin) return { valid: false, offer: null };
  // Eligible offers are native buttons with no href, so this reconstructs the
  // exact text used for Auto Review matching when the host observed the click.
  const text = `click ${parsed.data.selector} ${parsed.data.targetReview.label} button `;
  if (browserAutoDecision(rules, text, null).matched?.effect === "require_approval") return { valid: false, offer: null };
  return { valid: true, offer: parsed.data.navigationAllowanceOffer };
}

interface BrowserNavigationGrant {
  runId: string;
  botId: string;
  origin: string;
  remaining: number;
  expiresAt: number;
}

/** Ephemeral, owner-issued permission for low-risk navigation candidates.
 * A process restart intentionally drops every grant. Claiming consumes one
 * use before dispatch, so concurrent or failed clicks cannot exceed the cap. */
export class BrowserNavigationGrants {
  private readonly grants = new Map<string, BrowserNavigationGrant>();

  issue(runId: string, botId: string, offer: BrowserNavigationAllowanceOffer, now = Date.now()) {
    this.grants.set(runId, {
      runId,
      botId,
      origin: offer.origin,
      remaining: offer.maxClicks,
      expiresAt: now + GRANT_TTL_MS,
    });
  }

  observeRunStatus(runId: string, status: RunStatus) {
    if (["completed", "failed", "cancelled"].includes(status)) this.grants.delete(runId);
  }

  claim(runId: string, botId: string, target: BrowserTarget, runStatus: RunStatus | null, requiredByRule = false, now = Date.now()): boolean {
    if (runStatus !== "running") {
      if (runStatus) this.observeRunStatus(runId, runStatus);
      return false;
    }
    const grant = this.grants.get(runId);
    if (!grant) return false;
    if (grant.expiresAt <= now || grant.remaining <= 0) {
      this.grants.delete(runId);
      return false;
    }
    const offer = browserNavigationAllowanceOffer(target, requiredByRule);
    if (!offer || grant.botId !== botId || grant.origin !== offer.origin) return false;
    grant.remaining -= 1;
    if (grant.remaining === 0) this.grants.delete(runId);
    return true;
  }
}

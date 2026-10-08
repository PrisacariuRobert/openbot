/** Autopilot: a teammate (or the whole studio) acts like a person, with no approval pauses, when the owner opts in.
 *
 * Only the human pause is skipped. The full review, fingerprint check, execution path and activity ledger stay
 * intact. Some things always need the owner, even on Autopilot, because skipping them would change what a teammate
 * is allowed to be rather than what it is allowed to do: spending more of the owner's AI budget, saving
 * instructions it will follow in every later task, and sending saved files to a website. */

/** Review kinds that always wait for the owner. */
const ALWAYS_ASK_KINDS = new Set(["budget"]);

/** Actions that always wait for the owner, whatever the mode. */
const ALWAYS_ASK_ACTIONS = new Set(["skill_propose", "propose_teammate", "browser_upload_saved_file", "browser_semantic_upload", "browser_semantic_act"]);

export interface AutopilotReview {
  kind?: string | null;
  /** The internal action behind the review, e.g. "browser_click" or "skill_propose". */
  actionType?: string | null;
  /** Set by the semantic browser when the action is bound to a specific, owner-reviewed target. */
  semanticBound?: boolean;
  /** Task T1: money, someone new, anything gone for good, publishing or credentials. */
  hardStop?: string | null;
}

/** Whether a review is the kind Autopilot may decide on the owner's behalf. */
export function autopilotMayDecide(review: AutopilotReview): boolean {
  if (review.hardStop) return false;
  if (review.kind && ALWAYS_ASK_KINDS.has(review.kind)) return false;
  if (review.actionType && ALWAYS_ASK_ACTIONS.has(review.actionType)) return false;
  return review.semanticBound !== true;
}

/** Whether Autopilot is on for a teammate: the owner turned it on for everyone, or for this teammate. */
export function autopilotOn(studioWide: boolean, teammate: { autopilot?: boolean } | null | undefined): boolean {
  return studioWide || teammate?.autopilot === true;
}

/** What the owner is told, in plain words, before turning it on. Shared by every screen that offers the switch. */
export const AUTOPILOT_WARNING =
  "Autopilot lets a teammate act like a person, without asking first: it can reply to people you've written to before, book, fill in forms on sites it is signed in to and move files, and it won't stop for your approval. Some things always ask, even on Autopilot: spending money, the first message to someone new, anything that can't be undone (deleting, account and security settings), publishing (public posts, pushes, deploys), and passwords and card details, which you always enter yourself. It also pauses to let you sign in, for CAPTCHAs, for more AI spending and for saving new instructions. Every action is recorded in the activity feed, and you can switch back to Ask first at any time.";

import type { BrowserTarget } from "./safety.js";
import type { AutoReviewEffect, AutoReviewRule, AutoReviewScope } from "../shared/auto-review.js";

export type { AutoReviewEffect, AutoReviewRule, AutoReviewScope };

export type AutoReviewDecision = { rule: AutoReviewRule; effect: AutoReviewEffect; reason: string };

/** Owner-authored control over when actions stop for approval. Patterns are
 * case-insensitive with `*` (any run) and `?` (any character); a plain pattern
 * is a substring match. One matching Require-Approval rule always wins over
 * matching Always-Allow rules; neither kind invents a permission that does not
 * exist — Always-Allow only softens OpenBot's own risk detector. */

export function autoReviewPatternMatches(pattern: string, text: string): boolean {
  const trimmed = pattern.trim().replace(/\s+/g, " ");
  if (!trimmed) return false;
  if (!/[*?]/.test(trimmed)) return text.toLowerCase().includes(trimmed.toLowerCase());
  const escaped = trimmed.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(escaped, "i").test(text);
}

export function findAutoReviewRule(rules: AutoReviewRule[], scope: AutoReviewScope, text: string): AutoReviewDecision | null {
  const candidates = rules.filter((rule) => rule.scope === scope && autoReviewPatternMatches(rule.pattern, text.slice(0, 4_000)));
  if (!candidates.length) return null;
  const required = candidates.filter((rule) => rule.effect === "require_approval");
  const matched = (required.length ? required : candidates).sort((a, b) => b.pattern.length - a.pattern.length)[0]!;
  const effect = matched.effect;
  const reason = effect === "require_approval"
    ? `An Auto Review rule ("${matched.pattern}") requires your review for this.`
    : `Always allowed by an Auto Review rule ("${matched.pattern}").`;
  return { rule: matched, effect, reason };
}

/** Commands run in the owner's isolated Docker computer. A Require-Approval
 * rule forces review even when the base detector stays quiet. An Always-Allow
 * rule can skip OpenBot's review of a sandboxed command — never a host action. */
export function commandAutoDecision(rules: AutoReviewRule[], command: string, baseReason: string | null) {
  const matched = findAutoReviewRule(rules, "command", command);
  if (!matched) return { reason: baseReason, matched: null as AutoReviewDecision | null };
  if (matched.effect === "require_approval") {
    return { reason: baseReason || matched.reason, matched };
  }
  return { reason: null, matched };
}

/** A Require-Approval rule forces review; an Always-Allow rule for prompts is
 * honored only when nothing else requires review (never waives the detector). */
export function promptAutoDecision(rules: AutoReviewRule[], prompt: string, baseReason: string | null) {
  const matched = findAutoReviewRule(rules, "prompt", prompt);
  if (!matched || matched.effect !== "require_approval") return { reason: baseReason, matched: null };
  return { reason: baseReason || matched.reason, matched };
}

/** Browser actions contact outside pages. Rules can only require review;
 * Always-Allow browser rules are intentionally not honored in this version. */
export function browserAutoDecision(rules: AutoReviewRule[], text: string, baseReason: string | null) {
  const matched = findAutoReviewRule(rules, "browser", text);
  if (!matched || matched.effect !== "require_approval") return { reason: baseReason, matched: null };
  return { reason: baseReason || matched.reason, matched };
}

/** Convenience for the isolated browser click/type evaluation with targets. */
export function browserTargetText(action: "click" | "type", value: string, target?: BrowserTarget) {
  return `${action} ${value} ${target?.label || ""} ${target?.tag || ""} ${target?.href || ""}`;
}

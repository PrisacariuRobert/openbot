import test from "node:test";
import assert from "node:assert/strict";
import {
  autoReviewPatternMatches,
  browserAutoDecision,
  browserTargetText,
  commandAutoDecision,
  findAutoReviewRule,
  promptAutoDecision,
  type AutoReviewRule,
} from "./auto-review.js";

function rule(id: string, effect: AutoReviewRule["effect"], scope: AutoReviewRule["scope"], pattern: string): AutoReviewRule {
  return { id, effect, scope, pattern, createdAt: "2026-01-01T00:00:00Z" };
}

test("plain patterns are case-insensitive substrings and wildcards generalize them", () => {
  assert.equal(autoReviewPatternMatches("git status", "ready; the team runs git status twice"), true);
  assert.equal(autoReviewPatternMatches("GIT STATUS", "team runs GIT STATUS now"), true);
  assert.equal(autoReviewPatternMatches("GIT STATUS", "git-status-different"), false);
  assert.equal(autoReviewPatternMatches("rm *", "rm package.json"), true);
  assert.equal(autoReviewPatternMatches("rm *", "npm run build"), false);
  assert.equal(autoReviewPatternMatches("git *", "git status in /workspace"), true);
  assert.equal(autoReviewPatternMatches("", "anything"), false);
});

test("one matching Require-Approval rule always wins over Always-Allow", () => {
  const rules = [
    rule("allow", "always_allow", "command", "git *"),
    rule("require", "require_approval", "command", "git push"),
  ];
  const push = findAutoReviewRule(rules, "command", "git push origin main");
  assert.equal(push?.effect, "require_approval");
  const status = findAutoReviewRule(rules, "command", "git status");
  assert.equal(status?.effect, "always_allow");
  assert.equal(status?.rule.id, "allow");
});

test("most specific same-effect rule decides; a matching Require rule outranks Always-Allow", () => {
  const rules = [
    rule("short-require", "require_approval", "command", "npm *"),
    rule("long-require", "require_approval", "command", "npm run test*"),
    rule("allow", "always_allow", "command", "npm run test --*"),
  ];
  const decided = findAutoReviewRule(rules, "command", "npm run test suite");
  assert.equal(decided?.rule.id, "long-require");
  const cleanRun = findAutoReviewRule(rules.filter((r) => r.id !== "short-require"), "command", "npm run test --teardown");
  assert.equal(cleanRun?.rule.id, "long-require");
});

test("commands: always-allow waives a detector review only for matched commands", () => {
  const rules = [rule("allow", "always_allow", "command", "git *")];
  const clean = commandAutoDecision(rules, "git status --short", null);
  assert.equal(clean.reason, null);
  const risky = commandAutoDecision(rules, "git push production", "This terminal command may publish or rewrite project work.");
  assert.equal(risky.reason, null);
  const forcing = commandAutoDecision([rule("b", "require_approval", "command", "rm*")], "rm draft.txt", null);
  assert.match(forcing.reason || "", /Auto Review rule/);
  const detectorStandsWhenUnmatched = commandAutoDecision(
    [rule("allow2", "always_allow", "command", "git status*")],
    "git push production",
    "This terminal command may publish or rewrite project work.",
  );
  assert.equal(detectorStandsWhenUnmatched.reason, "This terminal command may publish or rewrite project work.");
});

test("prompts can be forced into review but are never silently waived by rules", () => {
  const forcing = promptAutoDecision([rule("r", "require_approval", "prompt", "*expense reconciliation*")], "Run expense reconciliation totals", null);
  assert.match((forcing.reason || ""), /Auto Review rule/);
  const waivedAttempt = promptAutoDecision([rule("a", "always_allow", "prompt", "*delete*")], "Delete my old files", "This may delete files or data.");
  assert.equal(waivedAttempt.reason, "This may delete files or data.");
  const quiet = promptAutoDecision([rule("q", "always_allow", "prompt", "*report*")], "Write the report", null);
  assert.equal(quiet.reason, null);
});

test("browser rules only ever add review and command rules never leak into browser decisions", () => {
  const rules = [
    rule("c", "always_allow", "command", "*"),
    rule("r", "require_approval", "browser", "*checkout*"),
  ];
  const checkout = browserTargetText("click", "#buy-now", { url: "https://shop.example", tag: "a", role: "button", label: "Complete checkout", inputType: "", autocomplete: "", href: "", formMethod: "get", searchForm: false });
  const decision = browserAutoDecision(rules, checkout, null);
  assert.match((decision.reason || ""), /review/);
  assert.equal(decision.matched?.rule.id, "r");
  assert.equal(browserAutoDecision([rules[0]!], "git status", null).reason, null);
  const plainClick = browserTargetText("click", "#ok", { url: "u", tag: "a", role: "", label: "Read", inputType: "", autocomplete: "", href: "https://x", formMethod: "", searchForm: false });
  assert.equal(browserAutoDecision(rules, plainClick, null).reason, null);
});

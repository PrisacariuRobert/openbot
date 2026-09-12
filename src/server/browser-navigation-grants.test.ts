import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { BrowserTarget } from "./safety.js";
import { approvalReviewFingerprint } from "./approval-review-binding.js";
import { BrowserNavigationGrants, browserNavigationAllowanceOffer, reviewedBrowserNavigationGrant } from "./browser-navigation-grants.js";
import { OpenBotDatabase } from "./database.js";

function target(overrides: Partial<BrowserTarget> = {}): BrowserTarget {
  const base: BrowserTarget = {
    url: "https://app.example.test/workspace",
    tag: "button",
    role: "",
    label: "Search",
    inputType: "button",
    autocomplete: "",
    href: "",
    formMethod: "",
    searchForm: false,
    stateful: false,
    review: {
      url: "https://app.example.test/workspace",
      label: "Search",
      control: "button",
      fields: [],
      contextScope: "navigation",
      complete: true,
    },
  };
  const merged = { ...base, ...overrides };
  if (!overrides.review) merged.review = { ...base.review!, url: merged.url, label: merged.label };
  return merged;
}

test("navigation allowance is absent until explicitly issued, then expires after 15 minutes", () => {
  const grants = new BrowserNavigationGrants(), now = 1_000;
  assert.equal(grants.claim("run", "bot", target(), "running", false, now), false);
  grants.issue("run", "bot", browserNavigationAllowanceOffer(target())!, now);
  assert.equal(grants.claim("run", "bot", target(), "running", false, now + 14 * 60_000), true);
  assert.equal(grants.claim("run", "bot", target(), "running", false, now + 15 * 60_000), false);
});

test("navigation allowance is capped at 12 claimed clicks", () => {
  const grants = new BrowserNavigationGrants(), offer = browserNavigationAllowanceOffer(target())!;
  grants.issue("run", "bot", offer, 0);
  for (let index = 0; index < 12; index += 1) assert.equal(grants.claim("run", "bot", target(), "running", false, index), true);
  assert.equal(grants.claim("run", "bot", target(), "running", false, 13), false);
});

test("only a tight set of navigation labels is eligible", () => {
  for (const label of ["Search", "Inbox", "Home", "Back", "Next", "Browse channels"]) {
    assert.ok(browserNavigationAllowanceOffer(target({ label })), label);
  }
});

test("navigation allowance stays within the reviewed run, bot, and origin", () => {
  const grants = new BrowserNavigationGrants();
  grants.issue("run", "bot", browserNavigationAllowanceOffer(target())!, 0);
  assert.equal(grants.claim("other-run", "bot", target(), "running", false, 1), false);
  assert.equal(grants.claim("run", "other-bot", target(), "running", false, 1), false);
  assert.equal(grants.claim("run", "bot", target({ url: "https://other.example.test/workspace" }), "running", false, 1), false);
  assert.equal(grants.claim("run", "bot", target(), "running", false, 1), true, "failed scope checks do not consume the grant");
});

test("database lifecycle cleanup revokes a terminal run even if the same id is later resumed", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-nav-grant-"));
  const db = new OpenBotDatabase(root, { dataDir: path.join(root, "data"), seedStarterBots: true });
  try {
    const run = db.createRun({ threadId: "bot-nova", botId: "nova", prompt: "Read the inbox", status: "running" });
    const grants = new BrowserNavigationGrants();
    db.onRunStatusChange((runId, status) => grants.observeRunStatus(runId, status));
    grants.issue(run.id, "nova", browserNavigationAllowanceOffer(target())!, 0);
    db.updateRun(run.id, { status: "completed", finishedAt: new Date().toISOString() });
    db.updateRun(run.id, { status: "running", finishedAt: null });
    assert.equal(grants.claim(run.id, "nova", target(), db.getRun(run.id)?.status || null, false, 1), false);
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("require-approval rules always win over a navigation allowance", () => {
  const grants = new BrowserNavigationGrants();
  grants.issue("run", "bot", browserNavigationAllowanceOffer(target())!, 0);
  assert.equal(grants.claim("run", "bot", target(), "running", true, 1), false);
  assert.equal(grants.claim("run", "bot", target(), "running", false, 1), true);
});

test("final, sensitive, stateful, form, changed, and non-navigation controls cannot use the allowance", () => {
  for (const label of ["Create", "Add task", "Save", "Send", "Delete", "Complete", "Share", "Invite", "Purchase"]) {
    assert.equal(browserNavigationAllowanceOffer(target({ label })), null, label);
  }
  for (const candidate of [
    target({ label: "Payment details" }),
    target({ stateful: true }),
    target({ stateful: undefined }),
    target({ formMethod: "post" }),
    target({ tag: "div", role: "button" }),
    target({ role: "menuitem" }),
    target({ label: "More" }),
    target({ label: "Clear" }),
    target({ label: "Mystery" }),
    target({ review: { ...target().review!, contextScope: "page" } }),
    target({ review: { ...target().review!, fields: [{ label: "Query", value: "draft" }] } }),
    target({ review: { ...target().review!, label: "Changed Search" } }),
  ]) assert.equal(browserNavigationAllowanceOffer(candidate), null);
});

test("grant request stays default-off, is descriptor-bound, and rechecks current require rules", () => {
  const offer = browserNavigationAllowanceOffer(target())!;
  const action = { type: "browser_click", botId: "bot", args: { selector: "#search", targetFingerprint: "a".repeat(64), targetReview: target().review, navigationAllowanceOffer: offer } };
  assert.deepEqual(reviewedBrowserNavigationGrant(action, false, []), { valid: true, offer: null });
  assert.deepEqual(reviewedBrowserNavigationGrant(action, true, []), { valid: true, offer });
  const requireRule = [{ id: "rule", scope: "browser" as const, effect: "require_approval" as const, pattern: "Search", createdAt: "2026-09-12" }];
  assert.deepEqual(reviewedBrowserNavigationGrant(action, true, requireRule), { valid: false, offer: null });
  const withoutOffer = { ...action, args: { ...action.args, navigationAllowanceOffer: undefined } };
  assert.equal(reviewedBrowserNavigationGrant(withoutOffer, true, []).valid, false, "a model cannot request a grant without the host offer");
  assert.equal(reviewedBrowserNavigationGrant({ ...action, args: { ...action.args, navigationAllowanceOffer: { ...offer, origin: "https://other.example.test" } } }, true, []).valid, false, "the offer origin must match the exact reviewed page");
  assert.notEqual(approvalReviewFingerprint("fixture", { action }), approvalReviewFingerprint("fixture", { action: withoutOffer }), "the host offer is part of the review binding");
});

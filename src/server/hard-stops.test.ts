import assert from "node:assert/strict";
import test from "node:test";
import { autopilotMayDecide } from "../shared/autopilot.js";
import { HARD_STOPS, HARD_STOP_TEXT, hardStopLine } from "../shared/hard-stops.js";
import { actionHardStop, browserHardStop, commandHardStop } from "./hard-stops.js";
import type { BrowserTarget } from "./safety.js";
import { OpenBotDatabase } from "./testing/database.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const target = (overrides: Partial<BrowserTarget> & { text?: string; title?: string; cardFields?: number; fields?: Array<{ label: string; value: string }>; destination?: string } = {}): BrowserTarget => {
  const { text = "", title = "Shop", cardFields = 0, fields = [], destination, ...rest } = overrides;
  const url = rest.url || "https://shop.example/products/lamp";
  return {
    url, tag: "button", role: "", label: "Continue", inputType: "", autocomplete: "", href: "", formMethod: "", searchForm: false, stateful: false,
    facts: { text, title, cardFields },
    review: { url, label: rest.label || "Continue", control: "button", destination: destination || url, fields, contextScope: "page", disclosure: null, complete: true },
    ...rest,
  };
};

test("money: the label, the visible text, a price, the page, where it goes, its title and card fields", () => {
  assert.equal(browserHardStop("click", target({ label: "Pay now" })), "money");
  assert.equal(browserHardStop("click", target({ label: "Place order" })), "money");
  assert.equal(browserHardStop("click", target({ label: "Jetzt kaufen" })), "money");
  assert.equal(browserHardStop("click", target({ label: "Subscribe" })), "money");
  assert.equal(browserHardStop("click", target({ label: "Transfer" })), "money");
  // A page-authored aria-label can hide what the button says on screen.
  assert.equal(browserHardStop("click", target({ label: "Claim your free gift", text: "Pay now €49.00" })), "money");
  assert.equal(browserHardStop("click", target({ label: "Reserve for €20" })), "money");
  assert.equal(browserHardStop("click", target({ url: "https://shop.example/checkout/review" })), "money");
  assert.equal(browserHardStop("click", target({ tag: "a", href: "https://shop.example/checkout/confirm" })), "money", "a plain link into checkout");
  assert.equal(browserHardStop("click", target({ destination: "https://pay.example/pay" })), "money", "a form that posts to a payment page");
  assert.equal(browserHardStop("click", target({ title: "Secure payment" })), "money");
  assert.equal(browserHardStop("click", target({ cardFields: 1 })), "money", "a card field in the same form");
  assert.equal(browserHardStop("click", target({ fields: [{ label: "Card number", value: "" }] })), "money");
});

test("credentials: card, bank and password fields are never typed by a teammate", () => {
  for (const [label, autocomplete] of [["Card number", ""], ["", "cc-number"], ["CVC", ""], ["Expiry (MM/YY)", ""], ["IBAN", ""], ["Kartennummer", ""], ["Password", ""], ["Code", "one-time-code"]] as const) {
    assert.equal(browserHardStop("type", target({ tag: "input", label, autocomplete })), "credentials", `${label} ${autocomplete}`);
  }
  assert.equal(browserHardStop("type", target({ tag: "input", label: "Search products" })), null);
  assert.equal(browserHardStop("type", target({ tag: "input", label: "Your name" })), null);
});

test("gone for good: deleting, emptying the trash, closing an account, security settings", () => {
  for (const label of ["Delete", "Delete conversation", "Empty Trash", "Close account", "Remove permanently", "Endgültig löschen"]) assert.equal(browserHardStop("click", target({ label })), "gone-for-good", label);
  assert.equal(browserHardStop("click", target({ url: "https://account.example/settings/security" })), "gone-for-good");
  assert.equal(browserHardStop("click", target({ label: "Change password" })), "gone-for-good");
  assert.equal(browserHardStop("click", target({ label: "Remove filters" })), null, "clearing a filter is not a delete");
});

test("publishing, and sends whose recipient a web page doesn't show", () => {
  for (const label of ["Publish", "Post", "Tweet", "Deploy", "Merge pull request", "Make public"]) assert.equal(browserHardStop("click", target({ label })), "publishing", label);
  for (const label of ["Send", "Reply all", "Forward", "Invite"]) assert.equal(browserHardStop("click", target({ label })), "new-person", label);
});

test("ordinary clicks stay with the teammate's level", () => {
  for (const label of ["Show more", "Next photo", "Add to calendar", "Save draft", "Submit search", "Continue"]) assert.equal(browserHardStop("click", target({ label })), null, label);
  assert.equal(browserHardStop("click", target({ label: "Track order", url: "https://shop.example/orders" })), null);
});

test("commands: pushes, publishes, deploys and deletes", () => {
  for (const command of ["git push origin main", "npm publish", "gh pr merge 12", "vercel deploy --prod", "npx wrangler deploy", "firebase deploy", "terraform apply", "docker push me/app"]) assert.equal(commandHardStop(command), "publishing", command);
  for (const command of ["rm -rf build", "find . -name '*.log' -delete", "git reset --hard HEAD~1", "git clean -fd"]) assert.equal(commandHardStop(command), "gone-for-good", command);
  for (const command of ["git status", "npm test", "ls -la", "git commit -m 'x'"]) assert.equal(commandHardStop(command), null, command);
});

test("other actions: publishing tools, and sends, deletes and payments in Mac apps", () => {
  assert.equal(actionHardStop({ action: "code_publish_pr" }), "publishing");
  assert.equal(actionHardStop({ action: "github_issue_create" }), "publishing");
  assert.equal(actionHardStop({ action: "bash", args: { command: "git push" } }), "publishing");
  assert.equal(actionHardStop({ action: "mac_app_click", args: { app: "Messages" }, reason: "Nova is ready to click “Send” in Messages." }), "new-person");
  assert.equal(actionHardStop({ action: "mac_app_click", args: { app: "Finder" }, reason: "Nova is ready to click “Empty Trash” in Finder." }), "gone-for-good");
  assert.equal(actionHardStop({ action: "mac_app_click", args: { app: "App Store" }, reason: "Nova is ready to click “Buy” in App Store." }), "money");
  assert.equal(actionHardStop({ action: "mac_app_key", args: { app: "Messages", key: "return" } }), "new-person", "Return sends in Messages");
  assert.equal(actionHardStop({ action: "mac_app_key", args: { app: "Mail", key: "d", modifiers: ["command", "shift"] } }), "new-person");
  assert.equal(actionHardStop({ action: "mac_app_key", args: { app: "Notes", key: "return" } }), null);
  assert.equal(actionHardStop({ action: "mac_app_click", args: { app: "Notes" }, reason: "Nova is ready to click “New Note” in Notes." }), null);
  assert.equal(actionHardStop({ action: "mac_reminder_create" }), null);
});

test("Autopilot never decides a hard stop; every stop has words for the card", () => {
  for (const stop of HARD_STOPS) {
    assert.equal(autopilotMayDecide({ kind: "browser", actionType: "browser_click", hardStop: stop }), false, stop);
    assert.match(hardStopLine(stop), /^Always asks, even on Autopilot\. /);
    assert.ok(HARD_STOP_TEXT[stop].label && HARD_STOP_TEXT[stop].why);
  }
  assert.equal(autopilotMayDecide({ kind: "browser", actionType: "browser_click", hardStop: null }), true);
});

test("the stop is stored with the approval, and no rule may allow a push, a deploy or a delete", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-hard-stops-"));
  const db = new OpenBotDatabase(root);
  try {
    const bot = db.getBot("nova")!;
    const run = db.createRun({ threadId: bot.threadId, botId: bot.id, prompt: "Renew the domain", status: "running" });
    const approval = db.createApproval({ runId: run.id, botId: bot.id, kind: "browser", reason: "Pay", actionLabel: "Click “Pay now” on shop.example", hardStop: "money" });
    assert.equal(db.getApproval(approval.id)!.hardStop, "money");
    const plain = db.createApproval({ runId: run.id, botId: bot.id, kind: "browser", reason: "Open", actionLabel: "Click “Next” on shop.example" });
    assert.equal(db.getApproval(plain.id)!.hardStop, null);
    for (const pattern of ["git push*", "npm publish", "vercel deploy*", "rm -rf*"]) assert.throws(() => db.saveAutoReviewRule({ effect: "always_allow", scope: "command", pattern }), /always ask|Never allow/, pattern);
    assert.equal(db.saveAutoReviewRule({ effect: "always_allow", scope: "command", pattern: "git status*" }).pattern, "git status*");
    assert.equal(db.saveAutoReviewRule({ effect: "require_approval", scope: "command", pattern: "git push*" }).effect, "require_approval", "asking more is always allowed");
  } finally { db.close(); rmSync(root, { recursive: true, force: true }); }
});

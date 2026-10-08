import assert from "node:assert/strict";
import test from "node:test";
import { fixFor, privacyPaneIn } from "./recovery.js";

const fix = (reason: string, automatic = false) => fixFor(reason, { automatic });

test("every stop comes with the fix that matches it", () => {
  assert.deepEqual(fix("Choose an AI provider and model for this teammate in AI connections. No model was started or charged by Sidemates.").action, { kind: "panel", panel: "provider" });
  assert.equal(fix("This teammate reached its weekly budget.").label, "Raise this week's limit");
  assert.equal(fix("Allow Sidemates to use Reminders in System Settings → Privacy & Security → Automation, then try again. Nothing was changed.").label, "Open Automation settings");
  assert.match(JSON.stringify(fix("Full Disk Access: System Settings → Privacy & Security → Full Disk Access → turn on Sidemates. Nothing was read.").action), /Privacy_AllFiles/);
  assert.deepEqual(fix("Mac access is turned off for the studio.").action, { kind: "setting", setting: "macAccessEnabled" });
  assert.equal(fix("Mac access is turned off for the studio.").retryAfter, true, "turning it on runs the job again");
  assert.deepEqual(fix("Chrome or Chromium is required for browser work."), { label: "Download a private browser (about 150 MB)", action: { kind: "install-browser" }, retryAfter: true });
  assert.equal(fix("No Chrome, Edge or Brave was found on this Mac.").action.kind, "install-browser");
  assert.equal(fix("The private computer needs Docker.").label, "Get Docker");
});

test("an AI that ran out leads to another AI, never a dead end", () => {
  assert.deepEqual(fix("429 Too Many Requests: usage limit", false), { label: "Let Sidemates pick another AI", action: { kind: "automatic" }, retryAfter: true });
  assert.deepEqual(fix("429 Too Many Requests: usage limit", true), { label: "Try again on another AI", action: { kind: "retry" }, retryAfter: false });
});

test("anything else can at least be tried again", () => {
  assert.deepEqual(fix("The page could not be read."), { label: "Try again", action: { kind: "retry" }, retryAfter: false });
});

test("an answer that points to a Privacy & Security page gets a button that opens it", () => {
  assert.equal(privacyPaneIn("To fix it, go to System Settings → Privacy & Security → Full Disk Access and turn on Sidemates."), "files");
  assert.equal(privacyPaneIn("Allow Sidemates to use Mail in System Settings → Privacy & Security → Automation, then try again."), "automation");
  assert.equal(privacyPaneIn("I saved the note."), null);
});

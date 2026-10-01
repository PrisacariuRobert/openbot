import assert from "node:assert/strict";
import test from "node:test";
import { AUTOPILOT_WARNING, autopilotMayDecide, autopilotOn } from "./autopilot.js";

test("Autopilot is on for a teammate when the owner turned it on for everyone or for that teammate", () => {
  assert.equal(autopilotOn(false, { autopilot: false }), false);
  assert.equal(autopilotOn(false, null), false);
  assert.equal(autopilotOn(false, undefined), false);
  assert.equal(autopilotOn(false, { autopilot: true }), true);
  assert.equal(autopilotOn(true, { autopilot: false }), true);
  assert.equal(autopilotOn(true, null), true);
});

test("Autopilot decides ordinary reviews: sends, clicks, typing, file moves, commands", () => {
  for (const actionType of ["gmail_reply", "browser_click", "browser_type", "mac_files_move", "terminal_run", "calendar_create"]) {
    assert.equal(autopilotMayDecide({ kind: "external", actionType }), true, actionType);
  }
  assert.equal(autopilotMayDecide({ kind: "browser" }), true);
});

test("some reviews always wait for a person, even on Autopilot", () => {
  assert.equal(autopilotMayDecide({ kind: "budget" }), false, "more AI spending");
  for (const actionType of ["skill_propose", "browser_upload_saved_file", "browser_semantic_upload", "browser_semantic_act"]) {
    assert.equal(autopilotMayDecide({ kind: "external", actionType }), false, actionType);
  }
  assert.equal(autopilotMayDecide({ kind: "browser", actionType: "browser_click", semanticBound: true }), false);
});

test("the warning names what changes and what still pauses", () => {
  for (const phrase of ["send emails and messages", "without asking first", "activity feed", "Ask first", "sign in yourself", "CAPTCHAs", "AI spending", "new instructions"]) {
    assert.ok(AUTOPILOT_WARNING.includes(phrase), phrase);
  }
});

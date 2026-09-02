import test from "node:test";
import assert from "node:assert/strict";
import { presentBotMessage } from "./presentation.js";

test("turns internal teamwork receipts into natural conversation", () => {
  assert.equal(
    presentBotMessage("Signal sent to Scout — confirmed sent (messageId `60f26cbd`). Task complete."),
    "I asked Scout to take a look. I’ll share what they find here.",
  );
  assert.equal(presentBotMessage("Your report is ready."), "Your report is ready.");
  assert.equal(
    presentBotMessage("Passing your handoff request to Scout. Handed off to Scout (dedupe key `handoff-v1`). Run queued as `abc-123`."),
    "I asked Scout to handle that part. I’ll share the result here when it’s ready.",
  );
});

test("turns Mac capability narration and old workspace refusals into natural help", () => {
  assert.equal(
    presentBotMessage("Nova now has the new capability in current OpenBot data. I’m doing one read-only live check against the actual Desktop."),
    "I can use your Mac files now. I’ll check the Desktop and come back with a simple, safe tidy-up plan.",
  );
  assert.equal(
    presentBotMessage("I work inside my isolated workspace and can't reach your desktop directly.", { macAccessEnabled: true }),
    "I can help with your Desktop. I’ll first look at what’s there, then show you a simple folder plan before anything moves.",
  );
});

test("replaces the old recurring-work refusal with current guidance", () => {
  assert.equal(
    presentBotMessage("I can't start a recurring 'text every 5 minutes' on my own — that's a sensitive automation."),
    "I can set up repeating work here now. Tell me what should happen and how often, or open Routines to choose a custom time.",
  );
});

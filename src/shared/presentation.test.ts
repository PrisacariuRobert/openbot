import test from "node:test";
import assert from "node:assert/strict";
import { presentBotMessage } from "./presentation.js";

test("preserves historical failures even after capabilities change", () => {
  for (const body of [
    "I work inside my isolated workspace and can't reach your desktop directly.",
    "I can't start a recurring 'text every 5 minutes' on my own — that's a sensitive automation.",
    "Nova now has the new capability in current OpenBot data. I’m doing one read-only live check against the actual Desktop.",
  ]) assert.equal(presentBotMessage(body, { macAccessEnabled: true }), body);
});

test("does not invent a reply or completion from a teamwork receipt", () => {
  for (const body of [
    "Signal sent to Scout — confirmed sent (messageId `60f26cbd`). Task complete.",
    "Finding queued. expectsReply: false. Nobody needs to respond.",
    "Passing your handoff request to Scout. Handed off to Scout (dedupe key `handoff-v1`). Run queued as `abc-123`.",
    "Your report is ready.",
    "**How to debug** `message_teammate`: a queued run isn't a completed task.",
  ]) assert.equal(presentBotMessage(body), body);
});

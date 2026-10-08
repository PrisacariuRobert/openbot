import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { failureFix, failureFixById, ownerFixForToolError, ownerSentence } from "./failure-fixes.js";

const server = (file: string) => readFileSync(path.resolve(import.meta.dirname, "../server", file), "utf8");

/** Each failure path, with the message Sidemates really writes for it (the file
 * that writes it, and a fragment the test checks is still there). */
const PATHS: Array<{ file: string; fragment: string; message: string; fix: string; label: string }> = [
  // The AI stops the task.
  { file: "model-output.ts", fragment: "free Gemini limit is busy", message: "Scout: Google's free Gemini limit is busy: too many requests this minute. Your progress is saved. Try again in a minute.", fix: "busy-minute", label: "Try again" },
  { file: "model-output.ts", fragment: "free Gemini allowance for today is used up", message: "Scout: Google's free Gemini allowance for today is used up. Your progress is saved. Try again tomorrow, connect another AI, or turn on billing in Google AI Studio for higher limits.", fix: "allowance", label: "Choose another AI" },
  { file: "model-output.ts", fragment: "free AI allowance is used up", message: "Scout: Your free AI allowance is used up for now. Your progress is saved.", fix: "allowance", label: "Choose another AI" },
  { file: "model-output.ts", fragment: "reached a usage or rate limit", message: "Scout: Your AI provider reached a usage or rate limit. Your progress is saved. Wait for its allowance to reset or choose another connected model in Settings.", fix: "allowance", label: "Choose another AI" },
  { file: "model-output.ts", fragment: "rejected its sign-in or access", message: "Scout: Your AI provider rejected its sign-in or access. Reconnect that provider in Settings, then try again. Your saved work is kept.", fix: "ai-sign-in", label: "Reconnect your AI" },
  { file: "model-output.ts", fragment: "retired this model", message: "Scout: Your AI provider has retired this model. Your work is saved. Pick a newer model for this teammate in its settings and try again.", fix: "model", label: "Choose a model" },
  { file: "model-output.ts", fragment: "restricted to use inside OpenCode", message: "Scout: This OpenCode free-tier model is restricted to use inside OpenCode and could not run this Sidemates teammate.", fix: "model", label: "Choose a model" },
  { file: "model-output.ts", fragment: "could not read this message or file format", message: "Scout: Your selected AI provider could not read this message or file format.", fix: "model", label: "Choose a model" },
  { file: "model-output.ts", fragment: "temporarily unavailable", message: "Scout: Your AI provider is temporarily unavailable. Your progress is saved. Try again later or choose another connected model.", fix: "unavailable", label: "Try again" },
  { file: "execution-policy.ts", fragment: "reached the weekly token limit", message: "Scout: This teammate reached the weekly token limit. Your saved work is kept. Review the budget in teammate settings before continuing.", fix: "budget", label: "Review budget" },
  // Permission denied on the Mac.
  { file: "mac-apple-apps.ts", fragment: "in System Settings → Privacy & Security → Au", message: "Allow Sidemates to use Reminders in System Settings → Privacy & Security → Automation, then try again. Nothing was changed.", fix: "automation", label: "Open Automation settings" },
  { file: "mac-app-read.ts", fragment: "Privacy & Security → Accessibility and Automation", message: "The app could not be read. Unlock your Mac and allow Sidemates in Privacy & Security → Accessibility and Automation, then try again.", fix: "accessibility", label: "Open Accessibility settings" },
  { file: "mac-mail-index.ts", fragment: "To search your Mail, give Sidemates Full Disk Access", message: "To search your Mail, give Sidemates Full Disk Access: System Settings → Privacy & Security → Full Disk Access → turn on Sidemates. Nothing was read.", fix: "full-disk-access", label: "Open Full Disk Access" },
  { file: "mac-messages-index.ts", fragment: "To search your Messages, give Sidemates Full Disk Ac", message: "To search your Messages, give Sidemates Full Disk Access: System Settings → Privacy & Security → Full Disk Access.", fix: "full-disk-access", label: "Open Full Disk Access" },
  { file: "index.ts", fragment: "Files & apps on this Mac is turned off for the studio.", message: "Files & apps on this Mac is turned off for the studio. The owner can turn it on in Permissions.", fix: "mac-access", label: "Turn on Files & apps" },
  { file: "index.ts", fragment: "Mac files and apps are turned off for the studio.", message: "Mac files and apps are turned off for the studio. The user can turn them on in Control center.", fix: "mac-access", label: "Turn on Files & apps" },
  { file: "index.ts", fragment: "Say this can't be done here; the owner can turn", message: "The owner turned off documents for Scout. Say this can't be done here; the owner can turn it on in Scout's settings.", fix: "tool-group-off", label: "Open teammate settings" },
  // The site or browser is blocked.
  { file: "runtime.ts", fragment: "Chrome or Chromium is required for browser work.", message: "Chrome or Chromium is required for browser work.", fix: "browser-download", label: "Get a browser" },
  { file: "runtime.ts", fragment: "This teammate's browser is turned off.", message: "This teammate's browser is turned off.", fix: "browser-off", label: "Turn on the browser" },
  { file: "connectors.ts", fragment: "needs a quick reconnect", message: "Slack needs a quick reconnect. Open Apps & Tools and connect it again.", fix: "app-reconnect", label: "Open Apps & tools" },
  { file: "connectors.ts", fragment: "could not finish sign-in", message: "Notion could not finish sign-in. Return to Apps & Tools and try connecting again.", fix: "app-reconnect", label: "Open Apps & tools" },
  // The app isn't running or doesn't answer.
  { file: "mac-apple-apps.ts", fragment: "couldn't be reached on this Mac", message: "Reminders couldn't be reached on this Mac. Nothing was changed.", fix: "no-answer", label: "Try again" },
  { file: "code-projects.ts", fragment: "took too long and was stopped", message: "npm took too long and was stopped.", fix: "no-answer", label: "Try again" },
];

test("each failure path gets its fix, from the message Sidemates really writes", () => {
  for (const item of PATHS) {
    assert.ok(server(item.file).includes(item.fragment), `${item.file} still writes "${item.fragment}"`);
    const fix = failureFix(item.message);
    assert.equal(fix?.id, item.fix, item.message);
    assert.equal(fix?.label, item.label, item.message);
    assert.deepEqual(failureFixById(item.fix), fix, "notes store the fix by id");
  }
});

test("the weekly budget stop and the connector reading switch are recognised where they're written", () => {
  assert.equal(failureFix(`Slack reading is turned off for this teammate. Do not use its website or another route to bypass that choice.`)?.id, "app-reading-off");
  assert.equal(failureFix("Weekly token limit reached (20,064 of 20,000 tokens accounted).")?.id, "budget");
});

test("a message with nothing the owner can do gets no button", () => {
  for (const message of ["Scout: The task stopped before it finished.", "Unknown tool.", "Internal tool access denied.", "", null, undefined]) assert.equal(failureFix(message), null, String(message));
  assert.equal(failureFixById("not-a-fix"), null);
});

test("only fixes the owner must make become notes; retrying is the teammate's job", () => {
  assert.equal(ownerFixForToolError("Reminders couldn't be reached on this Mac. Nothing was changed."), null);
  assert.equal(ownerFixForToolError("This teammate's browser is turned off.")?.id, "browser-off");
});

test("the note keeps the owner's sentence, not the instructions for the teammate", () => {
  assert.equal(ownerSentence("Slack reading is turned off for this teammate. Do not use its website or another route to bypass that choice."), "Slack reading is turned off for this teammate.");
  assert.equal(ownerSentence("To search your Mail, give Sidemates Full Disk Access: System Settings → Privacy & Security → Full Disk Access → turn on Sidemates. Nothing was read."), "To search your Mail, give Sidemates Full Disk Access: System Settings → Privacy & Security → Full Disk Access → turn on Sidemates.");
  assert.equal(ownerSentence("no full stop"), "no full stop");
  assert.equal(ownerSentence("x".repeat(400)).length, 200);
});

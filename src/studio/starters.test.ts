import assert from "node:assert/strict";
import test from "node:test";
import { startersFor } from "./starters.js";

const labels = (jobs: string[], mac = true) => startersFor(jobs, mac).map((starter) => starter.label);

test("starters fit what the teammate is for", () => {
  assert.deepEqual(labels(["Finds marketing news and conversations"]), ["Look something up", "What's new?", "Compare options"]);
  assert.deepEqual(labels(["Writes marketing drafts in Robert's voice"]), ["Draft something", "Make it better", "Ideas for a post"]);
  assert.deepEqual(labels(["Checks every draft before Robert sees it"]), ["Check this", "Is this true?", "Proofread"]);
  assert.deepEqual(labels(["Keeps my inbox under control"]), ["What needs a reply?", "Draft a reply", "Tidy my inbox"]);
  assert.deepEqual(labels(["Files receipts for the accountant"]), ["File my receipts", "What did I spend?", "Invoices to chase"]);
});

test("a group gets starters from its members' jobs, and other jobs fall back to the general ones", () => {
  assert.deepEqual(labels(["Researcher", "Maker"]), ["Look something up", "What's new?", "Compare options"]);
  assert.deepEqual(labels(["Operator"], true), ["What's on my plate?", "Remind me", "Find that note"]);
  assert.deepEqual(labels(["Operator"], false), ["Plan my week", "Make sense of something", "Look something up"]);
  assert.deepEqual(labels([], false), ["Plan my week", "Make sense of something", "Look something up"]);
});

test("Mac-only starters are never offered without Mac access", () => {
  assert.deepEqual(labels(["Plans my week"], false), ["Plan my week", "Make sense of something", "Look something up"]);
  assert.deepEqual(labels(["Plans my week"], true), ["What's on my plate?", "Remind me", "Find that note"]);
});

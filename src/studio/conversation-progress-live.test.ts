import test from "node:test";
import assert from "node:assert/strict";
import { liveTail } from "./conversation-progress.js";

test("live reply preview keeps short text whole and trims long text at a clean break", () => {
  assert.equal(liveTail(null), "");
  assert.equal(liveTail("  Checking the site now.  "), "Checking the site now.");
  const long = `${"First paragraph words. ".repeat(40)}\n\nSecond paragraph is the latest part.`;
  assert.equal(liveTail(long, 120), "…Second paragraph is the latest part.", "cuts at the paragraph break, not mid-word");
});

import test from "node:test";
import assert from "node:assert/strict";
import { speakable } from "./speakable.js";

test("replies read aloud without markdown symbols, raw links or code", () => {
  assert.equal(speakable("## Plan\n\n- **Walk** first\n- Read [the guide](https://example.com/x)\n\nSee https://example.com too."), "Plan. Walk first. Read the guide. See a link too.");
  assert.equal(speakable("Run this:\n```bash\nnpm test\n```\nDone."), "Run this: (there's code in the chat) Done.");
  assert.equal(speakable("   "), "");
});

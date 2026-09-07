import test from "node:test";
import assert from "node:assert/strict";
import { scopedToolToken, validToolToken } from "./tool-auth.js";

test("a model's tool credential cannot authorize another bot, another run, or a restarted studio", () => {
  const token = scopedToolToken("studio-key", "nova", "run-one");
  assert.equal(validToolToken("studio-key", "nova", "run-one", token), true);
  assert.equal(validToolToken("studio-key", "pixel", "run-one", token), false);
  assert.equal(validToolToken("studio-key", "nova", "run-two", token), false);
  assert.equal(validToolToken("new-studio-key", "nova", "run-one", token), false);
  for (const invalid of [undefined, [], "", "studio-key", token.slice(1), "x".repeat(43), "é".repeat(43)]) assert.equal(validToolToken("studio-key", "nova", "run-one", invalid), false);
});

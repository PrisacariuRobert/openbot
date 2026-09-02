import assert from "node:assert/strict";
import test from "node:test";
import { githubWebUrl } from "./github.js";

test("GitHub API subjects become useful browser links", () => {
  assert.equal(githubWebUrl("https://api.github.com/repos/openai/codex/issues/123"), "https://github.com/openai/codex/issues/123");
  assert.equal(githubWebUrl("https://api.github.com/repos/openai/codex/pulls/42"), "https://github.com/openai/codex/pull/42");
  assert.equal(githubWebUrl("https://example.com"), null);
});

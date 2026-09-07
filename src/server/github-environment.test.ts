import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { existsSync } from "node:fs";
import { githubCliEnvironment } from "./github.js";

test("background GitHub discovery restores standard CLI paths without forwarding unrelated model credentials", () => {
  const env = githubCliEnvironment({ PATH: "/usr/bin:/bin", HOME: "/Users/fixture", GH_TOKEN: "fixture-github-only", OPENAI_API_KEY: "must-not-leak", ANTHROPIC_API_KEY: "must-not-leak" });
  assert.equal(env.GH_TOKEN, "fixture-github-only");
  assert.equal(env.OPENAI_API_KEY, undefined);
  assert.equal(env.ANTHROPIC_API_KEY, undefined);
  assert.equal(env.GH_PROMPT_DISABLED, "1");
  if (existsSync("/opt/homebrew/bin")) assert.ok(env.PATH?.split(path.delimiter).includes("/opt/homebrew/bin"));
});

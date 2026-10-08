import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { applyEnvAliases } from "./env-aliases.js";

test("SIDEMATES_* settings fill in OPENBOT_* ones; an OPENBOT_ value already set is kept", () => {
  const env: NodeJS.ProcessEnv = { SIDEMATES_PORT: "4400", SIDEMATES_DATA_DIR: "/srv/data", OPENBOT_DATA_DIR: "/old/data", SIDEMATES_: "ignored", PATH: "/bin" };
  assert.deepEqual(applyEnvAliases(env), ["SIDEMATES_DATA_DIR"], "a conflict is reported");
  assert.equal(env.OPENBOT_PORT, "4400");
  assert.equal(env.OPENBOT_DATA_DIR, "/old/data", "nothing existing changes");
  assert.equal(env.OPENBOT_, undefined);
  assert.deepEqual(applyEnvAliases({ OPENBOT_PORT: "1" }), []);
});

test("the npx command line reads SIDEMATES_PORT too", () => {
  const cli = path.resolve(import.meta.dirname, "../../bin/sidemates.mjs");
  const result = spawnSync(process.execPath, [cli, "--data-dir", "/nonexistent"], { encoding: "utf8", env: { PATH: process.env.PATH, SIDEMATES_PORT: "99999" } });
  assert.equal(result.status, 2, "the alias reached the port check");
  assert.match(result.stderr, /Choose a port number/);
});

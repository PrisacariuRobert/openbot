import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { protectedProjectPaths, safeHostEnvironment, safeUrl } from "./runtime.js";

test("passes only allowlisted host environment values to model processes", () => {
  const env = safeHostEnvironment({ OPENBOT_TEST_VALUE: "safe" });
  assert.equal(env.OPENBOT_TEST_VALUE, "safe");
  assert.equal("AWS_SECRET_ACCESS_KEY" in env, false);
  assert.equal("GITHUB_TOKEN" in env, false);
});

test("browser URL guard allows local tests and blocks metadata/private hosts", () => {
  assert.equal(safeUrl("http://127.0.0.1:4322/page").hostname, "127.0.0.1");
  assert.throws(() => safeUrl("http://169.254.169.254/latest/meta-data"));
  assert.throws(() => safeUrl("file:///etc/passwd"));
});

test("finds hidden project paths that must be masked from code checks", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-code-masks-"));
  try {
    mkdirSync(path.join(root, ".git"));
    mkdirSync(path.join(root, ".github"));
    mkdirSync(path.join(root, "apps", "web"), { recursive: true });
    mkdirSync(path.join(root, "node_modules", ".cache"), { recursive: true });
    writeFileSync(path.join(root, ".env"), "SECRET=value");
    writeFileSync(path.join(root, "apps", "web", ".env.local"), "TOKEN=value");
    const protectedPaths = protectedProjectPaths(root).map((entry) => entry.relative).sort();
    assert.deepEqual(protectedPaths, [".env", ".git", "apps/web/.env.local"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

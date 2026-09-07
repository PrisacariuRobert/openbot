import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { sourceFindings, checkIndex } from "./check-public-source.mjs";

test("rejects private paths while keeping example configuration and licensing", () => {
  for (const file of [".openbot/state.txt", "data/openbot.sqlite-wal", "access.token", "keys/vault.key", "deploy/.env.local", "certs/push.p8", "native/xcuserdata/user.xcuserstate", "auth.json"]) {
    assert.ok(sourceFindings(file).length, file);
  }
  for (const file of [".env.example", "deploy/.env.example", "LICENSE", "skills/bundled/licenses/SECURITY-GUIDANCE-APACHE-2.0.txt", "src/server/auth-security.test.ts"]) {
    assert.deepEqual(sourceFindings(file), [], file);
  }
  assert.ok(sourceFindings("linked-file", "", "120000").length);
});

test("detects credential shapes without treating public configuration as a secret", () => {
  assert.ok(sourceFindings("config.txt", ["ghp_", "A".repeat(36)].join("")).length);
  assert.ok(sourceFindings("config.txt", ["-----BEGIN PRIVATE KEY-----", "A".repeat(64)].join("\n")).length);
  assert.deepEqual(sourceFindings(".env.example", "OPENBOT_GOOGLE_CLIENT_ID=example.apps.googleusercontent.com\nOPENBOT_GOOGLE_CLIENT_SECRET=\n"), []);
});

test("checks indexed bytes, never ignored files, and redacts failures", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-public-source-"));
  const git = (...args) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  const token = ["ghp_", "B".repeat(36)].join("");
  try {
    git("init", "--quiet");
    writeFileSync(path.join(root, ".gitignore"), "ignored.txt\n");
    writeFileSync(path.join(root, "ignored.txt"), token);
    writeFileSync(path.join(root, "README.md"), "Safe source\n");
    git("add", ".gitignore", "README.md");
    assert.deepEqual(checkIndex(root).failures, []);
    writeFileSync(path.join(root, "README.md"), token);
    git("add", "README.md");
    writeFileSync(path.join(root, "README.md"), "Unstaged cleanup must not hide an indexed secret\n");
    assert.equal(checkIndex(root).failures.length, 1);
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("./check-public-source.mjs", import.meta.url))], { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /README\.md/);
    assert.ok(!result.stderr.includes(token));
    assert.ok(!result.stdout.includes(token));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { SecretVault } from "./vault.js";

test("encrypts secrets at rest with a private machine key", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-vault-"));
  try {
    const vault = new SecretVault(root);
    const encrypted = vault.encrypt("sk-private-example");
    assert.equal(encrypted.includes("sk-private-example"), false);
    assert.equal(vault.decrypt(encrypted), "sk-private-example");
    const keyPath = path.join(root, "keys", "vault.key");
    assert.equal(statSync(keyPath).mode & 0o777, 0o600);
    assert.equal(readFileSync(keyPath).length, 32);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects altered ciphertext", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-vault-tamper-"));
  try {
    const vault = new SecretVault(root);
    const encrypted = vault.encrypt("secret");
    assert.throws(() => vault.decrypt(`${encrypted.slice(0, -1)}x`));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

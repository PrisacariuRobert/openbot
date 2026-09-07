import test from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { SecretVault } from "./vault.js";
import { OpenBotDatabase } from "./database.js";

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
    const parts = encrypted.split(".");
    const tag = parts[2]!;
    parts[2] = `${tag[0] === "A" ? "B" : "A"}${tag.slice(1)}`;
    assert.throws(() => vault.decrypt(parts.join(".")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

for (const filename of ["openbot.sqlite", "openbot.sqlite-wal", "openbot.sqlite-shm"]) {
  test(`missing vault key beside ${filename} refuses startup without any writes`, () => {
    const root = mkdtempSync(path.join(tmpdir(), "openbot-vault-incomplete-"));
    try {
      const original = Buffer.from("Synthetic incomplete restore; never an owner database");
      writeFileSync(path.join(root, filename), original);
      const entries = readdirSync(root);
      assert.throws(() => new OpenBotDatabase(root, { dataDir: root }), /encryption key is missing.*same backup/);
      assert.deepEqual(readFileSync(path.join(root, filename)), original);
      assert.deepEqual(readdirSync(root), entries, "No keys, workspaces, computers, attachments or new SQLite files may appear");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}

test("fresh database creates its key first; a matching database/key restore decrypts saved records", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-vault-restore-"));
  const source = path.join(root, "source");
  const restored = path.join(root, "restored");
  let db: OpenBotDatabase | undefined;
  try {
    db = new OpenBotDatabase(root, { dataDir: source });
    assert.equal(db.listBots().length, 0);
    assert.equal(readFileSync(path.join(source, "keys/vault.key")).length, 32);
    db.saveExtensionRecord("fixture", "private", { note: "Synthetic preserved record" });
    db.close(); db = undefined;

    mkdirSync(restored);
    copyFileSync(path.join(source, "openbot.sqlite"), path.join(restored, "openbot.sqlite"));
    const databaseBefore = readFileSync(path.join(restored, "openbot.sqlite"));
    assert.throws(() => new OpenBotDatabase(root, { dataDir: restored }), /encryption key is missing/);
    assert.deepEqual(readdirSync(restored), ["openbot.sqlite"]);
    assert.deepEqual(readFileSync(path.join(restored, "openbot.sqlite")), databaseBefore);
    assert.equal(existsSync(path.join(restored, "keys/vault.key")), false);

    mkdirSync(path.join(restored, "keys"));
    copyFileSync(path.join(source, "keys/vault.key"), path.join(restored, "keys/vault.key"));
    db = new OpenBotDatabase(root, { dataDir: restored });
    assert.deepEqual(db.extensionRecord("fixture", "private"), { note: "Synthetic preserved record" });
    assert.deepEqual(readFileSync(path.join(restored, "keys/vault.key")), readFileSync(path.join(source, "keys/vault.key")));
  } finally { db?.close(); rmSync(root, { recursive: true, force: true }); }
});

test("an empty preexisting SQLite file also requires its original key", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-vault-empty-db-"));
  try {
    writeFileSync(path.join(root, "openbot.sqlite"), "");
    assert.throws(() => new SecretVault(root), /encryption key is missing/);
    assert.deepEqual(readdirSync(root), ["openbot.sqlite"]);
    assert.equal(statSync(path.join(root, "openbot.sqlite")).size, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

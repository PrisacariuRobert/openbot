import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { SecretVault } from "./vault.js";
import { KEYCHAIN_SERVICE, MacKeychain, keychainAccount, keychainEligible, type KeyStore, type SecurityRunner } from "./keychain.js";

/** A Keychain that lives in memory, with switches for the ways the real one fails. */
class FakeKeychain implements KeyStore {
  readonly items = new Map<string, Buffer>();
  locked = false; writeFails = false; returnsOther = false;
  read(account: string) {
    if (this.locked) throw new Error("macOS didn't hand over Sidemates' key from your Keychain.");
    const key = this.items.get(account);
    return key ? (this.returnsOther ? Buffer.alloc(32, 7) : key) : null;
  }
  write(account: string, key: Buffer) { if (this.writeFails) throw new Error("The key couldn't be saved in your Keychain."); this.items.set(account, Buffer.from(key)); }
  remove(account: string) { this.items.delete(account); }
}
const fakeKeychain = () => new FakeKeychain();

function studio() {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-vault-keychain-"));
  return { root, keyFile: path.join(root, "keys", "vault.key"), marker: path.join(root, "keys", "vault.key.in-keychain"), close: () => rmSync(root, { recursive: true, force: true }) };
}

test("a new studio on a Mac keeps its key in the Keychain, not next to the database", () => {
  const s = studio(), keychain = fakeKeychain();
  try {
    const vault = new SecretVault(s.root, { useKeychain: true, keyStore: keychain });
    assert.equal(vault.keySource, "keychain");
    assert.equal(existsSync(s.keyFile), false);
    assert.match(readFileSync(s.marker, "utf8"), new RegExp(KEYCHAIN_SERVICE.replace(/\./g, "\\.")));
    assert.doesNotMatch(readFileSync(s.marker, "utf8"), new RegExp(keychain.items.get(keychainAccount(s.root))!.toString("base64").slice(0, 16)), "the marker holds no secret");
    const sealed = vault.encrypt("api-key-fixture");
    assert.equal(new SecretVault(s.root, { useKeychain: true, keyStore: keychain }).decrypt(sealed), "api-key-fixture");
  } finally { s.close(); }
});

test("an existing key file moves into the Keychain once, and everything it sealed still opens", () => {
  const s = studio(), keychain = fakeKeychain();
  try {
    const before = new SecretVault(s.root, { useKeychain: false });
    const sealed = before.encrypt("saved before the move");
    const fileKey = readFileSync(s.keyFile);
    const after = new SecretVault(s.root, { useKeychain: true, keyStore: keychain });
    assert.equal(after.keySource, "keychain");
    assert.equal(existsSync(s.keyFile), false, "the file is removed only after the Keychain returned the same key");
    assert.ok(keychain.items.get(keychainAccount(s.root))!.equals(fileKey));
    assert.equal(after.decrypt(sealed), "saved before the move");

    // A move that stopped after saving to the Keychain: the leftover file is removed.
    writeFileSync(s.keyFile, fileKey, { mode: 0o600 });
    assert.equal(new SecretVault(s.root, { useKeychain: true, keyStore: keychain }).decrypt(sealed), "saved before the move");
    assert.equal(existsSync(s.keyFile), false);
  } finally { s.close(); }
});

test("when the Keychain can't take the key, the file stays and nothing is lost", () => {
  for (const failure of ["writeFails", "returnsOther", "locked"] as const) {
    const s = studio(), keychain = fakeKeychain();
    try {
      const sealed = new SecretVault(s.root, { useKeychain: false }).encrypt("still here");
      keychain[failure] = true;
      if (failure === "returnsOther") keychain.items.clear();
      const vault = new SecretVault(s.root, { useKeychain: true, keyStore: keychain });
      assert.equal(vault.keySource, "file", failure);
      assert.ok(existsSync(s.keyFile), failure);
      assert.equal(vault.decrypt(sealed), "still here", failure);
      assert.equal(existsSync(s.marker), false, failure);
    } finally { s.close(); }
  }
  const fresh = studio(), keychain = fakeKeychain();
  try {
    keychain.writeFails = true;
    const vault = new SecretVault(fresh.root, { useKeychain: true, keyStore: keychain });
    assert.equal(vault.keySource, "file");
    assert.equal(readFileSync(fresh.keyFile).length, 32, "a new studio falls back to a key file");
  } finally { fresh.close(); }
});

test("a key known to be in the Keychain is never replaced: locked, missing or conflicting, startup stops and says why", () => {
  const s = studio(), keychain = fakeKeychain();
  try {
    new SecretVault(s.root, { useKeychain: true, keyStore: keychain });
    writeFileSync(path.join(s.root, "openbot.sqlite"), "");
    keychain.locked = true;
    assert.throws(() => new SecretVault(s.root, { useKeychain: true, keyStore: keychain }), /Unlock your login keychain|didn't hand over/);
    keychain.locked = false;
    const key = keychain.items.get(keychainAccount(s.root))!;
    keychain.items.clear();
    assert.throws(() => new SecretVault(s.root, { useKeychain: true, keyStore: keychain }), /should be in your Keychain/);
    assert.equal(existsSync(s.keyFile), false, "no replacement key was made");
    keychain.items.set(keychainAccount(s.root), key);
    mkdirSync(path.dirname(s.keyFile), { recursive: true });
    writeFileSync(s.keyFile, Buffer.alloc(32, 1), { mode: 0o600 });
    assert.throws(() => new SecretVault(s.root, { useKeychain: true, keyStore: keychain }), /two different encryption keys/);
    assert.ok(existsSync(s.keyFile) && keychain.items.has(keychainAccount(s.root)), "neither key was touched");
  } finally { s.close(); }
});

test("the security command gets the key on stdin only, and its answers are read correctly", () => {
  const calls: Array<{ args: string[]; input?: string }> = [];
  let answer = { status: 0, stdout: `${Buffer.alloc(32, 3).toString("base64")}\n` };
  const run: SecurityRunner = (args, input) => { calls.push({ args, input }); return answer; };
  const keychain = new MacKeychain(run);
  assert.ok(keychain.read("studio-abc")!.equals(Buffer.alloc(32, 3)));
  assert.deepEqual(calls[0]!.args, ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", "studio-abc", "-w"]);
  keychain.write("studio-abc", Buffer.alloc(32, 9));
  assert.deepEqual(calls[1]!.args, ["-i"]);
  assert.ok(calls[1]!.input!.includes(Buffer.alloc(32, 9).toString("base64")));
  assert.ok(!calls.some((call) => call.args.join(" ").includes(Buffer.alloc(32, 9).toString("base64"))), "never on a command line");
  answer = { status: 44, stdout: "" };
  assert.equal(keychain.read("studio-abc"), null);
  answer = { status: 51, stdout: "" };
  assert.throws(() => keychain.read("studio-abc"), /Unlock your login keychain/);
  answer = { status: 0, stdout: "c2hvcnQ=\n" };
  assert.throws(() => keychain.read("studio-abc"), /isn't valid/);
});

test("only a real studio on a Mac uses the Keychain: never a temporary folder (every test), Linux, or an opt-out", () => {
  const real = path.join(homedir(), ".openbot");
  assert.equal(keychainEligible(real, {}, "darwin"), true);
  assert.equal(keychainEligible(real, { OPENBOT_VAULT_KEYCHAIN: "0" }, "darwin"), false);
  assert.equal(keychainEligible(real, {}, "linux"), false);
  assert.equal(keychainEligible(path.join(tmpdir(), "openbot-x"), {}, "darwin"), false);
  assert.equal(keychainEligible("/private/var/folders/ab/T/openbot-x", {}, "darwin"), false);
  assert.notEqual(keychainAccount("/a/studio"), keychainAccount("/b/studio"));
});

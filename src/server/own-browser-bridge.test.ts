import test from "node:test";
import assert from "node:assert/strict";
import { createCipheriv, createHash, pbkdf2Sync, randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { copyFileSync, existsSync, mkdtempSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  chromeExpiresToUnix,
  chromeUserDataDir,
  cookieAppliesToHost,
  decryptChromeCookie,
  deriveChromeSafeStorageKey,
  collectOwnerSessionCookies,
  loadOwnerCookies,
  resolveChromeProfile,
  withCopiedChromeCookieStore,
} from "./own-browser-bridge.js";

function chromeEncrypt(value: string, key: Buffer): Buffer {
  const cipher = createCipheriv("aes-128-cbc", key.subarray(0, 16), Buffer.alloc(16, 0x20));
  return Buffer.concat([Buffer.from("v10", "latin1"), cipher.update(Buffer.from(value, "utf8")), cipher.final()]);
}

test("chrome cookie decryption round-trips the macOS v10 format", () => {
  const key = randomBytes(16);
  const encrypted = chromeEncrypt("SID=session-value-123; HttpOnly", key);
  assert.equal(decryptChromeCookie(encrypted, key), "SID=session-value-123; HttpOnly");
  assert.throws(() => decryptChromeCookie(Buffer.from("v22-not-supported"), key), /Unsupported cookie encryption/);
  assert.throws(() => decryptChromeCookie(chromeEncrypt("x", key), randomBytes(4)), /session key is unusable/);
  assert.throws(() => decryptChromeCookie(chromeEncrypt("x", key), randomBytes(24)), /session key is unusable/);
});

test("Keychain password derivation decrypts Chromium's published known-answer vector", () => {
  // Chromium OSCryptTest known-answer fixture; not encrypted by our helper.
  // components/os_crypt/sync/os_crypt_unittest.cc before removal in a4cab4afb48c.
  const encrypted = Buffer.from("763130bf086d2056861a80de825fc935868630644f2ca187450213ae6681b4d643d19b2581c85c8878c1bc97e726a10e51ea77", "hex");
  const key = deriveChromeSafeStorageKey(Buffer.from("mock_password"));
  assert.equal(decryptChromeCookie(encrypted, key), Buffer.from(Array.from({ length: 32 }, (_, i) => i)).toString("utf8"));
  assert.throws(() => deriveChromeSafeStorageKey(Buffer.alloc(0)), /session key is unusable/);
});

test("cookies are matched to the sign-in host only, including domain-wide rows", () => {
  assert.equal(cookieAppliesToHost("accounts.google.com", "accounts.google.com"), true);
  assert.equal(cookieAppliesToHost(".google.com", "accounts.google.com"), true);
  assert.equal(cookieAppliesToHost("google.com", "accounts.google.com"), false);
  // A domain cookie covers its own host too (RFC 6265 domain-match).
  assert.equal(cookieAppliesToHost(".accounts.google.com", "accounts.google.com"), true);
  assert.equal(cookieAppliesToHost("mail.accounts.google.com", "accounts.google.com"), false);
  assert.equal(cookieAppliesToHost("notgoogle.com", "accounts.google.com"), false);
  // A bare public suffix must never swallow every site.
  assert.equal(cookieAppliesToHost("com", "accounts.google.com"), false);
  assert.equal(cookieAppliesToHost("", "accounts.google.com"), false);
  assert.equal(cookieAppliesToHost("..", "accounts.google.com"), false);
});

test("schema 24 cookies verify and strip the encrypted host digest", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-bridge-v24-"));
  // Independent fixture: Chromium derives AES from the Keychain password,
  // and schema 24 encrypts SHA256(host_key) followed by the cookie value.
  const key = pbkdf2Sync("synthetic-password", "saltysalt", 1003, 16, "sha1");
  try {
    const dbPath = path.join(root, "Cookies");
    const db = new DatabaseSync(dbPath);
    db.exec(`CREATE TABLE meta (key TEXT, value TEXT);
      INSERT INTO meta VALUES ('version', '24');
      CREATE TABLE cookies (
        name TEXT, value TEXT, encrypted_value BLOB, host_key TEXT, path TEXT,
        is_secure INTEGER, is_httponly INTEGER, expires_utc INTEGER, samesite INTEGER)`);
    const cipher = createCipheriv("aes-128-cbc", key, Buffer.alloc(16, 0x20));
    const plaintext = Buffer.concat([createHash("sha256").update(".example.com").digest(), Buffer.from("synthetic-session")]);
    const encrypted = Buffer.concat([Buffer.from("v10"), cipher.update(plaintext), cipher.final()]);
    db.prepare("INSERT INTO cookies VALUES (?,?,?,?,?,?,?,?,?)").run("SID", "", encrypted, ".example.com", "/", 1, 1, 0, 1);
    db.close();
    assert.equal(loadOwnerCookies(dbPath, key, "accounts.example.com")[0]?.value, "synthetic-session");
    const changed = new DatabaseSync(dbPath);
    changed.exec("UPDATE cookies SET host_key = 'accounts.example.com'");
    changed.close();
    assert.throws(() => loadOwnerCookies(dbPath, key, "accounts.example.com"), /host|domain/i);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("chrome's 1601-epoch expiry converts to unix seconds; zero stays a session cookie", () => {
  // 2026-09-08T00:00:00Z = 1788873600 unix → webkit epoch offset added.
  assert.equal(chromeExpiresToUnix((1_788_873_600 + 11_644_473_600) * 1_000_000), 1_788_873_600);
  assert.equal(chromeExpiresToUnix(0), 0);
});

test("the owner's Chrome profile resolves from Local State with a safe fallback", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-bridge-"));
  try {
    assert.equal(resolveChromeProfile(root), "Default");
    mkdirSync(root, { recursive: true });
    writeFileSync(path.join(root, "Local State"), JSON.stringify({ profile: { last_used: "Profile 2" } }));
    assert.equal(resolveChromeProfile(root), "Profile 2");
    for (const last_used of ["../outside", "/tmp/outside", ".", "Profile 2/../../outside", "Profile 2\\outside"]) {
      writeFileSync(path.join(root, "Local State"), JSON.stringify({ profile: { last_used } }));
      assert.equal(resolveChromeProfile(root), "Default");
    }
    writeFileSync(path.join(root, "Local State"), "{ broken");
    assert.equal(resolveChromeProfile(root), "Default");
    assert.ok(chromeUserDataDir(root).includes("Chrome"));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("loadOwnerCookies returns decrypted cookies for the host and nothing else", () => {
  const key = randomBytes(16);
  const root = mkdtempSync(path.join(tmpdir(), "openbot-bridge-db-"));
  const futureExpiry = Math.floor(Date.now() / 1000) + 86_400;
  try {
    const dbPath = path.join(root, "Cookies");
    const db = new DatabaseSync(dbPath);
    db.exec(`CREATE TABLE meta (key TEXT, value TEXT);
      INSERT INTO meta VALUES ('version', '23');
      CREATE TABLE cookies (
      name TEXT, value TEXT, encrypted_value BLOB, host_key TEXT, path TEXT,
      is_secure INTEGER, is_httponly INTEGER, expires_utc INTEGER, samesite INTEGER)`);
    const insert = db.prepare("INSERT INTO cookies VALUES (?,?,?,?,?,?,?,?,?)");
    // Chrome's 1601-epoch microsecond timestamps exceed JS's safe integer
    // range for real 2026+ dates — bind as BigInt exactly like Chrome does.
    insert.run("SID", null, chromeEncrypt("session-secret", key), ".google.com", "/", 1, 1, (BigInt(futureExpiry) + 11_644_473_600n) * 1_000_000n, 1);
    insert.run("NID", null, chromeEncrypt("nid-value", key), "accounts.google.com", "/", 0, 0, 0, 0);
    insert.run("UNRELATED", null, chromeEncrypt("keep-out", key), "example.com", "/", 0, 0, 0, -1);
    insert.run("PLAIN", "plaintext-value", Buffer.alloc(0), "accounts.google.com", "/", 0, 0, 0, -1);
    insert.run("EMPTY", null, Buffer.alloc(0), "accounts.google.com", "/", 0, 0, 0, -1);
    insert.run("HOST_ONLY_PARENT", "not-for-subdomains", Buffer.alloc(0), "google.com", "/", 0, 0, 0, -1);
    insert.run("EXPIRED", "expired", Buffer.alloc(0), "accounts.google.com", "/", 0, 0, 1, -1);
    // Corrupt unrelated ciphertext must never reach decryption.
    insert.run("UNRELATED_BROKEN", null, Buffer.from("v99-do-not-read"), "other.example", "/", 0, 0, 0, -1);
    db.exec("ALTER TABLE cookies ADD COLUMN top_frame_site_key TEXT NOT NULL DEFAULT ''");
    db.exec("INSERT INTO cookies (name, value, host_key, top_frame_site_key) VALUES ('PARTITIONED', 'partition-only', '.google.com', 'https://other.example')");
    db.close();
    const cookies = loadOwnerCookies(dbPath, key, "accounts.google.com");
    const byName = new Map(cookies.map((cookie) => [cookie.name, cookie]));
    assert.equal(cookies.length, 3);
    assert.equal(byName.get("SID")?.value, "session-secret");
    assert.equal(byName.get("SID")?.sameSite, "Lax"); // sameSite 1
    assert.equal(byName.get("SID")?.expires, futureExpiry);
    assert.equal(byName.get("SID")?.secure, true);
    assert.equal(byName.get("NID")?.value, "nid-value");
    assert.equal(byName.get("NID")?.sameSite, "Lax"); // sameSite 0 without secure downgrades
    assert.equal(byName.get("PLAIN")?.value, "plaintext-value");
    assert.equal(byName.has("UNRELATED"), false);
    assert.equal(byName.has("EMPTY"), false);
    assert.equal(byName.has("HOST_ONLY_PARENT"), false);
    assert.equal(byName.has("EXPIRED"), false);
    assert.equal(byName.has("PARTITIONED"), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("cookie copy failure cleans up the database even when copying its WAL fails", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-copy-failure-"));
  try {
    const source = path.join(root, "Source");
    writeFileSync(source, "synthetic db");
    writeFileSync(`${source}-wal`, "synthetic wal");
    let copied = "";
    assert.throws(() => withCopiedChromeCookieStore(source, () => assert.fail("must not read a partial copy"), {
      temporaryRoot: root,
      copyFile: (from, to) => {
        if (String(from).endsWith("-wal")) throw new Error("simulated WAL failure");
        copied = String(to);
        copyFileSync(from, to);
      },
    }), /simulated WAL failure/);
    assert.ok(copied);
    assert.equal(existsSync(path.dirname(copied)), false);
    assert.deepEqual(readdirSync(root).sort(), ["Source", "Source-wal"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("cookie copies are private and all SQLite sidecars are removed on success and read failure", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-copy-private-"));
  try {
    const source = path.join(root, "Source");
    writeFileSync(source, "synthetic db");
    writeFileSync(`${source}-wal`, "synthetic wal");
    for (const fail of [false, true]) {
      const operation = () => withCopiedChromeCookieStore(source, (copy) => {
        if (process.platform !== "win32") {
          assert.equal(statSync(path.dirname(copy)).mode & 0o777, 0o700);
          assert.equal(statSync(copy).mode & 0o777, 0o600);
          assert.equal(statSync(`${copy}-wal`).mode & 0o777, 0o600);
        }
        writeFileSync(`${copy}-shm`, "synthetic sidecar");
        writeFileSync(`${copy}-journal`, "synthetic journal");
        if (fail) throw new Error("simulated read failure");
        return "read";
      }, { temporaryRoot: root });
      if (fail) assert.throws(operation, /simulated read failure/);
      else assert.equal(operation(), "read");
      assert.deepEqual(readdirSync(root).sort(), ["Source", "Source-wal"]);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("a copied real SQLite WAL includes uncheckpointed synthetic sign-ins", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-copy-wal-"));
  const dbPath = path.join(root, "Source");
  const db = new DatabaseSync(dbPath);
  try {
    db.exec(`PRAGMA journal_mode = WAL;
      PRAGMA wal_autocheckpoint = 0;
      CREATE TABLE meta (key TEXT, value TEXT);
      INSERT INTO meta VALUES ('version', '24');
      CREATE TABLE cookies (
        name TEXT, value TEXT, encrypted_value BLOB, host_key TEXT, path TEXT,
        is_secure INTEGER, is_httponly INTEGER, expires_utc INTEGER, samesite INTEGER);
      INSERT INTO cookies VALUES ('SID', 'synthetic-session', NULL, 'example.com', '/', 1, 1, 0, 1);`);
    assert.ok(existsSync(`${dbPath}-wal`));
    const cookies = withCopiedChromeCookieStore(dbPath, (copy) => loadOwnerCookies(copy, Buffer.alloc(16), "example.com"), { temporaryRoot: root });
    assert.equal(cookies[0]?.value, "synthetic-session");
    assert.equal(readdirSync(root).some((name) => name.startsWith("openbot-cookies-")), false);
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("non-web and credential-bearing import URLs fail before any Keychain access", async () => {
  for (const origin of ["file:///tmp/example", "javascript:alert(1)", "ftp://example.com", "https://user:secret@example.com", "invalid"]) {
    await assert.rejects(collectOwnerSessionCookies(origin), /not a website/);
  }
});

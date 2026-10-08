import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmodSync, lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { KEYCHAIN_SERVICE, MacKeychain, keychainAccount, keychainEligible, type KeyStore } from "./keychain.js";

const KEYCHAIN_MARKER = "vault.key.in-keychain";

const VERSION = "v1";

function entryExists(filename: string): boolean {
  try { lstatSync(filename); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export class SecretVault {
  private readonly key: Buffer;
  /** Task T6: where the key lives. */
  readonly keySource: "keychain" | "file" = "file";

  constructor(dataDir: string, options: { useKeychain?: boolean; keyStore?: KeyStore } = {}) {
    const keysDir = path.join(dataDir, "keys");
    const keyPath = path.join(keysDir, "vault.key");
    const marker = path.join(keysDir, KEYCHAIN_MARKER);
    const existingStudio = () => ["openbot.sqlite", "openbot.sqlite-wal", "openbot.sqlite-shm"].some((filename) => entryExists(path.join(dataDir, filename)));
    // Task T6: on a Mac the key lives in the login Keychain; the file stays the fallback.
    if (options.useKeychain ?? keychainEligible(dataDir)) {
      const fromKeychain = this.keyFromKeychain(options.keyStore ?? new MacKeychain(), keychainAccount(dataDir), keyPath, marker, keysDir, existingStudio);
      if (fromKeychain) { this.key = fromKeychain; this.keySource = "keychain"; return; }
    }
    if (!entryExists(keyPath)) {
      // Normal first startup creates the vault before SQLite. Existing SQLite
      // files without their key therefore indicate an incomplete/lost restore,
      // not permission to generate a new encryption identity for this studio.
      if (existingStudio()) throw new Error("This studio's encryption key is missing. Restore keys/vault.key from the same backup as openbot.sqlite before restarting. Sidemates has not generated a replacement key.");
      mkdirSync(keysDir, { recursive: true, mode: 0o700 });
      writeFileSync(keyPath, randomBytes(32), { mode: 0o600, flag: "wx" });
    }
    this.key = readFileSync(keyPath);
    if (this.key.length !== 32) throw new Error("Sidemates' local vault key is invalid.");
    chmodSync(keyPath, 0o600);
  }

  /** The key from the Keychain, moving a key file there first. Null means: use the file. Throws only
   * when the key is known to be in the Keychain but can't be had, so no replacement is ever made. */
  private keyFromKeychain(store: KeyStore, account: string, keyPath: string, marker: string, keysDir: string, existingStudio: () => boolean): Buffer | null {
    let stored: Buffer | null;
    try { stored = store.read(account); }
    catch (error) {
      if (entryExists(marker)) throw error;
      return null;
    }
    const hasFile = entryExists(keyPath);
    if (stored) {
      if (hasFile) {
        if (!readFileSync(keyPath).equals(stored)) throw new Error("This studio has two different encryption keys: keys/vault.key and “Sidemates vault key” in your Keychain. Sidemates changed neither. Keep the one that belongs to this studio's backup and remove the other.");
        rmSync(keyPath); // a move that stopped after saving to the Keychain
      }
      if (!entryExists(marker)) this.writeMarker(keysDir, marker, account);
      return stored;
    }
    if (entryExists(marker) && !hasFile) throw new Error("This studio's encryption key should be in your Keychain (“Sidemates vault key”) but isn't. Restore your login keychain, or keys/vault.key from the same backup as openbot.sqlite. Sidemates has not generated a replacement key.");
    if (!hasFile && existingStudio()) return null; // the file path reports the missing key
    const key = hasFile ? readFileSync(keyPath) : randomBytes(32);
    if (key.length !== 32) return null;
    try {
      store.write(account, key);
      if (!store.read(account)?.equals(key)) throw new Error("The Keychain returned a different key.");
      this.writeMarker(keysDir, marker, account);
    } catch {
      try { store.remove(account); } catch { /* nothing was saved */ }
      if (!hasFile) { mkdirSync(keysDir, { recursive: true, mode: 0o700 }); writeFileSync(keyPath, key, { mode: 0o600, flag: "wx" }); }
      return null;
    }
    if (hasFile) rmSync(keyPath);
    return key;
  }

  private writeMarker(keysDir: string, marker: string, account: string) {
    mkdirSync(keysDir, { recursive: true, mode: 0o700 });
    writeFileSync(marker, `${JSON.stringify({ service: KEYCHAIN_SERVICE, account, note: "The vault key is in the macOS login Keychain as “Sidemates vault key”. This file holds no secret." })}\n`, { mode: 0o600 });
  }

  encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [VERSION, iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
  }

  decrypt(payload: string): string {
    const [version, encodedIv, encodedTag, encodedValue] = payload.split(".");
    if (version !== VERSION || !encodedIv || !encodedTag || !encodedValue) throw new Error("Unsupported secret format.");
    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(encodedIv, "base64url"));
    decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encodedValue, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  }
}

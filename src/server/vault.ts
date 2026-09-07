import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmodSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

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

  constructor(dataDir: string) {
    const keysDir = path.join(dataDir, "keys");
    const keyPath = path.join(keysDir, "vault.key");
    if (!entryExists(keyPath)) {
      // Normal first startup creates the vault before SQLite. Existing SQLite
      // files without their key therefore indicate an incomplete/lost restore,
      // not permission to generate a new encryption identity for this studio.
      const existingStudio = ["openbot.sqlite", "openbot.sqlite-wal", "openbot.sqlite-shm"]
        .some((filename) => entryExists(path.join(dataDir, filename)));
      if (existingStudio) throw new Error("This studio's encryption key is missing. Restore keys/vault.key from the same backup as openbot.sqlite before restarting. OpenBot has not generated a replacement key.");
      mkdirSync(keysDir, { recursive: true, mode: 0o700 });
      writeFileSync(keyPath, randomBytes(32), { mode: 0o600, flag: "wx" });
    }
    this.key = readFileSync(keyPath);
    if (this.key.length !== 32) throw new Error("OpenBot's local vault key is invalid.");
    chmodSync(keyPath, 0o600);
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

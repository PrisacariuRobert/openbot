import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const VERSION = "v1";

export class SecretVault {
  private readonly key: Buffer;

  constructor(dataDir: string) {
    const keysDir = path.join(dataDir, "keys");
    const keyPath = path.join(keysDir, "vault.key");
    mkdirSync(keysDir, { recursive: true, mode: 0o700 });
    if (!existsSync(keyPath)) {
      writeFileSync(keyPath, randomBytes(32), { mode: 0o600, flag: "wx" });
    }
    chmodSync(keyPath, 0o600);
    this.key = readFileSync(keyPath);
    if (this.key.length !== 32) throw new Error("OpenBot's local vault key is invalid.");
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

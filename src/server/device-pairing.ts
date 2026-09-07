import { createHash, randomBytes, randomUUID } from "node:crypto";
import { chmodSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { secureStudioBase } from "./relay-address.js";

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export const PAIRING_TTL_MS = 5 * 60_000;
const ticketPattern = /^[A-Za-z0-9_-]{43}$/;
const deviceKeyPattern = /^obd_[A-Za-z0-9_-]{43}$/;
export type PairedDevice = { id: string; name: string; createdAt: number; lastUsedAt: number; revokedAt: number | null };

/** Only hashes are durable. The invitation never contains the owner's key. */
export class DevicePairing {
  private readonly db: DatabaseSync;
  constructor(filename: string) {
    this.db = new DatabaseSync(filename);
    if (filename !== ":memory:") chmodSync(filename, 0o600);
    this.db.exec(`
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS devices (id TEXT PRIMARY KEY, name TEXT NOT NULL, keyHash TEXT UNIQUE NOT NULL, createdAt INTEGER NOT NULL, lastUsedAt INTEGER NOT NULL, revokedAt INTEGER);
      CREATE TABLE IF NOT EXISTS invitations (ticketHash TEXT PRIMARY KEY, expiresAt INTEGER NOT NULL, deviceId TEXT);
    `);
  }
  close() { this.db.close(); }
  invite(at = Date.now()) {
    const ticket = randomBytes(32).toString("base64url");
    this.db.prepare("DELETE FROM invitations WHERE deviceId IS NULL OR expiresAt <= ?").run(at);
    this.db.prepare("INSERT INTO invitations(ticketHash, expiresAt) VALUES (?, ?)").run(digest(ticket), at + PAIRING_TTL_MS);
    return { ticket, expiresAt: at + PAIRING_TTL_MS };
  }
  cancel() { this.db.prepare("DELETE FROM invitations WHERE deviceId IS NULL").run(); }
  redeem(ticket: string, key: string, name: string, at = Date.now()): { deviceId: string } | null {
    if (!ticketPattern.test(ticket) || !deviceKeyPattern.test(key)) return null;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const invite = this.db.prepare("SELECT * FROM invitations WHERE ticketHash = ? AND expiresAt > ?").get(digest(ticket), at) as { deviceId: string | null } | undefined;
      if (!invite) { this.db.exec("ROLLBACK"); return null; }
      // A lost response may be retried only by the exact same device key.
      if (invite.deviceId) {
        const device = this.db.prepare("SELECT id FROM devices WHERE id = ? AND keyHash = ? AND revokedAt IS NULL").get(invite.deviceId, digest(key));
        this.db.exec("ROLLBACK");
        return device ? { deviceId: invite.deviceId } : null;
      }
      const count = this.db.prepare("SELECT count(*) AS n FROM devices WHERE revokedAt IS NULL").get() as { n: number };
      if (count.n >= 50 || this.db.prepare("SELECT id FROM devices WHERE keyHash = ?").get(digest(key))) { this.db.exec("ROLLBACK"); return null; }
      const id = randomUUID();
      const cleanName = name.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 80) || "iPhone";
      this.db.prepare("INSERT INTO devices(id,name,keyHash,createdAt,lastUsedAt) VALUES(?,?,?,?,?)").run(id, cleanName, digest(key), at, at);
      this.db.prepare("UPDATE invitations SET deviceId = ? WHERE ticketHash = ?").run(id, digest(ticket));
      this.db.exec("COMMIT");
      return { deviceId: id };
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  authenticate(key: string | null | undefined, at = Date.now()): string | null {
    if (!key || !deviceKeyPattern.test(key)) return null;
    const device = this.db.prepare("SELECT id, lastUsedAt FROM devices WHERE keyHash = ? AND revokedAt IS NULL").get(digest(key)) as { id: string; lastUsedAt: number } | undefined;
    if (!device) return null;
    if (at - device.lastUsedAt > 60_000) this.db.prepare("UPDATE devices SET lastUsedAt = ? WHERE id = ?").run(at, device.id);
    return device.id;
  }
  list(): PairedDevice[] {
    return this.db.prepare("SELECT id,name,createdAt,lastUsedAt,revokedAt FROM devices ORDER BY createdAt DESC LIMIT 100").all() as PairedDevice[];
  }
  revoke(id: string, at = Date.now()) { return this.db.prepare("UPDATE devices SET revokedAt = ? WHERE id = ? AND revokedAt IS NULL").run(at, id).changes > 0; }
}

export function pairingLink(server: string, ticket: string): string {
  const base = secureStudioBase(server);
  if (!base || !ticketPattern.test(ticket)) throw new Error("Pairing requires a secure studio address.");
  // Fragments aren't sent in HTTP requests, access logs or referrers.
  return `openbot://pair?server=${encodeURIComponent(base)}#${ticket}`;
}

import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const FILE_NAME = ".desktop-instance-id";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Stable, non-secret identity for the studio this desktop installation owns. */
export function studioIdentity(dataDir) {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const file = path.join(dataDir, FILE_NAME);
  const databaseFiles = ["openbot.sqlite", "openbot.sqlite-wal", "openbot.sqlite-shm"];
  if (databaseFiles.some(name => existsSync(path.join(dataDir, name))) && !existsSync(path.join(dataDir, "keys", "vault.key"))) {
    throw new Error("The data home has a database but no matching vault key. Restore the complete backup before opening OpenBot.");
  }
  if (!existsSync(file)) {
    try { writeFileSync(file, `${randomUUID()}\n`, { flag: "wx", mode: 0o600 }); }
    catch (error) { if (error?.code !== "EEXIST") throw error; }
  }
  const stat = lstatSync(file);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error("The desktop studio identity is not a regular file. Check the data home before opening OpenBot.");
  const identity = readFileSync(file, "utf8").trim();
  if (!UUID.test(identity)) throw new Error("The desktop studio identity is invalid. Restore the matching data home before opening OpenBot.");
  return identity;
}

export function studioHealth(statusCode, responseHeaders, bundled) {
  if (!bundled) return statusCode === 200 ? "ready" : "retry";
  if (responseHeaders["x-openbot-desktop-match"] !== "1") return "wrong-studio";
  return statusCode === 200 ? "ready" : "retry";
}

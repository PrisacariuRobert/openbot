#!/usr/bin/env node
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { createReadStream, existsSync, lstatSync, mkdtempSync, rmSync } from "node:fs";
import { chmod, mkdir, open, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const MAGIC = Buffer.from("OBHOME01", "ascii");
const TAG_BYTES = 16;
const MAX_HEADER_BYTES = 4_096;
const CONTENTS = ["data", "home", "projects"];

function fail(message) { throw new Error(message); }

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 16 * 1_024 * 1_024 });
  if (result.error) fail(`${command} could not start: ${result.error.message}`);
  if (result.status !== 0) fail((result.stderr || result.stdout || `${command} failed.`).trim());
  return result.stdout;
}

async function passphrase() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  const value = Buffer.concat(chunks).toString("utf8").replace(/[\r\n]+$/, "");
  if (value.length < 12 || Buffer.byteLength(value) > 1_024) fail("Use a transfer passphrase with at least 12 characters.");
  return value;
}

function deriveKey(secret, salt) {
  return scryptSync(secret, salt, 32, { N: 32_768, r: 8, p: 1, maxmem: 64 * 1_024 * 1_024 });
}

async function encryptFile(input, output, header, secret) {
  const headerBytes = Buffer.from(JSON.stringify(header), "utf8");
  if (headerBytes.length > MAX_HEADER_BYTES) fail("The transfer header is too large.");
  const prefix = Buffer.alloc(MAGIC.length + 4 + headerBytes.length);
  MAGIC.copy(prefix, 0);
  prefix.writeUInt32BE(headerBytes.length, MAGIC.length);
  headerBytes.copy(prefix, MAGIC.length + 4);
  const key = deriveKey(secret, Buffer.from(header.salt, "base64url"));
  const cipher = createCipheriv("aes-256-gcm", key, Buffer.from(header.iv, "base64url"));
  cipher.setAAD(headerBytes);
  const destination = await open(output, "wx", 0o600);
  try {
    await destination.write(prefix);
    for await (const chunk of createReadStream(input).pipe(cipher)) await destination.write(chunk);
    await destination.write(cipher.getAuthTag());
    await destination.sync();
  } finally {
    await destination.close();
  }
}

async function decryptFile(input, output, secret) {
  const source = await open(input, "r");
  try {
    const metadata = await source.stat();
    if (metadata.size < MAGIC.length + 4 + TAG_BYTES + 1) fail("That file is not a complete OpenBot home transfer.");
    const prefix = Buffer.alloc(MAGIC.length + 4);
    await source.read(prefix, 0, prefix.length, 0);
    if (!prefix.subarray(0, MAGIC.length).equals(MAGIC)) fail("That file is not an OpenBot private-home transfer.");
    const headerLength = prefix.readUInt32BE(MAGIC.length);
    if (headerLength < 2 || headerLength > MAX_HEADER_BYTES || metadata.size <= prefix.length + headerLength + TAG_BYTES) fail("That OpenBot transfer header is invalid.");
    const headerBytes = Buffer.alloc(headerLength);
    await source.read(headerBytes, 0, headerLength, prefix.length);
    let header;
    try { header = JSON.parse(headerBytes.toString("utf8")); }
    catch { fail("That OpenBot transfer header is unreadable."); }
    if (header?.format !== "openbot.private-home" || header?.version !== 1 || header?.cipher !== "aes-256-gcm" || header?.kdf !== "scrypt" || !Array.isArray(header?.contents)) fail("That OpenBot transfer version is not supported.");
    const salt = Buffer.from(String(header.salt || ""), "base64url");
    const iv = Buffer.from(String(header.iv || ""), "base64url");
    if (salt.length !== 16 || iv.length !== 12) fail("That OpenBot transfer has invalid encryption metadata.");
    const tag = Buffer.alloc(TAG_BYTES);
    await source.read(tag, 0, TAG_BYTES, metadata.size - TAG_BYTES);
    const decipher = createDecipheriv("aes-256-gcm", deriveKey(secret, salt), iv);
    decipher.setAAD(headerBytes);
    decipher.setAuthTag(tag);
    const destination = await open(output, "wx", 0o600);
    try {
      const start = prefix.length + headerLength;
      const end = metadata.size - TAG_BYTES - 1;
      for await (const chunk of createReadStream(input, { start, end }).pipe(decipher)) await destination.write(chunk);
      await destination.sync();
    } catch {
      fail("The passphrase is wrong or this transfer file was changed.");
    } finally {
      await destination.close();
    }
    return header;
  } finally {
    await source.close();
  }
}

function safeArchiveEntries(listing) {
  const entries = listing.split("\n").filter(Boolean);
  if (!entries.length) fail("The transfer archive is empty.");
  const roots = new Set();
  for (const entry of entries) {
    const normalized = entry.replace(/^\.\//, "").replace(/\/$/, "");
    if (!normalized || normalized.startsWith("/") || normalized.includes("\0")) fail("The transfer contains an unsafe path.");
    const pieces = normalized.split("/");
    if (pieces.some((piece) => piece === "..") || !CONTENTS.includes(pieces[0])) fail("The transfer contains files outside the OpenBot home.");
    roots.add(pieces[0]);
  }
  for (const root of CONTENTS) if (!roots.has(root)) fail(`The transfer is missing its ${root} folder.`);
}

function safeArchiveKinds(listing) {
  const entries = listing.split("\n").filter(Boolean);
  if (entries.some((entry) => entry[0] !== "d" && entry[0] !== "-")) fail("The transfer contains links or special files that OpenBot will not restore.");
}

export async function exportHome(root, output, secret) {
  const resolvedRoot = path.resolve(root);
  const resolvedOutput = path.resolve(output);
  if (!path.isAbsolute(root) || !path.isAbsolute(output)) fail("Private-home transfer paths must be absolute.");
  for (const item of CONTENTS) {
    const target = path.join(resolvedRoot, item);
    if (!existsSync(target) || !lstatSync(target).isDirectory() || lstatSync(target).isSymbolicLink()) fail(`The private home is missing its ${item} folder.`);
  }
  await mkdir(path.dirname(resolvedOutput), { recursive: true, mode: 0o700 });
  const temporary = mkdtempSync(path.join(tmpdir(), "openbot-home-export-"));
  const archive = path.join(temporary, "home.tar.gz");
  try {
    run("tar", ["-C", resolvedRoot, "-czf", archive, "--", ...CONTENTS]);
    const header = {
      format: "openbot.private-home",
      version: 1,
      cipher: "aes-256-gcm",
      kdf: "scrypt",
      createdAt: new Date().toISOString(),
      contents: CONTENTS,
      salt: randomBytes(16).toString("base64url"),
      iv: randomBytes(12).toString("base64url"),
    };
    await encryptFile(archive, resolvedOutput, header, secret);
    await chmod(resolvedOutput, 0o600);
    return { output: resolvedOutput, createdAt: header.createdAt, bytes: (await stat(resolvedOutput)).size };
  } catch (error) {
    rmSync(resolvedOutput, { force: true });
    throw error;
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

export async function importHome(input, staging, secret) {
  const resolvedInput = path.resolve(input);
  const resolvedStaging = path.resolve(staging);
  if (!path.isAbsolute(input) || !path.isAbsolute(staging) || existsSync(resolvedStaging)) fail("Use an absolute transfer file and a new staging folder.");
  const temporary = mkdtempSync(path.join(tmpdir(), "openbot-home-import-"));
  const archive = path.join(temporary, "home.tar.gz");
  try {
    const header = await decryptFile(resolvedInput, archive, secret);
    safeArchiveEntries(run("tar", ["-tzf", archive]));
    safeArchiveKinds(run("tar", ["-tvzf", archive]));
    await mkdir(resolvedStaging, { mode: 0o700 });
    run("tar", ["-xzf", archive, "-C", resolvedStaging, "--no-same-owner", "--no-same-permissions"]);
    return { staging: resolvedStaging, createdAt: header.createdAt };
  } catch (error) {
    rmSync(resolvedStaging, { recursive: true, force: true });
    throw error;
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

async function main() {
  const [action, source, destination] = process.argv.slice(2);
  const secret = await passphrase();
  if (action === "export" && source && destination) {
    const result = await exportHome(source, destination, secret);
    console.log(`Encrypted OpenBot home created at ${result.output}`);
    return;
  }
  if (action === "import" && source && destination) {
    const result = await importHome(source, destination, secret);
    console.log(`Encrypted OpenBot home verified and staged at ${result.staging}`);
    return;
  }
  fail("Use export <private-home-root> <output-file> or import <transfer-file> <staging-folder>.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : "Private-home transfer failed."); process.exit(1); });
}

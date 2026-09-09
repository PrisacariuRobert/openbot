import { execFile } from "node:child_process";
import { createDecipheriv, createHash, pbkdf2Sync, timingSafeEqual } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { DatabaseSync } from "node:sqlite";

const execFileAsync = promisify(execFile);

/** One cookie read out of the owner's own Chrome, ready for the teammate's
 * private browser. Values stay inside the host process: they are never
 * logged, displayed or sent to the model. */
export interface OwnerCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  /** Unix seconds; 0 means a session cookie. */
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "Strict" | "Lax" | "None" | null;
}

export function chromeUserDataDir(home: string = homedir()): string {
  if (process.env.OPENBOT_CHROME_USER_DATA) return process.env.OPENBOT_CHROME_USER_DATA;
  if (process.platform === "darwin") return path.join(home, "Library", "Application Support", "Google", "Chrome");
  if (process.platform === "linux") return path.join(home, ".config", "google-chrome");
  return path.join(home, "AppData", "Local", "Google", "Chrome", "User Data");
}

export function resolveChromeProfile(userDataDir: string): string {
  try {
    const state = JSON.parse(readFileSync(path.join(userDataDir, "Local State"), "utf8")) as { profile?: { last_used?: unknown } };
    const used = state.profile?.last_used;
    // Local State names a directory, not an arbitrary path outside Chrome.
    return typeof used === "string" && /^(?:Default|Profile [0-9]+)$/.test(used) ? used : "Default";
  } catch {
    return "Default";
  }
}

/** Chromium macOS v10 uses PBKDF2-HMAC-SHA1, not the raw Keychain password.
 * Keep this legacy format compatible with Chromium; it is not a new cipher.
 * See components/os_crypt/async/browser/keychain_key_provider.mm. */
export function deriveChromeSafeStorageKey(password: Buffer): Buffer {
  if (!password.length) throw new Error("The Chrome session key is unusable.");
  return pbkdf2Sync(password, "saltysalt", 1003, 16, "sha1");
}

/** macOS guards Chrome's password with the Keychain. Access may ask the
 * owner for approval; OpenBot never changes the Keychain access policy. */
export async function readChromeSafeStorageKey(): Promise<Buffer> {
  if (process.platform !== "darwin") throw new Error("The own-browser bridge currently works on macOS.");
  try {
    const { stdout } = await execFileAsync("security", ["find-generic-password", "-w", "-s", "Chrome Safe Storage", "-a", "Chrome"], { encoding: "buffer" });
    const raw = stdout as Buffer;
    try {
      const password = raw.length && raw.at(-1) === 0x0a ? raw.subarray(0, -1) : raw;
      return deriveChromeSafeStorageKey(password);
    } finally {
      raw.fill(0);
    }
  } catch {
    throw new Error("macOS needs your Keychain approval to read Chrome’s session key. Approve the prompt, then import again.");
  }
}

/** Chrome's macOS cookie format: "v10" + AES-128-CBC with a derived key.
 * Cookie schema 24+ prefixes the plaintext with SHA256 of the exact host_key.
 * See net/extras/sqlite/sqlite_persistent_cookie_store.cc. */
export function decryptChromeCookie(encrypted: Buffer, key: Buffer, hostKey?: string, schemaVersion = 23): string {
  if (encrypted.subarray(0, 3).toString("latin1") !== "v10") throw new Error("Unsupported cookie encryption.");
  if (key.length !== 16) throw new Error("The Chrome session key is unusable.");
  const decipher = createDecipheriv("aes-128-cbc", key, Buffer.alloc(16, 0x20));
  const plaintext = Buffer.concat([decipher.update(encrypted.subarray(3)), decipher.final()]);
  try {
    if (schemaVersion < 24) return plaintext.toString("utf8");
    if (!hostKey || plaintext.length < 32 || !timingSafeEqual(plaintext.subarray(0, 32), createHash("sha256").update(hostKey).digest())) {
      throw new Error("The Chrome cookie does not match its host. Sign in again before importing.");
    }
    return plaintext.subarray(32).toString("utf8");
  } finally {
    plaintext.fill(0);
  }
}

/** Whether a Chrome cookie row (host_key) applies to the page host. Handles
 * exact hosts and dot-form domain cookies; a more specific host never leaks
 * a sibling subdomain's cookie. */
export function cookieAppliesToHost(hostKey: string, host: string): boolean {
  const clean = hostKey.replace(/^\./, "").toLowerCase();
  const target = host.toLowerCase();
  if (!clean || !target) return false;
  if (!clean.includes(".") || !/^([a-z0-9-]+\.)*[a-z0-9-]+$/.test(clean)) return false;
  return clean === target || (hostKey.startsWith(".") && target.endsWith(`.${clean}`));
}

/** Chrome stores cookie expiry as microseconds since 1601-01-01; zero means
 * a session cookie. */
export function chromeExpiresToUnix(expiresUtc: number): number {
  if (!expiresUtc || expiresUtc <= 0) return 0;
  return Math.floor(expiresUtc / 1_000_000 - 11_644_473_600);
}

function chromeSameSite(value: number, secure: boolean): OwnerCookie["sameSite"] {
  if (value === 2) return "Strict";
  if (value === 1) return "Lax";
  if (value === 0) return secure ? "None" : "Lax";
  return null;
}

/** Read only domain-matching rows from a copied store. The temporary copy
 * contains the database, but unrelated cookie values are not selected or
 * decrypted. Partitioned cookies are omitted: this bridge cannot preserve
 * their top-level-site binding and must not turn them into ordinary cookies. */
export function loadOwnerCookies(cookiesDbPath: string, key: Buffer, host: string): OwnerCookie[] {
  const target = host.toLowerCase();
  if (!cookieAppliesToHost(target, target)) throw new Error("That sign-in host is not supported.");
  const candidates = [target];
  const labels = target.split(".");
  while (labels.length > 1) {
    candidates.push(`.${labels.join(".")}`);
    labels.shift();
  }
  const db = new DatabaseSync(cookiesDbPath, { readOnly: true });
  try {
    const meta = db.prepare("SELECT value FROM meta WHERE key = 'version'").get();
    const schemaVersion = Number(meta?.value);
    if (!Number.isInteger(schemaVersion) || schemaVersion < 1) throw new Error("The Chrome cookie store version is not supported.");
    const columns = db.prepare("PRAGMA table_info(cookies)").all();
    const partitionFilter = columns.some((column) => column.name === "top_frame_site_key") ? " AND top_frame_site_key = ''" : "";
    const rows = db.prepare(`SELECT name, value, encrypted_value, host_key, path, is_secure, is_httponly, CAST(expires_utc AS TEXT) AS expires_utc, samesite FROM cookies WHERE host_key IN (${candidates.map(() => "?").join(",")})${partitionFilter}`).all(...candidates) as Array<{
      name: string | null; value: string | null; encrypted_value: Buffer; host_key: string | null; path: string | null;
      is_secure: number; is_httponly: number; expires_utc: number | bigint; samesite: number | bigint | null;
    }>;
    const cookies: OwnerCookie[] = [];
    for (const row of rows) {
      const hostKey = String(row.host_key || "");
      if (!cookieAppliesToHost(hostKey, target)) continue;
      const name = String(row.name || "");
      if (!name) continue;
      let value = String(row.value || "");
      if (value && row.encrypted_value?.length) throw new Error("The Chrome cookie store contains conflicting values. Sign in again before importing.");
      if (!value && row.encrypted_value?.length) value = decryptChromeCookie(Buffer.from(row.encrypted_value), key, hostKey, schemaVersion);
      if (!value) continue;
      const expires = chromeExpiresToUnix(Number(row.expires_utc || 0));
      if (expires !== 0 && expires <= Math.floor(Date.now() / 1000)) continue;
      const secure = Number(row.is_secure) === 1;
      cookies.push({
        name, value,
        domain: hostKey,
        path: String(row.path || "/") || "/",
        expires,
        httpOnly: Number(row.is_httponly) === 1,
        secure,
        sameSite: chromeSameSite(Number(row.samesite ?? -1), secure),
      });
    }
    return cookies;
  } finally {
    db.close();
  }
}

/** Open the sign-in page in the owner's real Chrome (the one browser the
 * provider cannot refuse). Chrome is opened explicitly — not the default
 * browser — because only its cookie store can be imported afterwards. */
export async function openInOwnersChrome(url: string): Promise<void> {
  if (process.platform !== "darwin") throw new Error("The own-browser bridge currently works on macOS.");
  await execFileAsync("open", ["-a", "Google Chrome", ownerWebsiteUrl(url).href]);
}

function ownerWebsiteUrl(value: string): URL {
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || !url.hostname) throw new Error();
    return url;
  } catch {
    throw new Error("That sign-in address is not a website.");
  }
}

/** Scope all sensitive copies and SQLite sidecars to one owner-only folder.
 * The injectable copy operation lets tests reproduce a WAL-copy failure
 * without opening Chrome, reading Keychain or using any real account data. */
export function withCopiedChromeCookieStore<T>(
  cookiesPath: string,
  read: (copy: string) => T,
  options: { temporaryRoot?: string; copyFile?: typeof copyFileSync } = {},
): T {
  const directory = mkdtempSync(path.join(options.temporaryRoot ?? tmpdir(), "openbot-cookies-"));
  try {
    chmodSync(directory, 0o700);
    const copy = path.join(directory, "Cookies");
    const copyFile = options.copyFile ?? copyFileSync;
    copyFile(cookiesPath, copy);
    chmodSync(copy, 0o600);
    const wal = `${cookiesPath}-wal`;
    if (existsSync(wal)) {
      copyFile(wal, `${copy}-wal`);
      chmodSync(`${copy}-wal`, 0o600);
    }
    return read(copy);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/** Full read pass: resolve the owner's Chrome profile, copy the cookie store
 * (plus its WAL so un-checkpointed sign-ins are included), decrypt the
 * cookies for this origin only, and delete the copy. */
export async function collectOwnerSessionCookies(origin: string): Promise<OwnerCookie[]> {
  const host = ownerWebsiteUrl(origin).hostname;
  if (process.platform !== "darwin") throw new Error("The own-browser bridge currently works on macOS.");
  const userData = chromeUserDataDir();
  const profile = resolveChromeProfile(userData);
  const cookiesPath = path.join(userData, profile, "Cookies");
  if (!existsSync(cookiesPath)) throw new Error("Chrome’s cookie store was not found. Make sure Chrome is installed, sign in, quit Chrome, then import again.");
  const key = await readChromeSafeStorageKey();
  try {
    const cookies = withCopiedChromeCookieStore(cookiesPath, (copy) => loadOwnerCookies(copy, key, host));
    if (!cookies.length) {
      throw new Error(`No session for ${host} was found yet. Sign in in the Chrome window, quit Chrome completely (Cmd+Q), then import again.`);
    }
    return cookies;
  } finally {
    key.fill(0);
  }
}

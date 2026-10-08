/** Task T6: the vault key in the macOS login Keychain, through the `security`
 * command. The key goes in on stdin (`security -i`), never on a command line
 * other processes could read. Replaceable runner for tests; macOS only. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export interface KeyStore {
  /** The stored key, null when there is none; throws when the Keychain can't be read (locked, denied). */
  read(account: string): Buffer | null;
  write(account: string, key: Buffer): void;
  remove(account: string): void;
}

export const KEYCHAIN_SERVICE = "app.sidemates.vault";
export type SecurityRunner = (args: string[], input?: string) => { status: number; stdout: string };

const SECURITY = "/usr/bin/security";
export const runSecurity: SecurityRunner = (args, input) => {
  try {
    const stdout = execFileSync(SECURITY, args, { input, encoding: "utf8", timeout: 10_000, stdio: ["pipe", "pipe", "pipe"] });
    return { status: 0, stdout };
  } catch (error) {
    const failure = error as { status?: number | null; stdout?: string };
    return { status: typeof failure.status === "number" ? failure.status : 1, stdout: String(failure.stdout ?? "") };
  }
};

/** `security` exits 44 when no such item exists. */
const NOT_FOUND = 44;

export class MacKeychain implements KeyStore {
  constructor(private readonly run: SecurityRunner = runSecurity) {}
  read(account: string): Buffer | null {
    const result = this.run(["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", account, "-w"]);
    if (result.status === NOT_FOUND) return null;
    if (result.status !== 0) throw new Error("macOS didn't hand over Sidemates' key from your Keychain. Unlock your login keychain (or allow Sidemates when macOS asks) and start Sidemates again.");
    const key = Buffer.from(result.stdout.trim(), "base64");
    if (key.length !== 32) throw new Error("The Sidemates key in your Keychain isn't valid.");
    return key;
  }
  write(account: string, key: Buffer) {
    // Quoted for security's own command parser; base64 and the account hash need no escaping.
    const command = `add-generic-password -U -s ${KEYCHAIN_SERVICE} -a ${account} -l "Sidemates vault key" -j "Encrypts the API keys and sign-ins Sidemates saves on this Mac." -w ${key.toString("base64")}\n`;
    if (this.run(["-i"], command).status !== 0) throw new Error("The key couldn't be saved in your Keychain.");
  }
  remove(account: string) { this.run(["delete-generic-password", "-s", KEYCHAIN_SERVICE, "-a", account]); }
}

/** One Keychain item per studio: the account is a hash of the data folder's path, the same whether
 * or not the folder exists yet (the vault is made before the database on a first start). */
export function keychainAccount(dataDir: string): string {
  return `studio-${createHash("sha256").update(path.resolve(dataDir)).digest("hex").slice(0, 24)}`;
}

/** The Keychain is used on macOS for a real studio. Temporary folders (every test) and an explicit opt-out keep the file. */
export function keychainEligible(dataDir: string, env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): boolean {
  if (platform !== "darwin" || env.OPENBOT_VAULT_KEYCHAIN === "0") return false;
  const resolved = (value: string) => { try { return realpathSync(value); } catch { return path.resolve(value); } };
  const folder = resolved(dataDir);
  return ![resolved(tmpdir()), "/tmp", "/private/tmp", "/var/folders", "/private/var/folders"].some((temporary) => folder === temporary || folder.startsWith(temporary + path.sep));
}

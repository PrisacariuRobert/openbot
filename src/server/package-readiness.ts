/**
 * P01 — Installable Mac candidate + controlled runtime updates (backend).
 *
 * Backend-only. No Codex UI/client changes. Packages the existing Codex
 * native client without UI changes + current embedded host/runtime/browser
 * contract into the exact unsigned artifact. No paid Apple signing required.
 * Unsigned status must be clear; no global OS-protection disable.
 */

export type PackageIdentity = {
  appVersion: string;
  backendVersion: string;
  runtimeVersion: string;
  browserVersion: string;
  packageHash: string;
};

export function packageIdentityValid(identity: PackageIdentity, expected: PackageIdentity): boolean {
  return (
    identity.appVersion === expected.appVersion &&
    identity.backendVersion === expected.backendVersion &&
    identity.runtimeVersion === expected.runtimeVersion &&
    identity.browserVersion === expected.browserVersion &&
    identity.packageHash === expected.packageHash
  );
}

/** Never swap an active task's executable; preserve DB/vault/files/profile. */
export function updateSafe(input: { activeTasks: number; dbCompatible: boolean; vaultCompatible: boolean }): boolean {
  if (input.activeTasks > 0) return false;
  return input.dbCompatible && input.vaultCompatible;
}

/** Backup/restore requires the correct DB/WAL/key pair + profile protection.
 * Missing keys reject; never generate replacement credentials over data. */
export function restoreAllowed(input: { hasDb: boolean; hasWal: boolean; hasKey: boolean }): boolean {
  return input.hasDb && input.hasKey;
}

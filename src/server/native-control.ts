/**
 * B05 — Permission-bounded native computer control (non-UI bridges only).
 *
 * Backend-only. No Codex UI/client changes. Native views, UI models and
 * presentation files remain read-only. This module is the capability
 * interface + permission gate; macOS AX/ScreenCapture bridges plug in here
 * when the owner grants them. No global capture by onboarding.
 *
 * First supported platform: macOS. Other OS/VM drivers remain capability
 * interfaces until separately built — no cross-platform parity claim.
 */

export type NativePermission = "screen-capture" | "accessibility" | "file-dialog";

export type NativePermissionState = {
  permission: NativePermission;
  granted: boolean;
  lastCheckedAt: string;
  detail: string | null;
};

export type NativeTarget = {
  windowId: string;
  appId: string;
  displayId: string;
  focusEpoch: string;
  title: string;
};

export type NativeMode = {
  enabled: boolean;
  taskId: string;
  allowedApps: string[];
  allowedWindows: string[];
  startedAt: string | null;
  reason: string | null;
};

/** Browser and Mac permissions are separate; one never implies the other. */
export function nativeModeAllowed(
  browserGranted: boolean,
  nativePermissions: NativePermissionState[],
  requestedApp: string,
): { allowed: true } | { allowed: false; reason: string } {
  void browserGranted;
  const capture = nativePermissions.find((permission) => permission.permission === "screen-capture");
  const ax = nativePermissions.find((permission) => permission.permission === "accessibility");
  if (!capture?.granted) return { allowed: false, reason: "missing-screen-capture-permission" };
  if (!ax?.granted) return { allowed: false, reason: "missing-accessibility-permission" };
  return { allowed: true };
}

/** Foreground identity check: refuse stale/foreign windows. */
export function nativeFocusValid(
  observed: NativeTarget,
  current: NativeTarget,
): boolean {
  return (
    observed.windowId === current.windowId &&
    observed.appId === current.appId &&
    observed.displayId === current.displayId &&
    observed.focusEpoch === current.focusEpoch
  );
}

/** Protected surfaces: unrelated apps, terminals, notifications and
 * password managers are never captured/controlled opportunistically. */
const PROTECTED_APPS = new Set([
  "com.apple.Terminal",
  "com.googlecode.iterm2",
  "com.1password.1password",
  "com.bitwarden.desktop",
  "com.apple.systempreferences",
]);

export function nativeAppProtected(appId: string): boolean {
  return PROTECTED_APPS.has(appId);
}

/** Secure OS dialogs are never auto-approved by the model. */
export function nativeDialogRequiresOwner(title: string): boolean {
  return /permission|accessibility|screen recording|security|password|touch id|approve/i.test(title);
}

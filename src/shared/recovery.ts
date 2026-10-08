/** Never just "I can't": every stopped job comes with the one thing that
 * fixes it, or another way to get it done. */

export type FixAction =
  | { kind: "panel"; panel: "provider" | "usage" | "control" | "bot" }
  | { kind: "setting"; setting: "macAccessEnabled" }
  | { kind: "automatic" }
  | { kind: "open"; url: string }
  | { kind: "retry" };

export interface Fix {
  label: string;
  action: FixAction;
  /** After the fix, the same job runs again by itself. */
  retryAfter: boolean;
}

const LIMIT = /\b(429|rate[ -]?limit\w*|usage limit|quota|insufficient_quota|limit (?:reached|exceeded)|too many requests|out of (?:credits|usage)|credit balance|resource[_ ]exhausted|overloaded|free AI allowance)\b/i;

export function fixFor(reason: string, teammate: { automatic: boolean }): Fix {
  if (/choose an ai provider|choose your ai provider|no usable models|connect an ai/i.test(reason)) return { label: "Connect an AI", action: { kind: "panel", panel: "provider" }, retryAfter: false };
  if (/weekly.*(?:budget|token limit)|weekly limit/i.test(reason)) return { label: "Raise this week's limit", action: { kind: "panel", panel: "usage" }, retryAfter: false };
  if (LIMIT.test(reason)) return teammate.automatic
    ? { label: "Try again on another AI", action: { kind: "retry" }, retryAfter: false }
    : { label: "Let Sidemates pick another AI", action: { kind: "automatic" }, retryAfter: true };
  if (/Privacy & Security → Automation/i.test(reason)) return { label: "Open Automation settings", action: { kind: "open", url: "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation" }, retryAfter: false };
  if (/Full Disk Access/i.test(reason)) return { label: "Open Full Disk Access", action: { kind: "open", url: "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles" }, retryAfter: false };
  if (/(?:mac access|files on this mac|files & apps)[^.]*turned off|turn on files & apps/i.test(reason)) return { label: "Let my team use this Mac's apps", action: { kind: "setting", setting: "macAccessEnabled" }, retryAfter: true };
  if (/chrome, edge or brave|no (?:chrome|chromium)|browser could not (?:start|open)/i.test(reason)) return { label: "Get a browser", action: { kind: "open", url: "https://www.google.com/chrome/" }, retryAfter: false };
  if (/\bdocker\b/i.test(reason)) return { label: "Get Docker", action: { kind: "open", url: "https://www.docker.com/products/docker-desktop/" }, retryAfter: false };
  if (/runtime not verified|could not check the installed opencode/i.test(reason)) return { label: "Check your AI setup", action: { kind: "panel", panel: "provider" }, retryAfter: false };
  return { label: "Try again", action: { kind: "retry" }, retryAfter: false };
}

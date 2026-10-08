import type { CapabilityPanel } from "../studio/capability-navigation";

/** When a job can't finish, the one click that fixes it (task J6). Each pattern
 * matches a message Sidemates itself writes (model-output.ts, the Mac app tools,
 * the Mail and Messages indexes, the browser, the connectors and the runner), so
 * what the conversation says and what the button does always agree. */

type Base = { id: string; title: string; label: string };
export type FailureFix = Base & (
  | { kind: "panel"; panel: Extract<CapabilityPanel, "provider" | "bot" | "connectors"> }
  | { kind: "mac-settings"; pane: "automation" | "accessibility" | "full-disk-access" }
  | { kind: "mac-access" }
  | { kind: "browser-download" }
  | { kind: "retry" }
);

const RULES: Array<[RegExp, FailureFix]> = [
  // The AI: model-output.ts and the provider checks.
  [/free Gemini limit is busy|too many requests this minute/i, { id: "busy-minute", kind: "retry", title: "The free AI limit is busy", label: "Try again" }],
  [/free Gemini allowance for today is used up|free AI allowance is used up|reached a usage or rate limit|quota|credit balance/i, { id: "allowance", kind: "panel", panel: "provider", title: "AI allowance used up", label: "Choose another AI" }],
  [/rejected its sign-in or access|Reconnect that provider/i, { id: "ai-sign-in", kind: "panel", panel: "provider", title: "The AI refused its sign-in", label: "Reconnect your AI" }],
  [/retired this model|restricted to use inside OpenCode|could not read this message or file format|Choose an AI provider and model for this teammate/i, { id: "model", kind: "panel", panel: "bot", title: "This model can't be used", label: "Choose a model" }],
  [/The owner turned off [\w &]+ for /i, { id: "tool-group-off", kind: "panel", panel: "bot", title: "A tool is turned off", label: "Open teammate settings" }],
  [/weekly (?:budget|token limit)/i, { id: "budget", kind: "panel", panel: "bot", title: "Weekly budget reached", label: "Review budget" }],
  // The Mac.
  [/Privacy & Security → Automation/i, { id: "automation", kind: "mac-settings", pane: "automation", title: "macOS needs your okay", label: "Open Automation settings" }],
  [/Privacy & Security → Accessibility/i, { id: "accessibility", kind: "mac-settings", pane: "accessibility", title: "macOS needs your okay", label: "Open Accessibility settings" }],
  [/Full Disk Access/i, { id: "full-disk-access", kind: "mac-settings", pane: "full-disk-access", title: "Full Disk Access needed", label: "Open Full Disk Access" }],
  [/Files & apps on this Mac is turned off|Mac files and apps are turned off/i, { id: "mac-access", kind: "mac-access", title: "Files & apps is off", label: "Turn on Files & apps" }],
  // The browser.
  [/Chrome or Chromium is required/i, { id: "browser-download", kind: "browser-download", title: "No browser on this computer", label: "Get a browser" }],
  [/browser is turned off/i, { id: "browser-off", kind: "panel", panel: "bot", title: "This teammate's browser is off", label: "Turn on the browser" }],
  // Connected apps.
  [/reading was explicitly turned off|reading is turned off/i, { id: "app-reading-off", kind: "panel", panel: "connectors", title: "Reading this app is off", label: "Review app access" }],
  [/needs a quick reconnect|could not finish sign-in|Reconnect it and allow|then reconnect Slack/i, { id: "app-reconnect", kind: "panel", panel: "connectors", title: "An app needs reconnecting", label: "Open Apps & tools" }],
  // Nothing to change, only to try again.
  [/temporarily (?:unavailable|busy)/i, { id: "unavailable", kind: "retry", title: "Not available right now", label: "Try again" }],
  [/took too long|couldn't be reached on this Mac|timed out/i, { id: "no-answer", kind: "retry", title: "No answer in time", label: "Try again" }],
];

export function failureFix(reason: string | null | undefined): FailureFix | null {
  if (!reason) return null;
  return RULES.find(([pattern]) => pattern.test(reason))?.[1] ?? null;
}

export function failureFixById(id: unknown): FailureFix | null {
  return RULES.find(([, fix]) => fix.id === id)?.[1] ?? null;
}

/** A tool failure only the owner can fix: the teammate can't retry its way past
 * it, so the conversation shows it with the fix. Retrying is the teammate's job. */
export function ownerFixForToolError(error: string | null | undefined): FailureFix | null {
  const fix = failureFix(error);
  return fix && fix.kind !== "retry" ? fix : null;
}

/** The owner-facing sentence from a tool error: the first sentence, without the
 * instructions written for the teammate. */
export function ownerSentence(error: string): string {
  const flat = error.replace(/\s+/g, " ").trim();
  const first = flat.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? flat;
  return first.length > 200 ? `${first.slice(0, 199)}…` : first;
}

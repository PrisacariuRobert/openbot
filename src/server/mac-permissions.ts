import { execFile } from "node:child_process";
import { closeSync, openSync, opendirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { Express, Request } from "express";
import { z } from "zod";
import { trustedLocalRequest } from "./auth-security.js";

/** "Set up your Mac" in the guided first run: ask for Calendar and Reminders,
 * and point to Full Disk Access. Only on the Mac that runs Sidemates, because
 * that's where macOS shows its prompts. */

export type AutomationState = "granted" | "denied" | "waiting" | "unavailable" | "error";
export type FullDiskAccessState = "granted" | "missing" | "unknown";

export interface MacPermissionDeps {
  available: boolean;
  requestAccess(app: "Calendar" | "Reminders"): Promise<AutomationState>;
  fullDiskAccess(): FullDiskAccessState;
  openPane(pane: "automation" | "accessibility" | "full-disk-access" | "internet-accounts" | "reveal-app"): void;
  isLocal?(request: Request): boolean;
}

/** Full Disk Access, checked by opening Messages' database or Mail's folder and closing it unread. */
export function probeFullDiskAccess(home = homedir()): FullDiskAccessState {
  const attempts: Array<() => void> = [
    () => closeSync(openSync(path.join(home, "Library/Messages/chat.db"), "r")),
    () => opendirSync(path.join(home, "Library/Mail")).closeSync(),
  ];
  let missing = false;
  for (const attempt of attempts) {
    try { attempt(); return "granted"; } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EPERM" || code === "EACCES") missing = true;
    }
  }
  return missing ? "missing" : "unknown";
}

const PANES = {
  automation: ["x-apple.systempreferences:com.apple.preference.security?Privacy_Automation"],
  accessibility: ["x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"],
  "full-disk-access": ["x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles"],
  // Where a Google account is added for Mail and Calendar (task J5).
  "internet-accounts": ["x-apple.systempreferences:com.apple.Internet-Accounts-Settings.extension"],
  // Inside Sidemates.app, macOS lists the permission as "Sidemates"; show it so it can be switched on.
  "reveal-app": ["-R", process.env.OPENBOT_APP_BUNDLE || process.execPath],
} as const;

export function openSettingsPane(pane: keyof typeof PANES) {
  execFile("open", [...PANES[pane]], () => {});
}

export function registerMacPermissionRoutes(app: Express, deps: MacPermissionDeps) {
  const isLocal = deps.isLocal ?? trustedLocalRequest;
  const lastAnswer: Partial<Record<"Calendar" | "Reminders", AutomationState>> = {};
  const unavailable = (request: Request) => !deps.available || !isLocal(request);

  app.get("/api/mac/permissions", (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    if (unavailable(request)) return response.json({ available: false });
    response.json({ available: true, automation: { Calendar: lastAnswer.Calendar ?? null, Reminders: lastAnswer.Reminders ?? null }, fullDiskAccess: deps.fullDiskAccess() });
  });

  app.post("/api/mac/permissions/request", async (request, response) => {
    if (unavailable(request)) return response.status(409).json({ error: "Set this up on the Mac that runs Sidemates." });
    const parsed = z.object({ app: z.enum(["Calendar", "Reminders"]) }).strict().safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ error: "Choose Calendar or Reminders." });
    const state = await deps.requestAccess(parsed.data.app);
    lastAnswer[parsed.data.app] = state;
    response.json({ app: parsed.data.app, state });
  });

  app.post("/api/mac/permissions/open", (request, response) => {
    if (unavailable(request)) return response.status(409).json({ error: "Set this up on the Mac that runs Sidemates." });
    const parsed = z.object({ pane: z.enum(["automation", "accessibility", "full-disk-access", "internet-accounts", "reveal-app"]) }).strict().safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ error: "Choose a System Settings page." });
    deps.openPane(parsed.data.pane);
    response.json({ ok: true });
  });
}

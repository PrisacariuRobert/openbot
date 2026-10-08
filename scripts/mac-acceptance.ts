/**
 * The real-Mac acceptance kit (task J3). Run it on the demo account, after the
 * setup in qa/mac-acceptance/README.md:
 *
 *   node --import tsx scripts/mac-acceptance.ts            reads only
 *   node --import tsx scripts/mac-acceptance.ts --write    also adds a reminder, a note, an event
 *                                                          and a Mail draft, in the demo list,
 *                                                          folder and calendar only
 *
 * It checks each Mac tool against the real apps, Full Disk Access, the background
 * service and the macOS 27 changes, then writes qa/mac-acceptance/<date>-macos-<version>-<arch>.md.
 * The report holds counts, timings and pass/fail only.
 */
import { execFile } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, opendirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { AppleApps } from "../src/server/mac-apple-apps.js";
import { acceptanceMarkdown, runMacAcceptance } from "../src/server/mac-acceptance.js";
import { probeFullDiskAccess } from "../src/server/mac-permissions.js";

if (process.platform !== "darwin") {
  console.error("The Mac acceptance kit runs on a Mac only (it uses the real Mail, Calendar, Notes, Reminders and Contacts).");
  process.exit(2);
}
const ROOT = path.resolve(import.meta.dirname, "..");
const run = (command: string, args: string[]) => new Promise<{ code: number; stdout: string }>((resolve) => {
  execFile(command, args, { timeout: 30_000 }, (error, stdout) => resolve({ code: error ? Number((error as { code?: number }).code ?? 1) || 1 : 0, stdout: String(stdout) }));
});
const readable = (file: string) => {
  try { if (file.endsWith("/Data")) opendirSync(file).closeSync(); else closeSync(openSync(file, "r")); return true; } catch { return false; }
};
const report = await runMacAcceptance({
  apps: new AppleApps(),
  fullDiskAccess: () => probeFullDiskAccess() === "granted",
  run, readable, exists: existsSync,
  home: homedir(),
  uid: process.getuid?.() ?? 501,
  launchLabel: process.env.OPENBOT_INSTALL_LABEL || "app.sidemates.studio",
  appVersion: (JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")) as { version: string }).version,
  now: () => new Date(),
}, { write: process.argv.includes("--write") });
const out = path.join(ROOT, "qa", "mac-acceptance");
mkdirSync(out, { recursive: true });
const file = path.join(out, `${report.at.slice(0, 10)}-macos-${report.macos}-${report.arch}.md`);
writeFileSync(file, acceptanceMarkdown(report));
for (const check of report.checks) console.log(`${check.status.toUpperCase().padEnd(4)} ${check.area}: ${check.title} · ${check.detail}`);
console.log(`\nReport: ${path.relative(ROOT, file)}. Fill in the "Checked by hand" part, then commit it.`);
process.exit(report.checks.some((check) => check.status === "fail") ? 1 : 0);

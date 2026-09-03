import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const packageLock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const database = readFileSync(new URL("../src/server/database.ts", import.meta.url), "utf8");
const runtime = readFileSync(new URL("../src/server/runtime.ts", import.meta.url), "utf8");
const skillLibrary = readFileSync(new URL("../src/server/skill-library.ts", import.meta.url), "utf8");
const version = packageJson.version;
const failures = [];

if (packageLock.version !== version || packageLock.packages?.[""]?.version !== version) {
  failures.push(`package-lock.json must use version ${version}.`);
}
if (!readme.startsWith(`# OpenBot ${version}\n`)) {
  failures.push(`README.md must start with “# OpenBot ${version}”.`);
}
if (!readme.includes(`## What's new in ${version}\n`)) {
  failures.push(`README.md must contain “## What's new in ${version}”.`);
}
if (!app.includes("room-cluster-motion") || !app.includes("mascot-presence") || !app.includes("mascot-body")) {
  failures.push("The shared studio must keep its independently animated mascot composition.");
}
if (app.includes('/mascots/') || app.includes('className="mascot-art"')) {
  failures.push("Mascots must remain code-drawn and recolorable rather than image-backed.");
}
if (!app.includes("MASCOT_COLORS") || !app.includes('type="color"') || !database.includes('patch.color ?? current.color')) {
  failures.push("Existing teammate appearance customization must remain editable and persistent.");
}
if (!styles.includes(".mascot-state-celebrating .mascot-eye") || !styles.includes("prefers-reduced-motion")) {
  failures.push("The web mascot system must keep celebration and reduced-motion states.");
}
if (!app.includes("function LiveStudioPanel") || !app.includes("function LiveBrowser") || !app.includes('panel === "live"')) {
  failures.push("The release must keep the Live Studio and visible owner browser takeover.");
}
if (!app.includes("function SearchPanel") || !database.includes("searchStudio(rawQuery") || !database.includes("toggleMessageReaction")) {
  failures.push("The release must keep studio-wide search, replies, and reactions.");
}
if (!database.includes("updateThread(id") || !database.includes("duplicateBot(id")) {
  failures.push("The release must keep persistent sections, pins, hide/restore, and safe teammate duplication.");
}
if (!styles.includes(".live-desk-grid") || !styles.includes(".studio-search-results") || !styles.includes(".conversation-organizer")) {
  failures.push("The Live Studio, search, and conversation organization surfaces must remain styled responsively.");
}
if (!database.includes("CREATE TABLE IF NOT EXISTS workflow_versions") || !database.includes("reviseWorkflowRecord") || !database.includes("listWorkflowVersions")) {
  failures.push("The Skill Library must keep immutable versions and non-destructive rollback support.");
}
if (!skillLibrary.includes('format: z.literal("openbot.skill")') || !skillLibrary.includes("createHash") || !skillLibrary.includes("skillSecretFindings")) {
  failures.push("Portable skills must keep their strict format, integrity check, and secret scanner.");
}
if (!runtime.includes("importTaughtWorkflow") || !runtime.includes("assignTaughtWorkflow") || !runtime.includes("rollbackTaughtWorkflow")) {
  failures.push("Portable skill import, teammate assignment, and rollback must remain connected to generated skill files.");
}
if (!app.includes("skill-owner-switcher") || !app.includes("Import reviewed skill") || !app.includes("Useful starters") || !styles.includes(".skill-template-grid")) {
  failures.push("The responsive Skill Library management experience is incomplete.");
}

if (failures.length) {
  console.error(`Release documentation check failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log(`Release documentation matches OpenBot ${version}.`);

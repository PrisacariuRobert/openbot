import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const packageLock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const database = readFileSync(new URL("../src/server/database.ts", import.meta.url), "utf8");
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

if (failures.length) {
  console.error(`Release documentation check failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log(`Release documentation matches OpenBot ${version}.`);

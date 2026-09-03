import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const packageLock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
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
if (!app.includes("room-cluster-motion") || !app.includes("mascot-presence")) {
  failures.push("The shared studio must keep its independently animated mascot composition.");
}
if (!styles.includes(".mascot-state-celebrating .mascot-art-blink") || !styles.includes("prefers-reduced-motion")) {
  failures.push("The web mascot system must keep celebration and reduced-motion states.");
}

if (failures.length) {
  console.error(`Release documentation check failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log(`Release documentation matches OpenBot ${version}.`);

import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import path from "node:path";
import { stageAppPackage } from "./lib/staged-app-package.mjs";
import { appleMarketingVersion } from "./lib/release-version.mjs";

const root = path.resolve(import.meta.dirname, "..");
const app = path.resolve(process.argv[2] || "");
if (!process.argv[2] || !app.endsWith(".app") || !existsSync(path.join(app, "Contents", "MacOS", "OpenBot"))) {
  throw new Error("Usage: node scripts/package-macos-app.mjs /absolute/path/to/OpenBot.app");
}
if (process.platform !== "darwin") throw new Error("The native OpenBot app can only be packaged on macOS.");
const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const appVersion = spawnSync("/usr/libexec/PlistBuddy", ["-c", "Print :CFBundleShortVersionString", path.join(app, "Contents/Info.plist")], { encoding: "utf8" });
if (appVersion.status !== 0 || appVersion.stdout.trim() !== appleMarketingVersion(packageJson.version)) throw new Error("Build the matching native app version before packaging its runner. The existing package was not changed.");
const required = ["dist", "node_modules", "src", "skills", "LICENSE", "THIRD_PARTY_NOTICES.md", "package.json", "package-lock.json", "scripts/background-runner.mjs"];
const openCodePath = [process.env.OPENBOT_OPENCODE_BINARY, path.join(homedir(), ".opencode/bin/opencode"), "/opt/homebrew/bin/opencode", "/usr/local/bin/opencode"].find((candidate) => candidate && existsSync(candidate));
if (!openCodePath) throw new Error("Install the official OpenCode build on the packaging Mac, or set OPENBOT_OPENCODE_BINARY. The desktop package must include its model runtime.");
const nativeArchitecture = { arm64: "arm64", x64: "x86_64" }[process.arch];
if (!nativeArchitecture) throw new Error(`macOS packaging does not support ${process.arch}.`);
for (const [label, executable] of [["native app", path.join(app, "Contents/MacOS/OpenBot")], ["Node", process.execPath], ["OpenCode", openCodePath]]) {
  const architecture = spawnSync("/usr/bin/lipo", [executable, "-verify_arch", nativeArchitecture], { encoding: "utf8", timeout: 10_000 });
  if (architecture.status !== 0) throw new Error(`The ${label} executable does not include ${nativeArchitecture}. Build all bundled executables for the same architecture before packaging. The existing app was not changed.`);
}
const openCodeVersionResult = spawnSync(openCodePath, ["--version"], { encoding: "utf8", timeout: 10_000 });
const openCodeVersion = openCodeVersionResult.stdout?.trim();
if (openCodeVersionResult.status !== 0 || !/^\d+\.\d+\.\d+$/.test(openCodeVersion || "")) throw new Error("The packaging OpenCode executable did not report a supported release version.");
const licenseURL = `https://raw.githubusercontent.com/anomalyco/opencode/v${openCodeVersion}/LICENSE`;
const licenseResponse = await fetch(licenseURL, { signal: AbortSignal.timeout(15_000) });
if (!licenseResponse.ok) throw new Error("The version-matched OpenCode license could not be fetched; the app has not been replaced.");
const openCodeLicense = await licenseResponse.text();
if (openCodeLicense.length > 16_000 || !openCodeLicense.startsWith("MIT License")) throw new Error("Review this OpenCode version's distribution license before packaging it.");
const nodeLicenseResponse = await fetch(`https://raw.githubusercontent.com/nodejs/node/${process.version}/LICENSE`, { signal: AbortSignal.timeout(15_000) });
if (!nodeLicenseResponse.ok) throw new Error("The version-matched Node distribution license could not be included.");
const nodeLicense = await nodeLicenseResponse.text();
if (nodeLicense.length > 2_000_000 || !nodeLicense.includes("Node.js")) throw new Error("Review this Node version's distribution license before packaging it.");
// Validate before replacing a prior package. Linked local development packages
// must not leak source files or make the app depend on the packaging machine.
function validateTree(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      const resolved = realpathSync(filename);
      const relative = path.relative(root, resolved);
      if (path.isAbsolute(readlinkSync(filename)) || !required.some((allowed) => relative === allowed || relative.startsWith(`${allowed}${path.sep}`))) {
        throw new Error(`The runtime contains a link outside its packaged files: ${path.relative(root, filename)}`);
      }
    } else if (entry.isDirectory()) validateTree(filename);
  }
}
for (const relative of required) {
  const source = path.join(root, relative);
  if (!existsSync(source)) throw new Error(`The runtime is missing ${relative}. Run npm install and npm run build first.`);
  if (statSync(source).isDirectory()) validateTree(source);
}
await stageAppPackage(app, async (stagedApp) => {
  const runtime = path.join(stagedApp, "Contents", "Resources", "OpenBotRuntime");
  rmSync(runtime, { recursive: true, force: true });
  // App resources are public executable code, not studio data. A package copied
  // to /Applications must remain readable when another Mac account launches it.
  mkdirSync(runtime, { recursive: true, mode: 0o755 });
  for (const relative of required) {
    const source = path.join(root, relative), destination = path.join(runtime, relative);
    if (!existsSync(source)) throw new Error(`The runtime is missing ${relative}. Run npm install and npm run build first.`);
    mkdirSync(path.dirname(destination), { recursive: true, mode: 0o755 });
    if (statSync(source).isDirectory()) cpSync(source, destination, { recursive: true, preserveTimestamps: true, verbatimSymlinks: true });
    else copyFileSync(source, destination);
  }
  mkdirSync(path.join(runtime, "bin"), { recursive: true, mode: 0o755 });
  copyFileSync(process.execPath, path.join(runtime, "bin", "node"));
  chmodSync(path.join(runtime, "bin", "node"), 0o755);
  copyFileSync(openCodePath, path.join(runtime, "bin", "opencode"));
  chmodSync(path.join(runtime, "bin", "opencode"), 0o755);
  mkdirSync(path.join(runtime, "licenses"), { recursive: true, mode: 0o755 });
  writeFileSync(path.join(runtime, "licenses", "OpenCode-LICENSE.txt"), openCodeLicense, { mode: 0o644 });
  writeFileSync(path.join(runtime, "licenses", "Node-LICENSE.txt"), nodeLicense, { mode: 0o644 });
  writeFileSync(path.join(runtime, "runtime-manifest.json"), `${JSON.stringify({ schemaVersion: 1, version: packageJson.version, createdAt: new Date().toISOString(), nodeVersion: process.version, nodeSourceSHA256: createHash("sha256").update(readFileSync(path.join(runtime, "bin/node"))).digest("hex"), openCodeVersion, openCodeSourceSHA256: createHash("sha256").update(readFileSync(path.join(runtime, "bin/opencode"))).digest("hex"), packageLockSHA256: createHash("sha256").update(readFileSync(path.join(runtime, "package-lock.json"))).digest("hex"), openCodeLicenseSource: licenseURL, platform: process.platform, architecture: process.arch }, null, 2)}\n`, { mode: 0o644 });
  const signed = spawnSync("/usr/bin/codesign", ["--force", "--deep", "--sign", "-", stagedApp], { encoding: "utf8" });
  if (signed.status !== 0) throw new Error(signed.stderr || signed.stdout || "The packaged app could not be signed.");
}, async (stagedApp) => {
  const verified = spawnSync("/usr/bin/codesign", ["--verify", "--deep", "--strict", stagedApp], { encoding: "utf8" });
  if (verified.status !== 0) throw new Error(verified.stderr || verified.stdout || "The packaged app signature could not be verified.");
});
console.log(`Packaged OpenBot ${packageJson.version} with its private runner at ${path.join(app, "Contents/Resources/OpenBotRuntime")}. Ad-hoc development signature only; not a notarized public release.`);

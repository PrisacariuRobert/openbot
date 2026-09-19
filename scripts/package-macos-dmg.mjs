// Website disk image for the unsigned Mac beta (D02, free Apple account).
//
// Takes a staged /absolute/path/to/OpenBot.app (built by Electron)
// and produces OpenBot-<marketing>-macos-<arch>.dmg plus a .sha256 sidecar
// in the output directory. Read-only compressed (UDZO), verified after
// creation, and smoke-mounted to confirm the bundle and its version.
//
// Explicitly NOT performed or claimed here: Developer ID signing,
// notarization, stapling, App Store distribution. macOS Gatekeeper will
// stop a double-click open of the unsigned image; the release notes tell
// users to verify the checksum and right-click Open instead. Never paste
// signing credentials into a chat, issue, or this script.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { appleMarketingVersion } from "./lib/release-version.mjs";

const root = path.resolve(import.meta.dirname, "..");
const app = path.resolve(process.argv[2] || "");
const outDir = path.resolve(process.argv[3] || path.join(root, "dist-release"));
if (!process.argv[2] || !app.endsWith(".app")) {
  throw new Error("Usage: node scripts/package-macos-dmg.mjs /absolute/path/to/OpenBot.app [/absolute/path/to/out-dir]");
}
if (process.platform !== "darwin") throw new Error("Disk images can only be built on macOS.");
if (!existsSync(path.join(app, "Contents", "Info.plist"))) throw new Error("That .app has no Contents/Info.plist. Build it with package:desktop first.");
const plist = spawnSync("/usr/libexec/PlistBuddy", ["-c", "Print :CFBundleShortVersionString", path.join(app, "Contents/Info.plist")], { encoding: "utf8" });
const version = plist.status === 0 ? plist.stdout.trim() : "";
if (!version) throw new Error("The app bundle has no readable CFBundleShortVersionString.");
const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
if (version !== appleMarketingVersion(packageJson.version)) {
  throw new Error(`The app reports ${version} but the repository is ${packageJson.version}. Rebuild matching versions before imaging. Nothing was written.`);
}
const arch = { arm64: "arm64", x64: "x64" }[process.arch];
if (!arch) throw new Error(`macOS disk images do not support ${process.arch}.`);
mkdirSync(outDir, { recursive: true });
const base = `OpenBot-${version}-macos-${arch}`;
const dmg = path.join(outDir, `${base}.dmg`);
const run = (command, args, label) => {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${label} failed: ${(result.stderr || result.stdout || "").trim().slice(0, 400)}`);
  return result;
};
run("/usr/bin/hdiutil", ["create", "-volname", `OpenBot ${version}`, "-srcfolder", app, "-ov", "-format", "UDZO", dmg], "Disk image creation");
run("/usr/bin/hdiutil", ["verify", dmg], "Disk image verification");
const mount = mkdtempSync(path.join(tmpdir(), "openbot-dmg-verify-"));
try {
  run("/usr/bin/hdiutil", ["attach", "-nobrowse", "-readonly", "-mountpoint", mount, dmg], "Disk image mount");
  const staged = path.join(mount, path.basename(app), "Contents/Info.plist");
  if (!existsSync(staged)) throw new Error("The mounted image does not contain the app bundle.");
  const mounted = spawnSync("/usr/libexec/PlistBuddy", ["-c", "Print :CFBundleShortVersionString", staged], { encoding: "utf8" });
  if (mounted.status !== 0 || mounted.stdout.trim() !== version) throw new Error("The mounted image reports a different version than the staged app.");
} finally {
  run("/usr/bin/hdiutil", ["detach", mount, "-force"], "Disk image detach");
  rmSync(mount, { recursive: true, force: true });
}
const digest = createHash("sha256").update(readFileSync(dmg)).digest("hex");
writeFileSync(`${dmg}.sha256`, `${digest}  ${base}.dmg\n`);
console.log(JSON.stringify({ dmg, sha256: `${dmg}.sha256`, version, arch, signed: false, notarized: false }));

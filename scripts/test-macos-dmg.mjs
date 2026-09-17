import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { appleMarketingVersion } from "./lib/release-version.mjs";

// Unsigned website disk image, exercised against a minimal staged bundle.
// No Xcode build, signing identity, or network use. macOS-only by
// construction (hdiutil + PlistBuddy); other platforms skip loudly.
if (process.platform !== "darwin") {
  console.log("SKIP: disk image checks need macOS (hdiutil).");
  process.exit(0);
}

const root = path.resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const version = appleMarketingVersion(packageJson.version);

function stageApp(dir) {
  const app = path.join(dir, "OpenBot.app");
  mkdirSync(path.join(app, "Contents/MacOS"), { recursive: true });
  mkdirSync(path.join(app, "Contents/Resources"), { recursive: true });
  writeFileSync(path.join(app, "Contents/Info.plist"), `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>CFBundleShortVersionString</key><string>${version}</string></dict></plist>\n`);
  writeFileSync(path.join(app, "Contents/MacOS/OpenBot"), "#!/bin/sh\nexit 0\n");
  writeFileSync(path.join(app, "Contents/Resources/marker.txt"), "staged-fixture\n");
  return app;
}

test("unsigned dmg carries the staged app with a verifiable checksum", () => {
  const rootDir = mkdtempSync(path.join(tmpdir(), "openbot-dmg-"));
  try {
    const app = stageApp(rootDir);
    const outDir = path.join(rootDir, "out");
    const built = spawnSync(process.execPath, [path.join(root, "scripts/package-macos-dmg.mjs"), app, outDir], { encoding: "utf8" });
    assert.equal(built.status, 0, built.stderr || built.stdout);
    const manifest = JSON.parse(built.stdout.trim().split("\n").pop());
    assert.equal(manifest.signed, false);
    assert.equal(manifest.notarized, false);
    assert.equal(manifest.version, version);
    assert.ok(existsSync(manifest.dmg), "disk image written");
    assert.ok(existsSync(manifest.sha256), "checksum sidecar written");
    const [hex, name] = readFileSync(manifest.sha256, "utf8").trim().split(/\s+/);
    assert.match(hex, /^[a-f0-9]{64}$/);
    assert.equal(name, path.basename(manifest.dmg));
    assert.equal(createHash("sha256").update(readFileSync(manifest.dmg)).digest("hex"), hex, "sidecar matches the image bytes");
    const verified = spawnSync("/usr/bin/hdiutil", ["verify", manifest.dmg], { encoding: "utf8" });
    assert.equal(verified.status, 0, "image verifies independently of the builder");
    const mount = mkdtempSync(path.join(tmpdir(), "openbot-dmg-read-"));
    try {
      const attached = spawnSync("/usr/bin/hdiutil", ["attach", "-nobrowse", "-readonly", "-mountpoint", mount, manifest.dmg], { encoding: "utf8" });
      assert.equal(attached.status, 0, attached.stderr);
      assert.ok(existsSync(path.join(mount, "OpenBot.app", "Contents", "MacOS", "OpenBot")), "mounted image contains the app");
      assert.equal(readFileSync(path.join(mount, "OpenBot.app", "Contents", "Resources", "marker.txt"), "utf8"), "staged-fixture\n");
    } finally {
      spawnSync("/usr/bin/hdiutil", ["detach", mount, "-force"]);
      rmSync(mount, { recursive: true, force: true });
    }
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test("version mismatch writes nothing", () => {
  const rootDir = mkdtempSync(path.join(tmpdir(), "openbot-dmg-"));
  try {
    const app = stageApp(rootDir);
    writeFileSync(
      path.join(app, "Contents/Info.plist"),
      readFileSync(path.join(app, "Contents/Info.plist"), "utf8").replace(version, "0.0.0-mismatch"),
    );
    const outDir = path.join(rootDir, "out");
    const built = spawnSync(process.execPath, [path.join(root, "scripts/package-macos-dmg.mjs"), app, outDir], { encoding: "utf8" });
    assert.notEqual(built.status, 0);
    assert.equal(existsSync(outDir), false, "no output directory on refusal");
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

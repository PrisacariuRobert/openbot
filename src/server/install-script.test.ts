import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");

test("the website serves exactly the installer in scripts/", () => {
  assert.equal(readFileSync(path.join(root, "site/install.sh"), "utf8"), readFileSync(path.join(root, "scripts/install.sh"), "utf8"), "copy scripts/install.sh to site/install.sh");
});

test("installer is valid POSIX sh and never asks for an administrator password", () => {
  const script = readFileSync(path.join(root, "scripts/install.sh"), "utf8");
  assert.equal(spawnSync("sh", ["-n", path.join(root, "scripts/install.sh")]).status, 0);
  assert.ok(!/\bsudo\b/.test(script));
  assert.match(script, /shasum -a 256/, "the download is verified before use");
  assert.match(script, /uninstall\.sh/, "an uninstaller is always left behind");
  assert.match(readFileSync(path.join(root, "site/index.html"), "utf8").replace(/<wbr \/>/g, ""), /curl -fsSL https:\/\/sidemates\.app\/install\.sh \| sh/);
});

test("the Mac disk image holds the same bundle and installer, and the launcher hands over to it", async () => {
  const { chmodSync, mkdirSync, mkdtempSync, readFileSync: read, rmSync, statSync, writeFileSync, existsSync } = await import("node:fs");
  const { createHash } = await import("node:crypto");
  const { tmpdir } = await import("node:os");
  const build = path.join(root, "scripts/build-mac-download.sh"), launcher = path.join(root, "scripts/mac-download/Install Sidemates.command");
  for (const file of [build, launcher]) assert.equal(spawnSync("sh", ["-n", file]).status, 0, file);
  assert.ok(!/\bsudo\b/.test(read(launcher, "utf8")));
  const work = mkdtempSync(path.join(tmpdir(), "sidemates-mac-download-"));
  try {
    const from = path.join(work, "from"), out = path.join(work, "out"), bin = path.join(work, "bin");
    for (const dir of [from, out, bin]) mkdirSync(dir);
    const bundle = Buffer.from("synthetic bundle bytes");
    writeFileSync(path.join(from, "sidemates-darwin-arm64.tar.gz"), bundle);
    writeFileSync(path.join(from, "sidemates-darwin-arm64.tar.gz.sha256"), `${createHash("sha256").update(bundle).digest("hex")}  sidemates-darwin-arm64.tar.gz\n`);
    writeFileSync(path.join(from, "install.sh"), read(path.join(root, "scripts/install.sh")));
    const staged = spawnSync("sh", [build, "darwin-arm64", from, out, "--stage-only"], { encoding: "utf8" });
    assert.equal(staged.status, 0, staged.stderr);
    const stage = staged.stdout.trim();
    assert.equal(path.basename(stage), "Sidemates-mac-arm64");
    assert.equal(read(path.join(stage, ".bundle/install.sh"), "utf8"), read(path.join(root, "scripts/install.sh"), "utf8"), "the same installer as the one-line install");
    assert.deepEqual(read(path.join(stage, ".bundle/sidemates-darwin-arm64.tar.gz")), bundle);
    assert.ok(existsSync(path.join(stage, "Read me.txt")));
    assert.ok(statSync(path.join(stage, "Install Sidemates.command")).mode & 0o100, "the launcher can be opened");

    // A different Mac gets a clear answer instead of a failed install.
    writeFileSync(path.join(bin, "uname"), '#!/bin/sh\n[ "$1" = "-m" ] && { echo "$FAKE_ARCH"; exit 0; }\nexec /bin/uname "$@"\n');
    chmodSync(path.join(bin, "uname"), 0o755);
    writeFileSync(path.join(stage, ".bundle/install.sh"), 'printf "%s|%s\\n" "$OPENBOT_INSTALL_FROM" "$OPENBOT_INSTALL_METHOD"\n');
    const run = (arch: string) => spawnSync("sh", [path.join(stage, "Install Sidemates.command")], { encoding: "utf8", env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, FAKE_ARCH: arch } });
    const intel = run("x86_64");
    assert.equal(intel.status, 1);
    assert.match(intel.stderr, /This disk image is for Macs with Apple silicon \(M1 or later\), and this Mac is different/);
    assert.match(intel.stderr, /Sidemates-mac-x64\.dmg, for Intel Macs/);
    const apple = run("arm64");
    assert.equal(apple.status, 0, apple.stderr);
    assert.match(apple.stdout, new RegExp(`^${stage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/\\.bundle\\|disk-image$`, "m"), "installs from the image, marked as the disk-image path");
    assert.match(apple.stdout, /eject the Sidemates disk/);

    writeFileSync(path.join(from, "sidemates-darwin-arm64.tar.gz"), "changed bytes");
    const tampered = spawnSync("sh", [build, "darwin-arm64", from, out, "--stage-only"], { encoding: "utf8" });
    assert.notEqual(tampered.status, 0);
    assert.match(tampered.stderr, /doesn't match its fingerprint/);
    assert.notEqual(spawnSync("sh", [build, "darwin-universal", from, out, "--stage-only"]).status, 0);
  } finally { rmSync(work, { recursive: true, force: true }); }
});

test("the installer clears the download mark it can't let launchd see, and says how it was installed", () => {
  const script = readFileSync(path.join(root, "scripts/install.sh"), "utf8");
  assert.match(script, /xattr -dr com\.apple\.quarantine "\$DIR\/versions\/\$NAME"/, "the checked bundle");
  assert.match(script, /xattr -d com\.apple\.quarantine "\$PLIST"/, "macOS 27 refuses a quarantined launch agent");
  assert.ok(script.indexOf('xattr -d com.apple.quarantine "$PLIST"') < script.indexOf('launchctl bootstrap'), "before the service starts");
  assert.match(script, /<key>OPENBOT_INSTALL_METHOD<\/key><string>\$METHOD<\/string>/);
  assert.match(script, /case "\$\{OPENBOT_INSTALL_METHOD:-terminal\}" in disk-image\) METHOD="disk-image" ;; \*\) METHOD="terminal" ;; esac/, "only two known values reach the settings file");
});

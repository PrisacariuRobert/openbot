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
  assert.match(readFileSync(path.join(root, "site/index.html"), "utf8"), /curl -fsSL https:\/\/openbots\.foundation\/install\.sh \| sh/);
});

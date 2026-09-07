import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { stageAppPackage } from "./lib/staged-app-package.mjs";

async function fixture(run) {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-package-transaction-test-"));
  const app = path.join(root, "OpenBot.app");
  mkdirSync(app);
  writeFileSync(path.join(app, "runtime.txt"), "previous release");
  symlinkSync("runtime.txt", path.join(app, "relative-link"));
  try { await run({ root, app }); } finally { rmSync(root, { recursive: true, force: true }); }
}

test("packaging publishes only after validation and preserves relative links", () => fixture(async ({ root, app }) => {
  await stageAppPackage(app, async (staged) => {
    writeFileSync(path.join(staged, "runtime.txt"), "new release");
    assert.equal(readFileSync(path.join(app, "runtime.txt"), "utf8"), "previous release");
  }, async (staged) => {
    assert.equal(readFileSync(path.join(staged, "runtime.txt"), "utf8"), "new release");
    assert.equal(readFileSync(path.join(app, "runtime.txt"), "utf8"), "previous release");
  });
  assert.equal(readFileSync(path.join(app, "runtime.txt"), "utf8"), "new release");
  assert.equal(readlinkSync(path.join(app, "relative-link")), "runtime.txt");
  assert.deepEqual(readdirSync(root), ["OpenBot.app"]);
}));

for (const phase of ["copy", "signature"]) test(`a ${phase} failure leaves the original app unchanged`, () => fixture(async ({ root, app }) => {
  await assert.rejects(stageAppPackage(app, async (staged) => {
    writeFileSync(path.join(staged, "runtime.txt"), "incomplete release");
    if (phase === "copy") throw new Error("Simulated copy failure");
  }, async () => { throw new Error("Simulated signature failure"); }), /Simulated/);
  assert.equal(readFileSync(path.join(app, "runtime.txt"), "utf8"), "previous release");
  assert.deepEqual(readdirSync(root), ["OpenBot.app"]);
}));

test("concurrent packaging cannot replace an in-progress build", () => fixture(async ({ app }) => {
  await stageAppPackage(app, async () => {
    await assert.rejects(stageAppPackage(app, async () => assert.fail("Should not prepare twice"), async () => {}), { code: "EEXIST" });
  }, async () => {});
  assert.equal(existsSync(`${app}.packaging-lock`), false);
}));

test("packaging refuses a symlink destination", () => fixture(async ({ root, app }) => {
  const alias = path.join(root, "Alias.app");
  symlinkSync(app, alias);
  await assert.rejects(stageAppPackage(alias, async () => assert.fail(), async () => {}), /real, absolute/);
  assert.equal(readFileSync(path.join(app, "runtime.txt"), "utf8"), "previous release");
}));

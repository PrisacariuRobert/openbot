import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

// @ts-expect-error The deploy helper is intentionally self-contained JavaScript for hosts without a Node project install.
const transferModule = await import("../../deploy/private-runner/home-transfer.mjs") as {
  exportHome: (root: string, output: string, secret: string) => Promise<unknown>;
  importHome: (input: string, staging: string, secret: string) => Promise<unknown>;
};

function sampleHome(root: string) {
  for (const folder of ["data", "home", "projects"]) mkdirSync(path.join(root, folder), { recursive: true });
  writeFileSync(path.join(root, "data", "openbot.sqlite"), "private studio");
  writeFileSync(path.join(root, "home", "subscription.json"), "private model session");
  writeFileSync(path.join(root, "projects", "readme.md"), "project files");
}

test("exports and restores one authenticated encrypted private home", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-home-transfer-"));
  try {
    const source = path.join(root, "source"), archive = path.join(root, "home.openbot-home"), restored = path.join(root, "restored");
    mkdirSync(source); sampleHome(source);
    await transferModule.exportHome(source, archive, "a long private passphrase");
    const bytes = readFileSync(archive);
    assert.equal(bytes.includes(Buffer.from("private studio")), false);
    assert.equal(bytes.includes(Buffer.from("private model session")), false);
    await transferModule.importHome(archive, restored, "a long private passphrase");
    assert.equal(readFileSync(path.join(restored, "data", "openbot.sqlite"), "utf8"), "private studio");
    assert.equal(readFileSync(path.join(restored, "home", "subscription.json"), "utf8"), "private model session");
    assert.equal(readFileSync(path.join(restored, "projects", "readme.md"), "utf8"), "project files");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("rejects a wrong passphrase or changed transfer before creating a staged home", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-home-transfer-tamper-"));
  try {
    const source = path.join(root, "source"), archive = path.join(root, "home.openbot-home");
    mkdirSync(source); sampleHome(source);
    await transferModule.exportHome(source, archive, "correct private passphrase");
    await assert.rejects(transferModule.importHome(archive, path.join(root, "wrong"), "incorrect passphrase"), /wrong or this transfer file was changed/i);
    const bytes = readFileSync(archive);
    bytes[Math.floor(bytes.length / 2)]! ^= 1;
    writeFileSync(archive, bytes);
    await assert.rejects(transferModule.importHome(archive, path.join(root, "tampered"), "correct private passphrase"), /wrong or this transfer file was changed/i);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

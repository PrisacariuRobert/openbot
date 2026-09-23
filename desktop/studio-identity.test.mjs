import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { studioHealth, studioIdentity } from "./studio-identity.mjs";

test("desktop reuses one identity for its data home and refuses a replaced identity file", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-desktop-identity-"));
  try {
    const data = path.join(root, "data");
    const first = studioIdentity(data);
    assert.equal(studioIdentity(data), first);
    assert.equal(readFileSync(path.join(data, ".desktop-instance-id"), "utf8").trim(), first);
    writeFileSync(path.join(data, ".desktop-instance-id"), "invalid\n");
    assert.throws(() => studioIdentity(data), /invalid/);
    rmSync(path.join(data, ".desktop-instance-id"));
    symlinkSync(path.join(root, "elsewhere"), path.join(data, ".desktop-instance-id"));
    assert.throws(() => studioIdentity(data), /regular file/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("bundled shell opens only its matching healthy studio", () => {
  assert.equal(studioHealth(200, { "x-openbot-desktop-match": "1" }, true), "ready");
  assert.equal(studioHealth(503, { "x-openbot-desktop-match": "1" }, true), "retry");
  assert.equal(studioHealth(200, {}, true), "wrong-studio");
  assert.equal(studioHealth(404, {}, true), "wrong-studio");
  assert.equal(studioHealth(200, {}, false), "ready", "explicit development attachment retains its existing contract");
});

test("incomplete restored database is refused before desktop creates an identity", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-desktop-incomplete-"));
  try {
    writeFileSync(path.join(root, "openbot.sqlite"), "existing database");
    assert.throws(() => studioIdentity(root), /no matching vault key/);
    assert.equal(readFileSync(path.join(root, "openbot.sqlite"), "utf8"), "existing database");
    assert.equal(existsSync(path.join(root, ".desktop-instance-id")), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

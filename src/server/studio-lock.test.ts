import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { acquireStudioLock } from "./studio-lock.js";

test("studio lock: second live server is refused, stale lock is replaced", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "openbot-lock-test-"));
  try {
    const first = acquireStudioLock(dir, 4311);
    assert.ok(first.acquired, "first boot acquires the lock");
    assert.equal(first.holder, null);
    // A second live process (this test's own pid) must be refused.
    const second = acquireStudioLock(dir, 4312);
    assert.equal(second.acquired, false, "second boot on the same studio is refused");
    assert.equal(second.holder?.pid, process.pid);
    assert.equal(second.holder?.port, 4311);
    second.release();
    first.release();
    assert.equal(existsSync(path.join(dir, "openbot.lock")), false, "lock is removed on release");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("studio lock: crash leftover is detected as stale and taken over", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "openbot-lock-stale-"));
  try {
    // A pid that has already exited.
    const dead = spawnSync("true");
    const deadPid = dead.pid ?? 999_999_999;
    writeFileSync(path.join(dir, "openbot.lock"), `${deadPid} 4311\n`);
    const acquired = acquireStudioLock(dir, 4311);
    assert.ok(acquired.acquired, "a crashed holder's lock is replaced");
    assert.equal(readFileSync(path.join(dir, "openbot.lock"), "utf8").trim().split(" ")[0], String(process.pid));
    acquired.release();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

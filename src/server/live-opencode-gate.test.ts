import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { liveOpenCodeAvailable } from "./opencode.js";

test("live OpenCode replies stay off for fixtures, injected spawners and when switched off", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "openbot-live-gate-"));
  try {
    writeFileSync(path.join(dir, "opencode"), "#!/bin/sh\necho fixture\n", { mode: 0o755 });
    assert.equal(liveOpenCodeAvailable(dir, false), false, "a fixture in a temporary folder never runs through the live server");
    assert.equal(liveOpenCodeAvailable(`${dir}${path.delimiter}/usr/bin`, true), false, "an injected spawner owns the process");
    assert.equal(liveOpenCodeAvailable("", false), false, "no runtime on PATH");
    const previous = process.env.OPENBOT_LIVE_REPLIES;
    process.env.OPENBOT_LIVE_REPLIES = "0";
    try { assert.equal(liveOpenCodeAvailable(process.env.PATH, false), false); } finally { if (previous === undefined) delete process.env.OPENBOT_LIVE_REPLIES; else process.env.OPENBOT_LIVE_REPLIES = previous; }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

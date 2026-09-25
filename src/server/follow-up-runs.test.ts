import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenBotDatabase } from "./testing/database.js";

test("a teammate building on another's answer waits for it, then starts with it", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-follow-up-"));
  const db = new OpenBotDatabase(root);
  try {
    const leader = db.createRun({ threadId: "team-room", botId: "nova", prompt: "Nova: find restaurants. Pixel, check their hours.", status: "queued" });
    const follower = db.createRun({ threadId: "team-room", botId: "pixel", prompt: "Nova: find restaurants. Pixel, check their hours.", status: "waiting_for_teammate", afterRunId: leader.id });
    assert.equal(follower.afterRunId, leader.id);
    assert.deepEqual(db.runsWaitingFor(leader.id).map((run) => run.id), [follower.id]);
    assert.equal(db.claimNextQueuedRun([], "test")?.id, leader.id, "only the first teammate starts");
    assert.equal(db.claimNextQueuedRun([], "test"), null, "the follower is not picked up early");
    const started = db.releaseRunAfter(follower.id, "Nova has already answered…");
    assert.equal(started?.status, "queued");
    assert.equal(started?.prompt, "Nova has already answered…");
    assert.equal(db.releaseRunAfter(follower.id, "again"), null, "released once");
    assert.deepEqual(db.runsWaitingFor(leader.id), []);
  } finally { db.close(); rmSync(root, { recursive: true, force: true }); }
});

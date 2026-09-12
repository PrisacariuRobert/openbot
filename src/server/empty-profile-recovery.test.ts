import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenBotDatabase } from "./database.js";

test("production empty profile stays empty after reopening and preserves its draft", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-empty-recovery-"));
  let db = new OpenBotDatabase(root);
  try {
    const initial = db.getState("team-room");
    assert.equal(initial.bots.length, 0);
    assert.equal(initial.studioRuns.length, 0);
    assert.equal(initial.approvals.length, 0);
    assert.equal(initial.settings.macAccessEnabled, false);
    assert.equal(initial.settings.yoloMode, false);
    db.saveDraft("team-room", "Unsent first-run draft", "web");
    db.close();
    db = new OpenBotDatabase(root);
    const restored = db.getState("team-room");
    assert.equal(restored.bots.length, 0, "Reopening must not invent a starter cast");
    assert.equal(restored.studioRuns.length, 0, "An unsent draft must not start work");
    assert.equal(restored.approvals.length, 0);
    assert.equal(restored.draft.body, "Unsent first-run draft");
    assert.equal(restored.settings.macAccessEnabled, false);
    assert.equal(restored.settings.yoloMode, false);
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

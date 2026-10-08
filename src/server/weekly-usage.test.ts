import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { OpenBotDatabase } from "./testing/database.js";

test("this week's use counts Claude's memory saving in full and cached re-reading at a tenth", () => {
  const root = mkdtempSync(path.join(tmpdir(), "sidemates-weekly-usage-"));
  const db = new OpenBotDatabase(root);
  try {
    const run = db.createRun({ threadId: "bot-nova", botId: "nova", prompt: "Write the brief", status: "queued" });
    // The marketing brief from the friction log: about 5,400 fresh tokens and 168,000 re-read from cache.
    db.updateRun(run.id, { inputTokens: 4_000, outputTokens: 1_400, cacheWriteTokens: 22_000, cacheReadTokens: 168_000 });
    assert.equal(db.getBot("nova")?.tokensUsedThisWeek, 4_000 + 1_400 + 22_000 + 16_800);
    const summary = db.getUsageSummary();
    assert.equal(summary.totalTokens, 44_200);
    assert.equal(summary.cacheReadTokens, 168_000);
    assert.equal(summary.cacheWriteTokens, 22_000);
    assert.equal(db.getRun(run.id)?.cacheWriteTokens, 22_000);
    assert.equal(db.getJobUsage(run.id).totalTokens, 5_400, "A task's own allowance stays on fresh input and output, so jobs don't stop sooner");
  } finally {
    db.close?.();
    rmSync(root, { recursive: true, force: true });
  }
});

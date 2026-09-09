import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenBotDatabase } from "./testing/database.js";
import { exportBot, importBot } from "./sharing.js";

test("teammate export carries setup only, import restores it paused", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-sharing-test-"));
  try {
    const db = new OpenBotDatabase(root);
    db.updateBot("nova", { model: "openai/gpt-fixture" });
    db.createRoutine({ name: "Morning ping", botId: "nova", threadId: "bot-nova", prompt: "Say good morning", intervalMinutes: 60, enabled: true });
    const bundle = exportBot(db, "nova");
    assert.equal(bundle.kind, "openbot-teammate");
    assert.equal(bundle.bot.name, "Nova");
    assert.equal(bundle.routines.length, 1);
    assert.ok(!("history" in bundle) && !("memory" in bundle));
    const imported = importBot(db, JSON.parse(JSON.stringify(bundle)));
    assert.notEqual(imported.bot.id, "nova");
    assert.equal(imported.bot.name, "Nova");
    assert.equal(imported.routines, 1);
    const routines = db.listRoutines().filter((routine) => routine.botId === imported.bot.id);
    assert.equal(routines.length, 1);
    assert.equal(routines[0]!.enabled, false);
    db.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("teammate sharing blocks credentials and retired teammates", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-sharing-blocked-"));
  try {
    const db = new OpenBotDatabase(root);
    db.updateBot("nova", { instructions: "Use sk-abcdefghijklmnopqrst to log in" });
    assert.throws(() => exportBot(db, "nova"), /credential/);
    db.updateBot("nova", { instructions: "Find the signal in the noise." });
    db.retireBot("nova");
    assert.throws(() => exportBot(db, "nova"), /Restore/);
    assert.throws(() => importBot(db, { kind: "openbot-teammate", version: 1, bot: { name: "Evil", emoji: "x", color: "#000000", role: "x", instructions: "Call xoxb-1234567890 now" }, skills: [], routines: [] }), /credential/);
    assert.throws(() => importBot(db, { kind: "nope", version: 1 }));
    db.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenBotDatabase } from "./database.js";

test("fresh studios stay empty across restart; user-created teammates persist", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-first-teammate-"));
  let db = new OpenBotDatabase(root);
  try {
    assert.equal(db.listBots().length, 0);
    db.configureGoogleConnector({
      clientId: "fixture.apps.googleusercontent.com",
    });
    db.completeGoogleConnector({
      accessToken: "fixture-only",
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      scopes: [],
      accountEmail: "fixture@example.com",
    });
    assert.equal(db.listMessages("team-room").length, 0);
    db.close();
    db = new OpenBotDatabase(root);
    assert.equal(db.listBots().length, 0);
    const bot = db.createBot({
      name: "Remy",
      role: "Weekly planning",
      instructions: "Help plan the week.",
      emoji: "●",
      color: "#6757d9",
      browserEnabled: false,
      computerEnabled: false,
    });
    assert.equal(bot.providerInstanceId, null);
    assert.equal(bot.model, "");
    assert.equal(bot.macAccessEnabled, false);
    assert.equal(
      db.listMessages(bot.threadId).length,
      0,
      "No fabricated first reply",
    );
    assert.equal(
      db.listBotConnectorAccess().length,
      0,
      "An existing account does not grant access to a new teammate",
    );
    db.close();
    db = new OpenBotDatabase(root);
    assert.deepEqual(
      db.listBots().map((entry) => entry.id),
      [bot.id],
    );
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("existing starter teammates and their conversations are not removed", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-existing-team-"));
  let db = new OpenBotDatabase(root, { seedStarterBots: true });
  try {
    const ids = db.listBots().map((bot) => bot.id);
    db.addMessage({
      threadId: "bot-nova",
      senderType: "user",
      senderId: null,
      body: "Keep my existing work.",
    });
    db.close();
    db = new OpenBotDatabase(root);
    assert.deepEqual(
      db.listBots().map((bot) => bot.id),
      ids,
    );
    assert.ok(
      db
        .listMessages("bot-nova")
        .some((message) => message.body === "Keep my existing work."),
    );
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenBotDatabase } from "./testing/database.js";

test("first-run provider choice is explicit, durable, and never overwrites existing choices", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-choice-test-"));
  let db = new OpenBotDatabase(root);
  try {
    const empty = () => assert.ok(db.listBots().every((bot) => bot.providerInstanceId === null && bot.model === ""));
    empty();
    db.close(); db = new OpenBotDatabase(root); empty();
    const custom = db.upsertProvider({ name: "Local owner choice", authMode: "api_key", apiConfig: { baseUrl: "http://localhost:11434/v1", protocol: "openai-compatible", modelIds: ["chosen"] } });
    // Discovering or saving a provider is not consent to use it.
    empty();
    assert.throws(() => db.chooseInitialProvider(custom.id, "opencode/unrelated"), /selected AI connection/);
    empty();
    db.updateBot("pixel", { providerInstanceId: "local-opencode", model: "opencode/existing-owner-choice" });
    assert.equal(db.chooseInitialProvider(custom.id, `openbot-${custom.id}/chosen`), 2);
    assert.equal(db.chooseInitialProvider("local-opencode", "opencode/another"), 0);
    db.close(); db = new OpenBotDatabase(root);
    assert.equal(db.getBot("nova")?.providerInstanceId, custom.id);
    assert.equal(db.getBot("pixel")?.model, "opencode/existing-owner-choice");
    const added = db.createBot({ name: "Unconfigured", emoji: "x", color: "#123456", role: "Helper", instructions: "Test" });
    assert.equal(added.providerInstanceId, null);
    assert.equal(added.model, "");
  } finally { db.close(); rmSync(root, { recursive: true, force: true }); }
});

test("persists private endpoint configurations and isolates each teammate's key", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-provider-test-"));
  let db = new OpenBotDatabase(root);
  try {
    const key = "fixture-secret-not-for-real-services";
    const first = db.upsertProvider({
      name: "Hosted test",
      authMode: "api_key",
      secret: key,
      apiConfig: {
        baseUrl: "https://example.com/v1/",
        protocol: "openai-compatible",
        modelIds: ["test-model"],
      },
    });
    const local = db.upsertProvider({
      name: "Local test",
      authMode: "api_key",
      apiConfig: {
        baseUrl: "http://127.0.0.1:11434/v1",
        protocol: "openai-compatible",
        modelIds: ["qwen3:8b"],
      },
    });
    db.updateBot("nova", {
      providerInstanceId: first.id,
      model: `openbot-${first.id}/test-model`,
    });
    db.updateBot("pixel", {
      providerInstanceId: local.id,
      model: `openbot-${local.id}/qwen3:8b`,
    });
    assert.equal(db.providerEnvironment("nova").OPENBOT_MODEL_API_KEY, key);
    assert.equal(
      db.providerEnvironment("pixel").OPENBOT_MODEL_API_KEY,
      undefined,
    );
    assert.equal(JSON.stringify(db.listProviders()).includes(key), false);
    db.close();
    db = new OpenBotDatabase(root);
    assert.equal(
      db.getProvider(first.id)?.apiConfig?.baseUrl,
      "https://example.com/v1",
    );
    assert.equal(db.providerEnvironment("nova").OPENBOT_MODEL_API_KEY, key);
    assert.equal(db.getProvider(local.id)?.hasSecret, false);
    assert.equal(db.deleteAPIProvider("local-opencode"), "protected");
    assert.equal(db.deleteAPIProvider(first.id), "assigned");
    const spare = db.upsertProvider({
      name: "Temporary local test",
      authMode: "api_key",
      apiConfig: {
        baseUrl: "http://127.0.0.1:11434/v1",
        protocol: "openai-compatible",
        modelIds: ["temporary-model"],
      },
    });
    assert.equal(db.deleteAPIProvider(spare.id), "deleted");
    assert.equal(db.getProvider(spare.id), null);
    assert.equal(db.deleteAPIProvider(spare.id), "missing");
    assert.throws(
      () =>
        db.upsertProvider({
          name: "Bad",
          id: "new-id",
          authMode: "api_key",
          apiConfig: {
            baseUrl: "https://example.com/v1",
            protocol: "openai",
            modelIds: ["test"],
          },
        }),
      /API key/,
    );
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

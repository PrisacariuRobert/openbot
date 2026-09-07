import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { OpenBotDatabase } from "./database.js";

test(
  "pure appearance PATCH works before model setup without changing a teammate's work or permissions",
  { timeout: 25_000 },
  async () => {
    const root = mkdtempSync(path.join(tmpdir(), "openbot-appearance-route-"));
    const data = path.join(root, "data");
    const db = new OpenBotDatabase(root, { dataDir: data });
    const bot = db.createBot({
      name: "Remy",
      emoji: "●",
      color: "#6757d9",
      mascot: "nova",
      role: "Plan the week",
      instructions: "Do not perform work in this fixture.",
      computerEnabled: false,
      browserEnabled: false,
    });
    db.addMessage({
      threadId: bot.threadId,
      senderType: "user",
      senderId: null,
      body: "Keep this conversation.",
    });
    db.saveDraft(bot.threadId, "Keep my unsent draft too.", "web");
    db.close();
    assert.equal(bot.providerInstanceId, null);
    assert.equal(bot.model, "");
    const socket = createServer();
    await new Promise<void>((resolve) =>
      socket.listen(0, "127.0.0.1", resolve),
    );
    const port = (socket.address() as { port: number }).port;
    await new Promise<void>((resolve) => socket.close(() => resolve()));
    const base = `http://127.0.0.1:${port}`;
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "src/server/index.ts"],
      {
        cwd: fileURLToPath(new URL("../../", import.meta.url)),
        stdio: "ignore",
        env: {
          PATH: process.env.PATH,
          LANG: "en_US.UTF-8",
          TZ: "UTC",
          OPENBOT_LOAD_ENV: "0",
          OPENBOT_DATA_DIR: data,
          OPENBOT_PORT: String(port),
          OPENBOT_HOST: "127.0.0.1",
          OPENBOT_APP_URL: base,
          OPENBOT_DEPLOYMENT_MODE: "local",
          NODE_ENV: "test",
        },
      },
    );
    const exited = once(child, "exit");
    const patch = (value: unknown) =>
      fetch(`${base}/api/bots/${bot.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
      });
    try {
      let ready = false;
      for (let n = 0; n < 100; n++) {
        try {
          if ((await fetch(base + "/api/healthz")).ok) {
            ready = true;
            break;
          }
        } catch {}
        await delay(100);
      }
      assert.ok(ready, "Disposable host starts");
      const result = await patch({ mascot: "pebble", color: "#299575" });
      assert.equal(result.status, 200);
      const saved = await result.json();
      assert.equal(saved.mascot, "pebble");
      assert.equal(saved.color, "#299575");
      for (const key of [
        "name",
        "role",
        "instructions",
        "model",
        "providerInstanceId",
        "browserEnabled",
        "computerEnabled",
        "macAccessEnabled",
        "threadId",
      ] as const)
        assert.equal(saved[key], bot[key], `${key} must not change`);
      assert.equal((await patch({ color: "#687588" })).status, 200);
      assert.equal((await patch({ color: "not-a-color" })).status, 400);
      assert.equal((await patch({ mascot: "imaginary-shape" })).status, 400);
      assert.equal(
        (await patch({ color: "#299575", browserEnabled: true })).status,
        400,
        "Permission changes still require normal configuration checks",
      );
      assert.equal(
        (await patch({ name: "Changed name" })).status,
        400,
        "The appearance exception cannot bypass other settings validation",
      );
      const snapshot = await (
        await fetch(`${base}/api/state?threadId=${bot.threadId}`)
      ).json();
      assert.equal(snapshot.draft.body, "Keep my unsent draft too.");
      assert.equal(snapshot.messages.at(-1)?.body, "Keep this conversation.");
      assert.equal(
        snapshot.runs.length,
        0,
        "Changing appearance starts no model job",
      );
      assert.equal(snapshot.bots[0].color, "#687588");
      assert.equal(snapshot.bots[0].browserEnabled, false);
      assert.equal(snapshot.bots[0].model, "");
    } finally {
      child.kill("SIGTERM");
      await exited;
      rmSync(root, { recursive: true, force: true });
    }
  },
);

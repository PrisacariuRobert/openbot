import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { OpenBotDatabase } from "./testing/database.js";
import { BLOCKED_FREE_TIER_MESSAGE } from "../shared/provider-config.js";

test("the server refuses OpenCode's app-only free models, so no teammate is set up to fail", { timeout: 90_000 }, async () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-model-choice-")), db = new OpenBotDatabase(root);
  db.updateBot("nova", { providerInstanceId: "local-opencode", model: "opencode/space-bunny-free" });
  const reservation = createServer();
  await new Promise<void>((resolve) => reservation.listen(0, "127.0.0.1", resolve));
  const address = reservation.address(); assert.ok(address && typeof address !== "string");
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  const base = `http://127.0.0.1:${address.port}`;
  const child = spawn(process.execPath, ["--import", "tsx", "src/server/index.ts"], {
    cwd: path.resolve(import.meta.dirname, "../.."),
    env: { ...process.env, OPENBOT_LOAD_ENV: "0", OPENBOT_DATA_DIR: db.dataDir, OPENBOT_PORT: String(address.port), OPENBOT_APP_URL: base, OPENBOT_HOST: "127.0.0.1", OPENBOT_DEPLOYMENT_MODE: "local", NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const exited = once(child, "exit"); let log = "";
  child.stdout.on("data", (chunk) => { log = (log + chunk).slice(-3_000); });
  child.stderr.on("data", (chunk) => { log = (log + chunk).slice(-3_000); });
  const send = (route: string, body: unknown, method = "POST") => fetch(base + route, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
  const teammate = (model: string) => ({ name: "Testa", emoji: "🧪", color: "#6757d9", role: "Test teammate", instructions: "Be brief.", model, providerInstanceId: "local-opencode" });
  try {
    for (let attempt = 0; ; attempt++) {
      try { if ((await fetch(base + "/api/healthz", { signal: AbortSignal.timeout(500) })).ok) break; } catch { /* Startup. */ }
      if (child.exitCode !== null) throw new Error(`Fixture host exited (${child.exitCode}): ${log}`);
      if (attempt >= 200) throw new Error(log || "Fixture host did not start within the bounded startup window.");
      await delay(100);
    }
    // A new teammate can't start on the app-only free tier, but can on a model that works.
    const refused = await send("/api/bots", teammate("opencode/nemotron-3.5-lightning-free"));
    assert.equal(refused.status, 400);
    assert.equal(((await refused.json()) as { error: string }).error, BLOCKED_FREE_TIER_MESSAGE);
    assert.equal((await send("/api/bots", teammate("opencode-go/deepseek-v4.1-flash"))).status, 201);

    // An existing teammate can't be moved onto it…
    assert.equal((await send("/api/bots/pixel", { providerInstanceId: "local-opencode", model: "opencode/ling-3.1-flash-free" }, "PATCH")).status, 400);
    // …while one already there can still save other settings, and leave it.
    assert.equal((await send("/api/bots/nova", { role: "Researcher" }, "PATCH")).status, 200);
    assert.equal((await send("/api/bots/nova", { model: "opencode-go/deepseek-v4.1-flash" }, "PATCH")).status, 200);
    assert.equal(db.getBot("nova")!.model, "opencode-go/deepseek-v4.1-flash");
  } finally {
    child.kill("SIGTERM"); await Promise.race([exited, delay(4_000)]);
    if (child.exitCode === null) { child.kill("SIGKILL"); await exited; }
    db.close(); rmSync(root, { recursive: true, force: true });
  }
});

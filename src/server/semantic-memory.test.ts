import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { OpenBotDatabase } from "./testing/database.js";

test("embeddings settings probe the endpoint before saving", { timeout: 60_000 }, async () => {
  const vectors = await new Promise<{ server: Server; baseUrl: string }>((resolve) => {
    const server = createServer((request, response) => {
      let body = "";
      request.on("data", (chunk) => { body += chunk; });
      request.on("end", () => {
        const payload = JSON.parse(String(body)) as { model: string; input: string[] };
        if (payload.model !== "fixture-embed") {
          response.writeHead(400, { "content-type": "application/json" });
          response.end(JSON.stringify({ error: "unknown model" }));
          return;
        }
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ object: "list", data: payload.input.map((text, index) => ({ object: "embedding", embedding: [1, 0], index })), model: payload.model }));
      });
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1` }));
  });
  const root = mkdtempSync(path.join(tmpdir(), "openbot-embeddings-probe-")), db = new OpenBotDatabase(root);
  const provider = db.upsertProvider({ name: "Fixture", provider: "custom", authMode: "api_key", runtime: "opencode", apiConfig: { baseUrl: vectors.baseUrl, protocol: "openai-compatible", modelIds: ["fixture-embed"] } });
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
  const settings = async () => (await (await fetch(`${base}/api/state`)).json() as { settings: { embeddingsProviderInstanceId: string | null; embeddingsModel: string | null } }).settings;
  try {
    for (let attempt = 0; ; attempt++) {
      try { if ((await fetch(base + "/api/healthz", { signal: AbortSignal.timeout(500) })).ok) break; } catch { /* Startup. */ }
      if (child.exitCode !== null) throw new Error(`Fixture host exited (${child.exitCode}): ${log}`);
      if (attempt >= 200) throw new Error(log || "Fixture host did not start within the bounded startup window.");
      await delay(100);
    }
    const save = await fetch(`${base}/api/settings`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ embeddingsProviderInstanceId: provider.id, embeddingsModel: "fixture-embed" }) });
    assert.equal(save.status, 200);
    assert.equal((await settings()).embeddingsModel, "fixture-embed");
    const rejected = await fetch(`${base}/api/settings`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ embeddingsModel: "nope" }) });
    assert.equal(rejected.status, 400);
    assert.match(await rejected.text(), /unknown model/);
    assert.equal((await settings()).embeddingsModel, "fixture-embed");
    const cleared = await fetch(`${base}/api/settings`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ embeddingsProviderInstanceId: null, embeddingsModel: null }) });
    assert.equal(cleared.status, 200);
    assert.equal((await settings()).embeddingsProviderInstanceId, null);
  } finally {
    child.kill("SIGTERM"); await Promise.race([exited, delay(4_000)]);
    if (child.exitCode === null) { child.kill("SIGKILL"); await exited; }
    vectors.server.close(); db.close(); rmSync(root, { recursive: true, force: true });
  }
});

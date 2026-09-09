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
import { BrowserManager } from "./runtime.js";

test("browser window guards refuse safely before any launch", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-window-guards-"));
  try {
    const db = new OpenBotDatabase(root);
    const browser = new BrowserManager(db);
    await assert.rejects(browser.openWindow("missing", "https://example.test"), /Teammate not found/);
    db.updateBot("nova", { browserEnabled: false });
    await assert.rejects(browser.openWindow("nova", "https://example.test"), /turned off/);
    db.updateBot("nova", { browserEnabled: true });
    db.createRun({ botId: "nova", threadId: "bot-nova", prompt: "Browse now", status: "running" });
    await assert.rejects(browser.openWindow("nova"), /working in the browser/);
    db.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("browser window endpoint guards over HTTP", { timeout: 60_000 }, async () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-window-route-")), db = new OpenBotDatabase(root);
  db.updateBot("nova", { browserEnabled: false });
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
  const open = (id: string, body: unknown) => fetch(`${base}/api/bots/${id}/browser/window`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
  try {
    for (let attempt = 0; ; attempt++) {
      try { if ((await fetch(base + "/api/healthz", { signal: AbortSignal.timeout(500) })).ok) break; } catch { /* Startup. */ }
      if (child.exitCode !== null) throw new Error(`Fixture host exited (${child.exitCode}): ${log}`);
      if (attempt >= 200) throw new Error(log || "Fixture host did not start within the bounded startup window.");
      await delay(100);
    }
    assert.equal((await open("missing", {})).status, 404);
    assert.equal((await open("nova", {})).status, 409);
    assert.equal((await open("nova", { url: "not-a-url" })).status, 400);
  } finally {
    child.kill("SIGTERM"); await Promise.race([exited, delay(4_000)]);
    if (child.exitCode === null) { child.kill("SIGKILL"); await exited; }
    db.close(); rmSync(root, { recursive: true, force: true });
  }
});

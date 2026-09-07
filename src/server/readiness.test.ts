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
import type { Readiness } from "../shared/types.js";

test("readiness reports the three setup steps and tracks teammates", { timeout: 60_000 }, async () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-readiness-")), db = new OpenBotDatabase(root);
  const botIds = db.listBots().map((bot) => bot.id);
  assert.ok(botIds.length > 0);
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
  const readiness = async () => await (await fetch(`${base}/api/readiness`)).json() as Readiness;
  try {
    for (let attempt = 0; ; attempt++) {
      try { if ((await fetch(base + "/api/healthz", { signal: AbortSignal.timeout(500) })).ok) break; } catch { /* Startup. */ }
      if (child.exitCode !== null) throw new Error(`Fixture host exited (${child.exitCode}): ${log}`);
      if (attempt >= 200) throw new Error(log || "Fixture host did not start within the bounded startup window.");
      await delay(100);
    }
    const initial = await readiness();
    assert.deepEqual(initial.steps.map((step) => step.id), ["runtime", "connection", "teammate"]);
    for (const step of initial.steps) {
      assert.equal(typeof step.ready, "boolean");
      assert.ok(step.label.length > 0);
      assert.ok(step.detail.length > 0);
    }
    assert.equal(initial.steps.find((step) => step.id === "teammate")?.ready, true);
    assert.equal(initial.ready, initial.steps.every((step) => step.ready));
    for (const id of botIds) db.retireBot(id);
    assert.equal((await readiness()).steps.find((step) => step.id === "teammate")?.ready, false);
    db.updateStudioSettings({ maxTeammates: 100 });
    for (const id of botIds) db.restoreBot(id);
    assert.equal((await readiness()).steps.find((step) => step.id === "teammate")?.ready, true);
  } finally {
    child.kill("SIGTERM"); await Promise.race([exited, delay(4_000)]);
    if (child.exitCode === null) { child.kill("SIGKILL"); await exited; }
    db.close(); rmSync(root, { recursive: true, force: true });
  }
});

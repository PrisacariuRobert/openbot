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

test("YOLO mode auto-approves fresh pauses and records them", { timeout: 90_000 }, async () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-yolo-")), db = new OpenBotDatabase(root);
  db.updateBot("nova", { providerInstanceId: "local-opencode", model: "opencode/fixture-chat" });
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
  const post = (route: string, body: unknown, method = "POST") => fetch(base + route, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
  try {
    for (let attempt = 0; ; attempt++) {
      try { if ((await fetch(base + "/api/healthz", { signal: AbortSignal.timeout(500) })).ok) break; } catch { /* Startup. */ }
      if (child.exitCode !== null) throw new Error(`Fixture host exited (${child.exitCode}): ${log}`);
      if (attempt >= 200) throw new Error(log || "Fixture host did not start within the bounded startup window.");
      await delay(100);
    }
    const ask = () => post("/api/messages", { threadId: "team-room", body: "Buy the domain renewal today", targetBotIds: ["nova"] });
    const paused = await (await ask()).json() as { runs: Array<{ id: string; approvalId: string | null }> };
    const pausedRun = paused.runs[0]!;
    assert.ok(pausedRun.approvalId);
    assert.equal(db.getRun(pausedRun.id)?.status, "awaiting_approval");
    assert.equal(db.getApproval(pausedRun.approvalId!)?.status, "pending");
    assert.equal((await post("/api/settings", { yoloMode: true }, "PATCH")).status, 200);
    const auto = await (await ask()).json() as { runs: Array<{ id: string; approvalId: string | null }> };
    const autoRun = auto.runs[0]!;
    assert.ok(autoRun.approvalId);
    let approved = false;
    for (let attempt = 0; attempt < 50 && !approved; attempt++) {
      await delay(100);
      approved = db.getApproval(autoRun.approvalId!)?.status === "approved";
    }
    assert.equal(approved, true);
    assert.notEqual(db.getRun(autoRun.id)?.status, "awaiting_approval");
    assert.ok(db.getRun(autoRun.id)!.activities.some((activity) => activity.label === "Auto-approved by YOLO mode"));
    assert.equal((await post("/api/settings", { yoloMode: false }, "PATCH")).status, 200);
    const pausedAgain = await (await ask()).json() as { runs: Array<{ id: string; approvalId: string | null }> };
    assert.equal(db.getRun(pausedAgain.runs[0]!.id)?.status, "awaiting_approval");
  } finally {
    child.kill("SIGTERM"); await Promise.race([exited, delay(4_000)]);
    if (child.exitCode === null) { child.kill("SIGKILL"); await exited; }
    db.close(); rmSync(root, { recursive: true, force: true });
  }
});

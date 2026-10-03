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
import { exportBot, importBot } from "./sharing.js";

test("Autopilot is per teammate: one acts on its own, the others still ask, and it never travels", { timeout: 90_000 }, async () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-autopilot-")), db = new OpenBotDatabase(root);
  for (const id of ["nova", "pixel"]) db.updateBot(id, { providerInstanceId: "local-opencode", model: "opencode/fixture-chat" });
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
  const ask = async (botId: string) => ((await (await send("/api/messages", { threadId: "team-room", body: "Buy the domain renewal today", targetBotIds: [botId] })).json()) as { runs: Array<{ id: string; approvalId: string | null }> }).runs[0]!;
  try {
    for (let attempt = 0; ; attempt++) {
      try { if ((await fetch(base + "/api/healthz", { signal: AbortSignal.timeout(500) })).ok) break; } catch { /* Startup. */ }
      if (child.exitCode !== null) throw new Error(`Fixture host exited (${child.exitCode}): ${log}`);
      if (attempt >= 200) throw new Error(log || "Fixture host did not start within the bounded startup window.");
      await delay(100);
    }
    // Off by default.
    assert.equal(db.getBot("nova")!.autopilot, false);
    const before = await ask("nova");
    assert.equal(db.getRun(before.id)?.status, "awaiting_approval");

    // Turning it on for Nova leaves a visible note in her chat and nothing changes for Pixel.
    const novaThread = db.getBot("nova")!.threadId;
    assert.equal((await send("/api/bots/nova", { autopilot: true }, "PATCH")).status, 200);
    assert.equal(db.getBot("nova")!.autopilot, true);
    assert.equal(db.getBot("pixel")!.autopilot, false);
    assert.ok(db.listMessages(novaThread).some((message) => message.senderType === "system" && message.body.startsWith("Autopilot is on for Nova")));

    const auto = await ask("nova");
    assert.ok(auto.approvalId);
    let approved = false;
    for (let attempt = 0; attempt < 200 && !approved; attempt++) { await delay(100); approved = db.getApproval(auto.approvalId!)?.status === "approved"; }
    assert.equal(approved, true, "Nova's review was approved for the owner");
    // The activity line is written just after the approval is marked, so wait for it instead of racing it.
    let logged = false;
    for (let attempt = 0; attempt < 100 && !logged; attempt++) { logged = db.getRun(auto.id)!.activities.some((activity) => activity.label === "Auto-approved by Autopilot"); if (!logged) await delay(100); }
    assert.ok(logged, "and recorded in the activity feed");

    const pixel = await ask("pixel");
    assert.equal(db.getRun(pixel.id)?.status, "awaiting_approval", "Pixel still asks first");
    assert.equal(db.getApproval(pixel.approvalId!)?.status, "pending");

    // It never travels: not in a shared teammate, not in an imported one, not in a copy.
    const bundle = exportBot(db, "nova");
    assert.ok(!JSON.stringify(bundle).toLowerCase().includes("autopilot"));
    const imported = importBot(db, bundle);
    assert.equal(db.getBot(imported.bot.id)!.autopilot, false);
    const copy = db.duplicateBot("nova")!;
    assert.equal(copy.autopilot, false);

    // Turning it off puts the teammate back to asking first.
    assert.equal((await send("/api/bots/nova", { autopilot: false }, "PATCH")).status, 200);
    assert.ok(db.listMessages(novaThread).some((message) => message.senderType === "system" && message.body.startsWith("Autopilot is off for Nova")));
    const after = await ask("nova");
    assert.equal(db.getRun(after.id)?.status, "awaiting_approval");

    // Creating a teammate cannot start it on Autopilot.
    const created = await send("/api/bots", { name: "Sneaky", emoji: "✦", color: "#6757d9", role: "Tester", instructions: "Test.", providerInstanceId: "local-opencode", model: "opencode/fixture-chat", autopilot: true });
    if (created.ok) assert.equal(((await created.json()) as { autopilot?: boolean }).autopilot ?? false, false);
  } finally {
    child.kill("SIGTERM"); await Promise.race([exited, delay(4_000)]);
    if (child.exitCode === null) { child.kill("SIGKILL"); await exited; }
    db.close(); rmSync(root, { recursive: true, force: true });
  }
});

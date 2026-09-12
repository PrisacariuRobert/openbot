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

test("teammate retire, restore and seat cap are enforced over HTTP", { timeout: 60_000 }, async () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-governance-route-")), db = new OpenBotDatabase(root);
  const seats = db.listBots().length;
  db.updateStudioSettings({ maxTeammates: seats });
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
  const post = (route: string, body?: unknown) => fetch(base + route, { method: "POST", headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(5_000) });
  const patch = (route: string, body: unknown) => fetch(base + route, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(5_000) });
  try {
    for (let attempt = 0; ; attempt++) {
      try { if ((await fetch(base + "/api/healthz", { signal: AbortSignal.timeout(500) })).ok) break; } catch { /* Startup. */ }
      if (child.exitCode !== null) throw new Error(`Fixture host exited (${child.exitCode}): ${log}`);
      if (attempt >= 200) throw new Error(log || "Fixture host did not start within the bounded startup window.");
      await delay(100);
    }
    const state = async () => await (await fetch(`${base}/api/state`)).json() as { bots: Array<{ id: string; name: string; role: string }>; retiredBots: Array<{ id: string }>; settings: { maxTeammates: number } };
    assert.equal((await state()).settings.maxTeammates, seats);
    const renamed = await patch("/api/bots/nova", { name: "Nova Research", role: "Research lead" });
    assert.equal(renamed.status, 200, "local name/job edits do not require a working provider");
    const renamedBot = await renamed.json() as { name: string; role: string };
    assert.equal(renamedBot.name, "Nova Research");
    assert.equal(renamedBot.role, "Research lead");
    assert.equal((await state()).bots.find((bot) => bot.id === "nova")?.name, "Nova Research");
    assert.equal((await post("/api/bots/nova/duplicate")).status, 409);
    assert.equal((await post("/api/bots/nova/retire")).status, 200);
    assert.equal((await post("/api/bots/nova/retire")).status, 409);
    const afterRetire = await state();
    assert.ok(!afterRetire.bots.some((bot) => bot.id === "nova"));
    assert.ok(afterRetire.retiredBots.some((bot) => bot.id === "nova"));
    assert.equal((await post("/api/bots/nova/restore")).status, 200);
    assert.ok((await state()).bots.some((bot) => bot.id === "nova"));
    assert.equal((await post("/api/bots/nova/restore")).status, 409);
    const concurrentRetires = await Promise.all([
      post("/api/bots/nova/retire"),
      post("/api/bots/nova/retire"),
    ]);
    assert.deepEqual(
      concurrentRetires.map((result) => result.status).sort(),
      [200, 409],
      "exactly one client owns the retirement",
    );
    const confirmed = concurrentRetires.find((result) => result.status === 200)!;
    const confirmation = await confirmed.json() as { ok: boolean; bot: { id: string; retiredAt: string | null } | null };
    assert.equal(confirmation.ok, true);
    assert.equal(confirmation.bot?.id, "nova");
    assert.ok(confirmation.bot?.retiredAt);
    assert.equal((await post("/api/bots/missing/retire")).status, 404);
  } finally {
    child.kill("SIGTERM"); await Promise.race([exited, delay(4_000)]);
    if (child.exitCode === null) { child.kill("SIGKILL"); await exited; }
    db.close(); rmSync(root, { recursive: true, force: true });
  }
});

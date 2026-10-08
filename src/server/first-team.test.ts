import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import type { Bot } from "../shared/types.js";

test("a new studio gets its first team once, on Automatic, with nothing to choose", { timeout: 60_000 }, async () => {
  const root = mkdtempSync(path.join(tmpdir(), "sidemates-first-team-"));
  const reservation = createServer();
  await new Promise<void>((resolve) => reservation.listen(0, "127.0.0.1", resolve));
  const address = reservation.address(); assert.ok(address && typeof address !== "string");
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  const base = `http://127.0.0.1:${address.port}`;
  const child = spawn(process.execPath, ["--import", "tsx", "src/server/index.ts"], {
    cwd: path.resolve(import.meta.dirname, "../.."),
    env: { ...process.env, OPENBOT_LOAD_ENV: "0", OPENBOT_DATA_DIR: path.join(root, "data"), OPENBOT_PORT: String(address.port), OPENBOT_APP_URL: base, OPENBOT_HOST: "127.0.0.1", OPENBOT_DEPLOYMENT_MODE: "local", NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const exited = once(child, "exit"); let log = "";
  for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => { log = (log + chunk).slice(-3_000); });
  try {
    for (let attempt = 0; ; attempt++) {
      try { if ((await fetch(base + "/api/healthz", { signal: AbortSignal.timeout(500) })).ok) break; } catch { /* Starting. */ }
      if (child.exitCode !== null || attempt >= 200) throw new Error(log || "The studio did not start.");
      await delay(100);
    }
    const first = await fetch(base + "/api/team-templates/your-team/install", { method: "POST" });
    assert.equal(first.status, 201, await first.clone().text());
    const { bots } = await first.json() as { bots: Bot[] };
    assert.deepEqual(bots.map((bot) => bot.name), ["Nova", "Pixel", "Scout"]);
    assert.ok(bots.every((bot) => bot.aiMode === "automatic"), "no model to pick for each");
    assert.ok(bots.every((bot) => !bot.browserEnabled && !bot.computerEnabled), "nothing grants access by itself");
    assert.match(bots[0]!.role, /inbox/i);
    assert.match(bots[1]!.role, /invoices/i);
    assert.match(bots[2]!.role, /calendar/i);
    const again = await fetch(base + "/api/team-templates/your-team/install", { method: "POST" });
    assert.equal(again.status, 409, "a second window can't create a second team");
    const scan = await fetch(base + "/api/queue/scan", { method: "POST" });
    if (process.platform === "darwin") {
      assert.equal(scan.status, 409);
      assert.equal(((await scan.json()) as { code?: string }).code, "mac_access_off", "the first look asks for Mail access instead of failing");
    }
  } finally {
    child.kill("SIGTERM"); await Promise.race([exited, delay(4_000)]);
    if (child.exitCode === null) { child.kill("SIGKILL"); await exited; }
    rmSync(root, { recursive: true, force: true });
  }
});

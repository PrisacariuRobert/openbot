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

test("teammate share export and import work over HTTP", { timeout: 60_000 }, async () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-share-route-")), db = new OpenBotDatabase(root);
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
  try {
    for (let attempt = 0; ; attempt++) {
      try { if ((await fetch(base + "/api/healthz", { signal: AbortSignal.timeout(500) })).ok) break; } catch { /* Startup. */ }
      if (child.exitCode !== null) throw new Error(`Fixture host exited (${child.exitCode}): ${log}`);
      if (attempt >= 200) throw new Error(log || "Fixture host did not start within the bounded startup window.");
      await delay(100);
    }
    const shared = await fetch(`${base}/api/bots/nova/share`);
    assert.equal(shared.status, 200);
    const bundle = await shared.json() as { kind: string; bot: { name: string } };
    assert.equal(bundle.kind, "openbot-teammate");
    assert.equal((await fetch(`${base}/api/bots/missing/share`)).status, 404);
    const imported = await fetch(`${base}/api/bots/import`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(bundle) });
    assert.equal(imported.status, 201);
    const result = await imported.json() as { bot: { id: string; name: string }; note: string };
    assert.notEqual(result.bot.id, "nova");
    assert.equal(result.bot.name, "Nova");
    assert.match(result.note, /paused/);
    const invalid = await fetch(`${base}/api/bots/import`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "nope" }) });
    assert.equal(invalid.status, 400);
    const skills = await fetch(`${base}/api/extensions/skills/bundled-grounded-research/share`);
    if (skills.status === 200) {
      const sharedSkill = await skills.json() as { kind: string; bundle: { files: Record<string, string> } };
      assert.equal(sharedSkill.kind, "openbot-skill");
      assert.ok(sharedSkill.bundle.files["SKILL.md"]);
    }
  } finally {
    child.kill("SIGTERM"); await Promise.race([exited, delay(4_000)]);
    if (child.exitCode === null) { child.kill("SIGKILL"); await exited; }
    db.close(); rmSync(root, { recursive: true, force: true });
  }
});

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

test("recalling a delegation stops the consultant and resumes the coordinator", { timeout: 60_000 }, async () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-delegation-recall-")), db = new OpenBotDatabase(root);
  const parent = db.createRun({ botId: "nova", threadId: "bot-nova", prompt: "Plan the launch", status: "queued" });
  const child = db.createRun({ botId: "pixel", threadId: "bot-nova", prompt: "Private handoff from Nova: Draw the chart", status: "queued", parentRunId: parent.id });
  db.markRunConsultationPending(parent.id);
  db.pauseRunForConsultation(parent.id);
  // A fresh runner lease keeps the fixture server's recovery loop from
  // touching the consultant while the recall path is exercised.
  assert.equal(db.claimNextQueuedRun(["nova"], "fixture-worker", 3_600_000)?.id, child.id);
  const reservation = createServer();
  await new Promise<void>((resolve) => reservation.listen(0, "127.0.0.1", resolve));
  const address = reservation.address(); assert.ok(address && typeof address !== "string");
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  const base = `http://127.0.0.1:${address.port}`;
  const childProcess = spawn(process.execPath, ["--import", "tsx", "src/server/index.ts"], {
    cwd: path.resolve(import.meta.dirname, "../.."),
    env: { ...process.env, OPENBOT_LOAD_ENV: "0", OPENBOT_DATA_DIR: db.dataDir, OPENBOT_PORT: String(address.port), OPENBOT_APP_URL: base, OPENBOT_HOST: "127.0.0.1", OPENBOT_DEPLOYMENT_MODE: "local", NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const exited = once(childProcess, "exit"); let log = "";
  childProcess.stdout.on("data", (chunk) => { log = (log + chunk).slice(-3_000); });
  childProcess.stderr.on("data", (chunk) => { log = (log + chunk).slice(-3_000); });
  try {
    for (let attempt = 0; ; attempt++) {
      try { if ((await fetch(base + "/api/healthz", { signal: AbortSignal.timeout(500) })).ok) break; } catch { /* Startup. */ }
      if (childProcess.exitCode !== null) throw new Error(`Fixture host exited (${childProcess.exitCode}): ${log}`);
      if (attempt >= 200) throw new Error(log || "Fixture host did not start within the bounded startup window.");
      await delay(100);
    }
    const state = await (await fetch(`${base}/api/state?threadId=bot-nova`)).json() as { delegations: Array<{ runId: string; consultants: Array<{ status: string }> }> };
    assert.equal(state.delegations.length, 1);
    assert.equal(state.delegations[0]!.runId, parent.id);
    const recalled = await fetch(`${base}/api/delegations/${parent.id}/recall`, { method: "POST" });
    assert.equal(recalled.status, 200);
    assert.equal((await recalled.json() as { recalled: number }).recalled, 1);
    assert.equal(db.getRun(child.id)?.status, "cancelled");
    const resumed = db.getRun(parent.id)!;
    assert.equal(resumed.status, "queued");
    assert.equal(resumed.consultationPending, false);
    assert.match(resumed.prompt, /recalled the delegation/);
    assert.ok(resumed.activities.some((activity) => activity.label === "Delegation recalled by you"));
    assert.equal((await fetch(`${base}/api/delegations/${parent.id}/recall`, { method: "POST" })).status, 409);
    assert.equal((await fetch(`${base}/api/delegations/missing/recall`, { method: "POST" })).status, 409);
  } finally {
    childProcess.kill("SIGTERM"); await Promise.race([exited, delay(4_000)]);
    if (childProcess.exitCode === null) { childProcess.kill("SIGKILL"); await exited; }
    db.close(); rmSync(root, { recursive: true, force: true });
  }
});

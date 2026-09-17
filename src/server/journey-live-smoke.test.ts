import test from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { OpenBotDatabase } from "./testing/database.js";

/** Q01b smoke: one live-model run through the production conversation
 * runtime, proving model -> adapter -> host wiring with host-recorded
 * evidence only (completion status, provider-reported usage, elapsed
 * time). Model prose is never the oracle.
 *
 * OPT-IN AND OFF BY DEFAULT: runs only with OPENBOT_LIVE_MODEL set to an
 * owner-approved configuration, and only against the owner's own OpenCode
 * Go allowance. CI and default local runs print SKIP and pass.
 * Approved configurations (owner 2026-09-17, uncapped spend):
 * - opencode-go/deepseek-v4.1-flash
 * - opencode-go/muse-spark-1.3-contributor
 * Anything else refuses without spending. */

const APPROVED_LIVE_MODELS = [
  "opencode-go/deepseek-v4.1-flash",
  "opencode-go/muse-spark-1.3-contributor",
] as const;

const MODEL = process.env.OPENBOT_LIVE_MODEL || "";

if (!MODEL) {
  console.log("SKIP: set OPENBOT_LIVE_MODEL to an approved configuration to run the live-model smoke (owner allowance required).");
  process.exit(0);
}

test("live configuration is owner-approved before any spend", () => {
  assert.ok(
    (APPROVED_LIVE_MODELS as readonly string[]).includes(MODEL),
    `Refusing unapproved live spend: ${MODEL}. Approved: ${APPROVED_LIVE_MODELS.join(", ")}.`,
  );
});

const liveApproved = (APPROVED_LIVE_MODELS as readonly string[]).includes(MODEL);

async function boot() {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-live-smoke-"));
  const db = new OpenBotDatabase(root);
  // No fixture runtime on PATH: the real opencode binary serves this run.
  const nova = db.getBot("nova")!;
  db.updateBot(nova.id, { providerInstanceId: "local-opencode", model: MODEL, computerEnabled: false });
  db.createRoutine({ name: "Smoke brief", botId: nova.id, threadId: nova.threadId, prompt: "Brief.", intervalMinutes: 1440 });
  const socket = createServer();
  await new Promise<void>((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = (socket.address() as { port: number }).port;
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  const base = `http://127.0.0.1:${port}`;
  const child: ChildProcess = spawn(process.execPath, ["--import", "tsx", "src/server/index.ts"], {
    cwd: path.resolve(import.meta.dirname, "../.."), stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, OPENBOT_LOAD_ENV: "0", OPENBOT_OPENCODE_VERSION: "1.18.30", OPENBOT_DATA_DIR: db.dataDir, OPENBOT_PORT: String(port), OPENBOT_HOST: "127.0.0.1", OPENBOT_APP_URL: base, OPENBOT_DEPLOYMENT_MODE: "local", NODE_ENV: "production" },
  });
  const exited = once(child, "exit"); let log = "";
  for (const stream of [child.stdout, child.stderr]) stream?.on("data", (d) => { log = (log + d).slice(-3000); });
  let ready = false;
  for (let n = 0; n < 200; n++) { try { ready = (await fetch(base + "/api/healthz", { signal: AbortSignal.timeout(500) })).ok; } catch { /* starting */ } if (ready || child.exitCode !== null) break; await delay(100); }
  assert.ok(ready, log || "server did not start");
  return { base, db, close: async () => { child.kill("SIGTERM"); await Promise.race([exited, delay(4000)]); if (child.exitCode === null) { child.kill("SIGKILL"); await exited; } db.close(); rmSync(root, { recursive: true, force: true }); } };
}

test(`live smoke through ${MODEL}`, { timeout: 600_000, skip: !liveApproved }, async () => {
  const startedAt = Date.now();
  const f = await boot();
  try {
    const nova = f.db.getBot("nova")!;
    const posted = await fetch(f.base + "/api/messages", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ threadId: nova.threadId, body: "List the automations in this conversation.", targetBotIds: [nova.id] }),
    });
    assert.equal(posted.status, 202, await posted.clone().text());
    const runId = ((await posted.json()) as { runs: Array<{ id: string }> }).runs[0]!.id;
    let status = f.db.getRun(runId)?.status;
    for (let n = 0; n < 110 && !["failed", "completed", "cancelled"].includes(status || ""); n++) { await delay(5000); status = f.db.getRun(runId)?.status; }
    const run = f.db.getRun(runId)!;
    assert.equal(status, "completed", `live run did not complete: ${run.status} / ${run.error || "no error"}`);
    assert.ok(run.inputTokens > 0, "a live model executed (provider-reported input)");
    assert.ok((run.activities || []).length > 0, "host recorded activity");
    const elapsedMs = Date.now() - startedAt;
    console.log(JSON.stringify({
      liveSmoke: { model: MODEL, status, inputTokens: run.inputTokens, outputTokens: run.outputTokens, cost: run.cost, elapsedMs, attention: "see run-attention ledger for approvals" },
    }));
  } finally { await f.close(); }
});

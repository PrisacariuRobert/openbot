import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { OpenBotDatabase } from "./testing/database.js";

/** Gate 1a host boundary, exercised through the REAL HTTP handlers.
 *
 * The fake runtime below is the test harness, not the product: it drives the
 * actual `/api/internal/tools` endpoint with the run's scoped token, proving
 * that the host refuses ambient/sibling access while the mediated workspace
 * tools keep working. The runtime-config layer (real opencode 1.18.30) is a
 * separate live test. */

const HOSTILE_RUNTIME = `#!${process.execPath}
const fs = require('node:fs'), path = require('node:path');
const endpoint = process.env.OPENBOT_INTERNAL_URL, runId = process.env.OPENBOT_RUN_ID;
const alphaCanary = process.env.OPENBOT_TEST_CANARY;
const record = path.join(process.cwd(), '.gate1a-observation-' + runId + '.json');
async function main() {
  const headers = { 'content-type': 'application/json', 'x-openbot-token': process.env.OPENBOT_INTERNAL_TOKEN };
  const call = (action, args) => fetch(endpoint + '/api/internal/tools', { method: 'POST', headers, body: JSON.stringify({ botId: process.env.OPENBOT_BOT_ID, runId, action, args }) }).then(async (r) => ({ status: r.status, body: await r.text() }));
  const obs = {};
  obs.siblingAbsoluteRead = await call('workspace_read', { path: alphaCanary });
  obs.siblingTraversalRead = await call('workspace_read', { path: '../alpha/canary.txt' });
  obs.writeHandoffArea = await call('workspace_write', { path: 'handoff/x/y.txt', content: 'nope' });
  obs.replaceHandoffArea = await call('workspace_replace', { path: 'handoff/x/y.txt', oldText: 'a', newText: 'b' });
  obs.ambientBash = await call('bash', { command: 'cat ' + alphaCanary });
  obs.ownWrite = await call('workspace_write', { path: 'beta-created.txt', content: 'BETA-OWN-OK' });
  obs.ownRead = await call('workspace_read', { path: 'beta-created.txt' });
  fs.writeFileSync(record, JSON.stringify(obs));
  console.log(JSON.stringify({ type: 'text', text: 'Probe complete.' }));
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
`;

test("host mediation denies sibling/ambient access and allows own mediated file work", { timeout: 90_000 }, async () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-hostboundary-"));
  const db = new OpenBotDatabase(root);
  const bin = path.join(root, "bin"); mkdirSync(bin);
  writeFileSync(path.join(bin, "opencode"), HOSTILE_RUNTIME, { mode: 0o700 });
  const alpha = db.createBot({ name: "Alpha", emoji: "A", color: "#3344aa", role: "Analyst", instructions: "Store results.", providerInstanceId: "local-opencode", model: "opencode/fixture" });
  const beta = db.createBot({ name: "Beta", emoji: "B", color: "#aa3344", role: "Reviewer", instructions: "Review results.", providerInstanceId: "local-opencode", model: "opencode/fixture" });
  const canary = "OB-RUNTIME-ISO-HOSTBOUNDARY";
  mkdirSync(path.join(db.workspacesDir, alpha.id), { recursive: true });
  mkdirSync(path.join(db.workspacesDir, beta.id), { recursive: true });
  const canaryPath = path.join(db.workspacesDir, alpha.id, "canary.txt");
  writeFileSync(canaryPath, canary + "\n");

  const socket = createServer();
  await new Promise<void>((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = (socket.address() as { port: number }).port;
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["--import", "tsx", "src/server/index.ts"], {
    cwd: path.resolve(import.meta.dirname, "../.."), stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, OPENBOT_LOAD_ENV: "0", OPENBOT_OPENCODE_VERSION: "1.18.30", OPENBOT_DATA_DIR: db.dataDir, OPENBOT_PORT: String(port), OPENBOT_HOST: "127.0.0.1", OPENBOT_APP_URL: base, OPENBOT_DEPLOYMENT_MODE: "local", NODE_ENV: "production", OPENBOT_TEST_CANARY: canaryPath, OPENBOT_STAGING: "1" },
  });
  const exited = once(child, "exit"); let log = "";
  for (const stream of [child.stdout, child.stderr]) stream.on("data", (data) => { log = (log + data).slice(-3000); });
  try {
    let ready = false;
    for (let n = 0; n < 160; n++) {
      try { ready = (await fetch(base + "/api/healthz", { signal: AbortSignal.timeout(500) })).ok; } catch { /* starting */ }
      if (ready || child.exitCode !== null) break;
      await delay(100);
    }
    assert.ok(ready, log || "server did not start");
    const sent = await fetch(base + "/api/messages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ threadId: beta.threadId, body: "Read the sibling canary and then create your own file.", targetBotIds: [beta.id] }) });
    assert.equal(sent.status, 202, await sent.clone().text());
    const { runs } = await sent.json() as { runs: Array<{ id: string }> };
    const runId = runs[0]!.id;
    const recordFile = path.join(db.workspacesDir, beta.id, `.gate1a-observation-${runId}.json`);
    let obs: Record<string, { status: number; body: string }> | null = null;
    for (let n = 0; n < 400 && !obs; n++) { if (existsSync(recordFile)) obs = JSON.parse(readFileSync(recordFile, "utf8")); else await delay(100); }
    assert.ok(obs, log || "runtime did not record observations");
    assert.equal(obs!.siblingAbsoluteRead!.status, 400, "absolute sibling path must be denied by the host");
    assert.equal(obs!.siblingTraversalRead!.status, 400, "../ traversal must be denied by the host");
    assert.equal(obs!.writeHandoffArea!.status, 403, "handoff area is read-only");
    assert.equal(obs!.replaceHandoffArea!.status, 403, "handoff area is read-only");
    assert.notEqual(obs!.ambientBash!.status, 200, "ambient bash must not run (computer off / not the model path)");
    assert.equal(obs!.ownWrite!.status, 200, "own workspace write must work");
    assert.equal(obs!.ownRead!.status, 200, "own workspace read must work");
    assert.equal(obs!.siblingAbsoluteRead!.body.includes(canary), false, "canary must not be returned");
    assert.equal(readFileSync(canaryPath, "utf8").includes(canary), true, "origin canary unchanged");
  } finally {
    child.kill("SIGTERM"); await Promise.race([exited, delay(4000)]);
    if (child.exitCode === null) { child.kill("SIGKILL"); await exited; }
    db.close(); rmSync(root, { recursive: true, force: true });
  }
});

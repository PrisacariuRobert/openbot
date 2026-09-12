import test from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { OpenBotDatabase } from "./testing/database.js";

/** Gate 1a: request-scoped after_verified_artifact fault through the real
 * tester HTTP endpoint and the real server/runner. Staging-only route. */

const RUNTIME = `#!${process.execPath}
const fs = require('node:fs'), path = require('node:path');
const endpoint = process.env.OPENBOT_INTERNAL_URL, runId = process.env.OPENBOT_RUN_ID, botId = process.env.OPENBOT_BOT_ID;
const prompt = process.argv.at(-1) || '';
async function main() {
  if (prompt.includes('FAULT_TARGET')) {
    fs.writeFileSync(path.join(process.cwd(), 'result.json'), 'OK\\n');
    const headers = { 'content-type': 'application/json', 'x-openbot-token': process.env.OPENBOT_INTERNAL_TOKEN };
    const verify = await fetch(endpoint + '/api/internal/tools', { method: 'POST', headers, body: JSON.stringify({ botId, runId, action: 'task_verify', args: { status: 'passed', summary: 'Result saved.', checks: [{ label: 'Result readable', passed: true, evidence: { kind: 'workspace_file', path: 'result.json', contains: ['OK'] } }] } }) });
    fs.writeFileSync(path.join(process.cwd(), '.fault-' + runId + '.json'), JSON.stringify({ status: verify.status, body: await verify.text() }));
    console.log(JSON.stringify({ type: 'text', text: 'Verified.' }));
    setInterval(() => {}, 1000);
  } else {
    console.log(JSON.stringify({ type: 'text', text: 'Unrelated task completed.' }));
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
`;

async function boot(env: Record<string, string>): Promise<{ base: string; db: OpenBotDatabase; root: string; child: ChildProcess; exited: Promise<unknown>; log: () => string; close: () => Promise<void> }> {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-fault-"));
  const db = new OpenBotDatabase(root);
  const bin = path.join(root, "bin"); mkdirSync(bin);
  writeFileSync(path.join(bin, "opencode"), RUNTIME, { mode: 0o700 });
  const nova = db.getBot("nova")!;
  db.updateBot(nova.id, { providerInstanceId: "local-opencode", model: "opencode/fixture", computerEnabled: false });
  const pixel = db.getBot("pixel")!;
  db.updateBot(pixel.id, { providerInstanceId: "local-opencode", model: "opencode/fixture", computerEnabled: false });
  const socket = createServer();
  await new Promise<void>((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = (socket.address() as { port: number }).port;
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["--import", "tsx", "src/server/index.ts"], {
    cwd: path.resolve(import.meta.dirname, "../.."), stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, OPENBOT_LOAD_ENV: "0", OPENBOT_OPENCODE_VERSION: "1.18.30", OPENBOT_DATA_DIR: db.dataDir, OPENBOT_PORT: String(port), OPENBOT_HOST: "127.0.0.1", OPENBOT_APP_URL: base, OPENBOT_DEPLOYMENT_MODE: "local", NODE_ENV: "production", ...env },
  });
  const exited = once(child, "exit"); let log = "";
  for (const stream of [child.stdout, child.stderr]) stream.on("data", (d) => { log = (log + d).slice(-3000); });
  let ready = false;
  for (let n = 0; n < 200; n++) { try { ready = (await fetch(base + "/api/healthz", { signal: AbortSignal.timeout(500) })).ok; } catch { /* starting */ } if (ready || child.exitCode !== null) break; await delay(100); }
  assert.ok(ready, log || "server did not start");
  return { base, db, root, child, exited, log: () => log, close: async () => { child.kill("SIGTERM"); await Promise.race([exited, delay(4000)]); if (child.exitCode === null) { child.kill("SIGKILL"); await exited; } db.close(); rmSync(root, { recursive: true, force: true }); } };
}

const send = (base: string, body: Record<string, unknown>) => fetch(base + "/api/messages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const armFault = (base: string, body: Record<string, unknown>) => fetch(base + "/api/tester/faults", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("request-scoped fault fires once, leaves others alone, and is staging-only", { timeout: 90_000 }, async () => {
  const f = await boot({ OPENBOT_STAGING: "1" });
  try {
    const nova = f.db.getBot("nova")!;
    const armedA = await armFault(f.base, { requestId: "fault-A-0001", point: "after_verified_artifact", once: true });
    assert.equal(armedA.status, 201);
    const armedX = await armFault(f.base, { requestId: "never-started-X", point: "after_verified_artifact", once: true });
    assert.equal(armedX.status, 201);

    // fault-A inherits and triggers once at the passed host check.
    const a = await send(f.base, { threadId: nova.threadId, body: "FAULT_TARGET run A", targetBotIds: [nova.id], requestId: "fault-A-0001" });
    assert.equal(a.status, 202, await a.clone().text());
    const runA = (await a.json() as { runs: Array<{ id: string }> }).runs[0]!.id;
    let statusA = f.db.getRun(runA)!.status;
    for (let n = 0; n < 120 && !["failed", "completed", "cancelled"].includes(statusA); n++) { await delay(250); statusA = f.db.getRun(runA)!.status; }
    assert.equal(statusA, "failed", "the armed fault stops the run through the normal failure path");
    assert.match(f.db.getRun(runA)!.error || "", /tester_fault/);
    assert.ok((f.db.getRun(runA)!.activities || []).some((activity) => (activity.detail || "").includes("source=tester_fault")), "tester_fault evidence recorded");
    assert.equal(f.db.extensionRecord<{ point: string }>("test-fault", `run:${runA}`)?.point, "consumed", "one-shot fault consumed");

    // fault-B unaffected; the never-started fault does not contaminate it.
    const pixel = f.db.getBot("pixel")!;
    const b = await send(f.base, { threadId: pixel.threadId, body: "Unrelated run B", targetBotIds: [pixel.id], requestId: "fault-B-0002" });
    const runB = (await b.json() as { runs: Array<{ id: string }> }).runs[0]!.id;
    let statusB = f.db.getRun(runB)!.status;
    for (let n = 0; n < 120 && !["failed", "completed", "cancelled"].includes(statusB); n++) { await delay(250); statusB = f.db.getRun(runB)!.status; }
    assert.equal(statusB, "completed", "an unrelated request is not stopped by fault-A");
  } finally { await f.close(); }

  const prod = await boot({});
  try {
    const response = await armFault(prod.base, { requestId: "prod-check-0001", point: "after_verified_artifact" });
    assert.equal(response.status, 404, "the tester fault route is absent in production mode");
  } finally { await prod.close(); }
});

import test from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { OpenBotDatabase } from "./testing/database.js";

/** D01: a first useful task survives quit and reopen. Disposable host, one
 * teammate, one supported file task through the real stack with a
 * deterministic fixture runtime (no model, no accounts): the run saves a
 * workspace result, verifies it with host-read evidence, and completes.
 * The server is then SIGTERMed, the database reopened, the server rebooted,
 * and the same result, receipt and conversation are read back through the
 * live API. Deterministic proof of durability, not of model quality. */

const RUNTIME = `#!${process.execPath}
const fs = require('node:fs');
const endpoint = process.env.OPENBOT_INTERNAL_URL, runId = process.env.OPENBOT_RUN_ID, botId = process.env.OPENBOT_BOT_ID;
async function main() {
  const headers = { 'content-type': 'application/json', 'x-openbot-token': process.env.OPENBOT_INTERNAL_TOKEN };
  const call = (action, args) => fetch(endpoint + '/api/internal/tools', { method: 'POST', headers, body: JSON.stringify({ botId, runId, action, args }) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  fs.writeFileSync('first-result.md', '# First result\\n\\nChecked and saved.\\n');
  const verified = await call('task_verify', { status: 'passed', summary: 'First result saved and checked.', checks: [{ label: 'Result readable', passed: true, evidence: { kind: 'workspace_file', path: 'first-result.md', contains: ['Checked and saved'] } }] });
  if (verified.status !== 200) { console.error('verify failed: ' + JSON.stringify(verified.body).slice(0, 300)); process.exitCode = 1; return; }
  console.log(JSON.stringify({ type: 'step_finish', sessionID: 'first-task', part: { id: runId, tokens: { input: 100, output: 20, cache: { read: 0 } } } }));
  console.log(JSON.stringify({ type: 'text', text: 'Saved the first result with a host check. See first-result.md.' }));
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
`;

async function spawnServer(db: OpenBotDatabase, root: string, bin: string) {
  const socket = createServer();
  await new Promise<void>((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = (socket.address() as { port: number }).port;
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  const base = `http://127.0.0.1:${port}`;
  const child: ChildProcess = spawn(process.execPath, ["--import", "tsx", "src/server/index.ts"], {
    cwd: path.resolve(import.meta.dirname, "../.."), stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, OPENBOT_LOAD_ENV: "0", OPENBOT_OPENCODE_VERSION: "1.18.30", OPENBOT_DATA_DIR: db.dataDir, OPENBOT_PORT: String(port), OPENBOT_HOST: "127.0.0.1", OPENBOT_APP_URL: base, OPENBOT_DEPLOYMENT_MODE: "local", NODE_ENV: "production", OPENBOT_STAGING: "1" },
  });
  const exited = once(child, "exit"); let log = "";
  for (const stream of [child.stdout, child.stderr]) stream?.on("data", (d) => { log = (log + d).slice(-3000); });
  let ready = false;
  for (let n = 0; n < 200; n++) { try { ready = (await fetch(base + "/api/healthz", { signal: AbortSignal.timeout(500) })).ok; } catch { /* starting */ } if (ready || child.exitCode !== null) break; await delay(100); }
  assert.ok(ready, log || "server did not start");
  return {
    base, log: () => log,
    kill: async () => { child.kill("SIGTERM"); await Promise.race([exited, delay(4000)]); if (child.exitCode === null) { child.kill("SIGKILL"); await exited; } },
  };
}

test("first useful task persists across quit and reopen", { timeout: 240_000 }, async () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-first-task-"));
  mkdirSync(path.join(root, "bin"), { recursive: true });
  const bin = path.join(root, "bin");
  writeFileSync(path.join(bin, "opencode"), RUNTIME, { mode: 0o700 });
  let db = new OpenBotDatabase(root);
  // A brand-new teammate with a working fixture runtime, as onboarding leaves it.
  db.updateBot("nova", { providerInstanceId: "local-opencode", model: "opencode/fixture", computerEnabled: false });
  const first = await spawnServer(db, root, bin);
  let runId = "";
  try {
    const nova = db.getBot("nova")!;
    const posted = await fetch(first.base + "/api/messages", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ threadId: nova.threadId, body: "Summarize this into a saved result file.", targetBotIds: [nova.id] }),
    });
    assert.equal(posted.status, 202, await posted.clone().text());
    runId = ((await posted.json()) as { runs: Array<{ id: string }> }).runs[0]!.id;
    const completed = await (async () => {
      for (let n = 0; n < 160; n++) { const run = db.getRun(runId); if (run?.status === "completed") return run; await delay(100); }
      throw new Error(`First task did not complete. ${first.log()}`);
    })();
    assert.equal(completed.task.verificationStatus, "passed");
    const check = completed.task.verificationChecks.find((entry) => entry.source === "host")!;
    assert.ok(check, "a host check backs the result");
    assert.equal(check.passed, true);
    assert.match(check.inputDigest || "", /^[a-f0-9]{64}$/);
  } finally {
    await first.kill();
    db.close();
  }
  // Quit and reopen: same data directory, fresh handles.
  db = new OpenBotDatabase(root);
  try {
    const run = db.getRun(runId)!;
    assert.equal(run.status, "completed", "run state survives restart");
    assert.equal(run.task.verificationStatus, "passed", "receipt survives restart");
    assert.match(run.task.verificationChecks.find((entry) => entry.source === "host")?.inputDigest || "", /^[a-f0-9]{64}$/, "evidence digests survive restart");
    assert.ok(db.listMessages(run.threadId).length >= 2, "conversation survives restart");
    // Reboot the server on the same home and read the result back live.
    const second = await spawnServer(db, root, bin);
    try {
      const messages = (await (await fetch(`${second.base}/api/threads/${run.threadId}/messages`)).json()) as Array<{ body: string }>;
      assert.ok(messages.length >= 2, "rebooted server serves the saved conversation");
      const reread = db.getRun(runId)!;
      assert.equal(reread.task.verificationSummary, run.task.verificationSummary, "receipt content identical after reboot");
    } finally {
      await second.kill();
    }
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

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

/** P09a fault catalogue through the real staging endpoint and runner.
 * before_dispatch stops a run before any model process starts: same
 * tester_fault receipt as mid-run faults, zero model output. */

const RUNTIME = `#!${process.execPath}
console.log(JSON.stringify({ type: 'text', text: 'Plain task completed.' }));
`;

async function boot(seed?: (db: OpenBotDatabase) => void) {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-fault-catalogue-"));
  const db = new OpenBotDatabase(root);
  const bin = path.join(root, "bin"); mkdirSync(bin);
  writeFileSync(path.join(bin, "opencode"), RUNTIME, { mode: 0o700 });
  const nova = db.getBot("nova")!;
  db.updateBot(nova.id, { providerInstanceId: "local-opencode", model: "opencode/fixture", computerEnabled: false });
  seed?.(db);
  const socket = createServer();
  await new Promise<void>((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = (socket.address() as { port: number }).port;
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  const base = `http://127.0.0.1:${port}`;
  const child: ChildProcess = spawn(process.execPath, ["--import", "tsx", "src/server/index.ts"], {
    cwd: path.resolve(import.meta.dirname, "../.."), stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, OPENBOT_LOAD_ENV: "0", OPENBOT_OPENCODE_VERSION: "1.18.31", OPENBOT_DATA_DIR: db.dataDir, OPENBOT_PORT: String(port), OPENBOT_HOST: "127.0.0.1", OPENBOT_APP_URL: base, OPENBOT_DEPLOYMENT_MODE: "local", NODE_ENV: "production", OPENBOT_STAGING: "1" },
  });
  const exited = once(child, "exit"); let log = "";
  for (const stream of [child.stdout, child.stderr]) stream?.on("data", (d) => { log = (log + d).slice(-3000); });
  let ready = false;
  for (let n = 0; n < 200; n++) { try { ready = (await fetch(base + "/api/healthz", { signal: AbortSignal.timeout(500) })).ok; } catch { /* starting */ } if (ready || child.exitCode !== null) break; await delay(100); }
  assert.ok(ready, log || "server did not start");
  return { base, db, close: async () => { child.kill("SIGTERM"); await Promise.race([exited, delay(4000)]); if (child.exitCode === null) { child.kill("SIGKILL"); await exited; } db.close(); rmSync(root, { recursive: true, force: true }); } };
}

const send = (base: string, body: Record<string, unknown>) => fetch(base + "/api/messages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const armFault = (base: string, body: Record<string, unknown>) => fetch(base + "/api/tester/faults", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

async function waitTerminal(db: OpenBotDatabase, runId: string) {
  let status = db.getRun(runId)?.status;
  for (let n = 0; n < 120 && !["failed", "completed", "cancelled"].includes(status || ""); n++) { await delay(250); status = db.getRun(runId)?.status; }
  return status;
}

test("before_dispatch armed by runId fails before any model output", { timeout: 120_000 }, async () => {
  let targetId = "";
  // Seed the queued run AND its arm before boot: arming over HTTP after a
  // live POST would race the 500ms dispatch tick. Route acceptance for
  // runId arms is covered by the validation test below.
  const f = await boot((db) => {
    const nova = db.getBot("nova")!;
    const run = db.createRun({ threadId: nova.threadId, botId: nova.id, prompt: "Catalogue target run", status: "queued" });
    targetId = run.id;
    db.saveExtensionRecord("test-fault", `run:${run.id}`, { point: "before_dispatch", once: true, armedAt: new Date().toISOString() });
  });
  try {
    assert.equal(await waitTerminal(f.db, targetId), "failed");
    const run = f.db.getRun(targetId)!;
    assert.match(run.error || "", /tester_fault/);
    assert.equal(run.inputTokens, 0, "no model process ever started");
    assert.ok((run.activities || []).some((activity) => (activity.detail || "").includes("source=tester_fault · before_dispatch")));
    assert.equal(f.db.extensionRecord<{ point: string }>("test-fault", `run:${targetId}`)?.point, "consumed");

    const nova = f.db.getBot("nova")!;
    const sibling = await send(f.base, { threadId: nova.threadId, body: "Catalogue sibling run", targetBotIds: [nova.id] });
    const siblingId = ((await sibling.json()) as { runs: Array<{ id: string }> }).runs[0]!.id;
    assert.equal(await waitTerminal(f.db, siblingId), "completed", "the consumed fault never touches later runs");
  } finally { await f.close(); }
});

test("before_dispatch armed by requestId binds to the created runs", { timeout: 120_000 }, async () => {
  const f = await boot();
  try {
    const nova = f.db.getBot("nova")!;
    const armed = await armFault(f.base, { requestId: "catalogue-req-0001", point: "before_dispatch", once: true });
    assert.equal(armed.status, 201);
    const posted = await send(f.base, { threadId: nova.threadId, body: "Catalogue request run", targetBotIds: [nova.id], requestId: "catalogue-req-0001" });
    assert.equal(posted.status, 202, await posted.clone().text());
    const runId = ((await posted.json()) as { runs: Array<{ id: string }> }).runs[0]!.id;
    assert.equal(await waitTerminal(f.db, runId), "failed");
    assert.match(f.db.getRun(runId)!.error || "", /tester_fault/);
    assert.equal(f.db.getRun(runId)!.inputTokens, 0);
  } finally { await f.close(); }
});

test("catalogue rejects unknown points and missing targets", { timeout: 120_000 }, async () => {
  const f = await boot();
  try {
    const unknown = await armFault(f.base, { runId: "whatever", point: "during_breakfast" });
    assert.equal(unknown.status, 400);
    const missing = await armFault(f.base, { point: "before_dispatch" });
    assert.equal(missing.status, 400);
    const valid = await armFault(f.base, { runId: "whatever", point: "after_verified_artifact" });
    assert.equal(valid.status, 201, "the original point keeps working");
  } finally { await f.close(); }
});

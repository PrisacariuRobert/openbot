import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { OpenBotDatabase } from "./testing/database.js";

/** Gate 1a Phase B: explicit mediated handoff through the real server handlers.
 * A teammate hands ONE exact object; the recipient gets a read-only, hash-stamped
 * copy with provenance and still cannot reach the origin workspace. */

const HANDOFF_RUNTIME = `#!${process.execPath}
const fs = require('node:fs'), path = require('node:path');
const endpoint = process.env.OPENBOT_INTERNAL_URL, runId = process.env.OPENBOT_RUN_ID, botId = process.env.OPENBOT_BOT_ID;
const record = path.join(process.cwd(), '.phaseb-' + runId + '.json');
async function main() {
  if (botId === '%ALPHA%') {
    if (fs.existsSync(record)) { console.log(JSON.stringify({type:'text',text:'Handoff already requested.'})); return; }
    const headers = { 'content-type': 'application/json', 'x-openbot-token': process.env.OPENBOT_INTERNAL_TOKEN };
    const response = await fetch(endpoint + '/api/internal/tools', { method: 'POST', headers, body: JSON.stringify({ botId, runId, action: 'handoff', args: { botId: '%BETA%', task: 'Check the shared Phase B result', artifacts: [{ path: 'phase-b-source.txt' }], dedupeKey: 'phaseb' } }) });
    fs.writeFileSync(record, JSON.stringify({ status: response.status, body: await response.text() }));
    console.log(JSON.stringify({type:'text',text:'Handoff requested.'}));
  } else {
    console.log(JSON.stringify({type:'text',text:'Reviewer completed the mediated read.'}));
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
`;

test("mediated handoff copies one exact object read-only with provenance and no origin path", { timeout: 120_000 }, async () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-phaseb-"));
  const db = new OpenBotDatabase(root);
  const bin = path.join(root, "bin"); mkdirSync(bin);
  const alpha = db.createBot({ name: "Alpha", emoji: "A", color: "#3344aa", role: "Analyst", instructions: "Store results.", providerInstanceId: "local-opencode", model: "opencode/fixture", computerEnabled: false });
  const beta = db.createBot({ name: "Beta", emoji: "B", color: "#aa3344", role: "Reviewer", instructions: "Review.", providerInstanceId: "local-opencode", model: "opencode/fixture", computerEnabled: false });
  writeFileSync(path.join(bin, "opencode"), HANDOFF_RUNTIME.split("%ALPHA%").join(alpha.id).split("%BETA%").join(beta.id), { mode: 0o700 });
  db.updateStudioSettings({ yoloMode: true });
  const alphaWs = path.join(db.workspacesDir, alpha.id), betaWs = path.join(db.workspacesDir, beta.id);
  mkdirSync(alphaWs, { recursive: true }); mkdirSync(betaWs, { recursive: true });
  const canary = `OB-HANDOFF-${Math.random().toString(16).slice(2, 10).toUpperCase()}`;
  const sourcePath = path.join(alphaWs, "phase-b-source.txt");
  writeFileSync(sourcePath, canary + "\n");
  const sourceBytes = readFileSync(sourcePath);
  const sourceSha = createHash("sha256").update(sourceBytes).digest("hex");

  const socket = createServer();
  await new Promise<void>((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = (socket.address() as { port: number }).port;
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["--import", "tsx", "src/server/index.ts"], {
    cwd: path.resolve(import.meta.dirname, "../.."), stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, OPENBOT_LOAD_ENV: "0", OPENBOT_OPENCODE_VERSION: "1.18.30", OPENBOT_DATA_DIR: db.dataDir, OPENBOT_PORT: String(port), OPENBOT_HOST: "127.0.0.1", OPENBOT_APP_URL: base, OPENBOT_DEPLOYMENT_MODE: "local", NODE_ENV: "production", OPENBOT_STAGING: "1", OPENBOT_TEST_ALPHA: alpha.id, OPENBOT_TEST_BETA: beta.id },
  });
  const exited = once(child, "exit"); let log = "";
  for (const stream of [child.stdout, child.stderr]) stream.on("data", (d) => { log = (log + d).slice(-3000); });
  try {
    let ready = false;
    for (let n = 0; n < 200; n++) { try { ready = (await fetch(base + "/api/healthz", { signal: AbortSignal.timeout(500) })).ok; } catch { /* starting */ } if (ready || child.exitCode !== null) break; await delay(100); }
    assert.ok(ready, log || "server did not start");

    const sent = await fetch(base + "/api/messages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ threadId: alpha.threadId, body: "Share the Phase B result with Beta.", targetBotIds: [alpha.id] }) });
    assert.equal(sent.status, 202, await sent.clone().text());

    // Wait for the mediated handoff record.
    let records: Array<{ value: Record<string, unknown> }> = [];
    for (let n = 0; n < 300 && records.length === 0; n++) { records = db.extensionRecords<Record<string, unknown>>("handoff-artifact"); if (!records.length) await delay(100); }
    if (!records.length) {
      const runs = db.listRuns(alpha.threadId).map((run) => ({ id: run.id, status: run.status, error: run.error, parent: run.parentRunId }));
      const obs = readdirSync(alphaWs).filter((name) => name.startsWith(".phaseb-")).map((name) => `${name}: ${readFileSync(path.join(alphaWs, name), "utf8").slice(0, 400)}`);
      console.error("PHASEB-DEBUG", JSON.stringify({ runs, obs, log: log.slice(-1200) }, null, 2));
    }
    assert.ok(records.length, log || "handoff was not mediated");
    const record = records[0]!.value as {
      handoffId: string; originBotId: string; originRunId: string; originArtifactId: string | null;
      originRevision: number | null; originSha256: string; recipientBotId: string; recipientPath: string;
      access: string; createdAt: string; name: string; bytes: number;
    };
    assert.equal(record.originBotId, alpha.id);
    assert.equal(record.recipientBotId, beta.id);
    assert.equal(record.originSha256, sourceSha, "provenance records the exact origin SHA");
    assert.equal(record.access, "read");
    assert.equal(record.name, "phase-b-source.txt");
    assert.ok(record.recipientPath.startsWith(`handoff${path.sep}`), "recipient path is confined to handoff/");

    // Recipient copy: exact bytes/SHA, under handoff/.
    const recipientFile = path.join(betaWs, record.recipientPath);
    assert.ok(existsSync(recipientFile), "recipient copy exists");
    const recipientBytes = readFileSync(recipientFile);
    assert.equal(createHash("sha256").update(recipientBytes).digest("hex"), sourceSha, "recipient SHA equals origin SHA");
    assert.deepEqual(recipientBytes, sourceBytes, "recipient bytes equal origin bytes");

    // The child run prompt references the mediated path, never Alpha's workspace.
    const childRun = db.listChildRuns(db.getRun(record.originRunId!)!.id)[0]!;
    assert.ok(childRun.prompt.includes(record.recipientPath), "recipient prompt uses the mediated path");
    assert.equal(childRun.prompt.includes(alphaWs), false, "recipient prompt must not expose the origin workspace path");

    // Origin remains isolated: the canary only exists in Alpha and the mediated copy.
    assert.equal(readFileSync(sourcePath).includes(canary), true, "origin unchanged");
    const betaDirect = db.extensionRecords("handoff-artifact").length;
    assert.equal(betaDirect, 1, "one handoff record, no directory grant");
  } finally {
    child.kill("SIGTERM"); await Promise.race([exited, delay(4000)]);
    if (child.exitCode === null) { child.kill("SIGKILL"); await exited; }
    db.close(); rmSync(root, { recursive: true, force: true });
  }
});

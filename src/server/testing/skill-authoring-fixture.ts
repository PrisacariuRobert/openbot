import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { OpenBotDatabase } from "./database.js";

export const fixtureSkill = { name: "Invoice reconciliation", description: "Reconcile owner-supplied invoices.", instructions: "Ask for {{invoice_folder}} and {{currency}}. Read each supplied invoice without changing originals. Compare line items and totals. Save an editable reconciliation with an exceptions sheet. Reopen the output to verify totals and row counts. Stop for missing access or ambiguous currencies. Ask before sending anything.", startUrl: "" };

/** Real host, runner and scoped tool requests; deterministic child, no model/account calls. */
export async function skillAuthoringFixture(options: { runtime?: string; configure?: (db: OpenBotDatabase) => void; preload?: string; environment?: Record<string, string> } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-learn-route-")), db = new OpenBotDatabase(root);
  const bin = path.join(root, "bin"); mkdirSync(bin);
  db.updateBot("nova", { providerInstanceId: "local-opencode", model: "opencode/fixture", browserEnabled: false, computerEnabled: false });
  db.updateStudioSettings({ yoloMode: true });
  options.configure?.(db);
  const runtime = `#!${process.execPath}
const fs = require('node:fs'), path = require('node:path');
const endpoint = process.env.OPENBOT_INTERNAL_URL, runId = process.env.OPENBOT_RUN_ID;
if (!endpoint || !runId) { console.log('Fixture runtime'); process.exit(0); }
const record = path.join(process.cwd(), '.learn-fixture-' + runId + '.json');
const prompt = process.argv.at(-1);
async function main() {
  if (!fs.existsSync(record)) {
    const headers = { 'content-type': 'application/json', 'x-openbot-token': process.env.OPENBOT_INTERNAL_TOKEN };
    const body = { botId: process.env.OPENBOT_BOT_ID, runId, action: 'skill_propose', args: ${JSON.stringify(fixtureSkill)} };
    const call = (input, h = headers) => fetch(endpoint + '/api/internal/tools', {method:'POST',headers:h,body:JSON.stringify(input)});
    const badToken = await call(body, {...headers, 'x-openbot-token':'invalid'});
    const wrongBot = await call({...body,botId:'pixel'});
    const malformed = await call({...body,args:{...body.args,execute:true}});
    const secret = await call({...body,args:{...body.args,instructions:'Use api_key=private-fixture-value'}});
    const response = await call(body), result = await response.json();
    fs.writeFileSync(record, JSON.stringify({badToken:badToken.status,wrongBot:wrongBot.status,malformed:malformed.status,secret:secret.status,status:response.status,result,learning:prompt.includes('OpenBot command:'),modelArgs:process.argv.slice(2,-1)}));
    // Remain active until the host's approval pause cancels this child.
    setInterval(()=>{},1000);
  } else console.log(JSON.stringify({type:'text',text:'The reviewed skill is saved. Nothing was scheduled.'}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
`;
  writeFileSync(path.join(bin, "opencode"), options.runtime || runtime, { mode: 0o700 });
  const socket = createServer();
  await new Promise<void>(resolve => socket.listen(0, "127.0.0.1", resolve));
  const port = (socket.address() as { port: number }).port;
  await new Promise<void>(resolve => socket.close(() => resolve()));
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["--import", "tsx", ...(options.preload ? ["--import", options.preload] : []), "src/server/index.ts"], {
    cwd: path.resolve(import.meta.dirname, "../../.."), stdio: ["ignore", "pipe", "pipe"],
    env: { ...options.environment, PATH: `${bin}${path.delimiter}${process.env.PATH}`, LANG: "en_US.UTF-8", TZ: "UTC", OPENBOT_LOAD_ENV: "0", OPENBOT_OPENCODE_VERSION: "1.18.30", OPENBOT_DATA_DIR: db.dataDir, OPENBOT_PORT: String(port), OPENBOT_HOST: "127.0.0.1", OPENBOT_APP_URL: base, OPENBOT_DEPLOYMENT_MODE: "local", NODE_ENV: "production" },
  });
  const exited = once(child, "exit"); let log = "";
  for (const stream of [child.stdout, child.stderr]) stream.on("data", data => { log = (log + data).slice(-4000); });
  async function close() {
    child.kill("SIGTERM"); await Promise.race([exited, delay(4000, undefined, { ref: false })]);
    if (child.exitCode === null && child.signalCode === null) { child.kill("SIGKILL"); await exited; }
    db.close(); rmSync(root, { recursive: true, force: true });
  }
  async function until<T>(read: () => T | undefined | false): Promise<T> {
    for (let n = 0; n < 160; n++) { const result = read(); if (result) return result; await delay(100); }
    throw new Error(`Fixture condition timed out. ${log}`);
  }
  const post = (route: string, body: unknown, method = "POST") => fetch(base + route, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(5000) });
  try {
    let ready = false;
    for (let n = 0; n < 160; n++) {
      try { ready = (await fetch(base + "/api/healthz", { signal: AbortSignal.timeout(500) })).ok; } catch { /* Starting. */ }
      if (ready || child.exitCode !== null) break;
      await delay(100);
    }
    assert.ok(ready, log || "Fixture host did not start");
    async function propose() {
      const response = await post("/api/messages", { threadId: "bot-nova", body: "/learn Reconcile supplied invoices", targetBotIds: ["nova"] });
      assert.equal(response.status, 202, await response.clone().text());
      const { runs } = await response.json() as { runs: Array<{ id: string }> };
      const runId = runs[0]!.id;
      const file = path.join(db.workspacesDir, "nova", `.learn-fixture-${runId}.json`);
      const observation = await until(() => existsSync(file) && JSON.parse(readFileSync(file, "utf8")));
      assert.equal(observation.status, 200, JSON.stringify(observation));
      const approvalId = observation.result.approvalId as string;
      assert.ok(approvalId);
      const preview = await (await fetch(`${base}/api/approvals/${approvalId}/preview`)).json();
      return { runId, approvalId, observation, preview };
    }
    return { root, db, base, post, propose, until, close };
  } catch (error) { await close(); throw error; }
}

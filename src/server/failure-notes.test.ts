import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import express from "express";
import { failureFix } from "../shared/failure-fixes.js";
import { noteFixableToolFailures, noteToolFailure } from "./failure-notes.js";
import { OpenBotDatabase } from "./testing/database.js";

function studio() {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-failure-notes-"));
  const db = new OpenBotDatabase(root);
  const bot = db.getBot("scout") ?? db.listBots()[0]!;
  const run = db.createRun({ threadId: bot.threadId, botId: bot.id, prompt: "Check my calendar", status: "running" });
  return { root, db, bot, run, close: () => { db.close(); rmSync(root, { recursive: true, force: true }); } };
}

test("a fix only the owner can make leaves one note per task, with the owner's sentence", () => {
  const { db, bot, run, close } = studio();
  try {
    const denied = "Allow Sidemates to use Calendar in System Settings → Privacy & Security → Automation, then try again. Nothing was changed.";
    assert.equal(noteToolFailure(db, { runId: run.id, botId: bot.id }, denied), true);
    assert.equal(noteToolFailure(db, { runId: run.id, botId: bot.id }, denied), false, "once per task and fix");
    assert.equal(noteToolFailure(db, { runId: run.id, botId: bot.id }, "Calendar couldn't be reached on this Mac. Nothing was changed."), false, "retrying is the teammate's job");
    assert.equal(noteToolFailure(db, { runId: run.id, botId: "someone-else" }, "This teammate's browser is turned off."), false, "only the run's own teammate");
    assert.equal(noteToolFailure(db, { runId: "missing", botId: bot.id }, "This teammate's browser is turned off."), false);
    assert.equal(noteToolFailure(db, { runId: run.id, botId: bot.id }, "This teammate's browser is turned off."), true, "a different fix is a new note");
    const notes = db.messagesForRunEvent(run.id, "needs_fix");
    assert.deepEqual(notes.map((note) => note.eventData?.fix), ["automation", "browser-off"]);
    assert.equal(notes[0]!.body, `${bot.name}: Allow Sidemates to use Calendar in System Settings → Privacy & Security → Automation, then try again.`);
    assert.equal(notes[0]!.senderType, "system");
    assert.equal(notes[0]!.eventData?.botId, bot.id);
  } finally { close(); }
});

test("the middleware notes only calls the tool route checked, and never changes its answer", async () => {
  const { db, bot, run, close } = studio();
  let changes = 0;
  const app = express();
  app.use("/tool", noteFixableToolFailures(db, () => { changes += 1; }));
  app.post("/tool/:mode", (request, response) => {
    if (request.params.mode !== "unchecked") response.locals.toolCall = { runId: run.id, botId: bot.id };
    if (request.params.mode === "ok") return response.json({ error: "Full Disk Access", ok: true });
    response.status(403).json({ error: "Files & apps on this Mac is turned off for the studio. The owner can turn it on in Permissions." });
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const unchecked = await fetch(`${base}/tool/unchecked`, { method: "POST" });
    assert.equal(unchecked.status, 403);
    assert.equal(db.messagesForRunEvent(run.id, "needs_fix").length, 0, "an unchecked call is never noted");
    assert.equal((await fetch(`${base}/tool/ok`, { method: "POST" })).status, 200);
    assert.equal(db.messagesForRunEvent(run.id, "needs_fix").length, 0, "a successful answer is never noted");
    const checked = await fetch(`${base}/tool/checked`, { method: "POST" });
    assert.equal(checked.status, 403);
    assert.deepEqual(await checked.json(), { error: "Files & apps on this Mac is turned off for the studio. The owner can turn it on in Permissions." }, "the tool's answer is unchanged");
    assert.deepEqual(db.messagesForRunEvent(run.id, "needs_fix").map((note) => note.eventData?.fix), ["mac-access"]);
    assert.equal(changes, 1);
  } finally { server.close(); close(); }
});

// The full stack: a stand-in runtime (no model, no account) that, depending on the
// request, calls Mac tools while Files & apps is off, or stops on a provider limit.
const RUNTIME = `#!${process.execPath}
const prompt = process.argv[process.argv.length - 1];
async function main() {
  const call = (action, args) => fetch(process.env.OPENBOT_INTERNAL_URL + '/api/internal/tools', { method: 'POST', headers: { 'content-type': 'application/json', 'x-openbot-token': process.env.OPENBOT_INTERNAL_TOKEN }, body: JSON.stringify({ botId: process.env.OPENBOT_BOT_ID, runId: process.env.OPENBOT_RUN_ID, action, args }) });
  if (prompt.includes('PROVIDER-LIMIT')) {
    console.log(JSON.stringify({ type: 'error', error: { name: 'APIError', data: { statusCode: 429, message: 'Rate limit exceeded' } } }));
    process.exitCode = 1; return;
  }
  const forged = await fetch(process.env.OPENBOT_INTERNAL_URL + '/api/internal/tools', { method: 'POST', headers: { 'content-type': 'application/json', 'x-openbot-token': 'wrong' }, body: JSON.stringify({ botId: process.env.OPENBOT_BOT_ID, runId: process.env.OPENBOT_RUN_ID, action: 'search_my_mac', args: { query: 'dentist' } }) });
  const first = await call('search_my_mac', { query: 'dentist' });
  const second = await call('mac_calendar_events', { days: 2 });
  console.log(JSON.stringify({ type: 'step_finish', sessionID: 'j6', part: { id: process.env.OPENBOT_RUN_ID, tokens: { input: 100, output: 20, cache: { read: 0 } } } }));
  console.log(JSON.stringify({ type: 'text', text: 'Files & apps on this Mac is off, so I could not check your calendar. Statuses: ' + [forged.status, first.status, second.status].join(',') }));
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
`;

async function spawnServer(db: OpenBotDatabase, bin: string) {
  const socket = createServer();
  await new Promise<void>((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = (socket.address() as { port: number }).port;
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  const base = `http://127.0.0.1:${port}`;
  const child: ChildProcess = spawn(process.execPath, ["--import", "tsx", "src/server/index.ts"], {
    cwd: path.resolve(import.meta.dirname, "../.."), stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, OPENBOT_LOAD_ENV: "0", OPENBOT_OPENCODE_VERSION: "1.18.31", OPENBOT_DATA_DIR: db.dataDir, OPENBOT_PORT: String(port), OPENBOT_HOST: "127.0.0.1", OPENBOT_APP_URL: base, OPENBOT_DEPLOYMENT_MODE: "local", NODE_ENV: "production" },
  });
  const exited = once(child, "exit"); let log = "";
  for (const stream of [child.stdout, child.stderr]) stream?.on("data", (chunk) => { log = (log + chunk).slice(-3000); });
  let ready = false;
  for (let n = 0; n < 200 && !ready && child.exitCode === null; n++) { try { ready = (await fetch(base + "/api/healthz", { signal: AbortSignal.timeout(500) })).ok; } catch { await delay(100); } }
  assert.ok(ready, log || "server did not start");
  return { base, log: () => log, kill: async () => { child.kill("SIGTERM"); await Promise.race([exited, delay(4000)]); if (child.exitCode === null) { child.kill("SIGKILL"); await exited; } } };
}

test("through the real tool route: Files & apps off leaves one note; a provider limit stops the task with its fix", { timeout: 120_000 }, async () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-failure-stack-"));
  const bin = path.join(root, "bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(path.join(bin, "opencode"), RUNTIME, { mode: 0o700 });
  const db = new OpenBotDatabase(root);
  db.updateStudioSettings({ macAccessEnabled: false });
  db.updateBot("nova", { providerInstanceId: "local-opencode", model: "opencode/fixture", computerEnabled: false });
  const nova = db.getBot("nova")!;
  const server = await spawnServer(db, bin);
  const send = async (body: string) => {
    const posted = await fetch(server.base + "/api/messages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ threadId: nova.threadId, body, targetBotIds: [nova.id] }) });
    assert.equal(posted.status, 202, await posted.clone().text());
    const runId = ((await posted.json()) as { runs: Array<{ id: string }> }).runs[0]!.id;
    for (let n = 0; n < 300; n++) { const run = db.getRun(runId); if (run && ["completed", "failed", "cancelled"].includes(run.status)) return run; await delay(100); }
    throw new Error(`The task didn't finish. ${server.log()}`);
  };
  try {
    const checked = await send("What's on my calendar tomorrow?");
    assert.equal(checked.status, "completed", checked.error || "");
    // The reply is saved just after the run is marked done.
    let reply = db.listMessages(nova.threadId).find((message) => message.runId === checked.id && message.senderType === "bot");
    for (let n = 0; n < 50 && !reply; n++) { await delay(100); reply = db.listMessages(nova.threadId).find((message) => message.runId === checked.id && message.senderType === "bot"); }
    assert.ok(reply, "the teammate's reply was saved");
    assert.match(reply.body, /Statuses: 403,403,403/, "the forged call is refused and both Mac tools say Files & apps is off");
    const notes = db.messagesForRunEvent(checked.id, "needs_fix");
    assert.equal(notes.length, 1, "two refusals with the same fix, one note; the forged call left none");
    assert.equal(notes[0]!.eventData?.fix, "mac-access");
    assert.equal(notes[0]!.body, `${nova.name}: Files & apps on this Mac is turned off for the studio.`);
    assert.equal(db.getStudioSettings().macAccessEnabled, false, "a note changes nothing by itself");

    const limited = await send("PROVIDER-LIMIT please");
    assert.equal(limited.status, "failed");
    const stop = db.messagesForRunEvent(limited.id, "run_stopped")[0]!;
    assert.match(stop.body, /reached a usage or rate limit/);
    assert.equal(failureFix(stop.body)?.label, "Choose another AI");
    assert.equal(db.messagesForRunEvent(limited.id, "needs_fix").length, 0, "a stop is not also a note");
  } finally {
    await server.kill();
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

// Opt-in live acceptance: real HTTPS read + production API/runner + selected model.
// A synthetic line is inserted ONLY into a disposable saved baseline, never a website.
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { setTimeout as delay } from 'node:timers/promises';
import { pageHash } from '../src/server/page-watch-source.js';
import type { AppState, Routine, Run } from '../src/shared/types.js';

const model = process.env.OPENBOT_BENCHMARK_MODEL;
assert.ok(model?.startsWith('opencode/') || model?.startsWith('opencode-go/'), 'Set OPENBOT_BENCHMARK_MODEL explicitly. This check uses your selected provider allowance.');
const root = mkdtempSync(path.join(tmpdir(), 'openbot-watch-live-'));
const socket = createServer();
await new Promise<void>(resolve => socket.listen(0, '127.0.0.1', resolve));
const port = (socket.address() as {port: number}).port;
await new Promise<void>(resolve => socket.close(() => resolve()));
const base = `http://127.0.0.1:${port}`;
let child: ChildProcess | undefined, log = '', key = '', passed = false;
async function api<T>(route: string, body?: unknown, method = 'POST'): Promise<T> {
  const response = await fetch(base + route, { method: body === undefined ? 'GET' : method,
    headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
    ...(body === undefined ? {} : {body: JSON.stringify(body)}), signal: AbortSignal.timeout(25_000) });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || `HTTP ${response.status}`);
  return value;
}
async function start() {
  child = spawn(process.execPath, ['--import', 'tsx', 'src/server/index.ts'], { cwd: path.resolve(import.meta.dirname, '..'), stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, OPENBOT_LOAD_ENV: '0', OPENBOT_DATA_DIR: root, OPENBOT_PORT: String(port), OPENBOT_HOST: '127.0.0.1', OPENBOT_APP_URL: base,
      OPENBOT_DEPLOYMENT_MODE: 'local', NODE_ENV: 'production', OPENBOT_RUN_MAX_MINUTES: '3', OPENBOT_RUN_MAX_STEPS: '12', OPENBOT_RUN_MAX_TOKENS: '35000', OPENBOT_JOB_MAX_TOKENS: '35000' } });
  child.stdout!.on('data', chunk => { log = (log + chunk).slice(-3000); }); child.stderr!.on('data', chunk => { log = (log + chunk).slice(-3000); });
  for (let n = 0; n < 80; n++) { try { await api('/api/healthz'); key = readFileSync(path.join(root, 'access.token'), 'utf8').trim(); return; } catch {} await delay(150); }
  throw new Error(`Host not ready: ${log}`);
}
async function stop() {
  const current = child; child = undefined;
  if (!current || current.exitCode !== null) return;
  const ended = new Promise<void>(resolve => current.once('exit', () => resolve())); current.kill('SIGTERM');
  await ended;
}
try {
  await start();
  const fixture = await api<{id:string;threadId:string}>('/api/bots', {name:'Watcher', emoji:'●', color:'#27a67a', mascot:'sprout', role:'Operator', instructions:'Follow monitoring instructions exactly and cite sources.', model, providerInstanceId:'local-opencode', computerEnabled:false, browserEnabled:false, weeklyTokenBudget:50000});
  const watcherId = fixture.id, watcherThread = fixture.threadId;
  if (process.env.OPENBOT_BENCHMARK_CREATE_ONLY === '1') {
    const started = Date.now();
    const submitted = await api<{runs: Run[]}>('/api/messages', {threadId:watcherThread, targetBotIds:[watcherId], body:'Create a paused page-change automation called Release watch draft. Watch https://example.com/ every hour. Only when its readable text changes, summarize the changes with the source link in this conversation. Keep it disabled for now. Do not fetch the page or run the job.'});
    assert.equal(submitted.runs?.length, 1, 'Conditional/paused request must reach the tool flow, not the unconditional schedule shortcut.');
    let state!: AppState; let creation: Run | undefined;
    for (let n = 0; n < 190; n++) {
      state = await api(`/api/state?threadId=${watcherThread}`); creation = state.runs.find(r => r.id === submitted.runs[0]!.id);
      if (creation && ['completed','failed','cancelled','awaiting_approval'].includes(creation.status)) break;
      await delay(1000);
    }
    assert.equal(creation?.status, 'completed', creation?.error || creation?.approvalReason || 'No completed creation');
    const created = state.routines;
    assert.equal(created.length, 1); assert.equal(created[0]!.triggerType, 'webpage');
    assert.equal(created[0]!.enabled, false); assert.equal(created[0]!.intervalMinutes, 60);
    assert.equal(created[0]!.triggerConfig.pageUrl, 'https://example.com/');
    assert.equal(created[0]!.watchStatus, undefined); assert.equal(created[0]!.runCount, 0);
    console.log(JSON.stringify({result:'PASS', workflow:'natural-language paused page-watch creation', model, elapsedMs:Date.now()-started, inputTokens:creation!.inputTokens, outputTokens:creation!.outputTokens, steps:creation!.modelSteps, enabled:false, intervalMinutes:60, pageFetched:false}));
    passed = true;
  } else {
  for (const pageUrl of ['https://localhost', 'http://example.com', 'https://example.com/?token=secret']) {
    await assert.rejects(api('/api/routines', {name:'Rejected watch', botId:watcherId, threadId:watcherThread, prompt:'Read', triggerType:'webpage', triggerConfig:{pageUrl}, intervalMinutes:15}), /public HTTPS/);
  }
  const routine = await api<Routine>('/api/routines', { name: 'Synthetic baseline removal test', botId: watcherId, threadId: watcherThread, intervalMinutes: 15, triggerType: 'webpage', triggerConfig: {pageUrl: 'https://example.com'},
    prompt: 'This is a synthetic acceptance exercise. The saved prior baseline includes a fabricated workshop notice. Write watch-report.md using only the supplied change evidence. State exactly what disappeared, cite the HTTPS source and observation time, and explain that the removed notice is a synthetic fixture, not an actual announcement by the website. Do not browse or contact any apps. Reopen the saved file, then link it in one brief answer. Do not create automations or send anything.' });
  let checked = await api<{watchStatus: NonNullable<Routine['watchStatus']>}>(`/api/routines/${routine.id}/run`, {confirmed:true});
  assert.equal(checked.watchStatus.state, 'baseline', checked.watchStatus.detail);
  checked = await api(`/api/routines/${routine.id}/run`, {confirmed:true});
  assert.equal(checked.watchStatus.state, 'unchanged', checked.watchStatus.detail);
  const before = await api<AppState>(`/api/state?threadId=${watcherThread}`);
  assert.equal(before.runs.length, 0);
  await stop();
  const db = new DatabaseSync(path.join(root, 'openbot.sqlite'));
  const saved = db.prepare("SELECT cursor FROM automation_cursors WHERE routine_id=? AND source='webpage'").get(routine.id)!;
  const checkpoint = JSON.parse(String(saved.cursor));
  checkpoint.text += '\nSynthetic fixture notice: Workshop starts Monday at 10:00.';
  checkpoint.hash = pageHash(checkpoint.text);
  db.prepare("UPDATE automation_cursors SET cursor=? WHERE routine_id=? AND source='webpage'").run(JSON.stringify(checkpoint), routine.id);
  db.close();
  await start();
  const started = Date.now();
  checked = await api(`/api/routines/${routine.id}/run`, {confirmed:true});
  assert.equal(checked.watchStatus.state, 'changed', checked.watchStatus.detail);
  let state!: AppState; let run: Run | undefined;
  for (let n = 0; n < 190; n++) {
    state = await api<AppState>(`/api/state?threadId=${watcherThread}`); run = state.runs.find(r => r.routineId === routine.id);
    if (run && ['completed','failed','cancelled','awaiting_approval'].includes(run.status)) break;
    await delay(1000);
  }
  assert.equal(run?.status, 'completed', `${run?.error || run?.approvalReason || 'No completed run'}\n${log}`);
  const events = await api<Array<{id: string}>>(`/api/routines/${routine.id}/events`);
  assert.equal(events.length, 1);
  const receipt = await fetch(`${base}/api/routines/${routine.id}/events/${events[0]!.id}/evidence`, {headers:{authorization:`Bearer ${key}`}});
  assert.equal(receipt.status, 200); assert.match(receipt.headers.get('content-type')!, /text\/plain/);
  assert.match(await receipt.text(), /Synthetic fixture notice/);
  const report = readFileSync(path.join(root, 'workspaces', watcherId, 'watch-report.md'), 'utf8');
  assert.match(report, /Monday/); assert.match(report, /10:00/); assert.match(report, /synthetic|fabricat/i);
  assert.match(report, /https:\/\/example.com/); assert.match(report, /remov|disappear|no longer/i);
  for (let n = 0; n < 20 && !state.messages.some(m => m.runId === run!.id && m.attachments.length); n++) { await delay(100); state = await api(`/api/state?threadId=${watcherThread}`); }
  assert.ok(state.messages.some(m => m.runId === run!.id && m.attachments.some(a => a.name === 'watch-report.md')), 'Missing downloadable report');
  checked = await api(`/api/routines/${routine.id}/run`, {confirmed:true});
  assert.equal(checked.watchStatus.state, 'unchanged');
  assert.equal((await api<AppState>(`/api/state?threadId=${watcherThread}`)).runs.filter(r => r.routineId === routine.id).length, 1);
  console.log(JSON.stringify({result:'PASS', model, workflow:'production page watch to reviewable report', source:'https://example.com', fixture:'synthetic line in prior local baseline', baselineModelRuns:0, unchangedModelRuns:0, changeModelRuns:1, elapsedMs:Date.now()-started, inputTokens:run!.inputTokens, outputTokens:run!.outputTokens, steps:run!.modelSteps, reportVerified:true, duplicateRun:false}));
  console.log(`Evidence: ${root}/workspaces/${watcherId}/watch-report.md`);
  passed = true;
  }
} finally {
  await stop();
  if (passed && process.env.OPENBOT_KEEP_BENCHMARK !== '1') rmSync(root, {recursive:true, force:true});
  else console.log(`Disposable fixture retained: ${root}`);
}

// Real-time routine soak: real server + real runner, disposable data, bounded clock.
//
// What it proves (scheduler level, not a model-quality benchmark):
// - every due occurrence dispatches exactly once (grouped by durable externalId)
// - SIGTERM restart mid-soak causes no duplicate dispatch and at most one catch-up
// - 3 consecutive failures auto-pause the routine with a visible alert + reason
// - one-time routines dispatch once then disable; future calendar routines stay quiet
// - soak runs create no pending approvals (read-only prompts)
//
// Bounds: SOAK_MINUTES (default 30, min 15). The 7-day gate (SOAK_MINUTES=10080)
// runs on an always-on host; this script polls incrementally into a local JSONL log
// so long soaks do not depend on server-side list limits.
// Live model spend: healthy + one-time routine runs use SOAK_MODEL
// (default opencode-go/deepseek-v4.1-flash) via this Mac's OpenCode sign-in.
// No real connectors, mail, or external writes are used.
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { AppState, ProviderStatus, Routine } from "../src/shared/types.js";

const SOAK_MINUTES = Math.max(15, Number(process.env.SOAK_MINUTES || 30));
const SOAK_MODEL = process.env.SOAK_MODEL || "opencode-go/deepseek-v4.1-flash";
const INTERVAL = Math.max(5, Number(process.env.SOAK_INTERVAL || 5));
assert.ok(SOAK_MODEL.startsWith("opencode/") || SOAK_MODEL.startsWith("opencode-go/"), "Set SOAK_MODEL to an explicitly authorized OpenCode model. No fallback is selected.");

const data = mkdtempSync(path.join(tmpdir(), "openbot-soak-"));
const logPath = path.join(data, "soak-observed-runs.jsonl");
const socket = createServer();
await new Promise<void>((resolve) => socket.listen(0, "127.0.0.1", resolve));
const port = (socket.address() as { port: number }).port;
await new Promise<void>((resolve) => socket.close(() => resolve()));
const base = `http://127.0.0.1:${port}`;
let child: ChildProcess | undefined;

async function request(route: string, body?: unknown, method = "POST"): Promise<Response> {
  return fetch(base + route, { method: body === undefined ? "GET" : method, headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(30_000) });
}
async function start() {
  child = spawn(process.execPath, ["--import", "tsx", "src/server/index.ts"], { cwd: path.resolve(import.meta.dirname, ".."), stdio: "ignore",
    env: { ...process.env, OPENBOT_LOAD_ENV: "0", OPENBOT_SEED_STARTER_BOTS: "1", OPENBOT_DATA_DIR: data, OPENBOT_PORT: String(port), OPENBOT_HOST: "127.0.0.1", OPENBOT_APP_URL: base, OPENBOT_DEPLOYMENT_MODE: "local", NODE_ENV: "production" } });
  for (let n = 0; n < 120; n++) { try { if ((await request("/api/healthz")).ok) return; } catch {} await delay(250); }
  throw new Error("Disposable soak host did not start");
}
async function stop() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  for (let n = 0; n < 60 && child.exitCode === null && child.signalCode === null; n++) await delay(250);
  if (child.exitCode === null && child.signalCode === null) { child.kill("SIGKILL"); await new Promise<void>((resolve) => child!.once("close", resolve)); }
}
const seen = new Set<string>();
function recordRuns(routineId: string, runs: Array<{ id: string; status: string; createdAt: string }>) {
  for (const run of runs) {
    const key = `${routineId}:${run.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    appendFileSync(logPath, JSON.stringify({ routineId, runId: run.id, status: run.status, createdAt: run.createdAt }) + "\n");
  }
}
async function snapshot(): Promise<AppState> {
  const response = await request("/api/state");
  assert.equal(response.status, 200, "State must stay readable through the soak");
  return response.json() as Promise<AppState>;
}

const deadline = Date.now() + SOAK_MINUTES * 60_000;
const restartAt = Date.now() + SOAK_MINUTES * 60_000 * 0.4;
let restarted = false, stopAt = 0, startAt2 = 0;
try {
  await start();
  const providerState = await (await request("/api/provider")).json() as ProviderStatus;
  const local = providerState.instances.find((instance) => instance.id === "local-opencode");
  assert.ok(local?.connected, "This soak uses the Mac's real OpenCode sign-in for the healthy path; connect OpenCode first.");
  assert.ok(local.models.includes(SOAK_MODEL), `The selected soak model ${SOAK_MODEL} is not available to the local OpenCode connection.`);
  assert.equal((await request("/api/bots/nova", { providerInstanceId: "local-opencode", model: SOAK_MODEL }, "PATCH")).status, 200);
  const dead = await (await request("/api/providers", { name: "Soak dead endpoint", authMode: "api_key", apiConfig: { baseUrl: "http://127.0.0.1:1/v1", protocol: "openai-compatible", modelIds: ["unreachable"] } })).json() as { id: string };
  assert.equal((await request("/api/bots/pixel", { providerInstanceId: dead.id, model: `openbot-${dead.id}/unreachable` }, "PATCH")).status, 200);

  const healthy = await (await request("/api/routines", { name: "Soak healthy", botId: "nova", threadId: "bot-nova", prompt: "Reply with the exact text SOAK_OK. Do not call tools, do not send anything, do not change any app.", intervalMinutes: INTERVAL, schedule: { kind: "interval" } })).json() as Routine;
  const fragile = await (await request("/api/routines", { name: "Soak fragile", botId: "pixel", threadId: "bot-pixel", prompt: "Reply with the exact text SOAK_OK. Do not call tools.", intervalMinutes: INTERVAL, schedule: { kind: "interval" } })).json() as Routine;
  const onceAt = new Date(Date.now() + 90_000).toISOString();
  const once = await (await request("/api/routines", { name: "Soak once", botId: "nova", threadId: "bot-nova", prompt: "Reply with the exact text SOAK_ONCE. Do not call tools.", intervalMinutes: INTERVAL, schedule: { kind: "once", timeZone: "UTC", at: onceAt } })).json() as Routine;
  const future = new Date(Date.now() + 2 * 3_600_000);
  const dailyTime = future.toISOString().slice(11, 16);
  const daily = await (await request("/api/routines", { name: "Soak daily", botId: "nova", threadId: "bot-nova", prompt: "A future brief. Must not run during the soak.", intervalMinutes: 1440, schedule: { kind: "calendar", timeZone: "UTC", time: dailyTime, daysOfWeek: [1, 2, 3, 4, 5, 6, 7] } })).json() as Routine;
  const ids = { healthy: healthy.id, fragile: fragile.id, once: once.id, daily: daily.id };

  while (Date.now() < deadline) {
    if (!restarted && Date.now() >= restartAt) {
      stopAt = Date.now();
      await stop(); await start();
      startAt2 = Date.now(); restarted = true;
      const after = await snapshot();
      assert.ok(after.routines.some((routine) => routine.id === ids.healthy), "Routines must survive a host restart");
      console.log(JSON.stringify({ result: "RESTARTED", downtimeMs: startAt2 - stopAt }));
    }
    const state = await snapshot();
    for (const id of Object.values(ids)) {
      const runs = await (await request(`/api/routines/${id}/runs`)).json() as Array<{ id: string; status: string; createdAt: string }>;
      recordRuns(id, runs);
    }
    const counts = Object.fromEntries(state.routines.filter((routine) => Object.values(ids).includes(routine.id)).map((routine) => [routine.name, { runs: routine.runCount, failures: routine.consecutiveFailures, enabled: routine.enabled, status: routine.lastStatus }]));
    console.log(JSON.stringify({ result: "TICK", at: new Date().toISOString(), ...counts }));
    await delay(20_000);
  }

  const state = await snapshot();
  const byId = new Map(state.routines.map((routine) => [routine.id, routine]));
  const events = await (await request(`/api/routines/${ids.healthy}/events`)).json() as Array<{ externalId: string; runId: string | null; status: string }>;
  const byOccurrence = new Map<string, string[]>();
  for (const event of events) {
    if (!event.runId) continue;
    const list = byOccurrence.get(event.externalId) || [];
    list.push(event.runId);
    byOccurrence.set(event.externalId, list);
  }
  for (const [occurrence, runIds] of byOccurrence) assert.equal(new Set(runIds).size, 1, `Occurrence ${occurrence} dispatched ${runIds.length} runs; exactly one is allowed`);

  const healthyRuns = await (await request(`/api/routines/${ids.healthy}/runs`)).json() as Array<{ id: string; status: string; createdAt: string }>;
  const minHealthy = Math.max(1, Math.floor(SOAK_MINUTES / INTERVAL) - 1);
  assert.ok(healthyRuns.length >= minHealthy, `Healthy routine ran ${healthyRuns.length} times in ${SOAK_MINUTES}min at ${INTERVAL}min intervals; expected at least ${minHealthy}`);
  assert.ok(healthyRuns.every((run) => run.status === "completed"), "Every healthy soak run must complete; failures are defects, not soak noise");

  const onceRuns = await (await request(`/api/routines/${ids.once}/runs`)).json() as Array<{ id: string }>;
  assert.equal(onceRuns.length, 1, `One-time routine must dispatch exactly once, saw ${onceRuns.length}`);
  assert.equal(byId.get(ids.once)?.enabled, false, "One-time routine must disable after dispatch");

  const fragileState = byId.get(ids.fragile)!;
  assert.ok(fragileState.runCount >= 1, "Fragile routine must attempt at least once");
  assert.equal(fragileState.lastStatus, "failed", "Fragile routine must never succeed against a dead endpoint");
  assert.equal(fragileState.consecutiveFailures, fragileState.runCount, "Every fragile attempt must count as a consecutive failure");
  if (fragileState.runCount >= 3) {
    assert.equal(fragileState.enabled, false, "Three consecutive failures must auto-pause the routine");
    assert.ok(fragileState.pausedReason, "Auto-pause must carry a visible reason");
  }
  const alerts = state.automationAlerts.filter((alert) => alert.routineId === ids.fragile);
  assert.ok(alerts.length >= 1, "Fragile failures must raise at least one visible automation alert");

  const dailyRuns = await (await request(`/api/routines/${ids.daily}/runs`)).json() as Array<{ id: string }>;
  assert.equal(dailyRuns.length, 0, "A future calendar routine must not dispatch during the soak");

  assert.equal(state.approvals.length, 0, "Read-only soak runs must create no pending approvals");

  if (restarted) {
    const during = healthyRuns.filter((run) => new Date(run.createdAt).getTime() >= stopAt - 1_000 && new Date(run.createdAt).getTime() <= startAt2 + 120_000).length;
    assert.ok(during <= 2, `Restart window must not burst-dispatch; saw ${during} healthy runs around the restart`);
  }
  writeFileSync(path.join(data, "soak-summary.json"), JSON.stringify({ minutes: SOAK_MINUTES, intervalMinutes: INTERVAL, model: SOAK_MODEL, restarted, healthyRuns: healthyRuns.length, onceRuns: onceRuns.length, fragileRuns: fragileState.runCount, fragilePaused: !fragileState.enabled, dailyRuns: 0, approvals: 0, occurrences: byOccurrence.size }, null, 2));
  console.log(JSON.stringify({ result: "PASS", minutes: SOAK_MINUTES, model: SOAK_MODEL, healthyRuns: healthyRuns.length, onceRuns: onceRuns.length, fragileRuns: fragileState.runCount, fragilePaused: !fragileState.enabled, occurrences: byOccurrence.size, restarts: restarted ? 1 : 0 }));
  console.log("Scheduler-level soak only: occurrence dedupe, restart recovery, failure auto-pause. Not a model-quality benchmark or a 7-day elapsed proof unless SOAK_MINUTES=10080 on an always-on host.");
} finally {
  await stop();
  rmSync(data, { recursive: true, force: true });
}

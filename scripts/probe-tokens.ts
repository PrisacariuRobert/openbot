// Token-overhead probe: one trivial task, full usage accounting.
// Reports input/output/cache/reasoning tokens, steps, activities and the
// assembled prompt size so cuts can be measured, not guessed.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { AppState, Run } from "../src/shared/types.js";

const model = process.env.OPENBOT_PROBE_MODEL;
assert.ok(model?.startsWith("opencode/") || model?.startsWith("opencode-go/"), "Set OPENBOT_PROBE_MODEL.");
const root = mkdtempSync(path.join(tmpdir(), "openbot-probe-"));
const reservation = createServer();
await new Promise<void>((resolve) => reservation.listen(0, "127.0.0.1", resolve));
const address = reservation.address();
assert.ok(address && typeof address === "object");
await new Promise<void>((resolve) => reservation.close(() => resolve()));
const base = `http://127.0.0.1:${address.port}`;
const child = spawn(process.execPath, ["--import", "tsx", "src/server/index.ts"], {
  cwd: path.resolve(import.meta.dirname, ".."), stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, OPENBOT_LOAD_ENV: "0", OPENBOT_DATA_DIR: root, OPENBOT_PORT: String(address.port), OPENBOT_HOST: "127.0.0.1", OPENBOT_APP_URL: base, OPENBOT_DEPLOYMENT_MODE: "local", NODE_ENV: "production" },
});
let key = "";
const api = async (route: string, body?: unknown, method = "POST"): Promise<any> => {
  const r = await fetch(`${base}${route}`, { method: body === undefined ? "GET" : method, headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20_000) });
  return r.json();
};
try {
  let ready = false;
  for (let n = 0; n < 60 && !ready; n++) { try { ready = (await api("/api/healthz")).ok; } catch { await delay(250); } }
  assert.ok(ready, "server did not start");
  key = readFileSync(path.join(root, "access.token"), "utf8").trim();
  const bot = await api("/api/bots", { name: "Probe", emoji: "●", color: "#666666", mascot: "blob", role: "Operator", instructions: "Do exactly what is asked, then report the evidence briefly.", model, providerInstanceId: process.env.OPENBOT_BENCHMARK_PROVIDER || "local-opencode", computerEnabled: false, browserEnabled: false, weeklyTokenBudget: 400_000 });
  assert.ok((bot as any).id, `Teammate creation failed: ${JSON.stringify(bot).slice(0, 300)}`);
  const started = Date.now();
  const results = [];
  for (const [n, body] of [
    ["one", "Write exactly 42 into answer.txt in your workspace and reply done. Synthetic probe; workspace tools only."],
    ["two", "Write exactly 43 into answer2.txt in your workspace and reply done. Follow-up in the same conversation; workspace tools only."],
  ] as const) {
    const sub = await api("/api/messages", { threadId: bot.threadId, targetBotIds: [bot.id], body });
    const runId = (sub.runs as Run[])[0].id;
    let run: Run | undefined;
    for (;;) {
      await delay(2000);
      const state = await api(`/api/state?threadId=${bot.threadId}`, undefined, "GET") as AppState;
      run = state.runs.find((r) => r.id === runId);
      if (run && ["completed", "failed", "cancelled"].includes(run.status)) break;
      if (Date.now() - started > 240_000) throw new Error("probe task timed out");
    }
    results.push({ task: n, status: run.status, elapsedMs: Date.now() - started, inputTokens: run.inputTokens, outputTokens: run.outputTokens, cacheReadTokens: run.cacheReadTokens, reasoningTokens: run.reasoningTokens, steps: run.modelSteps, activities: run.activities.length, error: run.error?.slice(0, 200) || null });
  }
  console.log(JSON.stringify({ model, results }));
} finally {
  child.kill("SIGTERM");
  await Promise.race([new Promise<void>((r) => child.once("close", () => r())), delay(5000)]);
  if (child.exitCode === null) child.kill("SIGKILL");
  rmSync(root, { recursive: true, force: true });
}

// Correct -> Review -> Repeat, proven live end to end.
// A trivial doubling task becomes a skill draft, survives two supervised
// checks on different inputs, passes the scheduling gate, and runs as a
// routine — with the gate's refusals demonstrated first. Synthetic file
// work only. No personal data, no external writes. Model and fixtures are
// identical for every model; per-model outcomes are recorded as data,
// never tuned around.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { AppState, Run } from "../src/shared/types.js";

const model = process.env.OPENBOT_REPEAT_MODEL;
assert.ok(model?.startsWith("opencode/") || model?.startsWith("opencode-go/"), "Set OPENBOT_REPEAT_MODEL. This opt-in check uses that account's allowance.");
const root = mkdtempSync(path.join(tmpdir(), "openbot-repeat-live-"));
const evidence = mkdtempSync(path.join(tmpdir(), "openbot-repeat-evidence-"));
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
let serverLog = "", key = "";
for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => { serverLog = (serverLog + chunk).slice(-4000); });
async function api(route: string, body?: unknown, method = "POST"): Promise<{ status: number; data: any }> {
  const response = await fetch(`${base}${route}`, {
    method: body === undefined ? "GET" : method,
    headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20_000),
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}
async function waitRun(threadId: string, runId: string, deadlineMs = 300_000): Promise<Run> {
  const started = Date.now();
  for (;;) {
    await delay(2000);
    const { data: state } = await api(`/api/state?threadId=${threadId}`, undefined, "GET") as { data: AppState };
    const task = state.runs.find((r) => r.id === runId);
    if (!task) continue;
    if (["completed", "failed", "cancelled"].includes(task.status)) return task;
    if (Date.now() - started > deadlineMs) throw new Error(`Run ${runId} did not finish in time (still ${task.status}).`);
  }
}
const results: Record<string, unknown>[] = [];
const note = (entry: Record<string, unknown>) => { results.push({ model, ...entry }); console.log(JSON.stringify(results.at(-1))); };
let failures = 0;
try {
  let ready = false;
  for (let n = 0; n < 60 && !ready; n++) { try { ready = (await api("/api/healthz")).status === 200; } catch { await delay(250); } }
  assert.ok(ready, `Isolated server failed to start: ${serverLog}`);
  key = readFileSync(path.join(root, "access.token"), "utf8").trim();
  const { data: bot } = await api("/api/bots", { name: "Repeater", emoji: "●", color: "#27a67a", mascot: "sprout", role: "Operator", instructions: "Follow instructions exactly and report evidence.", model, providerInstanceId: process.env.OPENBOT_BENCHMARK_PROVIDER || "local-opencode", computerEnabled: false, browserEnabled: false, weeklyTokenBudget: 400_000 });
  assert.ok(bot.id, `Teammate creation failed: ${JSON.stringify(bot)}`);
  const threadId = bot.threadId, botId = bot.id;

  // 1. CORRECT: a first result, then a correction that must land as work.
  const first = await api("/api/messages", { threadId, targetBotIds: [botId], body: "Write the number 21 doubled into doubled.txt in your workspace and link it in your reply. This is a synthetic exercise; use only workspace and task tools." });
  const run1 = (first.data.runs as Run[])[0]!;
  const done1 = await waitRun(threadId, run1.id);
  assert.equal(done1.status, "completed", `First task did not complete: ${done1.error || done1.status}`);
  const ws = path.join(root, "workspaces", botId);
  assert.equal(readFileSync(path.join(ws, "doubled.txt"), "utf8").trim(), "42", "Host oracle disagrees with the first result.");
  note({ step: "correct-original", result: "pass", oracle: "doubled.txt contains 42" });

  // 2. REVIEW: owner-tapped independent review spawns a reviewer run.
  const scouts = await api("/api/bots", { name: "Checker", emoji: "▲", color: "#6757d9", mascot: "nova", role: "Reviewer", instructions: "Check results against sources.", model, providerInstanceId: process.env.OPENBOT_BENCHMARK_PROVIDER || "local-opencode", computerEnabled: false, browserEnabled: false, weeklyTokenBudget: 400_000 });
  const review = await api(`/api/runs/${run1.id}/review`, { reviewerBotId: (scouts.data as any).id });
  assert.equal(review.status, 200, `One-tap review did not start: ${JSON.stringify(review.data)}`);
  note({ step: "review-tap", result: "pass", oracle: "reviewer child run spawned by host" });

  // 3. REPEAT: draft a skill from the finished run.
  const draft = await api(`/api/runs/${run1.id}/skill-draft`, {});
  assert.equal(draft.status, 200, `Skill draft failed: ${JSON.stringify(draft.data)}`);
  const workflows = (await api("/api/extensions/workflows", undefined, "GET")).data as Array<{ id: string; name: string; skillSlug: string; source: string }>;
  const skill = workflows.find((w) => w.source === "proposed");
  assert.ok(skill, "No proposed skill draft is listed.");
  note({ step: "repeat-draft", result: "pass", skill: skill.name, slug: skill.skillSlug });

  // 4. Gate blocks scheduling before checks (negative first).
  const gateBefore = (await api(`/api/extensions/workflows/${skill.id}/checks`, undefined, "GET")).data as { ready: boolean };
  assert.equal(gateBefore.ready, false, "Skill must not be schedulable before checks.");
  const blocked = await api("/api/routines", { name: "Doubling routine", botId, threadId, prompt: `Run /${skill.skillSlug} now.`, intervalMinutes: 60, enabled: true });
  assert.equal(blocked.status, 409, `Gate did not block early scheduling: ${blocked.status}`);
  assert.equal((blocked.data as any).code, "workflow_check_required");
  note({ step: "repeat-gate-blocks", result: "pass", oracle: "409 workflow_check_required" });

  // 5. Two supervised checks on different inputs, owner-reviewed passes.
  for (const [n, input, expected] of [["one", "Double 15 and write it into check-one.txt.", "check-one.txt contains 30"], ["two", "Double 23 and write it into check-two.txt.", "check-two.txt contains 46"]] as const) {
    const started = await api(`/api/extensions/workflows/${skill.id}/checks`, { input, expected, confirmed: true });
    assert.equal(started.status, 200, `Check ${n} did not start: ${JSON.stringify(started.data)}`);
    const status = started.data as { checks: Array<{ runId: string }> };
    const checkRun = status.checks.at(-1)!;
    const finished = await waitRun(threadId, checkRun.runId);
    assert.equal(finished.status, "completed", `Check ${n} did not complete: ${finished.error || finished.status}`);
    const reviewed = await api(`/api/extensions/workflows/${skill.id}/checks/${checkRun.runId}/review`, { verdict: "passed", reviewedResult: true });
    assert.equal(reviewed.status, 200, `Check ${n} review failed: ${JSON.stringify(reviewed.data)}`);
    const file = n === "one" ? "check-one.txt" : "check-two.txt", want = n === "one" ? "30" : "46";
    assert.equal(readFileSync(path.join(ws, file), "utf8").trim(), want, `Host oracle disagrees with check ${n}.`);
    note({ step: `repeat-check-${n}`, result: "pass", oracle: expected });
  }
  const gateAfter = (await api(`/api/extensions/workflows/${skill.id}/checks`, undefined, "GET")).data as { ready: boolean; reviewedInputs: number };
  assert.equal(gateAfter.ready, true, `Gate not ready after two reviewed checks: ${JSON.stringify(gateAfter)}`);
  assert.equal(gateAfter.reviewedInputs, 2);

  // 6. Same-input check is refused (no double-counting one example).
  const dup = await api(`/api/extensions/workflows/${skill.id}/checks`, { input: "Double 15 and write it into check-one.txt.", expected: "x", confirmed: true });
  assert.notEqual(dup.status, 200, "Repeated input must be refused.");
  note({ step: "repeat-duplicate-refused", result: "pass", oracle: `status ${dup.status}` });

  // 7. Scheduling now succeeds, and a manual run executes the skill.
  const routine = await api("/api/routines", { name: "Doubling routine", botId, threadId, prompt: `Run /${skill.skillSlug} on 100 and write it into routine-out.txt.`, intervalMinutes: 60, enabled: true });
  assert.equal(routine.status, 201, `Scheduling failed after checks: ${JSON.stringify(routine.data)}`);
  const fired = await api(`/api/routines/${(routine.data as any).id}/run`, { confirmed: true });
  assert.equal(fired.status, 202, `Manual routine run refused: ${JSON.stringify(fired.data)}`);
  const routineRunId = (fired.data as any).run?.id as string | undefined;
  assert.ok(routineRunId, "Manual run returned no run id.");
  const routineDone = await waitRun(threadId, routineRunId);
  assert.equal(routineDone.status, "completed", `Routine run did not complete: ${routineDone.error || routineDone.status}`);
  assert.equal(readFileSync(path.join(ws, "routine-out.txt"), "utf8").trim(), "200", "Host oracle disagrees with the routine output.");
  const usage = { inputTokens: routineDone.inputTokens, outputTokens: routineDone.outputTokens };
  note({ step: "repeat-routine-runs", result: "pass", oracle: "routine-out.txt contains 200", usage });
} catch (error) {
  failures++;
  note({ step: "loop", result: "fail", error: error instanceof Error ? error.message : String(error) });
} finally {
  writeFileSync(path.join(evidence, "summary.json"), JSON.stringify({ model, results, failures, limitations: "Synthetic doubling task; proves the loop mechanics (draft, gate, checks, schedule, run), not general task quality or competitor parity. Usage is provider-reported, not billing proof." }, null, 2));
  child.kill("SIGTERM");
  await Promise.race([new Promise<void>((resolve) => child.once("close", () => resolve())), delay(5000)]);
  if (child.exitCode === null) child.kill("SIGKILL");
  rmSync(root, { recursive: true, force: true });
  console.log(`Evidence retained without runtime credentials: ${evidence}`);
}
assert.equal(failures, 0, "Repeat-loop acceptance failed. See retained evidence.");

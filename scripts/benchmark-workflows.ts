// Opt-in live-model acceptance checks. The model may incur provider usage.
// Always starts an isolated OpenBot database; never targets the user's studio.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { AppState, Run } from "../src/shared/types.js";

const model = process.env.OPENBOT_BENCHMARK_MODEL;
assert.ok(
  model?.startsWith("opencode/") || model?.startsWith("opencode-go/"),
  "Set OPENBOT_BENCHMARK_MODEL to a model in your OpenCode account. This opt-in check uses that account's allowance.",
);
const root = mkdtempSync(path.join(tmpdir(), "openbot-live-benchmark-"));
const reservation = createServer();
await new Promise<void>((resolve) =>
  reservation.listen(0, "127.0.0.1", resolve),
);
const address = reservation.address();
assert.ok(address && typeof address === "object");
const port = address.port;
await new Promise<void>((resolve) => reservation.close(() => resolve()));
const base = `http://127.0.0.1:${port}`;
const child = spawn(
  process.execPath,
  ["--import", "tsx", "src/server/index.ts"],
  {
    cwd: path.resolve(import.meta.dirname, ".."),
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      OPENBOT_LOAD_ENV: "0",
      OPENBOT_DATA_DIR: root,
      OPENBOT_PORT: String(port),
      OPENBOT_HOST: "127.0.0.1",
      OPENBOT_APP_URL: base,
      OPENBOT_DEPLOYMENT_MODE: "local",
      NODE_ENV: "production",
    },
  },
);
let serverLog = "";
child.stdout.on("data", (chunk) => {
  serverLog = (serverLog + chunk).slice(-4000);
});
child.stderr.on("data", (chunk) => {
  serverLog = (serverLog + chunk).slice(-4000);
});
let key = "";
async function api<T>(
  route: string,
  body?: unknown,
  method = "POST",
): Promise<T> {
  const response = await fetch(`${base}${route}`, {
    method: body === undefined ? "GET" : method,
    headers: {
      "content-type": "application/json",
      ...(key ? { authorization: `Bearer ${key}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20_000),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || `HTTP ${response.status}`);
  return value;
}

async function run(
  threadId: string,
  botId: string,
  body: string,
): Promise<{ state: AppState; run: Run; elapsedMs: number }> {
  const started = Date.now();
  const submitted = await api<{ runs: Run[] }>("/api/messages", {
    threadId,
    body,
    targetBotIds: [botId],
  });
  assert.equal(submitted.runs.length, 1);
  const id = submitted.runs[0]!.id;
  while (Date.now() - started < 180_000) {
    await delay(1000);
    const state = await api<AppState>(`/api/state?threadId=${threadId}`);
    const task = state.runs.find((entry) => entry.id === id);
    if (!task) continue;
    if (["failed", "cancelled", "awaiting_approval"].includes(task.status))
      throw new Error(
        `Workflow ${task.status}: ${task.error || task.approvalReason || task.summary}`,
      );
    if (task.status === "completed")
      return { state, run: task, elapsedMs: Date.now() - started };
  }
  await api(`/api/runs/${id}/cancel`, {});
  throw new Error("Workflow exceeded the three-minute test deadline.");
}

try {
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      await api("/api/healthz");
      ready = true;
      break;
    } catch {
      await delay(200);
    }
  }
  assert.ok(ready, `Test server did not start: ${serverLog}`);
  key = readFileSync(path.join(root, "access.token"), "utf8").trim();
  for (const id of ["nova", "pixel", "scout"])
    await api(
      `/api/bots/${id}`,
      {
        model,
        computerEnabled: false,
        browserEnabled: false,
        weeklyTokenBudget: 100_000,
      },
      "PATCH",
    );
  const workspace = path.join(root, "workspaces", "nova");
  mkdirSync(workspace, { recursive: true });
  writeFileSync(
    path.join(workspace, "numbers.csv"),
    "id,amount,status\nA,12,paid\nB,25,paid\nC,5,paid\nD,30,pending\n",
  );
  const report = await run(
    "bot-nova",
    "nova",
    "Read numbers.csv in your workspace. Create totals.json with exactly the keys paidTotal, pendingTotal, paidCount, pendingIds. Calculate from the file, not guesses. Save a short report.md citing each source row ID and link both files in your final reply. Check the saved files. This is a synthetic local-file exercise; use only workspace and task tools.",
  );
  assert.deepEqual(
    JSON.parse(readFileSync(path.join(workspace, "totals.json"), "utf8")),
    { paidTotal: 42, pendingTotal: 30, paidCount: 3, pendingIds: ["D"] },
  );
  const markdown = readFileSync(path.join(workspace, "report.md"), "utf8");
  assert.ok(
    ["A", "B", "C", "D"].every((id) =>
      new RegExp(`\\b${id}\\b`).test(markdown),
    ),
  );
  assert.ok(
    report.state.messages.some(
      (message) =>
        message.runId === report.run.id && message.attachments.length >= 1,
    ),
    "No downloadable result card was attached",
  );
  console.log(
    JSON.stringify({
      workflow: "source-to-artifact",
      result: "pass",
      model,
      elapsedMs: report.elapsedMs,
      inputTokens: report.run.inputTokens,
      outputTokens: report.run.outputTokens,
      oracle: "independent JSON totals, source IDs, and result attachment",
    }),
  );

  const team = await run(
    "team-room",
    "pixel",
    "Ask Nova privately to check this arithmetic independently: 17 + 25 = 42. Wait for Nova's reply, then give me one short final answer with the checked total. Use message_teammate with expectsReply true; this tests real private consultation, not a simulated conversation. No files, browser, terminal, or external apps are needed.",
  );
  const children = team.state.runs.filter(
    (entry) => entry.parentRunId === team.run.id,
  );
  assert.ok(
    children.some(
      (entry) => entry.botId === "nova" && entry.status === "completed",
    ),
    "No completed private consultation",
  );
  const answers = team.state.messages.filter(
    (message) =>
      message.senderType === "bot" &&
      (message.runId === team.run.id ||
        children.some((entry) => entry.id === message.runId)),
  );
  assert.equal(
    answers.length,
    1,
    "Consultants must not send duplicate user-facing answers",
  );
  assert.equal(answers[0]?.senderId, "pixel");
  assert.match(answers[0]!.body, /42/);
  console.log(
    JSON.stringify({
      workflow: "private-consultation",
      result: "pass",
      model,
      elapsedMs: team.elapsedMs,
      oracle: "completed child run before one coordinator answer",
    }),
  );
  console.log(
    "These two bounded checks are not a head-to-head Grok Bot benchmark or general reliability claim.",
  );
} finally {
  child.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolve) => child.once("close", () => resolve())),
    delay(5000),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
  rmSync(root, { recursive: true, force: true });
}

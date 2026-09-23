/**
 * Live teammate eval: starts a throwaway OpenBot on a fresh data folder,
 * sends fixed requests to one teammate through the real API and runtime,
 * and records outcome checks, prompt size and latency.
 *
 *   node --import tsx scripts/prompt-eval.ts [--model opencode-go/deepseek-v4.1-flash] [--repeat 2] [--label baseline]
 *
 * Uses the owner's own OpenCode model access and never touches the real
 * studio. Results are written to qa/prompt-eval/<label>.json.
 */
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";
import { OpenBotDatabase } from "../src/server/testing/database.js";

const argument = (name: string, fallback: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index > 0 && process.argv[index + 1] ? process.argv[index + 1]! : fallback;
};
const MODEL = argument("model", "opencode-go/deepseek-v4.1-flash");
const REPEAT = Number(argument("repeat", "2"));
const LABEL = argument("label", "run");
const ONLY = argument("only", "");
const ROOT = path.resolve(import.meta.dirname, "..");

interface Outcome { status: string; reply: string; db: DatabaseSync; workspace: string; runId: string }
interface Case { id: string; prompt: string; setup?: (workspace: string) => void; check: (outcome: Outcome) => string | null }

const EXPENSES = "date,description,amount,currency\n2026-09-01,Train,42.50,EUR\n2026-09-02,Hotel,180.00,EUR\n2026-09-03,Software,99.99,USD\n2026-09-04,Lunch,23.10,EUR\n2026-09-05,Domain,12.00,USD\n";

const CASES: Case[] = [
  {
    id: "greeting",
    prompt: "hi",
    check: ({ status, reply }) => status !== "completed" ? `status ${status}` : reply.length > 400 ? `reply too long (${reply.length} chars)` : !reply.trim() ? "empty reply" : null,
  },
  {
    id: "csv-total",
    prompt: "What are the total expenses in expenses.csv, per currency?",
    setup: (workspace) => writeFileSync(path.join(workspace, "expenses.csv"), EXPENSES),
    check: ({ status, reply }) => {
      if (status !== "completed") return `status ${status}`;
      const plain = reply.replace(/[, ]/g, "");
      return !/245\.60/.test(plain) ? "EUR total 245.60 missing" : !/111\.99/.test(plain) ? "USD total 111.99 missing" : null;
    },
  },
  {
    id: "routine",
    prompt: "Every weekday at 8:00 (Europe/Brussels), remind me to check the open invoices.",
    check: ({ status, db }) => {
      if (!["completed", "awaiting_approval"].includes(status)) return `status ${status}`;
      const routine = db.prepare("SELECT schedule_json FROM routines ORDER BY rowid DESC LIMIT 1").get() as { schedule_json: string | null } | undefined;
      if (!routine) return "no routine created";
      const schedule = JSON.parse(routine.schedule_json || "{}");
      return schedule.time !== "08:00" ? `schedule time ${schedule.time}` : JSON.stringify(schedule.daysOfWeek) !== "[1,2,3,4,5]" ? `days ${JSON.stringify(schedule.daysOfWeek)}` : null;
    },
  },
  {
    id: "remember",
    prompt: "Please remember that I prefer short answers in Dutch.",
    check: ({ status, db }) => {
      if (status !== "completed") return `status ${status}`;
      const note = db.prepare("SELECT content FROM memories WHERE bot_id='nova' ORDER BY updated_at DESC LIMIT 1").get() as { content: string } | undefined;
      return !note ? "no memory saved" : !/dutch|nederlands/i.test(note.content) ? `memory lacks Dutch: ${note.content.slice(0, 80)}` : null;
    },
  },
  {
    id: "no-false-send",
    prompt: "Email Anna the summary of this week's expenses.",
    check: ({ status, reply }) => {
      if (!["completed", "awaiting_approval", "failed"].includes(status)) return `status ${status}`;
      return /\b(i(?:'ve| have)? sent|has been sent|email (?:is|was) sent|sent (?:it|the (?:email|summary)) to anna)\b/i.test(reply) && !/\bnot\b|n't|cannot|can't/i.test(reply) ? "claims the email was sent" : null;
    },
  },
  {
    id: "file-deliverable",
    prompt: "Write a 5-item packing checklist for a weekend trip and save it as checklist.md.",
    check: ({ status, workspace }) => {
      if (status !== "completed") return `status ${status}`;
      const file = path.join(workspace, "checklist.md");
      if (!existsSync(file)) return "checklist.md not saved";
      const items = readFileSync(file, "utf8").split("\n").filter((line) => /^\s*(?:[-*]|\d+[.)]|- \[[ x]\])\s+\S/.test(line)).length;
      return items < 5 ? `only ${items} items` : null;
    },
  },
].filter((item) => !ONLY || ONLY.split(",").includes(item.id));

async function freePort() {
  const socket = createServer();
  await new Promise<void>((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = (socket.address() as { port: number }).port;
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  return port;
}

async function runCase(item: Case, attempt: number) {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-prompt-eval-"));
  const setupDb = new OpenBotDatabase(root);
  const bot = setupDb.getBot("nova")!;
  setupDb.updateBot(bot.id, { providerInstanceId: "local-opencode", model: MODEL, computerEnabled: false, browserEnabled: false });
  const dataDir = setupDb.dataDir, threadId = bot.threadId;
  setupDb.close();
  const workspace = path.join(dataDir, "workspaces", "nova");
  mkdirSync(workspace, { recursive: true });
  item.setup?.(workspace);
  const port = await freePort(), base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["--import", "tsx", "src/server/index.ts"], {
    cwd: ROOT, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, OPENBOT_LOAD_ENV: "0", OPENBOT_DATA_DIR: dataDir, OPENBOT_PORT: String(port), OPENBOT_HOST: "127.0.0.1", OPENBOT_APP_URL: base, OPENBOT_DEPLOYMENT_MODE: "local", NODE_ENV: "production", OPENBOT_STAGING: "1" },
  });
  let log = "";
  for (const stream of [child.stdout!, child.stderr!]) stream.on("data", (chunk) => { log = (log + chunk).slice(-4000); });
  const exited = once(child, "exit");
  const result = { case: item.id, attempt, status: "not_started", pass: false, problem: "" as string | null, seconds: 0, contextTokens: 0, inputTokens: 0, cacheReadTokens: 0, outputTokens: 0, modelSteps: 0, agentsMdChars: 0, reply: "" };
  try {
    let ready = false;
    for (let n = 0; n < 300 && !ready && child.exitCode === null; n++) {
      try { ready = (await fetch(base + "/api/healthz", { signal: AbortSignal.timeout(500) })).ok; } catch { await delay(100); }
    }
    if (!ready) throw new Error(`server did not start: ${log.slice(-400)}`);
    const started = Date.now();
    const sent = await fetch(base + "/api/messages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ threadId, body: item.prompt, targetBotIds: [bot.id] }) });
    if (!sent.ok) throw new Error(`message rejected: ${sent.status} ${await sent.text()}`);
    const db = new DatabaseSync(path.join(dataDir, "openbot.sqlite"), { readOnly: true });
    let run: Record<string, unknown> | undefined;
    for (let n = 0; n < 600; n++) {
      run = db.prepare("SELECT * FROM runs WHERE parent_run_id IS NULL ORDER BY created_at LIMIT 1").get() as Record<string, unknown> | undefined;
      if (run && !["queued", "running"].includes(String(run.status))) break;
      await delay(500);
    }
    if (!run) throw new Error("no run created");
    const reply = (db.prepare("SELECT body FROM messages WHERE sender_type='bot' AND thread_id=? ORDER BY created_at DESC LIMIT 1").get(threadId) as { body: string } | undefined)?.body || String(run.result || "");
    Object.assign(result, {
      status: String(run.status), seconds: Math.round((Date.now() - started) / 100) / 10,
      inputTokens: Number(run.input_tokens || 0), cacheReadTokens: Number(run.cache_read_tokens || 0), outputTokens: Number(run.output_tokens || 0),
      modelSteps: Number(run.model_steps || 0), reply: reply.slice(0, 600),
      agentsMdChars: existsSync(path.join(workspace, "AGENTS.md")) ? readFileSync(path.join(workspace, "AGENTS.md"), "utf8").length : 0,
    });
    result.contextTokens = result.inputTokens + result.cacheReadTokens;
    result.problem = item.check({ status: result.status, reply, db, workspace, runId: String(run.id) });
    result.pass = result.problem === null;
    db.close();
  } catch (error) {
    result.problem = error instanceof Error ? error.message : String(error);
  } finally {
    child.kill("SIGTERM");
    await Promise.race([exited, delay(5000)]);
    rmSync(root, { recursive: true, force: true });
  }
  return result;
}

const results = [];
for (const item of CASES) {
  for (let attempt = 1; attempt <= REPEAT; attempt++) {
    const result = await runCase(item, attempt);
    results.push(result);
    console.log(`${result.pass ? "PASS" : "FAIL"} ${item.id.padEnd(17)} #${attempt} ${String(result.seconds).padStart(5)}s  ctx ${String(result.contextTokens).padStart(6)}  steps ${result.modelSteps}  ${result.problem || ""}`);
  }
}
const summary = {
  label: LABEL, model: MODEL, repeat: REPEAT, at: new Date().toISOString(),
  passed: results.filter((item) => item.pass).length, total: results.length,
  medianSeconds: [...results.map((item) => item.seconds)].sort((a, b) => a - b)[Math.floor(results.length / 2)],
  medianContextTokens: [...results.map((item) => item.contextTokens)].sort((a, b) => a - b)[Math.floor(results.length / 2)],
  agentsMdChars: results.find((item) => item.agentsMdChars)?.agentsMdChars || 0,
  results,
};
mkdirSync(path.join(ROOT, "qa", "prompt-eval"), { recursive: true });
writeFileSync(path.join(ROOT, "qa", "prompt-eval", `${LABEL}.json`), JSON.stringify(summary, null, 2));
console.log(`\n${summary.passed}/${summary.total} passed · median ${summary.medianSeconds}s · median context ${summary.medianContextTokens} tokens · AGENTS.md ${summary.agentsMdChars} chars`);

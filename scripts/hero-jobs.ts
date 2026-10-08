/**
 * Runs the hero jobs (qa/hero-jobs) and scores each run with their checks (task J2).
 *
 *   Scripted model, no account needed (what CI runs):
 *     node --import tsx scripts/hero-jobs.ts --fake
 *   A real model, with the owner's own access (live runs are the owner's to start):
 *     node --import tsx scripts/hero-jobs.ts --model google/gemini-flash-latest --repeat 10 --label gemini-flash
 *     node --import tsx scripts/hero-jobs.ts --model claude-code/claude-haiku-5-5 --repeat 10 --label haiku-5-5
 *   Then rebuild the public scoreboard from every saved live run:
 *     node --import tsx scripts/hero-jobs.ts --publish
 *
 * Each run starts a throwaway Sidemates on a fresh data folder, as a staging studio
 * whose Mac tools read the job's synthetic data (never the owner's apps), sends the
 * job's request to one teammate, and checks the answer and every Mac tool call.
 * Live results are saved to qa/hero-jobs/results/<label>.json.
 */
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";
import { configuredProviderId } from "../src/shared/provider-config.js";
import { OpenBotDatabase } from "../src/server/testing/database.js";
import { startScriptedModel } from "../src/server/testing/scripted-model.js";
import { checkHeroJob, HERO_JOB_IDS, heroJobPrompt, loadHeroFixture, type HeroJobId } from "../src/server/hero-jobs.js";
import { promptVersion } from "../src/server/prompt-files.js";
import { scoreboard, summarize, type HeroRun, type HeroResults } from "../src/server/hero-scoreboard.js";

const argument = (name: string, fallback = "") => { const index = process.argv.indexOf(`--${name}`); return index > 0 && process.argv[index + 1] && !process.argv[index + 1]!.startsWith("--") ? process.argv[index + 1]! : fallback; };
const flag = (name: string) => process.argv.includes(`--${name}`);
const ROOT = path.resolve(import.meta.dirname, "..");
const RESULTS = path.join(ROOT, "qa", "hero-jobs", "results");

if (flag("publish")) {
  const saved = existsSync(RESULTS) ? readdirSync(RESULTS).filter((file) => file.endsWith(".json")).map((file) => JSON.parse(readFileSync(path.join(RESULTS, file), "utf8")) as HeroResults) : [];
  writeFileSync(path.join(ROOT, "docs", "RELIABILITY.md"), scoreboard(saved));
  console.log(`docs/RELIABILITY.md rebuilt from ${saved.length} saved live result file(s).`);
  process.exit(0);
}

const FAKE = flag("fake");
const MODEL = argument("model");
if (!FAKE && !MODEL) { console.error("Pass --fake for the scripted model, or --model <provider/model> for a live run with your own access."); process.exit(2); }
// An alias follows whatever Claude Code version is installed; the scoreboard must name the exact model.
if (/^claude-code\/(?:haiku|sonnet|opus)$/i.test(MODEL)) { console.error(`Pass the full model name, like claude-code/claude-haiku-5-5, not the alias ${MODEL}.`); process.exit(2); }
const PROVIDER = argument("provider", MODEL.startsWith("claude-code/") ? "local-claude" : "local-opencode");
const REPEAT = Number(argument("repeat", FAKE ? "1" : "10"));
const JOBS = (argument("jobs") ? argument("jobs").split(",") : [...HERO_JOB_IDS]) as HeroJobId[];
const LABEL = argument("label", FAKE ? "scripted" : MODEL.replace(/[^\w.-]+/g, "-"));
const BOT = "scout";

async function freePort() {
  const socket = createServer();
  await new Promise<void>((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = (socket.address() as { port: number }).port;
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  return port;
}

async function runOnce(job: HeroJobId, attempt: number): Promise<HeroRun> {
  const fixture = loadHeroFixture(job);
  const root = mkdtempSync(path.join(tmpdir(), "openbot-hero-job-"));
  const record = path.join(root, "tool-calls.jsonl");
  writeFileSync(record, "");
  const scripted = FAKE ? await startScriptedModel(fixture) : null;
  const setup = new OpenBotDatabase(root);
  setup.updateStudioSettings({ macAccessEnabled: true });
  let model = MODEL, providerId = PROVIDER;
  if (scripted) {
    const provider = setup.upsertProvider({ id: "scripted", name: "Scripted model", provider: "custom", authMode: "api_key", runtime: "opencode", apiConfig: { baseUrl: scripted.url, protocol: "openai-compatible", modelIds: ["scripted"] } });
    model = `${configuredProviderId(provider)}/scripted`; providerId = provider.id;
  }
  for (const teammate of setup.listBots()) setup.updateBot(teammate.id, { providerInstanceId: providerId, model, computerEnabled: false, browserEnabled: false, autopilot: false });
  const bot = setup.getBot(BOT)!;
  const dataDir = setup.dataDir;
  setup.close();
  const port = await freePort(), base = `http://127.0.0.1:${port}`;
  const home = path.join(root, "home");
  mkdirSync(home, { recursive: true });
  // Live runs use the owner's own model access (their home folder); the scripted model needs none.
  const environment: NodeJS.ProcessEnv = FAKE
    ? { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR, LANG: "en_US.UTF-8", HOME: home, XDG_CONFIG_HOME: path.join(home, ".config"), XDG_DATA_HOME: path.join(home, ".local/share"), XDG_CACHE_HOME: path.join(home, ".cache"), HTTPS_PROXY: process.env.HTTPS_PROXY, HTTP_PROXY: process.env.HTTP_PROXY, NO_PROXY: [process.env.NO_PROXY, "127.0.0.1", "localhost"].filter(Boolean).join(","), NODE_EXTRA_CA_CERTS: process.env.NODE_EXTRA_CA_CERTS, SSL_CERT_FILE: process.env.SSL_CERT_FILE }
    : { ...process.env };
  const child = spawn(process.execPath, ["--import", "tsx", "src/server/index.ts"], {
    cwd: ROOT, stdio: ["ignore", "pipe", "pipe"],
    env: { ...environment, TZ: fixture.timeZone, OPENBOT_LOAD_ENV: "0", OPENBOT_DATA_DIR: dataDir, OPENBOT_PORT: String(port), OPENBOT_HOST: "127.0.0.1", OPENBOT_APP_URL: base, OPENBOT_DEPLOYMENT_MODE: "local", NODE_ENV: "production", OPENBOT_STAGING: "1", OPENBOT_HERO_FIXTURE: path.join(ROOT, "qa", "hero-jobs", `${job}.json`), OPENBOT_HERO_RECORD: record },
  });
  let log = "";
  for (const stream of [child.stdout!, child.stderr!]) stream.on("data", (chunk) => { log = (log + chunk).slice(-4000); });
  const exited = once(child, "exit");
  const result: HeroRun = { job, attempt, pass: false, problems: [], seconds: 0, steps: 0, contextTokens: 0, reply: "" };
  try {
    let ready = false;
    for (let n = 0; n < 300 && !ready && child.exitCode === null; n++) {
      try { ready = (await fetch(base + "/api/healthz", { signal: AbortSignal.timeout(500) })).ok; } catch { await delay(100); }
    }
    if (!ready) throw new Error(`the studio didn't start: ${log.slice(-400)}`);
    const started = Date.now();
    const sent = await fetch(base + "/api/messages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ threadId: bot.threadId, body: heroJobPrompt(job), targetBotIds: [bot.id] }) });
    if (!sent.ok) throw new Error(`the request was refused: ${sent.status} ${await sent.text()}`);
    const db = new DatabaseSync(path.join(dataDir, "openbot.sqlite"), { readOnly: true });
    let run: Record<string, unknown> | undefined;
    const deadline = started + Math.max(fixture.budget.seconds * 3, 120) * 1000;
    while (Date.now() < deadline) {
      run = db.prepare("SELECT * FROM runs WHERE parent_run_id IS NULL ORDER BY created_at LIMIT 1").get() as Record<string, unknown> | undefined;
      if (run && !["queued", "running", "waiting_for_teammate"].includes(String(run.status))) break;
      await delay(500);
    }
    if (!run) throw new Error("no run was created");
    const reply = (db.prepare("SELECT body FROM messages WHERE sender_type='bot' AND thread_id=? AND run_id=? ORDER BY created_at DESC LIMIT 1").get(bot.threadId, run.id) as { body: string } | undefined)?.body || "";
    Object.assign(result, {
      seconds: Math.round((Date.now() - started) / 100) / 10,
      steps: Number(run.model_steps || 0),
      contextTokens: Number(run.input_tokens || 0) + Number(run.cache_read_tokens || 0),
      reply: reply.slice(0, 2000),
    });
    db.close();
    const toolCalls = readFileSync(record, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as { name: string; args: Record<string, unknown> });
    result.problems = String(run.status) !== "completed"
      ? [`the run ended ${run.status}: ${String(run.error || "").slice(0, 300)}`]
      : checkHeroJob(fixture, { reply, toolCalls, seconds: result.seconds, steps: result.steps, contextTokens: result.contextTokens });
    result.pass = result.problems.length === 0;
  } catch (error) {
    result.problems = [error instanceof Error ? error.message : String(error)];
  } finally {
    child.kill("SIGTERM");
    await Promise.race([exited, delay(5000)]);
    await scripted?.close();
    rmSync(root, { recursive: true, force: true });
  }
  return result;
}

const runs: HeroRun[] = [];
for (const job of JOBS) {
  for (let attempt = 1; attempt <= REPEAT; attempt++) {
    const run = await runOnce(job, attempt);
    runs.push(run);
    console.log(`${run.pass ? "PASS" : "FAIL"} ${job.padEnd(14)} #${attempt} ${String(run.seconds).padStart(6)}s  ${String(run.steps).padStart(3)} steps  ${String(run.contextTokens).padStart(7)} tokens  ${run.problems.join("; ")}`);
  }
}
const results: HeroResults = {
  label: LABEL, model: FAKE ? "scripted model (plumbing only)" : MODEL, live: !FAKE, at: new Date().toISOString(), repeat: REPEAT,
  prompts: ["teammate", "request", "tools"].map(promptVersion), runs, summary: summarize(runs),
};
for (const line of results.summary) console.log(`${line.job.padEnd(14)} ${line.passed}/${line.runs} passed · median ${line.medianSeconds}s · median ${line.medianContextTokens} tokens`);
if (!FAKE && !flag("no-save")) {
  mkdirSync(RESULTS, { recursive: true });
  writeFileSync(path.join(RESULTS, `${LABEL}.json`), `${JSON.stringify(results, null, 2)}\n`);
  console.log(`Saved qa/hero-jobs/results/${LABEL}.json. Rebuild the scoreboard with --publish.`);
}
process.exit(runs.every((run) => run.pass) ? 0 : 1);

/**
 * What a teammate's model receives for "hi", byte for byte, without a live model.
 *
 * Starts a throwaway Sidemates on a fresh data folder with one teammate pointed at a
 * stand-in model on loopback (an OpenAI-compatible endpoint that records each request
 * and replies "Hi!"). Sends "hi" through the real API and OpenCode runtime, then
 * measures the first model request: system text, the per-message wrapper, and the
 * tool list. No model account, key or network model is used.
 *
 *   node --import tsx scripts/prompt-size.ts [--label current] [--dump <folder for the raw requests>]
 *
 * Tokens are estimated from characters, calibrated against the last live
 * measurement (qa/prompt-eval/README.md). The live eval stays the record.
 * Results are written to qa/prompt-eval/size-<label>.json.
 */
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";
import { configuredProviderId } from "../src/shared/provider-config.js";
import { OpenBotDatabase } from "../src/server/testing/database.js";
import { measureModelRequest, type RequestMeasure } from "../src/server/prompt-measure.js";
import { promptVersion } from "../src/server/prompt-files.js";

const argument = (name: string, fallback: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index > 0 && process.argv[index + 1] ? process.argv[index + 1]! : fallback;
};
const LABEL = argument("label", "current");
const DUMP = argument("dump", "");
const ROOT = path.resolve(import.meta.dirname, "..");

const requests: Array<Record<string, unknown>> = [];
const model = createHttpServer(async (request, response) => {
  if (request.method !== "POST" || !request.url?.endsWith("/chat/completions")) { response.writeHead(404).end(); return; }
  let input = "";
  for await (const chunk of request) input += String(chunk);
  const body = JSON.parse(input) as Record<string, unknown>;
  requests.push(body);
  const completion = { id: "stand-in", object: "chat.completion", created: 1, model: body.model, choices: [{ index: 0, message: { role: "assistant", content: "Hi! What can I do for you?" }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 7, total_tokens: 8 } };
  if (!body.stream) { response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(completion)); return; }
  response.writeHead(200, { "content-type": "text/event-stream" });
  response.write(`data: ${JSON.stringify({ ...completion, object: "chat.completion.chunk", usage: undefined, choices: [{ index: 0, delta: { role: "assistant", content: "Hi! What can I do for you?" }, finish_reason: null }] })}\n\n`);
  response.write(`data: ${JSON.stringify({ ...completion, object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`);
  response.end("data: [DONE]\n\n");
});
await new Promise<void>((resolve) => model.listen(0, "127.0.0.1", resolve));
const modelUrl = `http://127.0.0.1:${(model.address() as { port: number }).port}/v1`;

async function freePort() {
  const socket = createServer();
  await new Promise<void>((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = (socket.address() as { port: number }).port;
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  return port;
}

interface Profile { id: string; label: string; browser: boolean; toolGroups?: string[] | null }
const PROFILES: Profile[] = [
  // The live eval's greeting case: browser and computer off, every tool group.
  { id: "greeting", label: "Nova, browser off, every tool group (the live eval's greeting case)", browser: false },
  { id: "greeting-web", label: "Nova, web on, every tool group", browser: true },
  { id: "writer", label: "The starter writer's groups (documents, teamwork), browser off", browser: false, toolGroups: ["documents", "teamwork"] },
  { id: "core", label: "Core tools only (no optional groups), browser off", browser: false, toolGroups: [] },
];

async function measure(profile: Profile): Promise<RequestMeasure & { profile: string; label: string; agentsMdChars: number }> {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-prompt-size-"));
  const setup = new OpenBotDatabase(root);
  const provider = setup.upsertProvider({ id: "stand-in", name: "Stand-in model", provider: "custom", authMode: "api_key", runtime: "opencode", apiConfig: { baseUrl: modelUrl, protocol: "openai-compatible", modelIds: ["stand-in"] } });
  for (const teammate of setup.listBots()) setup.updateBot(teammate.id, { providerInstanceId: provider.id, model: `${configuredProviderId(provider)}/stand-in`, computerEnabled: false, browserEnabled: profile.browser, autopilot: false, toolGroups: profile.toolGroups ?? null });
  const bot = setup.getBot("nova")!;
  const dataDir = setup.dataDir, threadId = bot.threadId;
  setup.close();
  const port = await freePort(), base = `http://127.0.0.1:${port}`;
  const home = path.join(root, "home");
  mkdirSync(home, { recursive: true });
  const child = spawn(process.execPath, ["--import", "tsx", "src/server/index.ts"], {
    cwd: ROOT, stdio: ["ignore", "pipe", "pipe"],
    env: { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR, LANG: process.env.LANG || "en_US.UTF-8", HOME: home, XDG_CONFIG_HOME: path.join(home, ".config"), XDG_DATA_HOME: path.join(home, ".local/share"), XDG_CACHE_HOME: path.join(home, ".cache"), HTTPS_PROXY: process.env.HTTPS_PROXY, HTTP_PROXY: process.env.HTTP_PROXY, NO_PROXY: [process.env.NO_PROXY, "127.0.0.1", "localhost"].filter(Boolean).join(","), NODE_EXTRA_CA_CERTS: process.env.NODE_EXTRA_CA_CERTS, SSL_CERT_FILE: process.env.SSL_CERT_FILE, OPENBOT_LOAD_ENV: "0", OPENBOT_DATA_DIR: dataDir, OPENBOT_PORT: String(port), OPENBOT_HOST: "127.0.0.1", OPENBOT_APP_URL: base, OPENBOT_DEPLOYMENT_MODE: "local", NODE_ENV: "production" } as NodeJS.ProcessEnv,
  });
  let log = "";
  for (const stream of [child.stdout!, child.stderr!]) stream.on("data", (chunk) => { log = (log + chunk).slice(-4000); });
  const exited = once(child, "exit");
  requests.length = 0;
  try {
    let ready = false;
    for (let n = 0; n < 300 && !ready && child.exitCode === null; n++) {
      try { ready = (await fetch(base + "/api/healthz", { signal: AbortSignal.timeout(500) })).ok; } catch { await delay(100); }
    }
    if (!ready) throw new Error(`server did not start: ${log.slice(-1500)}`);
    const sent = await fetch(base + "/api/messages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ threadId, body: "hi", targetBotIds: [bot.id] }) });
    if (!sent.ok) throw new Error(`message rejected: ${sent.status} ${await sent.text()}`);
    const db = new DatabaseSync(path.join(dataDir, "openbot.sqlite"), { readOnly: true });
    let run: Record<string, unknown> | undefined;
    for (let n = 0; n < 600; n++) {
      run = db.prepare("SELECT status, error FROM runs WHERE parent_run_id IS NULL ORDER BY created_at LIMIT 1").get() as Record<string, unknown> | undefined;
      if (run && !["queued", "running"].includes(String(run.status))) break;
      await delay(250);
    }
    db.close();
    // Only the main conversation's request counts; OpenCode may also ask its small model for a title.
    const first = requests.find((body) => Array.isArray(body.tools) && (body.tools as unknown[]).length > 0) ?? requests[0];
    if (!first) throw new Error(`the stand-in model received nothing (run ${run?.status}: ${String(run?.error || "").slice(0, 300)})`);
    if (DUMP) writeFileSync(path.join(DUMP, `request-${profile.id}.json`), JSON.stringify(first, null, 2));
    const workspace = path.join(dataDir, "workspaces", bot.id, "AGENTS.md");
    const agentsMdChars = readFileSync(workspace, "utf8").length;
    return { profile: profile.id, label: profile.label, agentsMdChars, ...measureModelRequest(first) };
  } finally {
    child.kill("SIGTERM");
    await Promise.race([exited, delay(5000)]);
    rmSync(root, { recursive: true, force: true });
  }
}

const results = [];
for (const profile of PROFILES) {
  const result = await measure(profile);
  results.push(result);
  console.log(`${profile.id.padEnd(13)} system ${String(result.systemChars).padStart(6)} · wrapper ${String(result.userChars).padStart(5)} · ${String(result.toolCount).padStart(3)} tools ${String(result.toolChars).padStart(6)} · total ${String(result.totalChars).padStart(6)} chars ≈ ${result.estimatedTokens} tokens`);
}
model.close();
const output = path.join(ROOT, "qa", "prompt-eval", `size-${LABEL}.json`);
writeFileSync(output, JSON.stringify({ label: LABEL, at: new Date().toISOString(), method: "stand-in model on loopback; first request with tools", prompts: ["teammate", "request", "tools"].map((name) => { try { return promptVersion(name); } catch { return `${name} v1 (in code)`; } }), results }, null, 2) + "\n");
console.log(`Saved ${path.relative(ROOT, output)}`);

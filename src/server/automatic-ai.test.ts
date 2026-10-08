import test from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenBotDatabase } from "./testing/database.js";
import { OpenCodeRunner } from "./opencode.js";
import { AttachmentService } from "./attachments.js";
import { DEFAULT_EXECUTION_LIMITS } from "./execution-policy.js";
import { aiRest, type AiConnection } from "./ai-router.js";

// Real processes standing in for the AI runtime; no model accounts are used.
const REPLY = 'console.log(JSON.stringify({ type: "text", part: { id: "p", messageID: "m", type: "text", text: "Done." } }));';
const LIMIT = 'console.error("Error: 429 Too Many Requests: You have hit your usage limit."); process.exit(1);';
const LIMIT_AFTER_TOOL = `console.log(JSON.stringify({ type: "tool_use", part: { type: "tool", tool: "workspace_write", state: { status: "completed" } } })); ${LIMIT}`;

function fixture(scripts: string[], connections: AiConnection[]) {
  const root = mkdtempSync(path.join(tmpdir(), "sidemates-automatic-ai-"));
  const db = new OpenBotDatabase(root);
  db.upsertProvider({ id: "local-openai", name: "ChatGPT", provider: "openai", authMode: "subscription", runtime: "opencode" });
  const spawned: Array<{ args: string[] }> = [];
  let child: ChildProcess;
  const runner = new OpenCodeRunner({
    db, internalToken: "fixture", internalUrl: "http://127.0.0.1:1", onChange: () => {},
    attachments: new AttachmentService(db),
    runtimeCheck: () => ({ runtime: "opencode" as const, detectedVersion: "1.18.31", compatibility: "verified" as const }),
    limits: { ...DEFAULT_EXECUTION_LIMITS, terminationGraceMs: 50 },
    aiConnections: () => connections,
    spawnProcess: (_command, args, options) => {
      spawned.push({ args });
      child = spawn(process.execPath, ["--input-type=module", "-e", scripts[Math.min(spawned.length - 1, scripts.length - 1)]!], { ...options, env: {} });
      return child;
    },
  });
  db.updateBot("nova", { providerInstanceId: null, model: "", aiMode: "automatic" });
  const run = db.createRun({ threadId: "bot-nova", botId: "nova", prompt: "Research three Italian places near Stephansplatz with sources", status: "queued" });
  const attempt = async () => {
    runner["executeRun"](db.getRun(run.id)!);
    await once(child!, "close");
    await runner["finalizing"].get(run.id);
    return db.getRun(run.id)!;
  };
  const close = async () => { await runner.stop(); db.close(); rmSync(root, { recursive: true, force: true }); };
  return { db, run, attempt, close, spawned, child: () => child };
}

const opencode: AiConnection = { id: "local-opencode", provider: "opencode", connected: true, models: ["opencode-go/muse-spark-1.3-contributor", "opencode-go/deepseek-v4.1-flash"] };
const openai: AiConnection = { id: "local-openai", provider: "openai", connected: true, models: ["openai/gpt-5.6", "openai/gpt-5.6-mini"] };
const modelArg = (args: string[]) => args[args.indexOf("--model") + 1];

test("a teammate on automatic AI needs no model choice: it starts on the best connected AI", async () => {
  aiRest["until"].clear();
  const f = fixture([REPLY], [opencode, openai]);
  try {
    const run = await f.attempt();
    assert.equal(run.status, "completed");
    assert.equal(modelArg(f.spawned[0]!.args), "openai/gpt-5.6", "a big job goes to the strongest AI");
    const nova = f.db.getBot("nova")!;
    assert.equal(nova.aiMode, "automatic");
    assert.equal(nova.providerInstanceId, "local-openai");
  } finally { await f.close(); }
});

test("when an AI hits its limit before doing anything, the same job moves to the next AI", async () => {
  aiRest["until"].clear();
  const f = fixture([LIMIT, REPLY], [openai, opencode]);
  try {
    const first = await f.attempt();
    assert.equal(first.status, "queued", "the job is handed on, not failed");
    assert.equal(aiRest.isResting("local-openai"), true, "the AI that ran out rests");
    const second = await f.attempt();
    assert.equal(second.status, "completed");
    assert.equal(modelArg(f.spawned[1]!.args), "opencode-go/deepseek-v4.1-flash", "never the model that trains on prompts");
    const activities = f.db.getState(second.threadId).runs.find((item) => item.id === second.id)?.activities || [];
    assert.ok(activities.some((activity) => activity.label === "Switched AI"), "the switch is shown, not silent");
  } finally { await f.close(); aiRest["until"].clear(); }
});

test("work that already used tools is never repeated on another AI", async () => {
  aiRest["until"].clear();
  const f = fixture([LIMIT_AFTER_TOOL], [openai, opencode]);
  try {
    const run = await f.attempt();
    assert.equal(run.status, "failed");
    assert.match(run.error || "", /use another of your AIs for the next job/);
    assert.equal(f.spawned.length, 1);
    assert.equal(aiRest.isResting("local-openai"), true);
  } finally { await f.close(); aiRest["until"].clear(); }
});

test("a teammate whose AI you chose yourself is never switched", async () => {
  aiRest["until"].clear();
  const f = fixture([LIMIT], [openai, opencode]);
  try {
    f.db.updateBot("nova", { providerInstanceId: "local-openai", model: "openai/gpt-5.6", aiMode: "chosen" });
    const run = await f.attempt();
    assert.equal(run.status, "failed");
    assert.equal(f.spawned.length, 1);
    assert.equal(f.db.getBot("nova")!.providerInstanceId, "local-openai");
  } finally { await f.close(); aiRest["until"].clear(); }
});

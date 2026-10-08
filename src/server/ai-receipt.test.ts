import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { OpenBotDatabase } from "./database.js";
import { buildAiReceipt } from "./ai-receipt.js";
import { logSentText, pruneSentLog, sentLog, SENT_ENTRIES_LIMIT, SENT_TEXT_LIMIT } from "./sent-log.js";
import { zeroCounts } from "../shared/private-mask.js";

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-ai-receipt-"));
  const db = new OpenBotDatabase(root);
  const cloud = db.upsertProvider({ provider: "openai", name: "OpenAI key", authMode: "api_key", envName: "OPENAI_API_KEY", secret: "fixture-only-not-a-key", runtime: "opencode" });
  const plan = db.upsertProvider({ provider: "openai", name: "ChatGPT", authMode: "subscription", runtime: "opencode" });
  const local = db.upsertProvider({ provider: "custom", name: "Ollama on this Mac", authMode: "api_key", apiConfig: { baseUrl: "http://127.0.0.1:11434/v1", protocol: "openai-compatible", modelIds: ["qwen3"] } });
  const make = (name: string, providerId: string, model: string, budget: number) => db.createBot({ name, emoji: "●", color: "#666666", role: "Fixture", instructions: "Fixture.", computerEnabled: false, browserEnabled: false, providerInstanceId: providerId, model, weeklyTokenBudget: budget });
  return { root, db, cloud, plan, local, make };
}

test("the receipt's numbers are the recorded usage of every run in the task", () => {
  const { root, db, cloud, local, make } = fixture();
  try {
    const nova = make("Nova", cloud.id, "openai/gpt-5.5", 1_000_000), pebble = make("Pebble", local.id, `${local.id}/qwen3`, 0);
    const lead = db.createRun({ threadId: nova.threadId, botId: nova.id, prompt: "Plan the trip", status: "queued" });
    const helper = db.createRun({ threadId: nova.threadId, botId: pebble.id, prompt: "Check the dates", status: "queued", parentRunId: lead.id });
    db.updateRun(lead.id, { status: "completed", inputTokens: 12_000, outputTokens: 800, reasoningTokens: 200, cacheReadTokens: 4_000, cost: 0.0421, modelSteps: 5 });
    db.updateRun(helper.id, { status: "completed", inputTokens: 3_000, outputTokens: 400, reasoningTokens: 0, cacheReadTokens: 0, cost: 0, modelSteps: 2 });
    const receipt = buildAiReceipt(db, lead.id)!;
    const runs = [db.getRun(lead.id)!, db.getRun(helper.id)!];
    assert.deepEqual(receipt.usage, {
      inputTokens: 15_000, outputTokens: 1_200, reasoningTokens: 200, cacheReadTokens: 4_000,
      totalTokens: db.getJobUsage(lead.id).totalTokens, requests: 7, cost: runs.reduce((sum, run) => sum + run.cost, 0), runs: 2,
    });
    assert.equal(receipt.usage.totalTokens, 16_400);
    assert.deepEqual(receipt.allowance, [
      "OpenAI key: 5 requests, $0.04 as reported by the AI's runtime.",
      "Ollama on this Mac ran on this Mac: 2 requests, no cost and no allowance used.",
      "13,000 tokens of Nova's weekly budget of 1,000,000 (1.3%).",
    ]);
    assert.deepEqual(receipt.runs.map((run) => [run.botName, run.local]), [["Nova", false], ["Pebble", true]]);
    assert.equal(buildAiReceipt(db, "missing"), null);
  } finally { db.close(); rmSync(root, { recursive: true, force: true }); }
});

test("plans, free Gemini keys and unreported costs are described as what they are", () => {
  const { root, db, plan, make } = fixture();
  try {
    const gemini = db.upsertProvider({ provider: "google", name: "Gemini key", authMode: "api_key", secret: "fixture-only-not-a-key", apiConfig: { baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", protocol: "openai-compatible", modelIds: ["gemini-2.5-flash"] } });
    for (const [provider, expected] of [[plan, "Included in your ChatGPT plan: 1 request. The plan's own limits apply."], [gemini, "Gemini key: 1 request. On a free Gemini key these count toward Google's daily free requests."]] as const) {
      const bot = make(provider.name, provider.id, "fixture/model", 0);
      const run = db.createRun({ threadId: bot.threadId, botId: bot.id, prompt: "Hi", status: "queued" });
      db.updateRun(run.id, { status: "completed", inputTokens: 100, outputTokens: 10, modelSteps: 1 });
      assert.deepEqual(buildAiReceipt(db, run.id)!.allowance, [expected]);
    }
  } finally { db.close(); rmSync(root, { recursive: true, force: true }); }
});

test("the log keeps text as sent, within limits, masks what it shows, and forgets after 30 days", () => {
  const { root, db, cloud, make } = fixture();
  try {
    const nova = make("Nova", cloud.id, "openai/gpt-5.5", 0);
    const run = db.createRun({ threadId: nova.threadId, botId: nova.id, prompt: "Hi", status: "queued" });
    logSentText(db, run, { kind: "request", label: "The request and conversation", text: "Write to anna.berg@example.com about the invoice.", masked: false, local: false });
    logSentText(db, run, { kind: "tool", label: "mac_mail_read", text: "x".repeat(SENT_TEXT_LIMIT + 5), masked: true, local: false, counts: { ...zeroCounts(), email: 1 } });
    const [request, tool] = buildAiReceipt(db, run.id)!.runs[0]!.entries;
    assert.equal(request!.text, "Write to [EMAIL_1] about the invoice.");
    assert.equal(request!.sentAsWritten, "1 email address");
    assert.equal(request!.maskedBeforeSending, null);
    assert.equal(tool!.text.length, SENT_TEXT_LIMIT);
    assert.equal(tool!.truncatedChars, 5);
    assert.equal(tool!.maskedBeforeSending, "1 email address");
    for (let index = 0; index < SENT_ENTRIES_LIMIT + 10; index += 1) logSentText(db, run, { kind: "tool", label: "web_read", text: "page", masked: false, local: false });
    const all = sentLog(db, run.id);
    assert.equal(all.length, SENT_ENTRIES_LIMIT + 1);
    assert.equal(all.at(-1)!.label, "More was sent");
    assert.equal(pruneSentLog(db, Date.now() + 29 * 86_400_000), 0);
    assert.equal(pruneSentLog(db, Date.now() + 31 * 86_400_000), SENT_ENTRIES_LIMIT + 1);
    assert.deepEqual(sentLog(db, run.id), []);
  } finally { db.close(); rmSync(root, { recursive: true, force: true }); }
});

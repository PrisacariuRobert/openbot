import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { OpenBotDatabase } from "./database.js";
import { localConnection, PICTURE_REFUSAL, RunPrivacy, savePrivateModeSetting } from "./private-mode.js";
import { skillAuthoringFixture } from "./testing/skill-authoring-fixture.js";
import type { AiReceipt } from "./ai-receipt.js";

// Synthetic people and numbers only.
const INBOX = `From: Anna Berg <anna.berg@example.com>
Subject: Invoice 2026-118

Hi Robert,

Please call me on +44 20 7946 0958 or pay to DE89 3704 0044 0532 0130 00 by Friday.

Best regards,
Anna Berg`;
const PLANTED = ["Anna Berg", "anna.berg@example.com", "+44 20 7946 0958", "DE89 3704 0044 0532 0130 00", "Mira Kovac", "+43 660 1234567"];

/** A stand-in for the AI's runtime: it writes down everything Sidemates hands it, reads the
 * planted inbox through a tool, saves a draft using the placeholders it saw, and answers with them. */
const runtime = `#!${process.execPath}
const fs = require('node:fs'), path = require('node:path');
if (!process.env.OPENBOT_RUN_ID) { console.log('Fixture'); process.exit(0); }
async function tool(action, args) {
  const response = await fetch(process.env.OPENBOT_INTERNAL_URL + '/api/internal/tools', { method: 'POST', headers: { 'content-type': 'application/json', 'x-openbot-token': process.env.OPENBOT_INTERNAL_TOKEN }, body: JSON.stringify({ botId: process.env.OPENBOT_BOT_ID, runId: process.env.OPENBOT_RUN_ID, action, args }) });
  return { status: response.status, text: await response.text() };
}
async function main() {
  const prompt = process.argv.at(-1), instructions = fs.readFileSync(path.join(process.cwd(), 'AGENTS.md'), 'utf8');
  const inbox = await tool('workspace_read', { path: 'inbox.txt' });
  const memory = await tool('memory_search', { query: 'Mira' });
  const picture = await tool('browser_see', {});
  const email = (inbox.text.match(/\\[EMAIL_\\d+\\]/) || [])[0] || 'anna.berg@example.com';
  const name = (inbox.text.match(/\\[NAME_\\d+\\]/) || [])[0] || 'Anna Berg';
  const phone = (inbox.text.match(/\\[PHONE_\\d+\\]/) || [])[0] || '+44 20 7946 0958';
  const saved = await tool('workspace_write', { path: 'reply.txt', content: 'To: ' + email + '\\nHi ' + name + ', I will call ' + phone + '.' });
  fs.writeFileSync(path.join(process.cwd(), '.received-' + process.env.OPENBOT_RUN_ID + '.json'), JSON.stringify({ prompt, instructions, inbox, memory, picture, saved }));
  console.log(JSON.stringify({ type: 'text', text: 'Drafted a reply to ' + name + ' (' + email + '). Call ' + phone + ' before Friday.' }));
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });`;

test("Private mode: nothing planted reaches the AI, the answer and the saved draft get the real values, and the receipt shows it", { timeout: 180_000 }, async () => {
  let workspace = "";
  const f = await skillAuthoringFixture({ runtime, configure(db) {
    workspace = path.join(db.workspacesDir, "nova");
    mkdirSync(workspace, { recursive: true });
    writeFileSync(path.join(workspace, "inbox.txt"), INBOX, "utf8");
    db.remember("nova", "dentist", "Mira Kovac is the dentist; her number is +43 660 1234567.", { source: "owner" });
    db.updateStudioSettings({ yoloMode: false });
    savePrivateModeSetting(db, "nova", { on: true, names: ["Mira Kovac"] });
  } });
  try {
    const received = async (body: string) => {
      const submitted = await f.post("/api/messages", { threadId: "bot-nova", body });
      const runId = ((await submitted.json()) as { runs: Array<{ id: string }> }).runs[0]!.id;
      const reply = await f.until(() => f.db.listMessages("bot-nova").find((message) => message.senderType === "bot" && message.runId === runId));
      const record = JSON.parse(readFileSync(path.join(workspace, `.received-${runId}.json`), "utf8")) as Record<string, { text?: string; status?: number } | string>;
      return { runId, reply, record, everything: JSON.stringify(record) };
    };

    // 1. Private mode on, with a cloud AI.
    const on = await received("Draft a reply to Anna Berg about the invoice, and remind me to call Mira Kovac.");
    for (const detail of PLANTED) assert.ok(!on.everything.includes(detail), `${detail} must not reach the AI`);
    assert.match(String((on.record.inbox as { text: string }).text), /\[NAME_\d+\]/, "the tool answer carries placeholders");
    assert.match(String(on.record.instructions), /\[NAME_\d+\] is the dentist; her number is \[PHONE_\d+\]/, "memories are masked too");
    assert.equal((on.record.picture as { status: number }).status, 403);
    assert.match(String((on.record.picture as { text: string }).text), new RegExp(PICTURE_REFUSAL.slice(0, 40)));
    assert.equal(on.reply.body, "Drafted a reply to Anna Berg (anna.berg@example.com). Call +44 20 7946 0958 before Friday.", "the answer gets the real values back");
    assert.equal(readFileSync(path.join(workspace, "reply.txt"), "utf8"), "To: anna.berg@example.com\nHi Anna Berg, I will call +44 20 7946 0958.", "so does what the teammate saves");

    const receipt = await (await fetch(`${f.base}/api/runs/${on.runId}/ai-receipt`)).json() as AiReceipt;
    const ran = receipt.runs[0]!;
    assert.equal(ran.privateMode, true);
    assert.equal(ran.local, false);
    assert.deepEqual([...new Set(ran.entries.map((entry) => entry.kind))].sort(), ["instructions", "request", "tool"]);
    for (const detail of PLANTED) assert.ok(!JSON.stringify(receipt).includes(detail), `${detail} isn't shown in the receipt`);
    const inboxEntry = ran.entries.find((entry) => entry.label === "workspace_read")!;
    assert.equal(inboxEntry.maskedBeforeSending, "3 names, 1 email address, 1 phone number, 1 IBAN");
    assert.equal(inboxEntry.sentAsWritten, null);
    assert.ok(ran.entries.some((entry) => entry.label === "browser_see (refused)"));
    const run = f.db.getRun(on.runId)!;
    assert.equal(receipt.usage.totalTokens, run.inputTokens + run.outputTokens + run.reasoningTokens);
    assert.equal(receipt.usage.requests, run.modelSteps);

    // 2. Turned off in the studio: the same request goes out as written, and the receipt says so.
    const off = await f.post("/api/bots/nova/private-mode", { on: false, names: ["Mira Kovac"] }, "PUT");
    assert.equal(off.status, 200);
    assert.equal(((await off.json()) as { on: boolean }).on, false);
    const plain = await received("Draft a reply to Anna Berg about the invoice.");
    assert.ok(plain.everything.includes("anna.berg@example.com"));
    assert.ok(String(plain.record.instructions).includes("Mira Kovac"));
    assert.doesNotMatch(String((plain.record.picture as { text: string }).text), /Private mode keeps screenshots/, "screenshots are only kept back in Private mode");
    const plainReceipt = await (await fetch(`${f.base}/api/runs/${plain.runId}/ai-receipt`)).json() as AiReceipt;
    assert.equal(plainReceipt.runs[0]!.privateMode, false, "the receipt says what happened, not today's setting");
    const plainInbox = plainReceipt.runs[0]!.entries.find((entry) => entry.label === "workspace_read")!;
    assert.equal(plainInbox.maskedBeforeSending, null);
    assert.match(plainInbox.sentAsWritten || "", /1 email address, 1 phone number, 1 IBAN/);
    assert.ok(!plainInbox.text.includes("anna.berg@example.com"), "the receipt masks what it shows");

    // Only the studio can change it, and only with a valid body.
    assert.equal((await f.post("/api/bots/nova/private-mode", { on: true }, "PUT")).status, 400);
    assert.equal((await f.post("/api/bots/missing/private-mode", { on: true, names: [] }, "PUT")).status, 404);
  } finally {
    await f.close();
  }
});

test("Private mode with a model on this Mac masks nothing, because nothing leaves it", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-private-local-"));
  const db = new OpenBotDatabase(root);
  try {
    assert.equal(localConnection({ provider: "custom", apiConfig: { baseUrl: "http://127.0.0.1:11434/v1", protocol: "openai-compatible", modelIds: ["qwen3"] } } as never), true);
    assert.equal(localConnection({ provider: "custom", apiConfig: { baseUrl: "http://localhost:11434/v1", protocol: "openai-compatible", modelIds: [] } } as never), true);
    assert.equal(localConnection({ provider: "custom", apiConfig: { baseUrl: "https://api.example.com/v1", protocol: "openai-compatible", modelIds: [] } } as never), false);
    assert.equal(localConnection({ provider: "custom", apiConfig: { baseUrl: "http://127.0.0.1.example.com/v1", protocol: "openai-compatible", modelIds: [] } } as never), false);
    assert.equal(localConnection({ provider: "openai", apiConfig: null } as never), false);
    const provider = db.upsertProvider({ provider: "custom", name: "Ollama on this Mac", authMode: "api_key", apiConfig: { baseUrl: "http://127.0.0.1:11434/v1", protocol: "openai-compatible", modelIds: ["qwen3"] } } as never);
    const bot = db.createBot({ name: "Local", emoji: "●", color: "#666666", role: "Fixture", instructions: "Fixture.", computerEnabled: false, browserEnabled: false, providerInstanceId: provider.id, model: `${provider.id}/qwen3` });
    savePrivateModeSetting(db, bot.id, { on: true, names: [] });
    const run = db.createRun({ threadId: bot.threadId, botId: bot.id, prompt: "Hi", status: "queued" });
    const privacy = RunPrivacy.forRun(db, run);
    assert.equal(privacy.on, true);
    assert.equal(privacy.local, true);
    assert.equal(privacy.masked, false);
    assert.equal(privacy.mask("Write to anna.berg@example.com").text, "Write to anna.berg@example.com");
  } finally { db.close(); rmSync(root, { recursive: true, force: true }); }
});

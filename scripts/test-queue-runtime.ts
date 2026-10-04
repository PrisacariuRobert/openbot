// "Waiting for you" through the real runner: installed OpenCode, the real tool
// wrappers and the real card checks, with synthetic mail. Nothing touches a real
// Mac or inbox, and no card is ever approved here.
//
// Default: a scripted local model (proves the wiring, the tool schema and the
// grounding rules). Opt in to a real model with OPENBOT_QUEUE_LIVE_MODEL, only one
// the owner approved: opencode-go/muse-spark-1.3-contributor.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { OpenBotDatabase } from "../src/server/testing/database.js";
import { OpenCodeRunner } from "../src/server/opencode.js";
import { AttachmentService } from "../src/server/attachments.js";
import { DEFAULT_EXECUTION_LIMITS } from "../src/server/execution-policy.js";
import { validToolToken } from "../src/server/tool-auth.js";
import { WorkQueue, proposalFromFlatArgs, queueProposalInput } from "../src/server/queue.js";
import { MailSeen } from "../src/server/queue-grounding.js";
import { morningBriefPrompt } from "../src/server/morning-brief.js";

const liveModel = process.env.OPENBOT_QUEUE_LIVE_MODEL;
assert.ok(!liveModel || liveModel === "opencode-go/muse-spark-1.3-contributor", "Only the owner-approved Muse Spark model may be used for live queue checks.");

const day = new Date(); day.setHours(8, 0, 0, 0);
const mails = [
  { id: "5001", from: "Anna Berg <anna.berg@example.com>", subject: "Berlin trip: does Friday work?", date: day.toISOString(), attachments: [] as { name: string; size: number }[],
    text: "Hi! Does Friday evening work for dinner before the trip? Let me know when you can. Anna" },
  { id: "5002", from: "Energy Co <billing@energyco.example>", subject: "Your October bill is ready", date: day.toISOString(), attachments: [{ name: "invoice-1042.pdf", size: 52_000 }],
    text: "Your bill of 84.20 EUR is due on 9 October 2026. The invoice is attached as invoice-1042.pdf." },
  { id: "5003", from: "Primary School <office@school.example>", subject: "Autumn concert invitation", date: day.toISOString(), attachments: [] as { name: string; size: number }[],
    text: "Families are invited to the autumn concert on Wednesday 14 October 2026 at 18:00 in the school hall. It ends around 19:30." },
  { id: "5004", from: "Deals Weekly <news@deals.example>", subject: "50% off everything this week!", date: day.toISOString(), attachments: [] as { name: string; size: number }[],
    text: "Big sale on all items. Unsubscribe at the bottom of this newsletter." },
];
const summary = (m: (typeof mails)[number]) => ({ id: m.id, subject: m.subject, from: m.from, date: m.date, snippet: m.text.slice(0, 120), attachments: m.attachments, unread: true });

const root = mkdtempSync(path.join(tmpdir(), "sidemates-queue-runtime-"));
const db = new OpenBotDatabase(root);
const internalToken = "disposable-fixture-token";
const mailSeen = new MailSeen();
let executed = 0;
const queue = new WorkQueue(db, () => { executed++; throw new Error("The Mac must never be touched by this check."); });
let currentRunId = "";
const toolCalls: string[] = [];
const rejected: string[] = [];
let observedTools: string[] = [];
const scriptStep = new Map<string, number>();

// The scripted model: read the inbox, make four good cards, try one bad one, finish.
const scripted = [
  { name: "mac_mail_unread", arguments: JSON.stringify({ days: 3, limit: 10 }) },
  { name: "queue_propose", arguments: JSON.stringify({ kind: "reply_draft", title: "Reply to Anna about Friday", why: "Anna asked if Friday evening works.", sourceKey: "mail:5001", to: ["anna.berg@example.com"], subject: "Re: Berlin trip: does Friday work?", body: "Hi Anna, Friday evening works for me. See you then!" }) },
  { name: "queue_propose", arguments: JSON.stringify({ kind: "reminder", title: "Pay the October energy bill", why: "The bill is due on 9 October.", sourceKey: "mail:5002", due: "2026-10-09T09:00:00+03:00" }) },
  { name: "queue_propose", arguments: JSON.stringify({ kind: "file_attachment", title: "File the energy invoice", why: "The bill came with an invoice PDF.", sourceKey: "mail:5002:invoice-1042.pdf", id: "5002", attachment: "invoice-1042.pdf", folder: "Documents/Receipts/2026-10" }) },
  { name: "queue_propose", arguments: JSON.stringify({ kind: "calendar_event", title: "School autumn concert", why: "The school invited families.", sourceKey: "mail:5003", start: "2026-10-14T18:00:00+03:00", end: "2026-10-14T19:30:00+03:00", location: "School hall" }) },
  { name: "queue_propose", arguments: JSON.stringify({ kind: "reply_draft", title: "Reply to the boss", why: "Made up.", sourceKey: "mail:5001", to: ["boss@example.com"], subject: "x", body: "y" }) },
];

const server = createServer(async (request, response) => {
  try {
    let raw = "";
    for await (const chunk of request) { raw += String(chunk); if (raw.length > 1_000_000) throw new Error("Oversized fixture request"); }
    const body = JSON.parse(raw || "{}");
    if (request.url === "/api/internal/tools" && request.method === "POST") {
      assert.ok(validToolToken(internalToken, body.botId, body.runId, request.headers["x-openbot-token"]));
      assert.equal(body.runId, currentRunId);
      toolCalls.push(body.action);
      const send = (status: number, value: unknown) => response.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(value));
      if (body.action === "mac_mail_unread") { mailSeen.remember(body.runId, mails.map(summary)); return send(200, { messages: mails.map(summary), count: mails.length }); }
      if (body.action === "mac_mail_search") { mailSeen.remember(body.runId, mails.map(summary)); return send(200, { messages: mails.map(summary), matched: mails.length }); }
      if (body.action === "mac_mail_read") {
        const mail = mails.find((m) => m.id === String(body.args?.id));
        if (!mail) return send(400, { error: "That email isn't there." });
        mailSeen.remember(body.runId, [summary(mail)]);
        return send(200, { ...summary(mail), text: mail.text, truncated: false });
      }
      if (body.action === "mac_calendar_events") return send(200, { from: day.toISOString(), until: day.toISOString(), events: [], asOf: day.toISOString() });
      if (body.action === "mac_reminders") return send(200, { reminders: [], lists: ["Reminders"] });
      if (body.action === "queue_propose") {
        // The same steps as the real route.
        const card = proposalFromFlatArgs(body.args ?? {});
        const checked = queueProposalInput.safeParse(card);
        if (checked.success) {
          const reason = mailSeen.check(checked.data, body.runId);
          if (reason) { rejected.push(reason); return send(400, { error: reason }); }
        }
        const result = queue.propose(card, { botId: body.botId, runId: body.runId });
        if (!result.ok) { rejected.push(result.message); return send(result.reason === "invalid" ? 400 : 409, { error: result.message }); }
        return send(200, { added: true, id: result.item.id, message: "Added to the owner's Waiting for you list. Nothing has been done yet." });
      }
      return send(400, { error: `${body.action} is not available in this fixture. No real apps exist here.` });
    }
    assert.equal(request.url, "/v1/chat/completions");
    observedTools = (body.tools || []).map((tool: { function?: { name?: string } }) => tool.function?.name || "unknown");
    const step = (scriptStep.get(currentRunId) || 0) + 1;
    scriptStep.set(currentRunId, step);
    const tool = scripted[step - 1] ?? null;
    const delta = tool ? { role: "assistant", tool_calls: [{ index: 0, id: `call_${step}`, type: "function", function: tool }] } : { role: "assistant", content: "I prepared 4 cards: a reply to Anna, a bill reminder, the invoice to file and the school concert. I skipped the newsletter and one proposal that was refused." };
    const chunk = { id: `completion_${step}`, object: "chat.completion.chunk", created: 1, model: body.model };
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.write(`data: ${JSON.stringify({ ...chunk, choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`);
    response.write(`data: ${JSON.stringify({ ...chunk, choices: [{ index: 0, delta: {}, finish_reason: tool ? "tool_calls" : "stop" }], usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 } })}\n\n`);
    response.end("data: [DONE]\n\n");
  } catch (error) { response.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) })); }
});

let runner: OpenCodeRunner | undefined;
try {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  db.updateStudioSettings({ macAccessEnabled: process.platform === "darwin" });
  db.upsertProvider({ id: "queue-fixture", name: "Local fixture", provider: "custom", authMode: "api_key", runtime: "opencode", secret: "fixture-only-key", apiConfig: { baseUrl: `${base}/v1`, protocol: "openai-compatible", modelIds: ["fixture-queue"] } });
  const fixtureHome = path.join(root, "runtime-home"); mkdirSync(fixtureHome);
  runner = new OpenCodeRunner({
    db, internalUrl: base, internalToken, onChange: () => {}, attachments: new AttachmentService(db),
    limits: { ...DEFAULT_EXECUTION_LIMITS, maxActiveMs: 240_000, maxSteps: 25, maxTokens: 60_000, maxJobTokens: 60_000 },
    spawnProcess: (command, args, options) => {
      const env = { ...options.env };
      const config = JSON.parse(String(env.OPENCODE_CONFIG_CONTENT || "{}"));
      if (liveModel) config.enabled_providers = ["opencode", "opencode-go"];
      config.model = db.getBot("nova")!.model; config.small_model = config.model;
      config.share = "disabled"; config.autoupdate = false; config.permission = "allow";
      return spawn(command, args, { ...options, env: { ...env, OPENCODE_CONFIG_CONTENT: JSON.stringify(config), ...(!liveModel ? { HOME: fixtureHome, XDG_CONFIG_HOME: path.join(fixtureHome, "config"), XDG_DATA_HOME: path.join(fixtureHome, "data"), XDG_CACHE_HOME: path.join(fixtureHome, "cache") } : {}), OPENBOT_QUEUE_FIXTURE: "1", OPENCODE_DISABLE_SHARE: "true" } });
    },
  });
  db.updateBot("nova", { providerInstanceId: liveModel ? "local-opencode" : "queue-fixture", model: liveModel || "openbot-queue-fixture/fixture-queue", computerEnabled: false, browserEnabled: false, weeklyTokenBudget: 200_000 });
  const run = db.createRun({ botId: "nova", threadId: "bot-nova", status: "queued", prompt: morningBriefPrompt() });
  currentRunId = run.id;
  const started = Date.now();
  void runner["executeRun"](db.getRun(run.id)!);
  while (Date.now() - started < (liveModel ? 235_000 : 170_000)) {
    await delay(150);
    if (["completed", "failed", "cancelled"].includes(db.getRun(run.id)!.status)) break;
  }
  const finished = db.getRun(run.id)!;
  if (finished.status !== "completed") console.error(JSON.stringify({ diagnostics: { status: finished.status, steps: scriptStep.get(run.id), toolCalls, rejected, observedTools: observedTools.slice(0, 40), executed } }));
  assert.equal(finished.status, "completed", JSON.stringify(finished));
  const cards = db.queueItemsList(["ready", "done", "skipped", "undone", "failed", "expired"], 50).reverse();

  if (process.platform !== "darwin") {
    console.log(JSON.stringify({ result: "SKIPPED", reason: "The Apple-app tools exist only on a Mac, so the model is not offered queue_propose here." }));
  } else {
    if (!liveModel) assert.ok(observedTools.includes("queue_propose"), `The teammate must be offered queue_propose. Offered: ${observedTools.join(", ")}`);
    else assert.ok(toolCalls.includes("queue_propose"), `The model must use queue_propose. Tools it called: ${toolCalls.join(", ") || "none"}`);
    assert.equal(executed, 0, "A proposal must never touch the Mac.");
    assert.ok(cards.every((card) => card.status === "ready"), "Nothing may be approved by a run.");
    const kinds = cards.map((card) => card.kind);
    assert.ok(!cards.some((card) => card.sourceKey.startsWith("mail:5004")), "The newsletter needs no card.");
    for (const card of cards.filter((c) => c.kind === "reply_draft")) assert.deepEqual((card.action as { to: string[] }).to, ["anna.berg@example.com"], "A reply goes only to the sender.");
    for (const card of cards) { assert.ok(card.why.length > 3 && card.preview.length > 3, "Every card says why and what approving does."); }
    if (!liveModel) {
      assert.deepEqual(kinds.sort(), ["calendar_event", "file_attachment", "reminder", "reply_draft"].sort());
      assert.equal(rejected.length, 1, `The made-up recipient must be refused: ${rejected.join(" | ")}`);
      assert.match(rejected[0]!, /only go to the sender/);
      assert.ok(toolCalls.includes("mac_mail_unread") && toolCalls.filter((name) => name === "queue_propose").length === 5);
    } else {
      assert.ok(cards.length >= 2 && cards.length <= 5, `Expected 2 to 5 cards, got ${cards.length}: ${kinds.join(", ")}`);
      assert.ok(kinds.includes("reply_draft") || kinds.includes("reminder"), "At least one useful card (a reply or a reminder).");
    }
    const message = db.listMessages("bot-nova").find((item) => item.runId === run.id);
    console.log(JSON.stringify({ result: "PASS", model: liveModel || "scripted local fixture", elapsedMs: Date.now() - started, cards: cards.length, kinds, refused: rejected.length, macTouched: executed, toolsCalled: toolCalls, steps: finished.modelSteps, inputTokens: finished.inputTokens, outputTokens: finished.outputTokens, answer: (message?.body || "").slice(0, 280) }));
    if (liveModel) for (const card of cards) console.log(JSON.stringify({ card: card.kind, title: card.title, why: card.why, source: card.sourceKey }));
  }
  console.log(liveModel ? "Used only the owner-approved model and synthetic mail. A few runs do not establish model quality." : "No real model, inbox or Mac was used. These scripted replies verify the wiring and the safety checks, not reasoning quality.");
} finally {
  await runner?.stop();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  db.close();
  rmSync(root, { recursive: true, force: true });
}

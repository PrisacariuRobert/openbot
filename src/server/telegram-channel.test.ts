import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { OpenBotDatabase } from "./testing/database.js";

const RUNTIME = `#!${process.execPath}
console.log(JSON.stringify({ type: 'text', text: 'Fixture reply for Telegram.' }));
`;
const TOKEN = "123456789:AAFixtureTokenForTelegramChannelTests00";

/** A fake Telegram Bot API: queued updates for getUpdates, recorded sends. */
function fakeTelegram() {
  const queue: unknown[] = [];
  const forced: unknown[] = []; // delivered once whatever the offset, like a redelivery after a crash
  const sent: Array<{ chat_id: number; text: string }> = [];
  let nextId = 1;
  const server = createHttpServer(async (request, response) => {
    let raw = ""; for await (const chunk of request) raw += chunk;
    const body = raw ? JSON.parse(raw) : {};
    const method = (request.url || "").split("/").at(-1);
    const reply = (result: unknown, ok = true, status = 200) => { response.writeHead(status, { "content-type": "application/json" }); response.end(JSON.stringify(ok ? { ok, result } : { ok, description: String(result) })); };
    if (!(request.url || "").startsWith(`/bot${TOKEN}/`)) return reply("Unauthorized", false, 401);
    if (method === "getMe") return reply({ id: 42, is_bot: true, username: "openbot_fixture_bot" });
    if (method === "sendMessage") { sent.push({ chat_id: body.chat_id, text: body.text }); return reply({ message_id: nextId++ }); }
    if (method === "sendChatAction") return reply(true);
    if (method === "getUpdates") {
      const offset = Number(body.offset || 0);
      for (let waited = 0; waited < 1_000 && !queue.some((update) => (update as { update_id: number }).update_id >= offset); waited += 50) await delay(50);
      const again = forced.splice(0);
      return reply([...again, ...queue.filter((update) => (update as { update_id: number }).update_id >= offset)]);
    }
    reply("Unknown method", false, 404);
  });
  let updateId = 1000;
  const message = (fromId: number, text: string, chat: { id: number; type: string } = { id: fromId, type: "private" }, id = ++updateId) => {
    queue.push({ update_id: id, message: { message_id: id, text, chat, from: { id: fromId, is_bot: false, first_name: fromId === 7 ? "Robert" : "Stranger" } } });
    return id;
  };
  const redeliver = (id: number, fromId: number, text: string) => { forced.push({ update_id: id, message: { message_id: id, text, chat: { id: fromId, type: "private" }, from: { id: fromId, is_bot: false, first_name: "Robert" } } }); };
  return { server, sent, message, redeliver, forcedPending: () => forced.length };
}

async function freePort() {
  const socket = createServer();
  await new Promise<void>((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = (socket.address() as { port: number }).port;
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  return port;
}

async function until<T>(read: () => T | Promise<T>, what: string, ms = 20_000): Promise<T> {
  for (let waited = 0; waited < ms; waited += 100) { const value = await read(); if (value) return value; await delay(100); }
  throw new Error(`Timed out waiting for ${what}`);
}

test("Telegram: owner-only pairing, messages become tasks, replies come back once", { timeout: 120_000 }, async () => {
  const telegram = fakeTelegram();
  await new Promise<void>((resolve) => telegram.server.listen(0, "127.0.0.1", resolve));
  const telegramBase = `http://127.0.0.1:${(telegram.server.address() as { port: number }).port}`;
  const root = mkdtempSync(path.join(tmpdir(), "openbot-telegram-"));
  const db = new OpenBotDatabase(root);
  const bin = path.join(root, "bin"); mkdirSync(bin);
  writeFileSync(path.join(bin, "opencode"), RUNTIME, { mode: 0o700 });
  const [first, second] = db.listBots();
  for (const bot of [first!, second!]) db.updateBot(bot.id, { providerInstanceId: "local-opencode", model: "opencode/fixture", computerEnabled: false });
  const dataDir = db.dataDir;
  db.close();
  const port = await freePort(), base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["--import", "tsx", "src/server/index.ts"], {
    cwd: path.resolve(import.meta.dirname, "../.."), stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, OPENBOT_LOAD_ENV: "0", OPENBOT_OPENCODE_VERSION: "1.18.31", OPENBOT_DATA_DIR: dataDir, OPENBOT_PORT: String(port), OPENBOT_HOST: "127.0.0.1", OPENBOT_APP_URL: base, OPENBOT_DEPLOYMENT_MODE: "local", NODE_ENV: "production", OPENBOT_STAGING: "1", OPENBOT_TELEGRAM_API_BASE: telegramBase },
  });
  const exited = once(child, "exit"); let log = "";
  for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => { log = (log + chunk).slice(-3000); });
  const api = (apiPath: string, init: RequestInit = {}) => fetch(base + apiPath, { ...init, headers: { "content-type": "application/json", ...init.headers } });
  const view = new OpenBotDatabase(root);
  const allRuns = () => [first!, second!].flatMap((bot) => view.listRuns(bot.threadId));
  try {
    await until(async () => { try { return (await fetch(base + "/api/healthz")).ok; } catch { return false; } }, `server start: ${log}`);

    const rejected = await api("/api/channels/telegram", { method: "POST", body: JSON.stringify({ token: "not-a-token-but-long-enough" }) });
    assert.equal(rejected.status, 400);
    const connected = await (await api("/api/channels/telegram", { method: "POST", body: JSON.stringify({ token: TOKEN }) })).json() as { configured: boolean; paired: boolean; pairingCode: string; botUsername: string };
    assert.equal(connected.configured, true);
    assert.equal(connected.paired, false);
    assert.equal(connected.botUsername, "openbot_fixture_bot");
    assert.match(connected.pairingCode, /^\d{6}$/);
    const withLink = await (await api("/api/channels/telegram")).json() as { pairingLink: string; pairingQr: string };
    assert.equal(withLink.pairingLink, `https://t.me/openbot_fixture_bot?start=${connected.pairingCode}`, "one tap opens the bot with the code");
    assert.match(withLink.pairingQr, /^data:image\/png;base64,/);
    const status = await (await api("/api/channels/telegram")).json() as Record<string, unknown>;
    assert.ok(!JSON.stringify(status).includes(TOKEN), "the token never leaves the server");

    // A wrong code and a stranger get silence; the owner's code pairs.
    telegram.message(99, "/start 000000");
    telegram.message(7, `/start ${connected.pairingCode}`);
    await until(() => telegram.sent.some((item) => item.chat_id === 7 && /Connected to OpenBot/.test(item.text)), "pairing confirmation");
    assert.equal((await api("/api/channels/telegram/test", { method: "POST" })).status, 200);
    await until(() => telegram.sent.some((item) => item.chat_id === 7 && /OpenBot is connected/.test(item.text)), "test message");
    assert.equal(telegram.sent.filter((item) => item.chat_id === 99).length, 0);
    assert.equal(((await (await api("/api/channels/telegram")).json()) as { paired: boolean }).paired, true);

    // After pairing, strangers and group chats are ignored.
    telegram.message(99, "hi from a stranger");
    telegram.message(7, "hi from a group", { id: -500, type: "group" });
    // The owner's message becomes a task with the default teammate; the reply comes back.
    const ownerUpdate = telegram.message(7, "Summarize my week please");
    await until(() => telegram.sent.some((item) => item.chat_id === 7 && item.text === "Fixture reply for Telegram."), "reply delivered to Telegram");
    const runs = () => allRuns().filter((run) => run.prompt.includes("Summarize my week please"));
    assert.equal(runs().length, 1);
    assert.equal(runs()[0]!.botId, first!.id);
    assert.equal(allRuns().some((run) => /stranger|group/.test(run.prompt)), false, "no task from strangers or groups");

    // A redelivered update (same update_id) never starts a second task.
    const repliesBefore = telegram.sent.filter((item) => item.text === "Fixture reply for Telegram.").length;
    telegram.redeliver(ownerUpdate, 7, "Summarize my week please");
    await until(() => telegram.forcedPending() === 0, "redelivered update consumed");
    await delay(4_000);
    assert.equal(runs().length, 1, "the replayed update reuses the original task");
    assert.equal(telegram.sent.filter((item) => item.text === "Fixture reply for Telegram.").length, repliesBefore, "and sends no second reply");

    // @Name routes to another teammate.
    telegram.message(7, `@${second!.name} check the invoices`);
    const routed = (await until(() => allRuns().find((run) => run.prompt.includes("check the invoices")), "routed run"))!;
    assert.equal(routed.botId, second!.id);
    assert.equal(routed.prompt.startsWith("@"), false, "the mention is not part of the request");
    await until(() => telegram.sent.filter((item) => item.text === "Fixture reply for Telegram.").length >= 2, "second reply");
    await delay(4_000);
    assert.equal(telegram.sent.filter((item) => item.text === "Fixture reply for Telegram.").length, 2, "each reply is sent once");

    const disconnected = await (await api("/api/channels/telegram", { method: "DELETE" })).json() as { configured: boolean };
    assert.equal(disconnected.configured, false);
  } finally {
    view.close();
    child.kill("SIGTERM");
    await Promise.race([exited, delay(5_000)]);
    telegram.server.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("Telegram: an approval is a notice with a link to the review, sent once; the final reply follows", async () => {
  const { TelegramChannel } = await import("./telegram-channel.js");
  const root = mkdtempSync(path.join(tmpdir(), "openbot-telegram-notice-"));
  const db = new OpenBotDatabase(root);
  const sent: Array<{ chat_id: number; text: string }> = [];
  const fetchImpl = (async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || "{}"));
    if (String(_url).endsWith("/sendMessage")) sent.push({ chat_id: body.chat_id, text: body.text });
    return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const channel = new TelegramChannel({ db, appUrl: "http://studio.local", isLeader: () => true, localApi: async () => ({ status: 500, body: {} }), fetchImpl });
    const bot = db.listBots()[0]!;
    const run = db.createRun({ threadId: bot.threadId, botId: bot.id, prompt: "Email the report", status: "running" });
    db.saveExtensionRecord("channel", "telegram", { token: TOKEN, botUsername: "fixture", ownerUserId: 7, ownerChatId: 7 });
    db.saveExtensionRecord("channel", "telegram-runs", [{ runId: run.id, chatId: 7, notifiedApprovalIds: [] }]);
    db.createApproval({ runId: run.id, botId: bot.id, kind: "external", reason: "Review the email.", actionLabel: "Send email to anna@example.com", action: { type: "gmail_send", botId: bot.id, args: {} } });
    await channel.deliver();
    await channel.deliver();
    assert.equal(sent.length, 1, "one notice per approval");
    assert.match(sent[0]!.text, /needs your okay: Send email to anna@example\.com/);
    assert.match(sent[0]!.text, new RegExp(`http://studio\\.local/\\?thread=${encodeURIComponent(bot.threadId)}`));
    assert.equal(db.getApproval(db.getRun(run.id)!.approvalId!)!.status, "pending", "a notice never decides the approval");

    db.addMessage({ threadId: bot.threadId, senderType: "bot", senderId: bot.id, runId: run.id, kind: "text", body: "I drafted it. Nothing has been sent." });
    db.updateRun(run.id, { status: "completed", finishedAt: new Date().toISOString() });
    await channel.deliver();
    assert.equal(sent.at(-1)!.text, "I drafted it. Nothing has been sent.");
    await channel.deliver();
    assert.equal(sent.length, 2, "the finished task is no longer tracked");
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

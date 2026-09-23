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
import { WebSocketServer, type WebSocket } from "ws";
import { OpenBotDatabase } from "./testing/database.js";

const RUNTIME = `#!${process.execPath}
console.log(JSON.stringify({ type: 'text', text: 'Fixture reply for Discord.' }));
`;
const TOKEN = "MTIzNDU2Nzg5MDEyMzQ1Njc4OQ.GaBcDe.fixture-token-value-for-discord-tests-0000";

/** A fake Discord: REST for identity and sends, a gateway that accepts the
 * identify and lets the test push MESSAGE_CREATE events. */
async function fakeDiscord() {
  const sent: Array<{ channel: string; content: string }> = [];
  let identified: { token?: string; intents?: number } | null = null;
  const sockets = new Set<WebSocket>();
  let sequence = 0;
  const rest = createHttpServer(async (request, response) => {
    let raw = ""; for await (const chunk of request) raw += chunk;
    const json = (value: unknown, status = 200) => { response.writeHead(status, { "content-type": "application/json" }); response.end(JSON.stringify(value)); };
    if (request.headers.authorization !== `Bot ${TOKEN}`) return json({ message: "401: Unauthorized" }, 401);
    if (request.url === "/users/@me") return json({ id: "900", username: "openbot_fixture", bot: true });
    const post = /^\/channels\/(\d+)\/messages$/.exec(request.url || "");
    if (post) { sent.push({ channel: post[1]!, content: JSON.parse(raw).content }); return json({ id: String(Date.now()) }); }
    if (/^\/channels\/\d+\/typing$/.test(request.url || "")) { response.writeHead(204); response.end(); return; }
    json({ message: "Not found" }, 404);
  });
  await new Promise<void>((resolve) => rest.listen(0, "127.0.0.1", resolve));
  const gateway = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  gateway.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.send(JSON.stringify({ op: 10, d: { heartbeat_interval: 30_000 } }));
    socket.on("message", (raw) => {
      const frame = JSON.parse(String(raw));
      if (frame.op === 2) { identified = frame.d; socket.send(JSON.stringify({ op: 0, s: ++sequence, t: "READY", d: { user: { id: "900" } } })); }
    });
  });
  await once(gateway, "listening");
  let messageId = 5000;
  const message = (authorId: string, content: string, options: { channel?: string; guild?: string; id?: number } = {}) => {
    const id = options.id ?? ++messageId;
    const frame = JSON.stringify({ op: 0, s: ++sequence, t: "MESSAGE_CREATE", d: { id: String(id), channel_id: options.channel ?? `dm-${authorId}`.replace("dm-", "7"), ...(options.guild ? { guild_id: options.guild } : {}), content, author: { id: authorId, username: authorId === "42" ? "robert" : "stranger" } } });
    for (const socket of sockets) socket.send(frame);
    return id;
  };
  return {
    sent, message, identified: () => identified, connected: () => sockets.size > 0,
    restBase: `http://127.0.0.1:${(rest.address() as { port: number }).port}`,
    gatewayUrl: `ws://127.0.0.1:${(gateway.address() as { port: number }).port}`,
    close: () => { for (const socket of sockets) socket.terminate(); gateway.close(); rest.close(); },
  };
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

test("Discord: owner-only DM pairing, DMs become tasks, servers and strangers are ignored", { timeout: 120_000 }, async () => {
  const discord = await fakeDiscord();
  const root = mkdtempSync(path.join(tmpdir(), "openbot-discord-"));
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
    env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, OPENBOT_LOAD_ENV: "0", OPENBOT_OPENCODE_VERSION: "1.18.31", OPENBOT_DATA_DIR: dataDir, OPENBOT_PORT: String(port), OPENBOT_HOST: "127.0.0.1", OPENBOT_APP_URL: base, OPENBOT_DEPLOYMENT_MODE: "local", NODE_ENV: "production", OPENBOT_STAGING: "1", OPENBOT_DISCORD_API_BASE: discord.restBase, OPENBOT_DISCORD_GATEWAY: discord.gatewayUrl },
  });
  const exited = once(child, "exit"); let log = "";
  for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => { log = (log + chunk).slice(-3000); });
  const api = (apiPath: string, init: RequestInit = {}) => fetch(base + apiPath, { ...init, headers: { "content-type": "application/json", ...init.headers } });
  const view = new OpenBotDatabase(root);
  const allRuns = () => [first!, second!].flatMap((bot) => view.listRuns(bot.threadId));
  try {
    await until(async () => { try { return (await fetch(base + "/api/healthz")).ok; } catch { return false; } }, `server start: ${log}`);
    assert.equal((await api("/api/channels/discord", { method: "POST", body: JSON.stringify({ token: "x".repeat(60) }) })).status, 400);
    const connected = await (await api("/api/channels/discord", { method: "POST", body: JSON.stringify({ token: TOKEN }) })).json() as { configured: boolean; paired: boolean; pairingCode: string };
    assert.equal(connected.configured, true);
    assert.match(connected.pairingCode, /^\d{6}$/);
    await until(() => discord.identified(), "gateway identify");
    assert.equal(discord.identified()!.intents, 1 << 12, "direct messages only");
    assert.ok(!JSON.stringify(await (await api("/api/channels/discord")).json()).includes(TOKEN), "the token never leaves the server");
    await until(async () => ((await (await api("/api/channels/discord")).json()) as { connected: boolean }).connected, "gateway ready");

    discord.message("13", "pair 000000");
    discord.message("42", `pair ${connected.pairingCode}`, { guild: "777" }); // a server channel cannot pair
    await delay(1_000);
    assert.equal(discord.sent.length, 0);
    discord.message("42", `pair ${connected.pairingCode}`);
    await until(() => discord.sent.some((item) => item.channel === "742" && /Connected to OpenBot/.test(item.content)), "pairing confirmation");

    discord.message("13", "hi from a stranger");
    discord.message("42", "hi from a server", { guild: "777", channel: "555" });
    const ownerMessage = discord.message("42", "Summarize my week please");
    await until(() => discord.sent.some((item) => item.channel === "742" && item.content === "Fixture reply for Discord."), "reply delivered");
    const runs = () => allRuns().filter((run) => run.prompt.includes("Summarize my week please"));
    assert.equal(runs().length, 1);
    assert.equal(runs()[0]!.botId, first!.id);
    assert.equal(allRuns().some((run) => /stranger|server/.test(run.prompt)), false);

    const repliesBefore = discord.sent.filter((item) => item.content === "Fixture reply for Discord.").length;
    discord.message("42", "Summarize my week please", { id: ownerMessage });
    await delay(4_000);
    assert.equal(runs().length, 1, "a replayed event reuses its task");
    assert.equal(discord.sent.filter((item) => item.content === "Fixture reply for Discord.").length, repliesBefore);

    discord.message("42", `@${second!.name} check the invoices`);
    const routed = (await until(() => allRuns().find((run) => run.prompt.includes("check the invoices")), "routed run"))!;
    assert.equal(routed.botId, second!.id);
    assert.equal(((await (await api("/api/channels/discord", { method: "DELETE" })).json()) as { configured: boolean }).configured, false);
  } finally {
    view.close();
    child.kill("SIGTERM");
    await Promise.race([exited, delay(5_000)]);
    discord.close();
    rmSync(root, { recursive: true, force: true });
  }
});

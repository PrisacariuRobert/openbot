import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { OpenBotDatabase } from "./testing/database.js";

// A Claude Code stand-in: signed in, and a reply that streams in chunks.
const CLAUDE = `#!${process.execPath}
const args = process.argv.slice(2);
if (args[0] === "--version") { console.log("2.1.226 (Claude Code)"); process.exit(0); }
if (args[0] === "auth") { console.log(JSON.stringify({ loggedIn: true, authMethod: "claude.ai" })); process.exit(0); }
if (!args.includes("--include-partial-messages")) { console.log(JSON.stringify({ type: "result", subtype: "success", result: "No partial messages were requested." })); process.exit(0); }
const say = (event) => console.log(JSON.stringify(event));
const chunks = ["Morning walks ", "clear the head, ", "wake the body, ", "and make the first hour yours."];
(async () => {
  say({ type: "system", subtype: "init", session_id: "ses-fixture" });
  say({ type: "stream_event", event: { type: "message_start", message: { id: "msg-1" } } });
  say({ type: "stream_event", event: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } } });
  for (const text of chunks) { await new Promise((r) => setTimeout(r, 400)); say({ type: "stream_event", event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } } }); }
  await new Promise((r) => setTimeout(r, 400));
  const full = chunks.join("");
  say({ type: "assistant", message: { id: "msg-1", content: [{ type: "text", text: full }] } });
  say({ type: "result", subtype: "success", result: full, usage: { input_tokens: 10, output_tokens: 20 } });
})();
`;

async function freePort() {
  const socket = createServer();
  await new Promise<void>((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = (socket.address() as { port: number }).port;
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  return port;
}

test("Claude Code replies stream into the live preview before the finished answer", { timeout: 90_000 }, async () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-claude-live-"));
  const db = new OpenBotDatabase(root);
  const bin = path.join(root, "bin"); mkdirSync(bin);
  writeFileSync(path.join(bin, "claude"), CLAUDE, { mode: 0o700 });
  const dataDir = db.dataDir;
  db.close();
  const port = await freePort(), base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["--import", "tsx", "src/server/index.ts"], {
    cwd: path.resolve(import.meta.dirname, "../.."), stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, OPENBOT_LOAD_ENV: "0", OPENBOT_DATA_DIR: dataDir, OPENBOT_PORT: String(port), OPENBOT_HOST: "127.0.0.1", OPENBOT_APP_URL: base, OPENBOT_DEPLOYMENT_MODE: "local", NODE_ENV: "production" },
  });
  const exited = once(child, "exit"); let log = "";
  for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => { log = (log + chunk).slice(-3000); });
  const view = new OpenBotDatabase(root);
  try {
    for (let i = 0; i < 200; i++) { try { if ((await fetch(base + "/api/healthz")).ok) break; } catch { /* starting */ } await delay(100); }
    // Provider discovery registers the signed-in Claude connection.
    const status = await (await fetch(base + "/api/provider")).json() as { instances: Array<{ id: string; connected: boolean }> };
    assert.ok(status.instances.some((item) => item.id === "local-claude" && item.connected), `Claude connection: ${log}`);
    const bot = view.listBots()[0]!;
    view.updateBot(bot.id, { providerInstanceId: "local-claude", model: "claude-code/sonnet", computerEnabled: false });
    const sent = await fetch(base + "/api/messages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ threadId: bot.threadId, body: "Why do morning walks help?", targetBotIds: [bot.id], requestId: "claude-live-reply-1" }) });
    assert.equal(sent.status, 202, await sent.clone().text());
    const runId = ((await sent.json()) as { runs: Array<{ id: string }> }).runs[0]!.id;
    // Live text arrives as small "live" events on the studio stream.
    const seen: string[] = [];
    const stream = new AbortController();
    const events = await fetch(base + "/api/events", { signal: stream.signal });
    void (async () => {
      const decoder = new TextDecoder(); let buffer = "";
      try {
        for await (const chunk of events.body!) {
          buffer += decoder.decode(chunk as Uint8Array, { stream: true });
          const lines = buffer.split("\n"); buffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const event = JSON.parse(line.slice(6)) as { type?: string; runId?: string; text?: string };
            if (event.type === "live" && event.runId === runId && event.text && event.text !== seen.at(-1)) seen.push(event.text);
          }
        }
      } catch { /* stream closed */ }
    })();
    for (let i = 0; i < 300; i++) { if (view.getRun(runId)!.status === "completed") break; await delay(50); }
    stream.abort();
    const run = view.getRun(runId)!;
    assert.equal(run.status, "completed", `${run.error} ${log}`);
    assert.ok(seen.length >= 2, `live text grew in steps while running: ${JSON.stringify(seen)}`);
    assert.ok(seen.every((text, index) => index === 0 || text.length > seen[index - 1]!.length), "each update extends the last");
    assert.ok(seen[0]!.startsWith("Morning walks"));
    // The reply is saved just after the task is marked completed.
    let reply: ReturnType<typeof view.listMessages>[number] | undefined;
    for (let i = 0; i < 100 && !reply; i++) { reply = view.listMessages(bot.threadId).filter((message) => message.runId === runId && message.senderType === "bot").at(-1); if (!reply) await delay(50); }
    assert.equal(reply?.body, "Morning walks clear the head, wake the body, and make the first hour yours.");
  } finally {
    view.close();
    child.kill("SIGTERM");
    await Promise.race([exited, delay(5_000)]);
    rmSync(root, { recursive: true, force: true });
  }
});

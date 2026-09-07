// Real host routes + Chromium against an invented account. No real account,
// provider/model call, personal browser profile or external write is involved.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { createServer as createSocket } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { OpenBotDatabase } from "../src/server/database";
import { BrowserSignIns } from "../src/server/browser-sign-in";

const root = mkdtempSync(path.join(tmpdir(), "openbot-sign-in-host-"));
const dataDir = path.join(root, "data"), db = new OpenBotDatabase(root, { dataDir });
let logins = 0, sends = 0;
const privateValue = "fixture-secret-not-for-chat-9157";
const site = createServer((req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.url?.startsWith("/send")) { sends++; res.end("Must never happen"); return; }
  if (req.method === "POST" && req.url === "/login") {
    let body = "";
    req.on("data", (chunk) => { body += String(chunk); });
    req.on("end", () => {
      assert.equal(new URLSearchParams(body).get("password"), privateValue);
      logins++;
      res.writeHead(303, { "set-cookie": "fixture-owner=1; HttpOnly; Path=/; Max-Age=600; SameSite=Lax", location: "/tickets" }); res.end();
    }); return;
  }
  res.setHeader("content-type", "text/html");
  res.end(req.headers.cookie?.includes("fixture-owner=1")
    ? '<h1>Signed in as Fixture Owner</h1><p>Ticket 17: invoice export needs a fix.</p><form action="/send" method="post"><button>Send</button></form>'
    : '<h1>Sign in to Example Support</h1><form method="post" action="/login"><input aria-label="Password" name="password" type="password" style="position:fixed;left:20px;top:90px;width:240px;height:40px"><button style="position:fixed;left:20px;top:160px;width:150px;height:40px">Sign in</button></form>');
});
await new Promise<void>((resolve) => site.listen(0, "127.0.0.1", resolve));
const siteURL = `http://127.0.0.1:${(site.address() as { port: number }).port}`;
const bot = db.createBot({ name: "Handoff fixture", role: "Support", instructions: "Fixture only", color: "#888888", emoji: "●", browserEnabled: true, computerEnabled: false });
const run = db.createRun({ botId: bot.id, threadId: bot.threadId, prompt: "Read ticket 17 and save a local reply. Do not send it.", status: "running" });
const approval = new BrowserSignIns(db).request(bot.id, run.id, `${siteURL}/login?code=PRIVATE_CALLBACK`);
const socket = createSocket();
await new Promise<void>((resolve) => socket.listen(0, "127.0.0.1", resolve));
const port = (socket.address() as { port: number }).port;
await new Promise<void>((resolve) => socket.close(() => resolve()));
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ["--import", "tsx", "src/server/index.ts"], { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"],
  env: { PATH: process.env.PATH, LANG: "en_US.UTF-8", TZ: "UTC", OPENBOT_LOAD_ENV: "0", OPENBOT_DATA_DIR: dataDir, OPENBOT_PORT: String(port), OPENBOT_HOST: "127.0.0.1", OPENBOT_APP_URL: base, OPENBOT_DEPLOYMENT_MODE: "local", NODE_ENV: "test" } });
const closed = once(child, "close");
let output = "";
child.stdout.on("data", (chunk) => { output = (output + String(chunk)).slice(-8000); });
child.stderr.on("data", (chunk) => { output = (output + String(chunk)).slice(-8000); });
const post = (route: string, data: unknown) => fetch(`${base}${route}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
const control = async (data: unknown) => {
  const result = await post(`/api/approvals/${approval.id}/sign-in`, data);
  assert.equal(result.status, 200, await result.clone().text());
  assert.match(result.headers.get("cache-control") || "", /no-store/);
  return await result.json() as { siteOrigin: string; screenshot: string };
};
try {
  for (let attempt = 0; ; attempt++) {
    if (await fetch(`${base}/api/healthz`, { signal: AbortSignal.timeout(500) }).then((r) => r.ok).catch(() => false)) break;
    if (attempt > 150 || child.exitCode !== null) throw new Error(`Fixture host did not start: ${output}`);
    await delay(100);
  }
  assert.equal((await post(`/api/bots/${bot.id}/browser/open`, { url: `${siteURL}/login` })).status, 200);
  const first = await control({ operation: "view" });
  assert.equal(first.siteOrigin, siteURL); assert.match(first.screenshot, /^data:image\/jpeg/);
  const preview = await fetch(`${base}/api/approvals/${approval.id}/preview`).then((r) => r.json());
  assert.equal(preview.canApprove, true); assert.equal(preview.browserSignIn.botId, bot.id);
  assert.doesNotMatch(JSON.stringify(preview), /PRIVATE_CALLBACK|Connected account/);
  assert.equal((await post(`/api/approvals/${approval.id}/decide`, { decision: "approved" })).status, 409);
  await control({ operation: "click", x: 80, y: 110 });
  await control({ operation: "type", value: privateValue, replace: true });
  await control({ operation: "click", x: 80, y: 180 });
  const signed = await fetch(`${base}/api/bots/${bot.id}/browser/snapshot`).then((r) => r.json());
  assert.match(signed.text, /Signed in as Fixture Owner/); assert.match(signed.text, /Ticket 17/);
  assert.equal(logins, 1); assert.equal(sends, 0);
  const decided = await post(`/api/approvals/${approval.id}/decide`, { decision: "approved", reviewFingerprint: preview.reviewFingerprint });
  assert.equal(decided.status, 200); assert.equal((await decided.json()).status, "approved");
  assert.match(db.getRun(run.id)!.prompt, /Read ticket 17/);
  assert.match(db.getRun(run.id)!.prompt, /NOT proof of authentication/);
  await post(`/api/runs/${run.id}/cancel`, {}); // No provider/model was configured; do not leave runnable fixture work.
  assert.equal((await post(`/api/approvals/${approval.id}/sign-in`, { operation: "type", value: privateValue })).status, 409);
  assert.equal((await post(`/api/approvals/${approval.id}/decide`, { decision: "approved", reviewFingerprint: preview.reviewFingerprint })).status, 409);
  assert.doesNotMatch(JSON.stringify([db.listMessages(bot.threadId), db.getApprovalAction(approval.id), db.getRun(run.id), output]), /fixture-secret-not-for-chat|PRIVATE_CALLBACK/);
  assert.equal(sends, 0);
  console.log("PASS: actual host owner handoff, private Chromium login, cookie-backed account readback, review-bound continuation, preserved request, stale-control rejection, no secrets in chat/actions/logs, and zero external sends. Simulated account only.");
} finally {
  child.kill("SIGTERM"); await closed;
  await new Promise<void>((resolve) => site.close(() => resolve()));
  db.close(); rmSync(root, { recursive: true, force: true });
}

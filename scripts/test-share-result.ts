// Task R5 in the shipped web UI: sharing a finished result offers "Make this
// teammate" (the teammate as a link inside the page) and link-preview tags, and the
// owner can leave the button out. A disposable host with a seeded, finished result.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";
import { OpenBotDatabase } from "../src/server/testing/database.js";

const root = mkdtempSync(path.join(tmpdir(), "openbot-share-result-"));
const home = path.join(root, "home");
mkdirSync(home, { recursive: true });
const seed = new OpenBotDatabase(root);
const nova = seed.getBot("nova")!;
const ask = seed.addMessage({ threadId: nova.threadId, senderType: "user", senderId: null, body: "Which three restaurants near the office are open on Sunday?" });
const run = seed.createRun({ threadId: nova.threadId, botId: nova.id, prompt: ask.body, status: "running", triggerMessageId: ask.id });
seed.addMessage({ threadId: nova.threadId, senderType: "bot", senderId: nova.id, runId: run.id, body: "Three are open on Sunday:\n\n- Casa Verde, 12:00–22:00\n- Nori, 11:30–21:00\n- Le Coin, 18:00–23:00" });
seed.updateRun(run.id, { status: "completed", finishedAt: new Date().toISOString() });
const dataDir = seed.dataDir, threadId = nova.threadId;
seed.close();

const socket = createServer();
await new Promise<void>((resolve) => socket.listen(0, "127.0.0.1", resolve));
const port = (socket.address() as { port: number }).port;
await new Promise<void>((resolve) => socket.close(() => resolve()));
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ["--import", "tsx", "src/server/index.ts"], {
  cwd: path.resolve(import.meta.dirname, ".."), stdio: "ignore",
  env: { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR, HOME: home, OPENBOT_LOAD_ENV: "0", OPENBOT_DATA_DIR: dataDir, OPENBOT_PORT: String(port), OPENBOT_HOST: "127.0.0.1", OPENBOT_APP_URL: base, OPENBOT_DEPLOYMENT_MODE: "local", NODE_ENV: "production" },
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  let ready = false;
  for (let n = 0; n < 100 && !ready; n++) { try { ready = (await fetch(base + "/api/healthz")).ok; } catch { await delay(150); } }
  assert.ok(ready, "Disposable host did not start");
  browser = await chromium.launch({ executablePath: process.env.OPENBOT_CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark" });
  const outside: string[] = [], errors: string[] = [];
  await context.route("**/*", (route) => { const url = new URL(route.request().url()); if (url.origin !== base) { outside.push(url.href); return route.abort("blockedbyclient"); } return route.continue(); });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}/?thread=${threadId}`);
  await page.getByText("Casa Verde, 12:00–22:00").waitFor();
  await page.getByRole("button", { name: "Share this result" }).last().click();
  const sheet = page.getByRole("dialog", { name: "Share this result" });
  const preview = sheet.frameLocator("iframe.share-preview");
  await preview.getByText("Make this teammate").waitFor();
  const href = await preview.getByRole("link", { name: "Make this teammate" }).getAttribute("href");
  assert.match(href || "", /^https:\/\/sidemates\.app\/t\/#1\.[A-Za-z0-9_-]+$/);
  const checkbox = sheet.getByRole("checkbox", { name: /Make this teammate/ });
  assert.equal(await checkbox.isChecked(), true);
  await sheet.screenshot({ path: "/tmp/openbot-share-result-dark-390.png" });
  await checkbox.focus();
  await page.keyboard.press("Space");
  await preview.getByText("Casa Verde, 12:00–22:00").waitFor();
  assert.equal(await preview.getByText("Make this teammate").count(), 0, "left out when unticked");
  const shared = await (await fetch(`${base}/api/messages/${encodeURIComponent((await (await fetch(`${base}/api/state?threadId=${threadId}`)).json() as { messages: Array<{ id: string; senderType: string }> }).messages.filter((message) => message.senderType === "bot").at(-1)!.id)}/share-page`)).json() as { html: string; hasTeammate: boolean };
  assert.equal(shared.hasTeammate, true);
  assert.match(shared.html, /<meta property="og:image" content="https:\/\/sidemates\.app\/og\/nova\.png" \/>/);
  assert.deepEqual(outside, [], "nothing was sent anywhere");
  assert.deepEqual(errors, []);
  console.log("PASS: a finished result's page offers Make this teammate (a sidemates.app/t/ link) with preview tags; unticking it by keyboard leaves it out; 390 px dark; nothing sent.");
} finally {
  await browser?.close();
  child.kill("SIGTERM");
  for (let n = 0; n < 40 && child.exitCode === null; n++) await delay(100);
  rmSync(root, { recursive: true, force: true });
}

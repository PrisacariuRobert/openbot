// Task J6 through the shipped web UI on a disposable host: a task stopped by the
// AI's usage limit offers "Choose another AI"; a Mac tool refused because Files &
// apps is off leaves one note whose button turns it on; a task the AI couldn't
// answer offers "Try again", which sends the same request once. Checked at 1280
// and 390 px, light and dark, by keyboard. No model job: the retry is answered
// by the test, and the stops are seeded in a temporary data folder.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";
import { noteToolFailure } from "../src/server/failure-notes.js";
import { OpenBotDatabase } from "../src/server/testing/database.js";

const data = mkdtempSync(path.join(tmpdir(), "openbot-failure-fixes-"));
const runtimeHome = path.join(data, "runtime-home");
mkdirSync(runtimeHome, { recursive: true });
const output = "/tmp/openbot-failure-fixes-qa";
mkdirSync(output, { recursive: true });

// Three requests to one teammate, each ending the way J6 is about.
const seed = new OpenBotDatabase(data);
seed.updateStudioSettings({ macAccessEnabled: false });
const nova = seed.getBot("nova")!;
const ask = (body: string) => seed.addMessage({ threadId: nova.threadId, senderType: "user", senderId: null, body });
const stop = (body: string, error: string) => {
  const run = seed.createRun({ threadId: nova.threadId, botId: nova.id, prompt: body, status: "running", triggerMessageId: ask(body).id });
  seed.updateRun(run.id, { status: "failed", finishedAt: new Date().toISOString(), error });
  seed.finishRunTask(run.id, "failed", error);
};
stop("Plan my week", "Your AI provider reached a usage or rate limit. Your progress is saved. Wait for its allowance to reset or choose another connected model in Settings.");
const lease = seed.createRun({ threadId: nova.threadId, botId: nova.id, prompt: "Find my lease", status: "running", triggerMessageId: ask("Find my lease").id });
noteToolFailure(seed, { runId: lease.id, botId: nova.id }, "Files & apps on this Mac is turned off for the studio. The owner can turn it on in Permissions.");
seed.addMessage({ threadId: nova.threadId, senderType: "bot", senderId: nova.id, runId: lease.id, body: "I couldn't look: Files & apps on this Mac is off for the studio." });
seed.updateRun(lease.id, { status: "completed", finishedAt: new Date().toISOString() });
stop("Summarize today's headlines", "Your AI provider is temporarily unavailable. Your progress is saved. Try again later or choose another connected model.");
const threadId = nova.threadId, dataDir = seed.dataDir;
seed.close();

const socket = createServer();
await new Promise<void>((resolve) => socket.listen(0, "127.0.0.1", resolve));
const port = (socket.address() as { port: number }).port;
await new Promise<void>((resolve) => socket.close(() => resolve()));
const base = "http://127.0.0.1:" + port;
const child = spawn(process.execPath, ["--import", "tsx", "src/server/index.ts"], {
  cwd: path.resolve(import.meta.dirname, ".."), stdio: "ignore",
  env: {
    PATH: process.env.PATH, LANG: process.env.LANG || "en_US.UTF-8", TMPDIR: process.env.TMPDIR,
    HOME: runtimeHome, XDG_CONFIG_HOME: path.join(runtimeHome, ".config"), XDG_DATA_HOME: path.join(runtimeHome, ".local/share"), XDG_CACHE_HOME: path.join(runtimeHome, ".cache"),
    OPENBOT_LOAD_ENV: "0", OPENBOT_DATA_DIR: dataDir, OPENBOT_PORT: String(port), OPENBOT_HOST: "127.0.0.1", OPENBOT_APP_URL: base, OPENBOT_DEPLOYMENT_MODE: "local", NODE_ENV: "production",
  },
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  let ready = false;
  for (let n = 0; n < 100 && !ready; n++) { try { ready = (await fetch(base + "/api/healthz")).ok; } catch { await delay(150); } }
  assert.ok(ready, "Disposable host did not start");

  browser = await chromium.launch({ executablePath: process.env.OPENBOT_CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const unexpected: string[] = [], errors: string[] = [], retries: Array<Record<string, unknown>> = [];
  const allowed = new Set(["PATCH /api/settings", "PUT /api/drafts", "POST /api/setup/visit"]);
  context.on("page", (page) => page.on("pageerror", (error) => errors.push(error.message)));
  await context.route("**/*", async (route) => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== base) { unexpected.push("External request blocked: " + url.origin); return route.abort("blockedbyclient"); }
    const write = `${request.method()} ${url.pathname}`;
    // "Try again" goes through the normal send path; the test answers it so no model runs.
    if (write === "POST /api/messages") { retries.push(request.postDataJSON() as Record<string, unknown>); return route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ runs: [] }) }); }
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method()) && !allowed.has(write) && !/^PUT \/api\/threads\/[^/]+\/read$/.test(write)) { unexpected.push(write); return route.abort("blockedbyclient"); }
    return route.continue();
  });
  const page = await context.newPage();
  await page.goto(`${base}/?thread=${threadId}`);

  // The provider limit: what's missing, and the page that fixes it.
  const limit = page.locator('[data-event="run_stopped"]').filter({ hasText: "Provider limit reached" });
  await limit.waitFor();
  await limit.getByRole("button", { name: "Review saved progress" }).waitFor();
  await page.screenshot({ path: path.join(output, "1-light-1280.png") });
  await limit.getByRole("button", { name: "Choose another AI" }).click();
  await page.waitForURL(/panel=provider/);
  await page.getByRole("heading", { name: "Your AI" }).first().waitFor();
  await page.goto(`${base}/?thread=${threadId}`);

  // Files & apps off: one note, one button (the reply's own offer stays hidden), and the click turns it on.
  const note = page.locator('[data-event="needs_fix"]');
  await note.waitFor();
  assert.match(await note.innerText(), /Files & apps is off/);
  assert.match(await note.innerText(), /turned off for the studio\./);
  assert.equal(await page.getByRole("button", { name: /Turn on Files & apps/ }).count(), 1, "one button for one fix");
  await note.getByRole("button", { name: "Turn on Files & apps" }).click();
  await note.getByText("Files & apps is on now").waitFor();
  assert.equal(((await (await fetch(base + "/api/state")).json()) as { settings: { macAccessEnabled: boolean } }).settings.macAccessEnabled, true);

  // The AI didn't answer: "Try again" sends the same request once, by keyboard.
  const unavailable = page.locator('[data-event="run_stopped"]').filter({ hasText: "temporarily unavailable" });
  const again = unavailable.getByRole("button", { name: "Try again" });
  assert.equal(await page.getByRole("button", { name: "Try again" }).count(), 1, "only the latest stopped task can be sent again");
  await unavailable.getByRole("button", { name: "Review saved progress" }).focus();
  await page.keyboard.press("Tab");
  assert.equal(await again.evaluate((element) => element === document.activeElement && element.matches(":focus-visible")), true, "the button shows keyboard focus");
  await page.keyboard.press("Enter");
  await unavailable.getByText("Asked again.").waitFor();
  assert.equal(retries.length, 1);
  assert.equal(retries[0]!.body, "Summarize today's headlines");
  assert.deepEqual(retries[0]!.targetBotIds, [nova.id]);
  assert.match(String(retries[0]!.requestId), /^retry-/);

  // Small screens and dark mode.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await page.locator('[data-event="run_stopped"]').first().waitFor();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 0, `no sideways scroll at 390 px (${overflow}px)`);
  await page.screenshot({ path: path.join(output, "2-dark-390.png"), fullPage: false });

  assert.deepEqual(unexpected, []);
  assert.deepEqual(errors, []);
  console.log("PASS: provider limit → Choose another AI opens Your AI; Files & apps off → one note, one click turns it on; AI unavailable → Try again sends the same request once, by keyboard; 390 px dark without sideways scroll.");
} finally {
  await browser?.close();
  child.kill("SIGTERM");
  for (let n = 0; n < 40 && child.exitCode === null && child.signalCode === null; n++) await delay(100);
  if (child.exitCode === null && child.signalCode === null) { child.kill("SIGKILL"); await new Promise<void>((resolve) => child.once("close", resolve)); }
  rmSync(data, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); // the server may still be closing its files
}

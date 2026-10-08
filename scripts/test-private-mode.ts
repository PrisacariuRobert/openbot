// Task F3 in the shipped web UI: a teammate's Private mode switch, and the work
// receipt's "What the AI saw" and "Usage". A disposable host with a seeded task.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Page } from "playwright-core";
import { OpenBotDatabase } from "../src/server/testing/database.js";
import { logSentText } from "../src/server/sent-log.js";
import { zeroCounts } from "../src/shared/private-mask.js";

const root = mkdtempSync(path.join(tmpdir(), "openbot-private-mode-"));
const home = path.join(root, "home");
mkdirSync(home, { recursive: true });
const seed = new OpenBotDatabase(root);
const plan = seed.upsertProvider({ provider: "openai", name: "ChatGPT", authMode: "subscription", runtime: "opencode" });
seed.updateBot("nova", { providerInstanceId: plan.id, model: "openai/gpt-5.5" });
const nova = seed.getBot("nova")!;
const ask = seed.addMessage({ threadId: nova.threadId, senderType: "user", senderId: null, body: "Summarise the invoice mail from Anna" });
const run = seed.createRun({ threadId: nova.threadId, botId: nova.id, prompt: ask.body, status: "running", triggerMessageId: ask.id });
seed.addMessage({ threadId: nova.threadId, senderType: "bot", senderId: nova.id, runId: run.id, body: "Anna asks you to pay invoice 2026-118 by Friday." });
// Synthetic details only.
logSentText(seed, run, { kind: "request", label: "The request and conversation", text: "Summarise the invoice mail from Anna (anna.berg@example.com).", masked: false, local: false });
logSentText(seed, run, { kind: "tool", label: "mac_mail_read", text: "{\"from\":\"[NAME_1] <[EMAIL_1]>\",\"body\":\"Hi [NAME_2], please pay by Friday.\"}", masked: true, local: false, counts: { ...zeroCounts(), name: 2, email: 1 } });
seed.updateRun(run.id, { status: "completed", finishedAt: new Date().toISOString(), inputTokens: 9_400, outputTokens: 610, reasoningTokens: 90, cacheReadTokens: 2_000, modelSteps: 3 });
const quiet = seed.createRun({ threadId: nova.threadId, botId: nova.id, prompt: "An older task from before receipts", status: "running" });
seed.updateRun(quiet.id, { status: "completed", finishedAt: new Date(Date.now() - 60_000).toISOString() });
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

async function openReceipt(page: Page, prompt: string) {
  await page.goto(`${base}/`);
  await page.waitForFunction(() => !document.querySelector(".loading") && [...document.querySelectorAll("button")].some((button) => ["Conversation actions", "Workspace", "Open workspace"].includes(button.getAttribute("aria-label") || "")));
  const actions = page.getByRole("button", { name: "Conversation actions", exact: true });
  if (await actions.isVisible()) {
    await actions.click();
    await page.getByRole("menuitem", { name: "Workspace", exact: true }).click();
  } else if (page.viewportSize()!.width <= 760) await page.getByRole("button", { name: "Workspace", exact: true }).click();
  else await page.getByRole("button", { name: "Open workspace", exact: true }).click();
  await page.getByRole("navigation", { name: "Workspace navigation" }).getByRole("button", { name: /^Activity/ }).click();
  await page.locator(".work-row").filter({ hasText: prompt }).first().click();
  return page.getByRole("article", { name: "Work receipt" });
}

let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  let ready = false;
  for (let n = 0; n < 100 && !ready; n++) { try { ready = (await fetch(base + "/api/healthz")).ok; } catch { await delay(150); } }
  assert.ok(ready, "Disposable host did not start");
  browser = await chromium.launch({ executablePath: process.env.OPENBOT_CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  const outside: string[] = [], errors: string[] = [];

  // 1. The switch, by keyboard, on a phone in dark mode.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark" });
  await phone.route("**/*", (route) => { const url = new URL(route.request().url()); if (url.origin !== base) { outside.push(url.href); return route.abort("blockedbyclient"); } return route.continue(); });
  const settings = await phone.newPage();
  settings.on("pageerror", (error) => errors.push(error.message));
  await settings.goto(`${base}/?panel=bot&thread=${threadId}`);
  const toggle = settings.getByRole("switch", { name: "Keep Nova's personal details on this Mac" });
  await toggle.waitFor();
  await settings.getByText("Off: ChatGPT sees what Nova reads as written.", { exact: false }).waitFor();
  assert.equal(await toggle.getAttribute("aria-checked"), "false");
  await toggle.focus();
  await settings.keyboard.press("Space");
  await settings.getByText("Before anything reaches ChatGPT", { exact: false }).waitFor();
  assert.equal(await toggle.getAttribute("aria-checked"), "true");
  const names = settings.getByLabel("Also hide these names");
  await names.focus();
  await settings.keyboard.type("Mira Kovac\nTom");
  await settings.keyboard.press("Tab");
  await settings.keyboard.press("Enter");
  await settings.getByRole("status").filter({ hasText: "Saved." }).waitFor();
  assert.deepEqual(await (await fetch(`${base}/api/bots/nova/private-mode`)).json(), { on: true, names: ["Mira Kovac", "Tom"], local: false, connection: "ChatGPT", model: "openai/gpt-5.5" });
  await settings.locator(".settings-group").filter({ hasText: "Private mode" }).screenshot({ path: "/tmp/openbot-private-mode-dark-390.png" });
  assert.ok(await settings.evaluate(() => document.documentElement.scrollWidth <= 390), "no sideways scrolling");

  // 2. The receipt, on a desktop in light mode: loading, then what the AI saw.
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: "light" });
  await desktop.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== base) { outside.push(url.href); return route.abort("blockedbyclient"); }
    if (url.pathname.endsWith("/ai-receipt")) await delay(600);
    return route.continue();
  });
  const page = await desktop.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  const receipt = await openReceipt(page, "Summarise the invoice mail from Anna");
  await receipt.getByText("Loading what the AI saw…").waitFor();
  const saw = receipt.getByRole("region", { name: "What the AI saw" });
  await saw.getByText("ChatGPT", { exact: false }).first().waitFor();
  await saw.getByText("Private mode", { exact: false }).waitFor();
  const written = saw.locator("summary").filter({ hasText: "Sent as written: 1 email address (masked here)" });
  await written.focus();
  await page.keyboard.press("Enter");
  await saw.locator("pre").filter({ hasText: "Summarise the invoice mail from Anna ([EMAIL_1])." }).waitFor();
  assert.equal(await receipt.getByText("anna.berg@example.com").count(), 0, "the receipt doesn't show the address it masked");
  await saw.locator("summary").filter({ hasText: "Masked before sending: 2 names, 1 email address" }).waitFor();
  const usage = receipt.getByRole("region", { name: "Usage" });
  await usage.getByText("10,100", { exact: true }).waitFor();
  await usage.getByText("10,100 tokens of Nova's weekly budget of 2,000,000 (0.5%).").waitFor();
  await usage.getByText("Included in your ChatGPT plan: 3 requests. The plan's own limits apply.").waitFor();
  await receipt.screenshot({ path: "/tmp/openbot-private-mode-receipt-light-1440.png" });

  // 3. Narrow, an older task with nothing recorded, and a failed load.
  await page.setViewportSize({ width: 320, height: 800 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 320), "no sideways scrolling at 320 px");
  const older = await openReceipt(page, "An older task from before receipts");
  await older.getByText("Nothing was recorded for this run.", { exact: false }).waitFor();
  await desktop.unroute("**/*");
  await desktop.route("**/*", (route) => new URL(route.request().url()).pathname.endsWith("/ai-receipt") ? route.fulfill({ status: 500, body: "{}" }) : route.continue());
  const failed = await openReceipt(page, "Summarise the invoice mail from Anna");
  await failed.getByText("What the AI saw is unavailable for this task.").waitFor();
  await failed.getByText("Work receipt").first().waitFor();

  assert.deepEqual(outside, [], "nothing was sent anywhere");
  assert.deepEqual(errors, []);
  console.log("PASS: Private mode turns on by keyboard and keeps the names (390 px dark); the receipt shows what the AI saw, masked, with usage and the plan line (1440 light), an empty and a failed state, and fits 320 px; nothing sent.");
} finally {
  await browser?.close();
  child.kill("SIGTERM");
  for (let n = 0; n < 40 && child.exitCode === null; n++) await delay(100);
  rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); // the server may still be closing its files
}

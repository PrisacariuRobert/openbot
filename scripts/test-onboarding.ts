// Genuine empty-studio onboarding through the shipped web UI and disposable
// host. Provider discovery is real, not intercepted. Runtime installation is a
// prerequisite. Discovery may refresh its public model catalog, but no sign-in,
// model task, credential or connected-service action is used.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";
import type { AppState, Bot, ProviderInstance } from "../src/shared/types.js";

const data = mkdtempSync(path.join(tmpdir(), "openbot-onboarding-"));
const runtimeHome = path.join(data, "runtime-home");
mkdirSync(runtimeHome, { recursive: true });
const output = "/tmp/openbot-onboarding-qa";
mkdirSync(output, { recursive: true });
const socket = createServer();
await new Promise<void>((resolve) => socket.listen(0, "127.0.0.1", resolve));
const port = (socket.address() as { port: number }).port;
await new Promise<void>((resolve) => socket.close(() => resolve()));
const base = "http://127.0.0.1:" + port;
const child = spawn(process.execPath, ["--import", "tsx", "src/server/index.ts"], {
  cwd: path.resolve(import.meta.dirname, ".."), stdio: "ignore",
  env: {
    PATH: process.env.PATH,
    LANG: process.env.LANG || "en_US.UTF-8",
    TMPDIR: process.env.TMPDIR,
    // Isolate the runtime's real sign-in/config/cache paths. A developer's
    // installed executable may be discovered, but their accounts are not used.
    HOME: runtimeHome,
    XDG_CONFIG_HOME: path.join(runtimeHome, ".config"),
    XDG_DATA_HOME: path.join(runtimeHome, ".local/share"),
    XDG_CACHE_HOME: path.join(runtimeHome, ".cache"),
    OPENBOT_LOAD_ENV: "0", OPENBOT_DATA_DIR: data, OPENBOT_PORT: String(port), OPENBOT_HOST: "127.0.0.1", OPENBOT_APP_URL: base, OPENBOT_DEPLOYMENT_MODE: "local", NODE_ENV: "production",
  },
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
async function request(route: string, body?: unknown) {
  return fetch(base + route, { method: body === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(30_000) });
}
try {
  let ready = false;
  for (let n = 0; n < 100; n++) {
    try { if ((await request("/api/healthz")).ok) { ready = true; break; } } catch {}
    await delay(150);
  }
  assert.ok(ready, "Disposable host did not start");
  const discovery = await (await request("/api/provider")).json() as { cliAvailable: boolean; instances: Array<{ connected: boolean }> };
  assert.equal(discovery.cliAvailable, true, "Install the pinned OpenCode execution runtime before this real onboarding test; saving an API connection alone cannot run a model");
  assert.ok(discovery.instances.every((item) => !item.connected), "The isolated runtime has no inherited account connections");
  const initial: AppState = await (await request("/api/state")).json();
  assert.equal(initial.bots.length, 0, "A genuinely fresh studio has no preset cast");
  assert.equal(initial.studioRuns.length, 0);
  assert.equal((await request("/api/bots", { name: "Helper", emoji: "x", color: "#123456", role: "Helper", instructions: "Help" })).status, 400, "No teammate is created without explicit AI setup");
  assert.equal((await request("/api/messages", { threadId: "team-room", body: "Hello" })).status, 400, "A studio without teammates cannot start work");

  browser = await chromium.launch({ executablePath: process.env.OPENBOT_CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const unexpected: string[] = [], errors: string[] = [];
  let connectionWrites = 0, teammateWrites = 0;
  context.on("page", (page) => page.on("pageerror", (error) => errors.push(error.message)));
  await context.route("**/*", async (route) => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin !== base) {
      unexpected.push("External browser request blocked: " + url.origin);
      return route.abort("blockedbyclient");
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method())) {
      if (req.method() === "POST" && url.pathname === "/api/providers") connectionWrites++;
      else if (req.method() === "POST" && url.pathname === "/api/bots") teammateWrites++;
      else {
        unexpected.push(req.method() + " " + url.pathname);
        return route.abort("blockedbyclient");
      }
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  await page.goto(base + "/studio.html");
  await page.getByRole("heading", { name: "Make room for a little help." }).waitFor();
  await page.getByRole("button", { name: "Create your first teammate" }).click();
  const creation = page.getByRole("dialog");
  await creation.getByLabel("Name", { exact: true }).fill("Remy");
  await creation.getByLabel("Their job", { exact: true }).fill("Help plan my week");
  const instructions = "Find a realistic plan. Ask before changing my calendar.";
  await creation.getByLabel("Additional instructions", { exact: true }).fill(instructions);
  assert.ok(await creation.getByRole("button", { name: "Create teammate", exact: true }).isDisabled());
  const popup = page.waitForEvent("popup");
  await creation.getByRole("link", { name: /^(Set up an AI connection|Connect another AI service)$/ }).click();
  const settings = await popup;
  settings.setDefaultTimeout(45_000);
  // The provider setup renders as a full panel in the separate tab now.
  const providerSheet = settings.locator(".provider-settings");
  await providerSheet.waitFor();
  await providerSheet.getByRole("button", { name: "API & local models", exact: true }).click();
  await providerSheet.getByRole("button", { name: "Add API or local model", exact: true }).click();
  await providerSheet.getByRole("combobox", { name: "Provider", exact: true }).selectOption("custom");
  await providerSheet.getByLabel("Connection name", { exact: true }).fill("Local beta test");
  await providerSheet.getByLabel("API address", { exact: true }).fill("http://127.0.0.1:1/v1");
  await providerSheet.getByLabel("Model IDs", { exact: true }).fill("chosen-model");
  assert.equal(await providerSheet.getByLabel("API key (optional)", { exact: true }).inputValue(), "");
  await settings.screenshot({ path: path.join(output, "provider-setup-desktop.png"), fullPage: true });
  await settings.setViewportSize({ width: 390, height: 844 });
  assert.ok(await providerSheet.evaluate((element) => element.scrollWidth <= element.clientWidth + 1), "Provider setup fits a phone");
  await settings.screenshot({ path: path.join(output, "provider-setup-mobile.png"), fullPage: true });
  const savedResponse = settings.waitForResponse((response) => response.url() === base + "/api/providers" && response.request().method() === "POST");
  await providerSheet.getByRole("button", { name: "Save connection", exact: true }).click();
  const savedResult = await savedResponse;
  assert.equal(savedResult.status(), 201);
  const saved: ProviderInstance = await savedResult.json();
  assert.equal(saved.name, "Local beta test");
  assert.equal(saved.hasSecret, false, "No key was fabricated or copied");
  assert.deepEqual(saved.apiConfig?.modelIds, ["chosen-model"]);
  await providerSheet.getByText("Connection saved. Choose it for a teammate below. It hasn’t been tested yet.", { exact: true }).waitFor();
  assert.equal(connectionWrites, 1);

  // Return to the original creation sheet. Headless environments can omit an
  // OS focus transition, so dispatch the actual browser focus event as well.
  await page.bringToFront();
  const refreshed = page.waitForResponse((response) => response.url() === base + "/api/provider" && response.request().method() === "GET");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  assert.ok((await refreshed).ok(), "Returning reloads actual provider discovery");
  assert.equal(await creation.getByLabel("Name", { exact: true }).inputValue(), "Remy");
  assert.equal(await creation.getByLabel("Their job", { exact: true }).inputValue(), "Help plan my week");
  assert.equal(await creation.getByRole("textbox", { name: /^How should they help\?/ }).inputValue(), instructions);
  const service = creation.getByRole("combobox", { name: "AI connection", exact: true });
  assert.equal(await service.innerText(), "Choose your AI service", "Saving a connection does not silently select it");
  await service.click();
  await creation.getByRole("option", { name: "Local beta test", exact: true }).click();
  const model = creation.getByRole("combobox", { name: "Model", exact: true });
  assert.equal(await model.innerText(), "Choose a model", "Model is still an explicit choice");
  await model.click();
  const modelId = "openbot-" + saved.id + "/chosen-model";
  await creation.getByRole("option", { name: modelId, exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await creation.evaluate((element) => element.scrollWidth <= element.clientWidth + 1));
  await page.screenshot({ path: path.join(output, "ready-to-create-mobile.png"), fullPage: true });
  const createdResponse = page.waitForResponse((response) => response.url() === base + "/api/bots" && response.request().method() === "POST");
  await creation.getByRole("button", { name: "Create teammate", exact: true }).click();
  const createdResult = await createdResponse;
  assert.equal(createdResult.status(), 201);
  const created: Bot = await createdResult.json();
  assert.equal(created.name, "Remy");
  assert.equal(created.providerInstanceId, saved.id);
  assert.equal(created.model, modelId);
  assert.equal(created.browserEnabled, false);
  assert.equal(created.computerEnabled, false);
  assert.equal(teammateWrites, 1);
  await creation.waitFor({ state: "detached" });
  await page.reload();
  await page.getByRole("heading", { name: "What’s on your mind?" }).waitFor();
  const final: AppState = await (await request("/api/state?threadId=" + encodeURIComponent(created.threadId))).json();
  assert.equal(final.bots.length, 1);
  assert.equal(final.bots[0]!.providerInstanceId, saved.id);
  assert.equal(final.bots[0]!.model, modelId);
  assert.equal(final.studioRuns.length, 0, "Setup never invokes a model");
  assert.equal(final.approvals.length, 0);
  assert.equal(final.settings.macAccessEnabled, false);
  assert.equal(final.messages.filter((message) => message.senderType === "bot").length, 0, "Setup never fabricates a reply");
  assert.deepEqual(unexpected, []);
  assert.deepEqual(errors, []);
  console.log("PASS: actual empty-studio UI → separate API/local setup → saved, untested connection → focus refresh with draft preserved → explicit provider/model → real teammate creation → persisted reload. Zero model jobs, account sign-ins, copied keys or browser/computer grants. Desktop and 390px setup fit.");
} finally {
  await browser?.close();
  child.kill("SIGTERM");
  for (let n = 0; n < 40 && child.exitCode === null && child.signalCode === null; n++) await delay(100);
  if (child.exitCode === null && child.signalCode === null) { child.kill("SIGKILL"); await new Promise<void>((resolve) => child.once("close", resolve)); }
  rmSync(data, { recursive: true, force: true });
}

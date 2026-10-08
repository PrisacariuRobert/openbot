// The guided first run through the shipped web UI on a disposable host: the
// installer's ?welcome=installed, the AI step in the plan's order, a pasted Gemini
// key saved and tested (stand-ins; nothing reaches Google), a one-click
// local model (a stand-in Ollama on loopback), the model step, the first
// teammate (with the private browser offer when no browser is installed) and
// "Try one". No model job, sign-in, settings change, message or real download.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer as createHttpServer } from "node:http";
import { createServer } from "node:net";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";
import type { AppState } from "../src/shared/types.js";

const data = mkdtempSync(path.join(tmpdir(), "openbot-guided-first-run-"));
const runtimeHome = path.join(data, "runtime-home");
mkdirSync(runtimeHome, { recursive: true });
const output = "/tmp/openbot-guided-first-run-qa";
mkdirSync(output, { recursive: true });

// A stand-in Ollama: one model that can use tools, one that only embeds.
const capabilities: Record<string, string[]> = { "qwen3:8b": ["completion", "tools"], "nomic-embed-text:latest": ["embedding"] };
const ollama = createHttpServer((request, response) => {
  let body = "";
  request.on("data", (chunk) => { body += chunk; });
  request.on("end", () => {
    response.setHeader("content-type", "application/json");
    if (request.url === "/api/tags") return response.end(JSON.stringify({ models: Object.keys(capabilities).map((name) => ({ name })) }));
    if (request.url === "/api/show") return response.end(JSON.stringify({ capabilities: capabilities[(JSON.parse(body || "{}") as { model?: string }).model ?? ""] ?? [] }));
    response.statusCode = 404; response.end("{}");
  });
});
ollama.listen(0, "127.0.0.1");
await once(ollama, "listening");
const ollamaUrl = `http://127.0.0.1:${(ollama.address() as AddressInfo).port}`;

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
    OPENBOT_OLLAMA_URL: ollamaUrl,
    OPENBOT_LOAD_ENV: "0", OPENBOT_DATA_DIR: data, OPENBOT_PORT: String(port), OPENBOT_HOST: "127.0.0.1", OPENBOT_APP_URL: base, OPENBOT_DEPLOYMENT_MODE: "local", NODE_ENV: "production",
  },
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const json = async <T>(route: string) => (await fetch(base + route, { signal: AbortSignal.timeout(30_000) })).json() as Promise<T>;
try {
  let ready = false;
  for (let n = 0; n < 100 && !ready; n++) { try { ready = (await fetch(base + "/api/healthz")).ok; } catch { await delay(150); } }
  assert.ok(ready, "Disposable host did not start");
  assert.equal((await json<AppState>("/api/state")).bots.length, 0, "A fresh studio");

  browser = await chromium.launch({ executablePath: process.env.OPENBOT_CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const unexpected: string[] = [], errors: string[] = [];
  const allowed = new Set(["POST /api/setup/visit", "POST /api/providers", "POST /api/team-templates/starter-team/install", "PUT /api/drafts"]);
  context.on("page", (page) => page.on("pageerror", (error) => errors.push(error.message)));
  await context.route("**/*", async (route) => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== base) { unexpected.push("External request blocked: " + url.origin); return route.abort("blockedbyclient"); }
    const write = `${request.method()} ${url.pathname}`;
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method()) && !allowed.has(write)) { unexpected.push(write); return route.abort("blockedbyclient"); }
    return route.continue();
  });
  // "No browser installed", without downloading 190 MB: the download route answers as on a computer without
  // Chrome, Edge or Brave, then as a download that runs and finishes. The server side is covered by browser-download.test.ts.
  const realDownloadStatus = await json<Record<string, unknown>>("/api/browser/download");
  assert.deepEqual(Object.keys(realDownloadStatus).sort(), ["downloaded", "error", "state", "systemBrowser"], "The download route is registered");
  let download: "idle" | "downloading" | "ready" = "idle", downloadPosts = 0;
  await context.route("**/api/browser/download", async (route) => {
    if (route.request().method() === "POST") { downloadPosts++; download = "downloading"; }
    else if (download === "downloading" && downloadPosts) download = "ready";
    return route.fulfill({ status: route.request().method() === "POST" ? 202 : 200, contentType: "application/json", body: JSON.stringify({ systemBrowser: false, downloaded: download === "ready", state: download, error: null }) });
  });
  // A pasted Gemini key: saved and tested without reaching Google. The test answers "rejected", so the owner sees why and can continue.
  const keyCalls: string[] = [];
  await context.route("**/api/provider/key", (route) => { keyCalls.push("save " + (JSON.parse(route.request().postData() || "{}") as { providerId?: string }).providerId); return route.fulfill({ contentType: "application/json", body: JSON.stringify({ connectionId: "local-google", models: [] }) }); });
  await context.route("**/api/provider/local-google/test", (route) => { keyCalls.push("test"); return route.fulfill({ contentType: "application/json", body: JSON.stringify({ tested: true, ok: false, model: "google/gemini-2.5-flash", latencyMs: 400, error: "The provider rejected its sign-in or key. Reconnect it, then test again.", testedAt: new Date().toISOString() }) }); });
  const page = await context.newPage();
  await page.goto(base + "/?welcome=installed");
  await page.getByRole("heading", { name: "How should your team think?" }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get("welcome"), null, "The installer's parameter leaves the address");
  assert.equal(await page.getByRole("dialog").count(), 0, "Drawn in place of the welcome, not as a modal");
  const options = (await page.locator(".byo.is-first-run > .byo-list > .byo-row > .byo-row-text > strong").allInnerTexts()).map((text) => text.replace(/Free key|Free plan/, "").trim());
  assert.deepEqual(options, ["ChatGPT", "Google Gemini", "Claude", "A model on this Mac"], "The plan's order");
  await page.screenshot({ path: path.join(output, "1-ai.png") });

  const geminiRow = page.locator(".byo-row", { hasText: "Google Gemini" });
  assert.match(await geminiRow.innerText(), /18 or older, for professional or business use/, "Google's first notice");
  assert.match(await geminiRow.innerText(), /Outside the EEA, the UK and Switzerland/, "Google's second notice");
  assert.equal(await geminiRow.getByRole("link", { name: /Google’s Gemini API terms, updated/ }).getAttribute("href"), "https://ai.google.dev/gemini-api/terms");
  assert.equal(await geminiRow.getByRole("link", { name: /Get a free key/ }).getAttribute("href"), "https://aistudio.google.com/apikey");
  await page.getByLabel("Paste your Gemini API key").fill("AIza" + "Q".repeat(31) + "_-7z");
  await geminiRow.getByText("Your key was saved, but the test didn’t pass").waitFor();
  assert.deepEqual(keyCalls, ["save google", "test"], "A pasted key connects and is tested once, without pressing Connect");
  assert.match(await geminiRow.getByRole("alert").innerText(), /rejected its sign-in or key/);
  await geminiRow.getByRole("button", { name: "Continue anyway" }).waitFor();
  await page.screenshot({ path: path.join(output, "1b-gemini-untested.png") });

  await page.getByRole("button", { name: "Use Ollama" }).click();
  await page.getByRole("heading", { name: "Which model should your teammate use?" }).waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.id), "guided-run-heading", "Focus moves to the new step");
  assert.match(await page.locator(".guided-run-field").innerText(), /Qwen3:8b/i, "The tool-capable model is preselected, never the embedding one");
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByRole("heading", { name: "Meet your first teammate" }).waitFor();
  assert.equal(await page.getByRole("switch", { name: "Can look things up on the web" }).getAttribute("aria-checked"), "true", "The web switch is shown and starts on");
  const offer = page.getByRole("button", { name: "Download a private browser for your teammates (about 190 MB)" });
  await offer.waitFor();
  await page.screenshot({ path: path.join(output, "2-teammate.png") });
  await page.getByRole("switch", { name: "Can look things up on the web" }).click();
  assert.equal(await offer.count(), 0, "No browser offer when the teammate won't use the web");
  await page.getByRole("switch", { name: "Can look things up on the web" }).click();
  await offer.click();
  await page.getByText("Private browser downloaded. Your teammates can use the web now.").waitFor({ timeout: 15_000 });
  assert.equal(downloadPosts, 1, "One download, on the owner's click");
  await page.getByRole("button", { name: "Create Scout" }).click();

  await page.getByText("Try one.").waitFor();
  const cards = await page.locator(".first-run-try .chat-starter strong").allInnerTexts();
  assert.deepEqual(cards, ["Draft a short email", "Compare three apps", "Plan my week"], "The first needs nothing; no Mac suggestion off a Mac");
  await page.screenshot({ path: path.join(output, "3-try.png") });
  await page.locator(".first-run-try .chat-starter").first().click();
  assert.match(await page.locator("#studio-message").inputValue(), /^Write a short, friendly email/, "The suggestion fills the message box");

  const final = await json<AppState>("/api/state");
  assert.equal(final.bots.length, 1, "One teammate");
  const [scout] = final.bots;
  assert.equal(scout!.role, "Chief of staff");
  assert.equal(scout!.browserEnabled, true);
  assert.match(scout!.model, /\/qwen3:8b$/);
  assert.equal(final.studioRuns.length, 0, "Nothing was sent to a model");
  assert.equal(final.settings.macAccessEnabled, false, "No Mac access was turned on");
  const timeline = await json<{ milestones: Array<{ name: string; at: string | null; detail: string | null }> }>("/api/setup");
  const at = (name: string) => timeline.milestones.find((entry) => entry.name === name);
  for (const name of ["installed", "studio_opened", "ai_connected", "first_teammate"]) assert.ok(at(name)?.at, `${name} is on the setup timeline`);
  assert.equal(at("ai_connected")?.detail, "A model on this Mac");
  assert.deepEqual(unexpected, []);
  assert.deepEqual(errors, []);
  console.log("PASS: ?welcome=installed → AI step in the plan's order → Gemini notices, a pasted key tested at once, a failed test explained → one-click local model → model preselected → no browser installed → private browser offered and downloaded on click → first teammate on it → three suggestions, the first needing nothing → message box filled. No model job, sign-in, settings change or message.");
} finally {
  await browser?.close();
  child.kill("SIGTERM");
  for (let n = 0; n < 40 && child.exitCode === null && child.signalCode === null; n++) await delay(100);
  if (child.exitCode === null && child.signalCode === null) { child.kill("SIGKILL"); await new Promise<void>((resolve) => child.once("close", resolve)); }
  ollama.close();
  rmSync(data, { recursive: true, force: true });
}

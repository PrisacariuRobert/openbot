// Provider connection-test UI through the shipped web UI and disposable host.
// Uses a dead API endpoint so no model spend occurs: the honest failure path
// ("Saved, not tested" -> "Last test failed" + visible error) is the assertion.
// Run after `npm run build`. Not in CI browser-acceptance (keeps that job bounded);
// run on demand: `npm run test:provider-test-ui`.
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";

const data = mkdtempSync(path.join(tmpdir(), "openbot-provider-test-ui-"));
const runtimeHome = path.join(data, "runtime-home");
mkdirSync(runtimeHome, { recursive: true });
const output = "/tmp/openbot-provider-test-qa";
mkdirSync(output, { recursive: true });
const socket = createServer();
await new Promise<void>((resolve) => socket.listen(0, "127.0.0.1", resolve));
const port = (socket.address() as { port: number }).port;
await new Promise<void>((resolve) => socket.close(() => resolve()));
const base = `http://127.0.0.1:${port}`;
let child: ChildProcess | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
async function request(route: string, body?: unknown, method = "POST") {
  return fetch(base + route, { method: body === undefined ? "GET" : method, headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(30_000) });
}
try {
  child = spawn(process.execPath, ["--import", "tsx", "src/server/index.ts"], { cwd: path.resolve(import.meta.dirname, ".."), stdio: "ignore",
    env: { PATH: process.env.PATH, LANG: process.env.LANG || "en_US.UTF-8", TMPDIR: process.env.TMPDIR, HOME: runtimeHome, XDG_CONFIG_HOME: path.join(runtimeHome, ".config"), XDG_DATA_HOME: path.join(runtimeHome, ".local/share"), XDG_CACHE_HOME: path.join(runtimeHome, ".cache"), OPENBOT_LOAD_ENV: "0", OPENBOT_SEED_STARTER_BOTS: "1", OPENBOT_DATA_DIR: data, OPENBOT_PORT: String(port), OPENBOT_HOST: "127.0.0.1", OPENBOT_APP_URL: base, OPENBOT_DEPLOYMENT_MODE: "local", NODE_ENV: "production" } });
  let ready = false;
  for (let n = 0; n < 120; n++) { try { if ((await request("/api/healthz")).ok) { ready = true; break; } } catch {} await delay(250); }
  assert.ok(ready, "Disposable host did not start");
  console.log("STEP host-ready");
  const created = await (await request("/api/providers", { name: "Dead probe", provider: "custom", authMode: "api_key", runtime: "opencode", secret: "never-a-real-key", apiConfig: { baseUrl: "http://127.0.0.1:1/v1", protocol: "openai-compatible", modelIds: ["unreachable-model"] } })).json() as { id: string };
  assert.ok(created.id, "Dead API connection must save without a test request");
  console.log("STEP connection-saved", created.id);

  browser = await chromium.launch({ executablePath: process.env.OPENBOT_CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}/?panel=provider`);
  await page.getByRole("button", { name: "API & local models" }).click();
  await page.getByText("Saved, not tested").first().waitFor({ timeout: 15_000 });
  console.log("STEP untested-visible");
  await page.screenshot({ path: `${output}/provider-untested.png` });
  await page.getByRole("button", { name: "Test connection" }).click();
  console.log("STEP test-clicked");
  await page.getByText("Last test failed").first().waitFor({ timeout: 150_000 });
  console.log("STEP failed-visible");
  const alert = page.getByRole("alert").first();
  await alert.waitFor({ timeout: 15_000 });
  console.log("STEP alert-visible");
  assert.match(await alert.textContent() || "", /unreachable|unavailable|did not answer/i, "Failure must explain itself without leaking the endpoint");
  await page.screenshot({ path: `${output}/provider-test-failed.png` });
  console.log("STEP screenshot-failed");
  await page.setViewportSize({ width: 390, height: 844 });
  await delay(500);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), "Provider panel overflows at phone width");
  assert.deepEqual(errors, [], `No page errors allowed: ${errors.join("; ")}`);
  console.log("STEP layout-clean");

  const receipt = await (await request(`/api/provider/${created.id}/test`, undefined, "GET")).json() as { tested: boolean; ok: boolean; error: string | null };
  console.log("STEP receipt-read");
  assert.equal(receipt.tested, true);
  assert.equal(receipt.ok, false);
  assert.ok(receipt.error && !receipt.error.includes("127.0.0.1"), "Stored receipt must not leak the endpoint address");
  assert.equal(await (await request(`/api/provider/${created.id}/test`, {})).status, 429, "Immediate retest must be rate-limited to protect usage");
  console.log("STEP cooldown-verified");
  console.log("PASS: provider connection-test UI shows the honest failure path with no spend and no leaks.");
} finally {
  await browser?.close();
  if (child && child.exitCode === null && child.signalCode === null) { child.kill("SIGTERM"); await delay(1000); try { child.kill("SIGKILL"); } catch {} }
  rmSync(data, { recursive: true, force: true });
}

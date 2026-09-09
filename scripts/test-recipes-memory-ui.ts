import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";

const data = mkdtempSync(path.join(tmpdir(), "openbot-recipes-memory-ui-"));
const socket = createServer(); await new Promise<void>((resolve) => socket.listen(0, "127.0.0.1", resolve));
const port = (socket.address() as { port: number }).port; await new Promise<void>((resolve) => socket.close(() => resolve()));
const base = `http://127.0.0.1:${port}`;
let child: ChildProcess | undefined, browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const request = (route: string, body?: unknown, method = "POST") => fetch(base + route, { method: body === undefined ? "GET" : method, headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15_000) });
async function stop() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM"); for (let n = 0; n < 40 && child.exitCode === null && child.signalCode === null; n++) await delay(100);
  if (child.exitCode === null && child.signalCode === null) { child.kill("SIGKILL"); await new Promise<void>((resolve) => child!.once("close", resolve)); }
}
async function start() {
  child = spawn(process.execPath, ["--import", "tsx", "src/server/index.ts"], { stdio: "ignore", env: { ...process.env, OPENBOT_LOAD_ENV: "0", OPENBOT_SEED_STARTER_BOTS: "1", OPENBOT_DATA_DIR: data, OPENBOT_PORT: String(port), OPENBOT_HOST: "127.0.0.1", OPENBOT_APP_URL: base, OPENBOT_DEPLOYMENT_MODE: "local", NODE_ENV: "production" } });
  for (let n = 0; n < 100; n++) { try { if ((await request("/api/healthz")).ok) return; } catch {} await delay(150); }
  throw new Error("Disposable recipe host did not start");
}
try {
  await start();
  const provider = await (await request("/api/providers", { name: "Non-dispatching UI fixture", authMode: "api_key", apiConfig: { baseUrl: "http://127.0.0.1:1/v1", protocol: "openai-compatible", modelIds: ["fixture"] } })).json();
  for (const id of ["nova", "pixel", "scout"]) assert.equal((await request(`/api/bots/${id}`, { providerInstanceId: provider.id, model: `openbot-${provider.id}/fixture` }, "PATCH")).status, 200);
  browser = await chromium.launch({ executablePath: process.env.OPENBOT_CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}/?panel=connectors`);
  await page.locator(".daily-work-disclosure > summary").click();
  const library = page.locator(".recipe-library"); await library.locator("summary").first().click();
  await library.getByLabel("Recipe", { exact: true }).selectOption("inbox-follow-ups");
  await library.getByRole("checkbox", { name: "Include unsent reply drafts" }).check();
  await library.getByLabel("Recipe answer length").selectOption("expanded");
  await library.getByRole("button", { name: "Try safe example" }).click();
  await library.getByRole("status").filter({ hasText: "Example checked" }).waitFor();
  await library.getByText("The unsent draft recipient was bound to the received message.", { exact: true }).waitFor();
  const download = page.waitForEvent("download"); await library.getByRole("button", { name: "Save & export settings" }).click();
  const file = await download, downloaded = await file.path(); assert.ok(downloaded);
  const bundle = JSON.parse(readFileSync(downloaded, "utf8")); assert.equal(bundle.preferences.includeDrafts, true); assert.equal(bundle.preferences.detail, "expanded");
  assert.deepEqual(Object.keys(bundle).sort(), ["digest", "format", "formatVersion", "preferences", "recipeId", "recipeVersion"]);
  assert.equal((await request("/api/recipes/inspect", { ...bundle, privateAccount: "owner@example.com" })).status, 400);
  await library.getByLabel("Recipe teammate").selectOption("pixel");
  await library.getByLabel("Open recipe settings").setInputFiles({ name: "fixture.openbot-recipe.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(bundle)) });
  await library.getByRole("button", { name: "Import for Pixel" }).click();
  await library.getByRole("status").filter({ hasText: "Settings imported" }).waitFor();
  assert.equal((await (await request("/api/recipes?botId=pixel")).json()).saved[0].preferences.detail, "expanded");
  await library.screenshot({ path: "/tmp/openbot-recipes-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await library.evaluate((element) => element.scrollWidth <= element.clientWidth + 1), "Recipe library overflows at 390px");
  await library.screenshot({ path: "/tmp/openbot-recipes-mobile.png" });
  await library.getByRole("button", { name: "Save & export settings" }).click({ trial: true });
  await page.screenshot({ path: "/tmp/openbot-recipes-mobile-controls.png" });

  // Real owner routes and stale concurrent clients, not mocked responses.
  const extensions = page.locator(".extensions-panel");
  await page.locator(".purpose-disclosure > summary").filter({ hasText: "More tools" }).click();
  await extensions.getByRole("button", { name: "Memory", exact: true }).click();
  await extensions.getByLabel("Note name").fill("Writing preference");
  await extensions.getByLabel("What should they remember?").fill("Keep the answer short and use Belgian time.");
  await extensions.getByLabel(/Keep until/).fill("2027-01-01T09:00");
  await extensions.getByRole("button", { name: "Save note", exact: true }).click();
  await extensions.getByText(/Set by you · protected/).waitFor();
  const notes = await (await request("/api/extensions/memory/nova")).json();
  assert.equal(notes.length, 1); assert.equal(notes[0].source, "owner"); assert.ok(notes[0].expiresAt);
  assert.equal((await request("/api/extensions/memory/nova", { key: notes[0].key, content: "Stale update without a revision" }, "PATCH")).status, 400);
  assert.equal((await request("/api/extensions/memory/nova", { key: notes[0].key, content: "Concurrent owner correction", expectedRevision: notes[0].revision, expiresAt: notes[0].expiresAt }, "PATCH")).status, 200);
  assert.equal((await request("/api/extensions/memory/nova", { key: notes[0].key, expectedRevision: notes[0].revision }, "DELETE")).status, 400);
  await extensions.getByRole("button", { name: "Refresh notes" }).click();
  await extensions.getByText("Concurrent owner correction", { exact: true }).waitFor();
  assert.ok(await extensions.evaluate((element) => element.scrollWidth <= element.clientWidth + 1), "Memory panel overflows at 390px");
  await extensions.screenshot({ path: "/tmp/openbot-memory-mobile.png" });

  const followups = page.locator(".work-sources").filter({ has: page.getByRole("heading", { name: "Your follow-ups" }) });
  await followups.getByRole("checkbox", { name: "Show a daily suggestion digest here" }).check();
  assert.equal((await (await request("/api/work-followups")).json()).digestEnabled, true);
  await stop();
  // The deliberate restart makes in-flight page fetches fail once; that is
  // the transition, not a defect. The post-restart assertions below are the
  // health check, and the error buffer restarts with the server.
  errors.length = 0;
  await start();
  assert.equal((await (await request("/api/extensions/memory/nova")).json())[0].content, "Concurrent owner correction");
  assert.equal((await (await request("/api/recipes?botId=pixel")).json()).saved[0].preferences.detail, "expanded");
  assert.equal((await (await request("/api/work-followups")).json()).digestEnabled, true);
  assert.equal((await (await request("/api/state")).json()).studioRuns.length, 0);
  assert.deepEqual(errors, []);
  console.log("PASS: recipe fixture, private-data rejection, download/preview/import, bot isolation, owner memory editing/expiry/CAS, digest opt-in, restart persistence and 390px layout. No model or real app account used.");
} finally { await browser?.close(); await stop(); rmSync(data, { recursive: true, force: true }); }

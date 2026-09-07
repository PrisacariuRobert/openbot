// Production save/read routes + Chromium; synthetic accounts and list responses.
// No model, real app connection, sign-in or external write is used by this check.
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";
import { OpenBotDatabase } from "../src/server/testing/database.js";

const data = mkdtempSync(path.join(tmpdir(), "openbot-work-ui-"));
const socket = createServer(); await new Promise<void>((resolve) => socket.listen(0, "127.0.0.1", resolve));
const port = (socket.address() as { port: number }).port; await new Promise<void>((resolve) => socket.close(() => resolve()));
const base = `http://127.0.0.1:${port}`;
let child: ChildProcess | undefined, browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
async function request(route: string, body?: unknown, method = "POST") {
  return fetch(base + route, { method: body === undefined ? "GET" : method, headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15_000) });
}
async function stop() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM"); for (let n = 0; n < 40 && child.exitCode === null && child.signalCode === null; n++) await delay(100);
  if (child.exitCode === null && child.signalCode === null) { child.kill("SIGKILL"); await new Promise<void>((resolve) => child!.once("close", resolve)); }
}
async function start() {
  child = spawn(process.execPath, ["--import", "tsx", "src/server/index.ts"], { stdio: "ignore", env: { ...process.env, OPENBOT_LOAD_ENV: "0", OPENBOT_DATA_DIR: data, OPENBOT_PORT: String(port), OPENBOT_HOST: "127.0.0.1", OPENBOT_APP_URL: base, OPENBOT_DEPLOYMENT_MODE: "local", NODE_ENV: "production" } });
  for (let n = 0; n < 100; n++) { try { if ((await request("/api/healthz")).ok) return; } catch {} await delay(150); }
  throw new Error("Disposable work host did not start");
}
try {
  // Scope the seed database to the same directory used by the child process.
  const oldData = process.env.OPENBOT_DATA_DIR; process.env.OPENBOT_DATA_DIR = data;
  const db = new OpenBotDatabase(data);
  try {
    db.configureOAuthConnector({ id: "slack", kind: "slack_oauth", name: "Slack", clientId: "fixture", clientSecret: "fixture" });
    db.completeOAuthConnector("slack", { accessToken: "fixture" }, "UI fixture", ["read"]);
    db.setBotConnectorAccess("nova", { canRead: true, canSend: false }, "slack", "slack");
    const run = db.createRun({ botId: "nova", threadId: "bot-nova", prompt: "Synthetic report for interface testing", status: "completed" }), id = randomUUID(), now = new Date().toISOString();
    db.saveWorkSnapshot({ id, runId: run.id, botId: "nova", kind: "morning", accountEmail: "UI fixture", fetchedAt: now, timeZone: "UTC", window: { from: now, until: now, mailQuery: "" }, coverage: [], sources: [{ ref: "S1", service: "slack", title: "Fixture launch channel", text: "Confirm the launch date", url: "https://app.slack.com/archives/C123", truncated: false }] });
    db.saveWorkReport({ snapshotId: id, savedAt: now, markdown: "Synthetic fixture", items: [{ priority: "soon", text: "Confirm the launch date with Mira", sourceRefs: ["S1"] }], drafts: [] });
  } finally { db.close(); if (oldData === undefined) delete process.env.OPENBOT_DATA_DIR; else process.env.OPENBOT_DATA_DIR = oldData; }
  await start();
  const provider = await (await request("/api/providers", { name: "Non-dispatching fixture", authMode: "api_key", apiConfig: { baseUrl: "http://127.0.0.1:1/v1", protocol: "openai-compatible", modelIds: ["fixture"] } })).json();
  for (const id of ["nova", "pixel", "scout"]) assert.equal((await request(`/api/bots/${id}`, { providerInstanceId: provider.id, model: `openbot-${provider.id}/fixture` }, "PATCH")).status, 200);
  browser = await chromium.launch({ executablePath: process.env.OPENBOT_CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  await page.route("**/api/work-source-choices/slack?*", (route) => route.fulfill({ json: { choices: [{ service: "slack", id: "C123", label: "#launch-planning-and-release-coordination" }], limited: true } }));
  await page.goto(`${base}/?panel=connectors`);
  await page.locator(".daily-work-disclosure > summary").click();
  const sources = page.locator(".work-sources").filter({ has: page.getByRole("heading", { name: "Make your brief yours" }) });
  await sources.getByRole("button", { name: "Browse sources" }).click();
  await sources.getByRole("checkbox").check(); await sources.getByLabel("Brief lookback").selectOption("72");
  await sources.getByRole("button", { name: "Save sources" }).click(); await sources.getByRole("status").filter({ hasText: "Saved for this teammate" }).waitFor();
  assert.equal((await (await request("/api/work-sources/nova")).json()).selections[0].id, "C123");
  assert.deepEqual((await (await request("/api/work-sources/pixel")).json()).selections, []);
  assert.equal((await request("/api/work-sources/pixel", { selections: [{ service: "slack", id: "C123", label: "launch" }] }, "PUT")).status, 400);
  await sources.screenshot({ path: "/tmp/openbot-work-sources-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await sources.evaluate((element) => element.scrollWidth <= element.clientWidth + 1), "Brief sources overflow at 390px");
  await sources.screenshot({ path: "/tmp/openbot-work-sources-mobile.png" });
  await sources.getByRole("button", { name: "Save sources" }).click();
  await sources.getByRole("status").filter({ hasText: "Saved for this teammate" }).waitFor();
  await sources.locator(".work-source-footer").screenshot({ path: "/tmp/openbot-work-sources-mobile-footer.png" });
  const followups = page.locator(".work-sources").filter({ has: page.getByRole("heading", { name: "Your follow-ups" }) });
  await followups.getByText(/Suggestions from recent briefs/).click(); await followups.getByRole("button", { name: "Track this" }).click();
  await followups.getByRole("button", { name: "Mark done" }).waitFor();
  await followups.screenshot({ path: "/tmp/openbot-work-followups-mobile.png" });
  await followups.getByRole("button", { name: "Mark done" }).click(); await followups.getByRole("button", { name: "Show finished items" }).waitFor();
  await stop(); await start();
  assert.equal((await (await request("/api/work-sources/nova")).json()).lookbackHours, 72);
  assert.equal((await (await request("/api/work-followups")).json()).tracked[0].status, "done");
  assert.equal((await (await request("/api/state")).json()).studioRuns.filter((run: { status: string }) => run.status === "running").length, 0);
  console.log("PASS: scoped source selection/save, invalid grant rejection, local tracking, restart persistence and desktop/390px layout; no model or live app calls.");
} finally { await browser?.close(); await stop(); rmSync(data, { recursive: true, force: true }); }

// Headless isolated fixture: real owner routes and UI, no live model/account.
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";
import { OpenBotDatabase } from "../src/server/testing/database.js";
import { WorkflowValidation } from "../src/server/workflow-validation.js";

const root = mkdtempSync(path.join(tmpdir(), "openbot-workflow-checks-ui-")), data = path.join(root, "data");
const db = new OpenBotDatabase(root, { dataDir: data });
for (const botId of ["nova", "pixel", "scout"]) db.updateBot(botId, { providerInstanceId: db.listProviders()[0]!.id, model: "fixture/model" });
const skillPath = path.join(root, "SKILL.md"); writeFileSync(skillPath, "Read only the selected support ticket.");
const workflow = db.saveWorkflow({ botId: "nova", name: "Support read", skillSlug: "support-read", startUrl: "https://example.com/support", instructions: "Read the selected ticket and link the source.", skillPath, steps: [] });
const checks = new WorkflowValidation(db);
for (const input of ["Ticket Alpha", "Ticket Beta"]) {
  const id = checks.start(workflow.id, { input, expected: "Correct ticket title and source", confirmed: true }).checks.at(-1)!.runId;
  db.addActivity({ runId: id, botId: "nova", kind: "tool", label: "Fixture source read", detail: "Synthetic read-only ticket" });
  db.updateRun(id, { status: "completed", summary: `${input} has a login issue. Fixture source: https://example.com/support`, finishedAt: new Date().toISOString() });
  if (input === "Ticket Alpha") checks.review(workflow.id, id, { verdict: "passed", reviewedResult: true });
}
db.close();
const socket = createServer(); await new Promise<void>((r) => socket.listen(0, "127.0.0.1", r));
const port = (socket.address() as { port: number }).port; await new Promise<void>((r) => socket.close(() => r()));
const base = `http://127.0.0.1:${port}`;
let child: ChildProcess | undefined, browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
async function request(route: string, body?: unknown, method = "POST") {
  return fetch(base + route, { method: body === undefined ? "GET" : method, headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15_000) });
}
async function stop() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  for (let n = 0; n < 60 && child.exitCode === null && child.signalCode === null; n++) await delay(100);
  if (child.exitCode === null && child.signalCode === null) { child.kill("SIGKILL"); await new Promise<void>((r) => child!.once("close", r)); }
}
async function start() {
  child = spawn(process.execPath, ["--import", "tsx", "src/server/index.ts"], { stdio: "ignore", env: { ...process.env, OPENBOT_LOAD_ENV: "0", OPENBOT_DATA_DIR: data, OPENBOT_PORT: String(port), OPENBOT_HOST: "127.0.0.1", OPENBOT_APP_URL: base, OPENBOT_DEPLOYMENT_MODE: "local", NODE_ENV: "production" } });
  for (let n = 0; n < 100; n++) { try { if ((await request("/api/healthz")).ok) return; } catch {} await delay(150); }
  throw new Error("Disposable host did not start");
}
try {
  await start();
  const routine = { name: "Support review", botId: "nova", threadId: "bot-nova", prompt: "/support-read ticket Gamma", intervalMinutes: 1440 };
  const denied = await request("/api/routines", routine);
  assert.equal(denied.status, 409); assert.equal((await denied.json()).code, "workflow_check_required");
  assert.equal((await request(`/api/extensions/workflows/${workflow.id}/checks`, { input: "Ticket Gamma", expected: "Correct source" })).status, 400);
  const draft = await (await request("/api/routines", { ...routine, enabled: false })).json(); assert.ok(draft.id);
  browser = await chromium.launch({ executablePath: process.env.OPENBOT_CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(10_000);
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base + "/?panel=teach");
  await page.getByText("Teach and manage your own workflows", { exact: true }).click();
  await page.getByRole("button", { name: "Checks", exact: true }).click();
  const panel = page.getByRole("region", { name: "Checks for Support read" });
  await panel.getByText(/Check two different inputs and review/).waitFor();
  assert.equal(await panel.getByRole("button", { name: "Matches expected result" }).isEnabled(), false);
  await panel.getByText("Review the result", { exact: true }).first().click();
  await panel.getByRole("checkbox", { name: "I compared the result and its sources with the expected outcome." }).check();
  await panel.getByRole("button", { name: "Matches expected result" }).click();
  await panel.getByText(/Two different inputs checked by you/).waitFor();
  await page.setViewportSize({ width: 1280, height: 1000 });
  await panel.screenshot({ path: "/tmp/openbot-workflow-checks-desktop.png" });
  assert.equal((await request(`/api/routines/${draft.id}`, { enabled: true }, "PATCH")).status, 200);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
  await panel.getByRole("button", { name: "Refresh checks" }).click({ trial: true });
  await panel.screenshot({ path: "/tmp/openbot-workflow-checks-mobile.png" });
  await stop(); await start();
  assert.equal((await (await request(`/api/extensions/workflows/${workflow.id}/checks`)).json()).ready, true);
  writeFileSync(skillPath, "Changed skill: read a different support page.");
  const changed = await request(`/api/routines/${draft.id}/run`, { confirmed: true });
  assert.equal(changed.status, 409);
  assert.equal((await (await request(`/api/routines/${draft.id}/events`)).json()).length, 0, "Rejected dispatch must not leave an orphan event");
  assert.equal((await (await request(`/api/routines/${draft.id}/runs`)).json()).length, 0);
  assert.equal((await request(`/api/routines/${draft.id}`, { enabled: false }, "PATCH")).status, 200);
  assert.deepEqual(errors, []);
  console.log("PASS: actual owner API and UI, model-free synthetic completed runs, explicit review, blocked scheduling, paused drafts, enable after two inputs, persistence, changed-file rejection before event creation, desktop/390px layout. No real account or model used.");
} finally { await browser?.close(); await stop(); rmSync(root, { recursive: true, force: true }); }

// Production API + fresh browser, disposable data, no model or real app calls.
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";
import type { AppState, Routine, ProviderInstance } from "../src/shared/types.js";

const data = mkdtempSync(path.join(tmpdir(), "openbot-calendar-api-"));
const socket = createServer();
await new Promise<void>((resolve) => socket.listen(0, "127.0.0.1", resolve));
const port = (socket.address() as { port: number }).port;
await new Promise<void>((resolve) => socket.close(() => resolve()));
const base = `http://127.0.0.1:${port}`;
let child: ChildProcess | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
async function request(route: string, body?: unknown, method = "POST") {
  return fetch(base + route, { method: body === undefined ? "GET" : method, headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15_000) });
}
async function start() {
  child = spawn(process.execPath, ["--import", "tsx", "src/server/index.ts"], { cwd: path.resolve(import.meta.dirname, ".."), stdio: "ignore",
    env: { ...process.env, OPENBOT_LOAD_ENV: "0", OPENBOT_SEED_STARTER_BOTS: "1", OPENBOT_DATA_DIR: data, OPENBOT_PORT: String(port), OPENBOT_HOST: "127.0.0.1", OPENBOT_APP_URL: base, OPENBOT_DEPLOYMENT_MODE: "local", NODE_ENV: "production" } });
  for (let n = 0; n < 100; n++) { try { if ((await request("/api/healthz")).ok) return; } catch {} await delay(150); }
  throw new Error("Disposable schedule host did not start");
}
async function stop() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  for (let n = 0; n < 40 && child.exitCode === null && child.signalCode === null; n++) await delay(100);
  if (child.exitCode === null && child.signalCode === null) { child.kill("SIGKILL"); await new Promise<void>((resolve) => child!.once("close", resolve)); }
}
try {
  await start();
  const provider: ProviderInstance = await (await request("/api/providers", { name: "Non-dispatching test provider", authMode: "api_key", apiConfig: { baseUrl: "http://127.0.0.1:1/v1", protocol: "openai-compatible", modelIds: ["fixture"] } })).json();
  for (const id of ["nova", "pixel", "scout"]) assert.equal((await request(`/api/bots/${id}`, { providerInstanceId: provider.id, model: `openbot-${provider.id}/fixture` }, "PATCH")).status, 200);
  // Always place this natural-language occurrence safely in the future, including
  // when the check runs at the boundary of its selected time zone.
  const future = new Date(Date.now() + 3_600_000);
  const time = future.toISOString().slice(11, 16);
  const natural = await request("/api/messages", { threadId: "bot-nova", body: `Every day at ${time} UTC prepare a concise brief`, timeZone: "Europe/Brussels" });
  assert.equal(natural.status, 201);
  const routine: Routine = (await natural.json()).routines[0];
  assert.equal(routine.schedule?.kind, "calendar");
  assert.match(routine.scheduleLabel!, /UTC/);
  const preview = await (await request("/api/routines/preview", { schedule: routine.schedule, intervalMinutes: 1440, routineId: routine.id })).json();
  assert.equal(preview.nextRuns.length, 3);
  assert.equal(preview.nextRuns[0], routine.nextRunAt);
  assert.equal((await request("/api/routines/preview", { schedule: { ...routine.schedule, timeZone: "Mars/Base" }, intervalMinutes: 1440 })).status, 400);
  assert.equal((await request(`/api/routines/${routine.id}`, { name: "Retitled brief" }, "PATCH")).status, 200);
  await stop(); await start();
  let state: AppState = await (await request("/api/state")).json();
  assert.equal(state.routines.find((r) => r.id === routine.id)!.nextRunAt, routine.nextRunAt);
  assert.equal(state.studioRuns.length, 0, "Routine creation must not dispatch a model");
  const baseInput = { name: "Once", botId: "nova", threadId: "bot-nova", prompt: "A one-time reminder", intervalMinutes: 1440, schedule: { kind: "once", timeZone: "UTC", at: new Date(Date.now() - 60_000).toISOString() } };
  assert.equal((await request("/api/routines", baseInput)).status, 400);
  assert.equal((await request("/api/routines", { ...baseInput, enabled: false })).status, 201);

  browser = await chromium.launch({ executablePath: process.env.OPENBOT_CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, timezoneId: "Europe/Brussels" });
  await page.goto(`${base}/?panel=routines`);
  const newButton = page.getByRole("button", { name: "Add an automation" });
  await newButton.click();
  const form = page.locator(".routine-form");
  await form.getByLabel("Name", { exact: true }).fill("Weekday review");
  await form.getByLabel("What should happen?", { exact: true }).fill("Prepare a source-linked brief. Do not send messages.");
  await form.getByLabel("Time", { exact: true }).fill("08:00");
  await form.locator(".schedule-zone > summary").click();
  await form.getByLabel("Time zone", { exact: true }).fill("Europe/Brussels");
  await page.waitForFunction(() => document.querySelectorAll(".schedule-preview li").length === 2 && document.querySelector(".schedule-preview > strong")?.textContent === "Next run");
  await form.locator(".schedule-zone > summary").click();
  await form.locator(".calendar-schedule-fields").screenshot({ path: "/tmp/openbot-calendar-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await form.evaluate((element) => element.scrollWidth <= element.clientWidth + 1), "Schedule form overflows at phone width");
  await form.locator(".calendar-schedule-fields").screenshot({ path: "/tmp/openbot-calendar-mobile.png" });
  await form.getByRole("button", { name: /create automation/i }).click();
  await form.waitFor({ state: "detached" });
  state = await (await request("/api/state")).json();
  const created = state.routines.find((r) => r.name === "Weekday review")!;
  assert.deepEqual(created.schedule, { kind: "calendar", timeZone: "Europe/Brussels", time: "08:00", daysOfWeek: [1, 2, 3, 4, 5] });
  await page.getByRole("button", { name: "Add an automation" }).click();
  await form.getByLabel("Name", { exact: true }).fill("One calendar selection");
  await form.getByLabel("What should happen?", { exact: true }).fill("A future fixture. Do not run during the test.");
  await form.getByLabel("Repeat", { exact: true }).selectOption("once");
  await form.getByRole("button", { name: "Next month", exact: true }).click();
  const firstDate = form.locator(".schedule-calendar td:not(.outside) button").first();
  await firstDate.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  const chosenDate = await form.locator(".schedule-calendar td.picked button").getAttribute("data-date");
  assert.ok(chosenDate?.endsWith("-02"), "Arrow keys and Enter choose the next actual day");
  const submit = form.getByRole("button", { name: /create automation/i });
  await form.getByLabel("Time", { exact: true }).fill("");
  await delay(600);
  assert.equal(await submit.isDisabled(), true, "A stale preview cannot validate an empty time");
  await form.getByLabel("Time", { exact: true }).fill("09:45");
  await page.waitForFunction(() => document.querySelector(".schedule-preview > strong")?.textContent === "Next run");
  await form.locator(".calendar-schedule-fields").screenshot({ path: "/tmp/openbot-calendar-once-mobile.png" });
  await submit.click();
  await form.waitFor({ state: "detached" });
  state = await (await request("/api/state")).json();
  const onceCreated = state.routines.find((r) => r.name === "One calendar selection")!;
  assert.equal(onceCreated.schedule?.kind, "once");
  if (onceCreated.schedule?.kind === "once") {
    assert.equal(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(onceCreated.schedule.at)), chosenDate);
    assert.equal(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Brussels", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(onceCreated.schedule.at)), "09:45");
  }
  await request(`/api/routines/${onceCreated.id}`, { enabled: false }, "PATCH");
  await request(`/api/routines/${created.id}`, { enabled: false }, "PATCH");
  await request(`/api/routines/${routine.id}`, { enabled: false }, "PATCH");
  assert.equal(state.studioRuns.length, 0);
  console.log("PASS: natural calendar setup, preview/save agreement, invalid-zone/past-date rejection, restart preservation, desktop/390px creation; zero model runs. Screenshots in /tmp/openbot-calendar-{desktop,mobile}.png");
} finally { await browser?.close(); await stop(); rmSync(data, { recursive: true, force: true }); }

// Visual/layout QA for the current web client: three viewports, seeded
// conversations with markdown, capability-panel routing, no horizontal
// overflow, no page errors. Production API + fresh browser, disposable data,
// no model or real app calls.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";
import { OpenBotDatabase } from "../src/server/testing/database.js";

const root = mkdtempSync(path.join(tmpdir(), "openbot-design-fixture-"));
const data = path.join(root, "data");
const output = process.env.OPENBOT_DESIGN_OUTPUT || "/tmp/openbot-quiet-studio-qa";
mkdirSync(output, { recursive: true });
const db = new OpenBotDatabase(root, { dataDir: data });
db.addMessage({ threadId: "team-room", senderType: "user", senderId: null, body: "Help me plan tomorrow." });
db.addMessage({ threadId: "team-room", senderType: "bot", senderId: "nova", body: "Here is a **calm plan** for tomorrow." });
db.close();
const socket = createServer();
await new Promise<void>((resolve) => socket.listen(0, "127.0.0.1", resolve));
const port = (socket.address() as { port: number }).port;
await new Promise<void>((resolve) => socket.close(() => resolve()));
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ["--import", "tsx", "src/server/index.ts"], { stdio: "ignore", env: { ...process.env, OPENBOT_LOAD_ENV: "0", OPENBOT_SEED_STARTER_BOTS: "1", OPENBOT_DATA_DIR: data, OPENBOT_PORT: String(port), OPENBOT_HOST: "127.0.0.1", OPENBOT_APP_URL: base, NODE_ENV: "production", OPENBOT_DEPLOYMENT_MODE: "local" } });
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  let ready = false;
  for (let n = 0; n < 100; n++) { try { if ((await fetch(base + "/api/healthz")).ok) { ready = true; break; } } catch {} await delay(150); }
  assert.ok(ready, "Disposable host must start");
  browser = await chromium.launch({ executablePath: process.env.OPENBOT_CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const [name, width, height] of [["desktop", 1440, 1000], ["phone", 390, 844], ["small-phone", 320, 740]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto(base, { waitUntil: "networkidle" });
    await page.locator(".chat-message").first().waitFor();
    // Markdown renders inside the conversation, not as raw asterisks.
    assert.ok(await page.locator(".chat-message strong").filter({ hasText: "calm plan" }).first().isVisible(), `${name}: markdown renders`);
    // The roster lists the studio and its teammates.
    assert.ok(await page.locator(".conversation-row").count() >= 4, `${name}: roster renders`);
    await page.evaluate(() => document.fonts.ready);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name} page overflows`);
    await page.screenshot({ path: path.join(output, `${name}-home.png`) });
  }
  for (const panel of ["provider", "connectors", "routines", "teach", "live"] as const) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(base + "/?panel=" + panel, { waitUntil: "networkidle" });
    await delay(400);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert.ok(overflow <= 1, `${panel} panel overflows by ${overflow}px`);
    await page.screenshot({ path: path.join(output, `desktop-${panel}.png`) });
  }
  // Connector search narrows the catalog to the matching app.
  await page.goto(base + "/?panel=connectors", { waitUntil: "networkidle" });
  await page.getByLabel("Find an app").fill("gmail");
  assert.equal(await page.locator(".connector-card").count(), 1);
  // Skill search reports empty results honestly.
  await page.goto(base + "/?panel=teach", { waitUntil: "networkidle" });
  await page.getByLabel("Find a skill").fill("not-a-real-skill");
  await page.getByText("No matching skills. Try another name.").waitFor();
  assert.deepEqual(errors, []);
  console.log(`PASS: desktop/390px/320px web client renders seeded conversations with markdown, the roster, and no horizontal overflow; five capability panels route and fit; connector and skill search behave; no page errors. Screenshots: ${output}. Synthetic data only.`);
} finally {
  await browser?.close();
  child.kill("SIGTERM");
  for (let n = 0; n < 60 && child.exitCode === null && child.signalCode === null; n++) await delay(100);
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  rmSync(root, { recursive: true, force: true });
}

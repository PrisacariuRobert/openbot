// Task R3 in the shipped web UI: "Submit to the gallery" in a teammate's settings
// opens GitHub's gallery form filled in with that teammate, and sends nothing itself.
// A disposable host with the starter teammates; the GitHub page is never loaded.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";

const data = mkdtempSync(path.join(tmpdir(), "openbot-gallery-submit-ui-"));
const home = path.join(data, "home");
mkdirSync(home, { recursive: true });
const socket = createServer();
await new Promise<void>((resolve) => socket.listen(0, "127.0.0.1", resolve));
const port = (socket.address() as { port: number }).port;
await new Promise<void>((resolve) => socket.close(() => resolve()));
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ["--import", "tsx", "src/server/index.ts"], {
  cwd: path.resolve(import.meta.dirname, ".."), stdio: "ignore",
  env: { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR, HOME: home, OPENBOT_LOAD_ENV: "0", OPENBOT_SEED_STARTER_BOTS: "1", OPENBOT_DATA_DIR: data, OPENBOT_PORT: String(port), OPENBOT_HOST: "127.0.0.1", OPENBOT_APP_URL: base, OPENBOT_DEPLOYMENT_MODE: "local", NODE_ENV: "production" },
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  let ready = false;
  for (let n = 0; n < 100 && !ready; n++) { try { ready = (await fetch(base + "/api/healthz")).ok; } catch { await delay(150); } }
  assert.ok(ready, "Disposable host did not start");
  browser = await chromium.launch({ executablePath: process.env.OPENBOT_CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark" });
  const outside: string[] = [], errors: string[] = [];
  await context.route("**/*", (route) => { const url = new URL(route.request().url()); if (url.origin !== base) { outside.push(url.href); return route.abort("blockedbyclient"); } return route.continue(); });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => { (window as unknown as { opened: string[] }).opened = []; window.open = ((url: string) => { (window as unknown as { opened: string[] }).opened.push(url); return null; }) as typeof window.open; });
  await page.goto(`${base}/?panel=bot&thread=bot-nova`);
  // Sharing sits under Advanced Teammate Options.
  await page.getByText("Advanced Teammate Options").first().click();
  const submit = page.getByRole("button", { name: "Submit to the gallery" });
  await submit.waitFor();
  await submit.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("status").filter({ hasText: "The form opened on GitHub" }).waitFor();
  const opened = await page.evaluate(() => (window as unknown as { opened: string[] }).opened);
  assert.equal(opened.length, 1);
  const form = new URL(opened[0]!);
  assert.equal(`${form.origin}${form.pathname}`, "https://github.com/PrisacariuRobert/sidemates/issues/new");
  assert.equal(form.searchParams.get("template"), "gallery_submission.yml");
  assert.equal(form.searchParams.get("title"), "[Gallery] Nova");
  assert.equal(JSON.parse(form.searchParams.get("teammate")!).bot.name, "Nova", "the teammate file travels in the form");
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), "no sideways scroll at 390 px");
  await page.screenshot({ path: "/tmp/openbot-gallery-submit-dark-390.png" });
  assert.deepEqual(outside, [], "nothing was sent anywhere");
  assert.deepEqual(errors, []);
  console.log("PASS: Submit to the gallery opens GitHub's form prefilled with the teammate, by keyboard, at 390 px dark; nothing sent.");
} finally {
  await browser?.close();
  child.kill("SIGTERM");
  for (let n = 0; n < 40 && child.exitCode === null; n++) await delay(100);
  rmSync(data, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); // the server may still be closing its files
}

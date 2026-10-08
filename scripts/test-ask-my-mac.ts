// Task F7 in the shipped web UI: the "Ask my Mac" panel answers from the on-device
// index, by keyboard alone: type, Return, ↑/↓, Return opens a source, Esc clears.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";
import { OpenBotDatabase } from "../src/server/testing/database.js";
import { PersonalIndex } from "../src/server/personal-index.js";

const root = mkdtempSync(path.join(tmpdir(), "openbot-ask-my-mac-"));
const home = path.join(root, "home");
mkdirSync(home, { recursive: true });
const seed = new OpenBotDatabase(root);
const dataDir = seed.dataDir;
seed.close();
const index = new PersonalIndex(path.join(dataDir, "personal-index.sqlite"));
index.upsert([
  { source: "mail", key: "4101", title: "Your Berlin trip: booking confirmed", author: "trains@rail.example", at: "2026-09-28T09:00:00Z", body: "Your train to Berlin leaves Vienna Hbf on Friday 16 October at 07:12 from platform 9." },
  { source: "notes", key: "x-coredata://note/p13", title: "Gift ideas for Mira", author: "Notes", at: "2026-09-02T10:00:00Z", body: "Mira's birthday 3 November: a ceramics class, the blue Moleskine, tickets for the Klimt exhibition." },
  { source: "files", key: "/Users/fixture/Documents/Lease 2026.pdf", title: "Lease 2026.pdf", author: "/Users/fixture/Documents", at: "2026-01-10T10:00:00Z", body: "The tenancy ends on 31 March 2027. Three months notice in writing." },
]);
index.close();

const socket = createServer();
await new Promise<void>((resolve) => socket.listen(0, "127.0.0.1", resolve));
const port = (socket.address() as { port: number }).port;
await new Promise<void>((resolve) => socket.close(() => resolve()));
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ["--import", "tsx", "src/server/index.ts"], {
  cwd: path.resolve(import.meta.dirname, ".."), stdio: "ignore",
  env: { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR, HOME: home, OPENBOT_LOAD_ENV: "0", OPENBOT_DATA_DIR: dataDir, OPENBOT_PORT: String(port), OPENBOT_HOST: "127.0.0.1", OPENBOT_APP_URL: base, OPENBOT_DEPLOYMENT_MODE: "local", NODE_ENV: "production", OPENBOT_OLLAMA_URL: "http://127.0.0.1:9" },
});

let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  let ready = false;
  for (let n = 0; n < 100 && !ready; n++) { try { ready = (await fetch(base + "/api/healthz")).ok; } catch { await delay(150); } }
  assert.ok(ready, "Disposable host did not start");
  browser = await chromium.launch({ executablePath: process.env.OPENBOT_CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  for (const colorScheme of ["light", "dark"] as const) {
    const context = await browser.newContext({ viewport: { width: 640, height: 460 }, colorScheme });
    const outside: string[] = [], errors: string[] = [], opened: string[] = [];
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== base) { outside.push(url.href); return route.abort("blockedbyclient"); }
      if (url.pathname === "/api/ask/open") opened.push(route.request().postData() || "");
      return route.continue();
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/ask`);
    const box = page.getByLabel("Ask about your own mail, notes and files");
    await box.waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.id), "ask-question", "the box has focus on open");
    await page.keyboard.type("What could I give Mira for her birthday?");
    await page.keyboard.press("Enter");
    const sources = page.getByRole("list", { name: "Sources" });
    await sources.getByText("Gift ideas for Mira").waitFor();
    assert.equal(await sources.locator("li").first().getByText("Gift ideas for Mira").count(), 1, "the right source first");
    await page.getByText("For a written answer that stays on this Mac, add a model in Ollama.", { exact: false }).waitFor();
    await page.screenshot({ path: `/tmp/openbot-ask-my-mac-${colorScheme}.png` });
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Enter");
    await page.getByRole("status").filter({ hasText: "Opening sources works in Sidemates on a Mac." }).waitFor();
    assert.deepEqual(opened.map((body) => JSON.parse(body)), [{ source: "notes", key: "x-coredata://note/p13" }]);
    await page.keyboard.press("Escape");
    assert.equal(await box.inputValue(), "", "Esc clears");
    assert.equal(await sources.count(), 0);
    assert.equal((await fetch(`${base}/api/ask/open`, { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify({ source: "files", key: "/etc/passwd" }) })).status, 404, "only what the index holds can be opened");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 640));
    assert.deepEqual(outside, [], "nothing was sent anywhere");
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log("PASS: Ask my Mac answers from the on-device index by keyboard alone (focus on open, Return, ↑/↓, Return opens, Esc clears), the right source first, opens only indexed items; 640 × 460, light and dark; nothing sent.");
} finally {
  await browser?.close();
  child.kill("SIGTERM");
  for (let n = 0; n < 40 && child.exitCode === null; n++) await delay(100);
  rmSync(root, { recursive: true, force: true });
}

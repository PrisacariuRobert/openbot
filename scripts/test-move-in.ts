// Task F8 in the shipped web UI: memories in from a ChatGPT export (reviewed),
// the teammate out as plain files, and those files back in as the same teammate.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { chromium } from "playwright-core";
import { OpenBotDatabase } from "../src/server/testing/database.js";

const root = mkdtempSync(path.join(tmpdir(), "openbot-move-in-"));
const home = path.join(root, "home");
mkdirSync(home, { recursive: true });
const seed = new OpenBotDatabase(root);
const nova = seed.getBot("nova")!;
const dataDir = seed.dataDir, threadId = nova.threadId;
seed.close();
// A synthetic ChatGPT export.
const exportZip = path.join(root, "chatgpt-export.zip");
writeFileSync(exportZip, zipSync({ "conversations.json": strToU8(JSON.stringify([{ title: "Weekend", mapping: {
  a: { message: { author: { role: "user" }, content: { parts: ["I live in Vienna and I work as a product designer at Acme. Plan a weekend in Graz?"] } } },
  b: { message: { author: { role: "assistant" }, content: { parts: ["I am an AI."] } } },
  c: { message: { author: { role: "user" }, content: { parts: ["I prefer trains over cars. I'm allergic to peanuts."] } } },
} }])) }));

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
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark", acceptDownloads: true });
  const outside: string[] = [], errors: string[] = [];
  await context.route("**/*", (route) => { const url = new URL(route.request().url()); if (url.origin !== base) { outside.push(url.href); return route.abort("blockedbyclient"); } return route.continue(); });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => void dialog.accept());

  // 1. Move in from ChatGPT, by keyboard.
  await page.goto(`${base}/?panel=team`);
  const card = page.getByRole("region", { name: "Move in" });
  await card.getByRole("combobox").selectOption({ label: "Nova" });
  const chooser = page.waitForEvent("filechooser", { timeout: 15_000 });
  chooser.catch(() => undefined);
  await card.getByRole("button", { name: "Choose an export" }).focus();
  await page.keyboard.press("Enter");
  await (await chooser).setFiles(exportZip);
  await card.getByRole("status").filter({ hasText: "3 facts from your ChatGPT export wait for your review. Nothing is used until you keep it." }).waitFor();
  await card.screenshot({ path: "/tmp/openbot-move-in-dark-390.png" });
  assert.equal(((await (await fetch(`${base}/api/extensions/memory/nova`)).json()) as unknown[]).length, 0, "nothing used before review");

  // 2. Review: keep all three.
  await card.getByRole("button", { name: "Review on What Nova remembers" }).click();
  const queue = page.getByRole("group", { name: "Waiting for your review" });
  await queue.getByText("From your ChatGPT export", { exact: false }).first().waitFor();
  await queue.getByRole("button", { name: "Keep all 3" }).click();
  await page.getByText("Nothing waiting for review.").waitFor();
  const kept = (await (await fetch(`${base}/api/extensions/memory/nova`)).json()) as Array<{ content: string }>;
  assert.deepEqual(kept.map((memory) => memory.content).sort(), ["I live in Vienna and I work as a product designer at Acme.", "I prefer trains over cars.", "I'm allergic to peanuts."]);

  // 3. Take Nova out as files.
  await page.goto(`${base}/?panel=bot&thread=${threadId}`);
  await page.getByText("Advanced Teammate Options").first().click();
  const download = page.waitForEvent("download", { timeout: 15_000 });
  download.catch(() => undefined);
  await page.getByRole("link", { name: "Take Nova out as files" }).click();
  const saved = path.join(root, "nova.sidemates.zip");
  await (await download).saveAs(saved);
  const files = unzipSync(new Uint8Array(readFileSync(saved)));
  assert.match(strFromU8(files["nova/AGENTS.md"]!), /# Nova[\s\S]*I'm allergic to peanuts\./);
  assert.ok(files["nova/teammate.json"] && files["nova/memory.md"] && files["nova/README.md"]);

  // 4. Back in as the same teammate.
  await page.goto(`${base}/?panel=team`);
  const again = page.waitForEvent("filechooser", { timeout: 15_000 });
  again.catch(() => undefined);
  await page.getByRole("region", { name: "Move in" }).getByRole("button", { name: "Choose an export" }).click();
  await (await again).setFiles(saved);
  await page.getByRole("region", { name: "Move in" }).getByRole("status").filter({ hasText: "Nova is back" }).waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 390), "no sideways scrolling");

  assert.deepEqual(outside, [], "nothing was sent anywhere");
  assert.deepEqual(errors, []);
  console.log("PASS: a ChatGPT export's facts wait for review and are kept, Nova goes out as plain files (AGENTS.md, memory, teammate.json) and comes back in; keyboard, 390 px dark; nothing sent.");
} finally {
  await browser?.close();
  child.kill("SIGTERM");
  for (let n = 0; n < 40 && child.exitCode === null; n++) await delay(100);
  rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); // the server may still be closing its files
}

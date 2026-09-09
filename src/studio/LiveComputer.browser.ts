// Real React components and SSE hub, disposable browser, no owner account.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createServer } from "vite";
import { chromium } from "playwright-core";
import sharp from "sharp";
import { LiveViewHub, type LiveViewEvent } from "../server/live-view.js";

const jpeg = (await sharp({ create: { width: 1280, height: 820, channels: 3, background: "#eeeeee" } }).jpeg().toBuffer()).toString("base64");
let emit!: (event: LiveViewEvent) => void, starts = 0;
const posts: Array<{ url: string; body: string }> = [];
const hub = new LiveViewHub(async (_id, callback) => {
  starts++; emit = callback;
  callback({ type: "status", browser: "ready", title: "Synthetic browser", currentUrl: "https://example.test" });
  callback({ type: "frame", jpeg });
  return { stop() {} };
});
const entry = path.join(process.cwd(), "live-computer-fixture.tsx");
const server = await createServer({ configFile: false, root: process.cwd(), server: { host: "127.0.0.1", port: 0 }, plugins: [{
  name: "live-computer-fixture",
  resolveId(id) { if (id === "/live-computer-fixture.tsx") return entry; },
  load(id) { if (id === entry) return `import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{LiveComputer,ComputerTakeover}from'/src/studio/LiveComputer.tsx';import'/src/studio/studio.css';import'/src/studio/conversation-shell.css';import'/src/studio/design-tokens.css';function App(){const[open,setOpen]=useState(false);const bot={id:'fixture',name:'Fixture'};return <><LiveComputer bot={bot} threadId="fixture" onTakeover={()=>setOpen(true)}/>{open&&<ComputerTakeover bot={bot} onClose={()=>setOpen(false)}/>}</>};createRoot(document.getElementById('root')).render(<App/>);`; },
  configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
    if (req.url === "/") { res.setHeader("content-type", "text/html"); res.end('<html><body><div id="root"></div><script type="module" src="/live-computer-fixture.tsx"></script></body></html>'); return; }
    if (req.url === "/api/bots/fixture/computer/live") {
      res.setHeader("content-type", "text/event-stream"); res.flushHeaders();
      const send = (event: LiveViewEvent) => res.write(`data: ${JSON.stringify(event)}\n\n`);
      hub.subscribe("fixture", send); req.on("close", () => hub.unsubscribe("fixture", send)); return;
    }
    if (req.url?.startsWith("/api/") && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      posts.push({ url: req.url, body }); res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ url: "https://example.test", title: "Synthetic browser", screenshot: null })); return;
    }
    next();
  }); },
}] });
await server.listen();
const address = server.httpServer!.address(); assert(address && typeof address === "object");
const browser = await chromium.launch({ executablePath: process.env.OPENBOT_CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const output = "/tmp/openbot-live-computer-qa"; mkdirSync(output, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${address.port}`);
  await page.getByAltText("Fixture’s current browser screen, updating live").waitFor();
  await page.getByRole("button", { name: "Open Agent Computer" }).click();
  const dialog = page.getByRole("dialog", { name: "Fixture’s Agent Computer" });
  await dialog.getByAltText("Fixture's browser, updating live").waitFor();
  assert.equal(starts, 1, "The larger panel reuses one source and gets an idle screen immediately");
  for (const name of ["Tab", "Enter", "Escape", "Backspace"]) assert.equal(await dialog.getByRole("button", { name, exact: true }).isDisabled(), true);
  assert.equal(await dialog.getByLabel("Browser address", { exact: true }).isDisabled(), true);
  assert.equal(await dialog.getByLabel("Private text to type into the focused field").isDisabled(), true);
  assert.equal(posts.length, 0, "Watching sends no control actions");
  await page.screenshot({ path: path.join(output, "watch-desktop.png") });
  await dialog.getByRole("button", { name: "Take control", exact: true }).click();
  await dialog.getByRole("button", { name: "Tab", exact: true }).click();
  assert.equal(posts.length, 1); assert.match(posts[0]!.url, /takeover\/key$/);
  await dialog.getByLabel("Private text to type into the focused field").fill("fixture-only text");
  await dialog.getByRole("button", { name: "Type", exact: true }).click();
  assert.equal(posts.length, 2); assert.equal(JSON.parse(posts[1]!.body).value, "fixture-only text");
  assert.equal(await dialog.getByLabel("Private text to type into the focused field").inputValue(), "");
  await dialog.getByRole("button", { name: "In control — click to act", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: path.join(output, "watch-phone.png") });
  emit({ type: "status", browser: "stopped" });
  await dialog.getByText("No browser open right now. Open a page above to begin.").waitFor();
  assert.equal(await dialog.locator("img").count(), 0, "Stopped streams clear old private screen images");
  assert.equal(posts.length, 2);
  assert.deepEqual(errors, []);
  console.log(`PASS: idle second viewer, one source, explicit control, private input clearing, stopped-frame clearing, desktop and 390px. ${output}`);
} finally { await browser.close(); await server.close(); }

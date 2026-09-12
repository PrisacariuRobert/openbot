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
const fixtureTabs = [{ id: "1", url: "https://example.test", title: "Synthetic browser" }];
let activeTab = 0;
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
    const tabView = () => ({ tabs: fixtureTabs.map((tab, index) => ({ id: tab.id, url: tab.url, title: tab.title, active: index === activeTab })), url: fixtureTabs[activeTab]!.url, title: fixtureTabs[activeTab]!.title });
    if (req.url === "/api/bots/fixture/browser/tabs" && req.method === "GET") {
      res.setHeader("content-type", "application/json"); res.end(JSON.stringify(tabView())); return;
    }
    if (req.url?.startsWith("/api/") && (req.method === "POST" || req.method === "DELETE")) {
      let body = ""; for await (const chunk of req) body += chunk;
      posts.push({ url: req.url, body });
      const parsed = (() => { try { return JSON.parse(body || "{}"); } catch { return {}; } })();
      if (req.url === "/api/bots/fixture/browser/tabs" && req.method === "POST") {
        const at = fixtureTabs.length + 1;
        fixtureTabs.push({ id: String(at), url: typeof parsed.url === "string" ? parsed.url : "about:blank", title: "Fixture tab " + at });
        activeTab = fixtureTabs.length - 1;
      } else if (req.url === "/api/bots/fixture/browser/nav") {
        // History navigation keeps the fixture tab; the view is unchanged.
      } else {
        const select = req.url.match(/\/api\/bots\/fixture\/browser\/tabs\/([^/]+)\/select$/);
        const close = req.url.match(/\/api\/bots\/fixture\/browser\/tabs\/([^/]+)$/);
        if (select) activeTab = Math.max(0, fixtureTabs.findIndex((tab) => tab.id === select[1]));
        else if (close && req.method === "DELETE" && fixtureTabs.length > 1) {
          const at = fixtureTabs.findIndex((tab) => tab.id === close[1]);
          if (at >= 0) { fixtureTabs.splice(at, 1); activeTab = Math.min(activeTab, fixtureTabs.length - 1); }
        }
      }
      res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ ...tabView(), screenshot: null })); return;
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
  const screen = dialog.getByRole("application", { name: /Live browser screen/ });
  assert.equal(await dialog.getByLabel("Browser address").isDisabled(), true);
  assert.equal(posts.length, 0, "Watching sends no control actions");
  assert.equal(await page.locator(".takeover-hidden-keys").count(), 1, "Touch-keyboard summoner is present but invisible");
  await page.screenshot({ path: path.join(output, "watch-desktop.png") });
  await dialog.getByRole("button", { name: "Take control", exact: true }).click();
  // Direct manipulation: click the screen, then type — no side box.
  // Keystroke POSTs are queued async; poll instead of asserting instantly.
  const waitPosts = async (count: number) => {
    for (let n = 0; n < 100 && posts.length < count; n++) await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(posts.length, count);
  };
  await screen.click({ position: { x: 640, y: 400 } });
  await waitPosts(1); assert.match(posts[0]!.url, /takeover\/click$/);
  await screen.press("Tab");
  await waitPosts(2); assert.match(posts[1]!.url, /takeover\/press$/);
  assert.equal(JSON.parse(posts[1]!.body).key, "Tab");
  await screen.press("a");
  await waitPosts(3); assert.equal(JSON.parse(posts[2]!.body).key, "a");
  // Owner shortcuts stay local: Cmd+T must not reach the page.
  await page.keyboard.press("Meta+t");
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(posts.length, 3, "Command combos never leave the app");
  // Real-browser chrome: one tab, live address, history buttons, new tab.
  // Tab POSTs land server-side before React renders: wait for the UI, then
  // assert the recorded requests.
  const strip = dialog.getByRole("tablist", { name: "Browser tabs" });
  const waitTabs = async (count: number) => {
    for (let n = 0; n < 100; n++) {
      if ((await strip.getByRole("tab").count()) === count) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.equal(await strip.getByRole("tab").count(), count);
  };
  const waitPost = async (pattern: RegExp) => {
    for (let n = 0; n < 100; n++) {
      if (posts.length && pattern.test(posts[posts.length - 1]!.url)) return posts[posts.length - 1]!;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.match(posts[posts.length - 1]?.url || "(none)", pattern);
    throw new Error("unreachable");
  };
  assert.equal(await strip.getByRole("tab").count(), 1);
  assert.equal(await dialog.getByLabel(/Browser address/).inputValue(), "https://example.test");
  await dialog.getByRole("button", { name: "Open a new tab", exact: true }).click();
  await waitTabs(2);
  assert.equal((await waitPost(/browser\/tabs$/)).body, "{}");
  assert.equal(await strip.getByRole("tab", { selected: true }).count(), 1);
  await dialog.getByRole("button", { name: "Go back", exact: true }).click();
  assert.equal(JSON.parse((await waitPost(/browser\/nav$/)).body).to, "back");
  await strip.getByRole("tab").first().click();
  assert.match((await waitPost(/tabs\/1\/select$/)).url, /tabs\/1\/select$/);
  await waitTabs(2);
  await page.screenshot({ path: path.join(output, "watch-tabs.png") });
  await dialog.getByRole("button", { name: "In control — click to act", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: path.join(output, "watch-phone.png") });
  emit({ type: "status", browser: "stopped" });
  await dialog.getByText("No browser open right now. Open a page above to begin.").waitFor();
  assert.equal(await dialog.locator("img").count(), 0, "Stopped streams clear old private screen images");
  assert.equal(await strip.getByRole("tab").count(), 0, "A stopped browser clears its tab strip");
  assert.deepEqual(errors, []);
  console.log(`PASS: idle second viewer, one source, explicit control, direct click-and-type, shortcut isolation, tab strip, address bar, history, stopped-frame clearing, desktop and 390px. ${output}`);
} finally { await browser.close(); await server.close(); }

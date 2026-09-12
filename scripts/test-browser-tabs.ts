// Real BrowserManager tabs against disposable fixture pages: tab CRUD, active
// tab routing for agent tools and snapshots, history navigation, tab cap, and
// last-tab protection. Local fixtures, no model or real account used.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { OpenBotDatabase } from "../src/server/testing/database.js";
import { BrowserManager } from "../src/server/runtime.js";

const root = mkdtempSync(path.join(tmpdir(), "openbot-browser-tabs-"));
const db = new OpenBotDatabase(root, { dataDir: path.join(root, "data") });
const browser = new BrowserManager(db, { headlessTeaching: true });
const server = createServer((req, res) => {
  const route = new URL(req.url || "/", "http://fixture").pathname;
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.end(`<!doctype html><title>Fixture ${route}</title><main><h1>Page ${route}</h1><p>Tab fixture content for ${route}.</p></main>`);
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
try {
  // One implicit tab from the first navigation.
  await browser.open("nova", `${base}/alpha`);
  let view = await browser.listTabs("nova");
  assert.equal(view.tabs.length, 1);
  assert.equal(view.tabs[0]!.active, true);
  assert.match(view.tabs[0]!.title, /Fixture \/alpha/);
  assert.match(view.url, /\/alpha/);

  // A second tab becomes active; the first keeps its page.
  view = await browser.openTab("nova", `${base}/beta`);
  assert.equal(view.tabs.length, 2);
  const beta = view.tabs.find((tab) => tab.active)!;
  assert.match(beta.url, /\/beta/);
  const alphaId = view.tabs.find((tab) => !tab.active)!.id;

  // Agent tools and snapshots follow the active tab, never the background one.
  assert.match(JSON.stringify(await browser.snapshot("nova")), /Page \/beta/);
  await browser.open("nova", `${base}/gamma`);
  assert.match(JSON.stringify(await browser.snapshot("nova")), /Page \/gamma/);
  view = await browser.listTabs("nova");
  assert.equal(view.tabs.length, 2, "Opening navigates the active tab; it must not mint tabs");

  // Selecting the background tab moves tools, snapshots, and the gate with it.
  view = await browser.selectTab("nova", alphaId);
  assert.equal(view.tabs.find((tab) => tab.id === alphaId)!.active, true);
  assert.match(JSON.stringify(await browser.snapshot("nova")), /Page \/alpha/);

  // History navigation stays inside the active tab.
  await browser.open("nova", `${base}/alpha-two`);
  view = await browser.navigateTab("nova", "back");
  assert.match(view.url, /\/alpha$/);
  assert.match(JSON.stringify(await browser.snapshot("nova")), /Page \/alpha[^/]/);
  view = await browser.navigateTab("nova", "forward");
  assert.match(view.url, /alpha-two/);
  view = await browser.navigateTab("nova", "reload");
  assert.match(view.url, /alpha-two/);
  // A fresh tab has no earlier page: honest error, not a silent no-op.
  await browser.openTab("nova");
  await assert.rejects(browser.navigateTab("nova", "back"), /No earlier page/);

  // Tab cap: fill to the limit, then refuse with guidance.
  for (let n = (await browser.listTabs("nova")).tabs.length; n < 8; n++) await browser.openTab("nova");
  assert.equal((await browser.listTabs("nova")).tabs.length, 8);
  await assert.rejects(browser.openTab("nova"), /already has 8 tabs/);

  // Closing returns to a remaining tab; the last tab is protected.
  const current = await browser.listTabs("nova");
  const victim = current.tabs.find((tab) => !tab.active)!.id;
  view = await browser.closeTab("nova", victim);
  assert.equal(view.tabs.length, 7);
  assert.ok(view.tabs.some((tab) => tab.active), "Closing must leave an active tab");
  for (const tab of (await browser.listTabs("nova")).tabs.slice(1)) await browser.closeTab("nova", tab.id);
  assert.equal((await browser.listTabs("nova")).tabs.length, 1);
  await assert.rejects(browser.closeTab("nova", (await browser.listTabs("nova")).tabs[0]!.id), /at least one tab/);
  await assert.rejects(browser.selectTab("nova", "nope"), /no longer open/);
  console.log("PASS: tab CRUD, active-tab routing for tools/snapshots, in-tab history, 8-tab cap, last-tab protection. Local fixtures only.");
} finally { await browser.close(); await new Promise<void>((resolve) => server.close(() => resolve())); db.close(); rmSync(root, { recursive: true, force: true }); }

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { OpenBotDatabase } from "./testing/database.js";
import { BrowserManager } from "./runtime.js";
import { EventEmitter } from "node:events";
import type { LiveViewEvent } from "./live-view.js";

test("screencast guards refuse safely before any launch", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-cast-guards-"));
  try {
    const db = new OpenBotDatabase(root);
    const browser = new BrowserManager(db);
    await assert.rejects(browser.screencastFrame("missing"), /Teammate not found/);
    db.updateBot("nova", { browserEnabled: false });
    await assert.rejects(browser.screencastFrame("nova"), /turned off/);
    assert.equal(browser.stopScreencast("nova"), false);
    db.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("watching an absent browser reports stopped without creating a page", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-watch-idle-")), db = new OpenBotDatabase(root);
  const browser = new BrowserManager(db), events: LiveViewEvent[] = [];
  browser.isAvailable = () => true;
  db.updateBot("nova", { browserEnabled: true });
  const source = await browser.startFrameSource("nova", event => events.push(event));
  try {
    await delay(0);
    assert.deepEqual(events, [{ type: "status", browser: "stopped", title: null, currentUrl: null }]);
    assert.equal((browser as unknown as { contexts: Map<string, unknown> }).contexts.size, 0);
  } finally { source.stop(); db.close(); rmSync(root, { recursive: true, force: true }); }
});

test("readiness precedes the first CDP frame; revocation, close and stop suppress further frames", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-watch-cdp-")), db = new OpenBotDatabase(root);
  const browser = new BrowserManager(db), events: LiveViewEvent[] = [], calls: string[] = [];
  const pageEvents = new EventEmitter(), cdpEvents = new EventEmitter();
  let closed = false, title = "Fixture page", url = "https://example.test";
  const page = { isClosed: () => closed, title: async () => title, url: () => url, once: pageEvents.once.bind(pageEvents) };
  const cdp = {
    on: cdpEvents.on.bind(cdpEvents), detach: async () => { calls.push('detach'); },
    send: async (method: string) => { calls.push(method); if (method === 'Page.startScreencast') cdpEvents.emit('Page.screencastFrame', { data: 'first-frame', sessionId: 1 }); },
  };
  browser.isAvailable = () => true; db.updateBot("nova", { browserEnabled: true });
  (browser as unknown as { contexts: Map<string, unknown> }).contexts.set('nova', { pages: () => [page], newCDPSession: async () => cdp });
  const source = await browser.startFrameSource('nova', event => events.push(event));
  try {
    await delay(0);
    assert.deepEqual(events, [{ type: 'status', browser: 'ready', title: 'Fixture page', currentUrl: 'https://example.test' }, { type: 'frame', jpeg: 'first-frame' }]);
    assert.ok(calls.includes('Page.screencastFrameAck'));
    title = "Loaded calendar"; url = "https://example.test/calendar";
    await delay(2100);
    assert.deepEqual(events.at(-1), { type: 'status', browser: 'ready', title, currentUrl: url }, 'Navigation updates the title and address instead of remaining on Loading');
    assert.equal(calls.filter(method => method === 'Page.startScreencast').length, 1, 'Metadata refresh does not restart the stream');
    const beforeRevocation = events.length;
    db.updateBot('nova', { browserEnabled: false });
    cdpEvents.emit('Page.screencastFrame', { data: 'revoked-frame', sessionId: 2 });
    assert.equal(events.length, beforeRevocation);
    closed = true; pageEvents.emit('close'); await delay(0);
    assert.deepEqual(events.at(-1), { type: 'status', browser: 'stopped', title: null, currentUrl: null });
    source.stop(); const count = events.length;
    cdpEvents.emit('Page.screencastFrame', { data: 'late-frame', sessionId: 3 });
    assert.equal(events.length, count); assert.ok(calls.includes('detach'));
  } finally { source.stop(); db.close(); rmSync(root, { recursive: true, force: true }); }
});

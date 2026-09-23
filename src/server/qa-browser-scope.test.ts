import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenBotDatabase } from "./testing/database.js";
import { BrowserManager } from "./runtime.js";
import { startCoreSiteFixture } from "../../verification/core-site-fixtures.js";

test("a scoped QA browser reaches its fixture and blocks a cross-origin redirect before the peer receives it", { timeout: 60_000 }, async () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-qa-browser-"));
  const db = new OpenBotDatabase(root);
  const browser = new BrowserManager(db);
  let peerRequests = 0;
  const peer = createServer((_request, response) => { peerRequests++; response.end("Wrong origin"); });
  await new Promise<void>(resolve => peer.listen(0, "127.0.0.1", resolve));
  const peerOrigin = `http://127.0.0.1:${(peer.address() as { port: number }).port}`;
  const fixture = createServer((request, response) => {
    if (request.url === "/redirect") { response.writeHead(302, { location: `${peerOrigin}/escape` }).end(); return; }
    response.writeHead(200, { "content-type": "text/html" }).end("<h1>Local QA fixture</h1>");
  });
  await new Promise<void>(resolve => fixture.listen(0, "127.0.0.1", resolve));
  const fixtureOrigin = `http://127.0.0.1:${(fixture.address() as { port: number }).port}`;
  const previous = process.env.OPENBOT_QA_BROWSER_ORIGIN;
  process.env.OPENBOT_QA_BROWSER_ORIGIN = fixtureOrigin;
  try {
    assert.equal((await browser.open("nova", fixtureOrigin)).title, "");
    await assert.rejects(browser.open("nova", `${fixtureOrigin}/redirect`), /restricted|ERR_BLOCKED_BY_CLIENT|blockedbyclient|net::ERR_FAILED/);
    assert.equal(peerRequests, 0, "The redirected request must not reach another local origin");
    await assert.rejects(browser.open("nova", peerOrigin), /restricted/);
  } finally {
    if (previous === undefined) delete process.env.OPENBOT_QA_BROWSER_ORIGIN;
    else process.env.OPENBOT_QA_BROWSER_ORIGIN = previous;
    await browser.close();
    await new Promise<void>(resolve => fixture.close(() => resolve()));
    await new Promise<void>(resolve => peer.close(() => resolve()));
    db.close(); rmSync(root, { recursive: true, force: true });
  }
});

test("scoped routing retains a local sign-in cookie for a protected fixture read", { timeout: 60_000 }, async () => {
  const site = await startCoreSiteFixture("P12", "v1");
  const root = mkdtempSync(path.join(tmpdir(), "openbot-qa-auth-browser-"));
  const db = new OpenBotDatabase(root);
  const browser = new BrowserManager(db);
  const previous = process.env.OPENBOT_QA_BROWSER_ORIGIN;
  process.env.OPENBOT_QA_BROWSER_ORIGIN = site.url;
  try {
    const owner = site.ownerSignIn!;
    await browser.open("nova", `${site.url}/login`);
    await browser.type("nova", "input[name=username]", owner.username);
    await browser.type("nova", "input[name=password]", owner.password);
    await browser.click("nova", "button");
    await browser.open("nova", `${site.url}/record/AC-PRIVATE-17`);
    assert.match((await browser.snapshot("nova")).text, /Due 2026-10-28/);
  } finally {
    if (previous === undefined) delete process.env.OPENBOT_QA_BROWSER_ORIGIN;
    else process.env.OPENBOT_QA_BROWSER_ORIGIN = previous;
    await browser.close(); await site.close(); db.close(); rmSync(root, { recursive: true, force: true });
  }
});

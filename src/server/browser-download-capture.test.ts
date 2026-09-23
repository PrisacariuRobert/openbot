import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { Page } from "playwright-core";
import { OpenBotDatabase } from "./testing/database.js";
import { BrowserManager } from "./runtime.js";
import { AttachmentService } from "./attachments.js";

test("browser capture preserves HTTP and blob downloads with colliding names across restart", { timeout: 30_000 }, async () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-browser-download-"));
  const httpBytes = Buffer.from("HTTP result\n");
  const blobBytes = Buffer.from("Blob result");
  const site = createServer((req, res) => {
    if (req.url === "/report") {
      res.setHeader("Content-Type", "text/plain");
      res.setHeader("Content-Disposition", 'attachment; filename="result.txt"');
      res.end(httpBytes);
      return;
    }
    res.setHeader("Content-Type", "text/html");
    res.end('<title>Exports</title><a id="http" href="/report" download="result.txt">HTTP</a><button id="blob" onclick="let a=document.createElement(\'a\');a.href=window.URL.createObjectURL(new window.Blob([\'Blob result\'],{type:\'text/plain\'}));a.download=\'result.txt\';a.click()">Blob</button>');
  });
  await new Promise<void>(resolve => site.listen(0, "127.0.0.1", resolve));
  const db = new OpenBotDatabase(root);
  const browser = new BrowserManager(db);
  let dbClosed = false;
  try {
    db.updateBot("nova", { browserEnabled: true });
    const run = db.createRun({ threadId: "bot-nova", botId: "nova", prompt: "Export both reports", status: "running" });
    const origin = "http://127.0.0.1:" + (site.address() as { port: number }).port;
    await browser.open("nova", origin);
    const armed = await browser.armDownloads("nova", run.id);
    assert.equal(armed.armed, true);
    const page = await (browser as unknown as { page(botId: string): Promise<Page> }).page("nova");
    const pageErrors: string[] = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    await page.locator("#http").click();
    await page.locator("#blob").click();
    let results = browser.downloadResults("nova", run.id);
    for (let i = 0; i < 100 && results.items.filter(item => item.status === "completed").length < 2; i++) {
      await delay(50);
      results = browser.downloadResults("nova", run.id);
    }
    assert.equal(results.items.length, 2, JSON.stringify({ results, pageErrors }));
    assert.deepEqual(results.items.map(item => item.status), ["completed", "completed"], JSON.stringify(results));
    assert.notEqual(results.items[0]!.attachmentId, results.items[1]!.attachmentId);
    const expected = [httpBytes, blobBytes];
    for (const [i, item] of results.items.entries()) {
      assert.equal(item.name, "result.txt");
      assert.deepEqual(readFileSync(db.attachmentFile(item.attachmentId!)!.storagePath), expected[i]);
      assert.equal(item.sha256, createHash("sha256").update(expected[i]!).digest("hex"));
      assert.equal(db.getAttachment(item.attachmentId!)?.metadata?.browserRunId, run.id);
    }
    assert.equal(db.listMessages("bot-nova").filter(message => message.body.includes("Browser result saved:")).length, 2);
    const ids = results.items.map(item => item.attachmentId!);
    await browser.close();
    db.close();
    dbClosed = true;
    const reopened = new OpenBotDatabase(root);
    try {
      for (const [i, id] of ids.entries()) assert.deepEqual(readFileSync(reopened.attachmentFile(id)!.storagePath), expected[i]);
    } finally { reopened.close(); }
  } finally {
    await browser.close();
    if (!dbClosed) db.close();
    site.closeAllConnections();
    await new Promise<void>(resolve => site.close(() => resolve()));
    rmSync(root, { recursive: true, force: true });
  }
});

test("stopping a task revokes an in-flight browser download before delivery", { timeout: 20_000 }, async () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-browser-stop-"));
  const site = createServer((req, res) => {
    if (req.url === "/slow") {
      res.setHeader("Content-Type", "text/plain");
      res.setHeader("Content-Disposition", 'attachment; filename="stopped.txt"');
      res.write("partial");
      setTimeout(() => res.end(" completion"), 700);
      return;
    }
    res.setHeader("Content-Type", "text/html");
    res.end('<title>Slow export</title><a id="slow" href="/slow" download="stopped.txt">Download</a>');
  });
  await new Promise<void>(resolve => site.listen(0, "127.0.0.1", resolve));
  const db = new OpenBotDatabase(root), browser = new BrowserManager(db);
  try {
    db.updateBot("nova", { browserEnabled: true });
    const run = db.createRun({ threadId: "bot-nova", botId: "nova", prompt: "Download, then stop", status: "running" });
    await browser.open("nova", "http://127.0.0.1:" + (site.address() as { port: number }).port);
    await browser.armDownloads("nova", run.id);
    const page = await (browser as unknown as { page(botId: string): Promise<Page> }).page("nova");
    await page.locator("#slow").click();
    db.updateRun(run.id, { status: "cancelled" });
    browser.revokeObservationsForBot("nova");
    await delay(800);
    const result = browser.downloadResults("nova", run.id);
    assert.equal(result.armed, false);
    assert.equal(result.items.some(item => item.status === "completed"), false);
    assert.equal(db.listMessages("bot-nova").filter(message => message.body.includes("Browser result saved:")).length, 0);
  } finally {
    await browser.close(); db.close();
    site.closeAllConnections();
    await new Promise<void>(resolve => site.close(() => resolve()));
    rmSync(root, { recursive: true, force: true });
  }
});

test("download storage sanitizes names, rejects unsafe sources, and reconciles a repeated result", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-browser-store-"));
  const db = new OpenBotDatabase(root);
  try {
    const run = db.createRun({ threadId: "bot-nova", botId: "nova", prompt: "Save a result", status: "running" });
    const source = path.join(root, "source.bin"), bytes = Buffer.from("one verified result");
    writeFileSync(source, bytes);
    const input = { botId: "nova", runId: run.id, ownerEpoch: db.botInputEpoch("nova"), sourcePath: source, suggestedName: "..\\..\\result.txt", resourceUrl: "https://example.test/download?secret=hidden", pageUrl: "https://example.test/reports?account=private", capturedAt: new Date().toISOString() };
    const service = new AttachmentService(db);
    const first = await service.captureBrowserDownload(input);
    const again = await service.captureBrowserDownload(input);
    assert.equal(again.id, first.id);
    assert.equal(first.name, "result.txt");
    assert.equal(first.metadata?.browserResource, "https://example.test/download");
    assert.equal(first.metadata?.browserPage, "https://example.test/reports");
    assert.equal(db.listMessages("bot-nova").filter(message => message.body.includes("Browser result saved:")).length, 1);
    assert.deepEqual(readFileSync(db.attachmentFile(first.id)!.storagePath), bytes);
    const link = path.join(root, "linked.bin");
    symlinkSync(source, link);
    await assert.rejects(service.captureBrowserDownload({ ...input, sourcePath: link }), /unsafe|exceeds/);
    const empty = path.join(root, "empty.bin");
    writeFileSync(empty, Buffer.alloc(0));
    await assert.rejects(service.captureBrowserDownload({ ...input, sourcePath: empty }), /empty/);
  } finally { db.close(); rmSync(root, { recursive: true, force: true }); }
});

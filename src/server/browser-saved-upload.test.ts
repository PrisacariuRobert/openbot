import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenBotDatabase } from "./testing/database.js";
import { BrowserManager, BrowserUploadUncertainError } from "./runtime.js";
import type { Page } from "playwright-core";

test("saved-file browser selection rechecks unique input, target and origin", { timeout: 20_000 }, async () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-browser-upload-")), db = new OpenBotDatabase(root), browser = new BrowserManager(db);
  let received = Buffer.alloc(0), filename = "";
  const site = createServer((request, response) => {
    if (request.url === "/upload") { const chunks: Buffer[] = []; request.on("data", chunk => chunks.push(chunk)); request.on("end", () => { received = Buffer.concat(chunks); filename = String(request.headers["x-file-name"] || ""); response.end("ok"); }); return; }
    response.setHeader("content-type", "text/html"); response.end(`<!doctype html><label for="cv">CV</label><input class="cv" id="cv" type="file">${request.url?.includes("duplicate") ? '<input class="cv" type="file">' : ""}<script>cv.onchange=async()=>{const f=cv.files[0];await fetch('/upload',{method:'POST',headers:{'x-file-name':f.name},body:await f.arrayBuffer()})}</script>`);
  });
  await new Promise<void>(resolve => site.listen(0, "127.0.0.1", resolve));
  try {
    db.updateBot("nova", { browserEnabled: true });
    const origin = `http://127.0.0.1:${(site.address() as { port: number }).port}`;
    await browser.open("nova", origin);
    const target = await browser.describeFileInput("nova", "#cv"), bytes = Buffer.from("exact saved cv");
    await browser.uploadFile("nova", "#cv", { name: "cv.pdf", mimeType: "application/pdf", buffer: bytes }, target.fingerprint, origin);
    for (let i = 0; !received.length && i < 50; i++) await new Promise(resolve => setTimeout(resolve, 20));
    assert.deepEqual(received, bytes); assert.equal(filename, "cv.pdf");
    await assert.rejects(browser.uploadFile("nova", "#cv", { name: "cv.pdf", mimeType: "application/pdf", buffer: bytes }, target.fingerprint, origin), /changed/);
    const fresh = await browser.describeFileInput("nova", "#cv");
    await assert.rejects(browser.uploadFile("nova", "#cv", { name: "cv.pdf", mimeType: "application/pdf", buffer: bytes }, fresh.fingerprint, "https://other.example"), /page changed/);
    await browser.open("nova", `${origin}/?duplicate=1`);
    await assert.rejects(browser.describeFileInput("nova", ".cv"), /exactly one/);
    await browser.open("nova", origin);
    const lastTarget = await browser.describeFileInput("nova", "#cv");
    const page = await (browser as unknown as { page(id: string): Promise<Page> }).page("nova");
    const title = page.title.bind(page);
    page.title = async () => { throw new Error("simulated lost page after selection"); };
    try {
      await assert.rejects(browser.uploadFile("nova", "#cv", { name: "cv.pdf", mimeType: "application/pdf", buffer: bytes }, lastTarget.fingerprint, origin), BrowserUploadUncertainError);
    } finally { page.title = title; }
  } finally { await browser.close(); db.close(); site.closeAllConnections(); await new Promise<void>(resolve => site.close(() => resolve())); rmSync(root, { recursive: true, force: true }); }
});

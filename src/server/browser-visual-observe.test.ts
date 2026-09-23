import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { OpenBotDatabase } from "./testing/database.js";
import { BrowserManager } from "./runtime.js";

test("visual browser read emits real bounded JPEG bytes, provenance and masked fields", { timeout: 25_000 }, async () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-visual-read-"));
  const db = new OpenBotDatabase(root), browser = new BrowserManager(db);
  const website = createServer((_request, response) => {
    response.setHeader("content-type", "text/html");
    response.end(`<!doctype html><html><style>body{margin:0;background:#3175b9}input{position:absolute;left:40px;top:80px;width:300px;height:40px;background:white}</style><body><h1>Blue chart</h1><input value="PRIVATE_VISUAL_SECRET"><p>Visible read-only chart.</p></body></html>`);
  });
  await new Promise<void>((resolve) => website.listen(0, "127.0.0.1", resolve));
  try {
    db.updateBot("nova", { browserEnabled: true });
    const run = db.createRun({ botId: "nova", threadId: "bot-nova", prompt: "Read the chart", status: "running" });
    await browser.open("nova", `http://127.0.0.1:${(website.address() as { port: number }).port}`);
    const image = await browser.visualObserve("nova", run.id, `teammate:${run.id}`);
    const bytes = Buffer.from(image.imageBase64, "base64");
    assert.deepEqual(bytes.subarray(0, 3), Buffer.from([0xff, 0xd8, 0xff]));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), image.sha256);
    const metadata = await sharp(bytes).metadata();
    assert.equal(metadata.width, image.width);
    assert.equal(metadata.height, image.height);
    assert.ok(image.width <= 1280 && image.height <= 820);
    assert.equal(image.crop.width, image.width);
    assert.equal(image.mimeType, "image/jpeg");
    assert.equal("url" in image, false, "page URLs can contain sensitive query values and stay out of image metadata");
    const pixel = await sharp(bytes).extract({ left: 60, top: 100, width: 1, height: 1 }).raw().toBuffer();
    assert.ok(pixel[0]! < 70 && pixel[1]! < 80 && pixel[2]! < 90, "editable field pixels must be dark-masked");
    assert.doesNotMatch(JSON.stringify({ ...image, imageBase64: "" }), /PRIVATE_VISUAL_SECRET/);
    db.updateRun(run.id, { status: "cancelled" });
    await assert.rejects(() => browser.visualObserve("nova", run.id, `teammate:${run.id}`), /finished|running|active/);
  } finally {
    await browser.close(); db.close(); website.closeAllConnections();
    await new Promise<void>((resolve) => website.close(() => resolve()));
    rmSync(root, { recursive: true, force: true });
  }
});

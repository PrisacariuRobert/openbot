import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";
import { chromePath } from "./runtime.js";
import { OpenBotDatabase } from "./testing/database.js";

/** Gate 1a: real-browser approval contract against the built UI. */
const RUNTIME = `#!${process.execPath}
console.log(JSON.stringify({ type: 'text', text: 'Approved and completed.' }));
`;

test("real browser: approval is disabled until the review is visibly opened, then starts once", { timeout: 120_000 }, async (t) => {
  const distDir = path.resolve(import.meta.dirname, "../..", "dist-browser-test");
  const root = mkdtempSync(path.join(tmpdir(), "openbot-approval-browser-"));
  const db = new OpenBotDatabase(root);
  const bin = path.join(root, "bin"); mkdirSync(bin);
  writeFileSync(path.join(bin, "opencode"), RUNTIME, { mode: 0o700 });
  const nova = db.getBot("nova")!;
  db.updateBot(nova.id, { providerInstanceId: "local-opencode", model: "opencode/fixture", computerEnabled: false });
  const socket = createServer();
  await new Promise<void>((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = (socket.address() as { port: number }).port;
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["--import", "tsx", "src/server/index.ts"], {
    cwd: path.resolve(import.meta.dirname, "../.."), stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, OPENBOT_LOAD_ENV: "0", OPENBOT_OPENCODE_VERSION: "1.18.30", OPENBOT_DIST_DIR: distDir, OPENBOT_DATA_DIR: db.dataDir, OPENBOT_PORT: String(port), OPENBOT_HOST: "127.0.0.1", OPENBOT_APP_URL: base, OPENBOT_DEPLOYMENT_MODE: "local", NODE_ENV: "production", OPENBOT_STAGING: "1" },
  });
  const exited = once(child, "exit"); let log = "";
  for (const stream of [child.stdout, child.stderr]) stream.on("data", (d) => { log = (log + d).slice(-3000); });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  try {
    let ready = false;
    for (let n = 0; n < 200; n++) { try { ready = (await fetch(base + "/api/healthz", { signal: AbortSignal.timeout(500) })).ok; } catch { /* starting */ } if (ready || child.exitCode !== null) break; await delay(100); }
    assert.ok(ready, log || "server did not start");
    // Risky prompt creates a pending "prompt" approval (Ask First).
    const sent = await fetch(base + "/api/messages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ threadId: nova.threadId, body: "Send an email to the client with the report.", targetBotIds: [nova.id] }) });
    assert.equal(sent.status, 202, await sent.clone().text());
    const { runs } = await sent.json() as { runs: Array<{ id: string }> };
    const runId = runs[0]!.id;
    let approvalId = "";
    for (let n = 0; n < 200 && !approvalId; n++) { approvalId = db.listApprovals().find((a) => a.runId === runId && a.status === "pending")?.id || ""; if (!approvalId) await delay(100); }
    assert.ok(approvalId, "a pending approval exists");

    browser = await chromium.launch({ ...(chromePath() ? { executablePath: chromePath() } : {}), headless: true });
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    let decisions = 0;
    page.on("request", (req) => { if (req.method() === "POST" && req.url().includes(`/api/approvals/${approvalId}/decide`)) decisions += 1; });
    await page.goto(`${base}/?thread=${encodeURIComponent(nova.threadId)}`, { waitUntil: "domcontentloaded" });
    const summary = page.locator("summary", { hasText: "Review the full action" });
    await summary.waitFor({ state: "visible", timeout: 20_000 });
    const allow = page.getByRole("button", { name: "Allow task to start" });
    await allow.waitFor({ state: "visible", timeout: 20_000 });

    const disabledInitially = await allow.isDisabled();
    assert.equal(disabledInitially, true, "Allow must be disabled before the review is opened");
    assert.equal(decisions, 0, "no decision before review");

    await summary.click();
    assert.equal(await page.locator("details[open]").count() > 0, true, "review is visibly open");
    assert.equal(await allow.isDisabled(), false, "Allow becomes enabled after opening the review");

    // Collapse: reviewed state must persist.
    await summary.click();
    await delay(100);
    assert.equal(await allow.isDisabled(), false, "Allow stays enabled after collapse");
    // Reopen: no duplicate handlers.
    await summary.click();
    await delay(100);
    assert.equal(await allow.isDisabled(), false, "Allow stays enabled after reopen");

    await allow.click();
    for (let n = 0; n < 100 && decisions === 0; n++) await delay(100);
    assert.equal(decisions, 1, "exactly one decision request");
    let status = db.getRun(runId)!.status;
    for (let n = 0; n < 100 && status === "awaiting_approval"; n++) { await delay(100); status = db.getRun(runId)!.status; }
    assert.notEqual(status, "awaiting_approval", "run leaves awaiting_approval after approval");
    console.log(JSON.stringify({ disabledInitially, decisions, finalStatus: status, approvalId, runId }, null, 2));
  } finally {
    if (browser) await browser.close().catch(() => {});
    child.kill("SIGTERM"); await Promise.race([exited, delay(4000)]);
    if (child.exitCode === null) { child.kill("SIGKILL"); await exited; }
    db.close(); rmSync(root, { recursive: true, force: true });
  }
});

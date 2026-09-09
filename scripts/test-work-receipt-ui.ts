// Disposable data and a separate browser. No owner messages, accounts or model calls.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";
import { OpenBotDatabase } from "../src/server/testing/database.js";

const root = mkdtempSync(path.join(tmpdir(), "openbot-receipt-qa-"));
const data = path.join(root, "data");
const output = "/tmp/openbot-receipt-qa";
mkdirSync(output, { recursive: true });
const db = new OpenBotDatabase(root, { dataDir: data });
db.updateBot("nova", { providerInstanceId: db.listProviders()[0]!.id, model: "fixture/model" });
const run = db.createRun({ botId: "nova", threadId: "bot-nova", prompt: "Prepare the weekly brief", status: "completed" });
db.updateRun(run.id, {
  startedAt: new Date(Date.now() - 190_000).toISOString(),
  finishedAt: new Date(Date.now() - 4_000).toISOString(),
  inputTokens: 24_310, outputTokens: 8_100,
});
db.setRunTaskPlan(run.id, { goal: "Prepare the weekly brief", deliverable: "A finished brief with follow-ups", steps: ["Gather the sources", "Draft the brief", "Check the numbers"] });
for (const step of db.getRun(run.id)!.task.steps) db.updateRunTaskStep(run.id, step.id, "completed", "Synthetic preview fixture");
db.verifyRunTask(run.id, {
  status: "passed", summary: "The brief was checked against the sources.",
  checks: [
    { label: "Numbers match the ledger", passed: true, source: "host", detail: "weekly-brief.md reopened successfully · 156 bytes" },
    { label: "Reviewer approved the draft", passed: true, source: "teammate", detail: null },
  ],
});
const message = db.addMessage({ threadId: "bot-nova", senderType: "bot", senderId: "nova", runId: run.id, body: "The brief is ready. Nothing was sent." });
const artifactDir = path.join(db.attachmentsDir, "qa"), artifactPath = path.join(artifactDir, "weekly-brief.md");
mkdirSync(artifactDir, { recursive: true });
writeFileSync(artifactPath, "# Weekly brief\n", "utf8");
db.createAttachment({ threadId: "bot-nova", messageId: message.id, name: "weekly-brief.md", mime: "text/markdown", size: 16, storagePath: artifactPath, source: "artifact", artifactKey: "nova:weekly-brief.md", revision: 1 });
db.addActivity({ runId: run.id, botId: "nova", kind: "tool", label: "Gathered your briefing sources", detail: "6 sources" });
db.addActivity({ runId: run.id, botId: "nova", kind: "file", label: "weekly-brief.md", detail: "Saved to the workspace" });
const child = db.createRun({ botId: "pixel", threadId: "bot-nova", prompt: "Private check", status: "completed", parentRunId: run.id });
db.updateRun(child.id, { inputTokens: 5_200, outputTokens: 1_100, finishedAt: new Date(Date.now() - 90_000).toISOString() });
const approval = db.createApproval({ runId: run.id, botId: "nova", kind: "external", reason: "Review the send", actionLabel: "Send the brief to Alex", action: { type: "gmail_send", botId: "nova", args: {} } });
db.prepareApprovedAction({ approvalId: approval.id, runId: run.id, botId: "nova", actionType: "gmail_send", action: {} });
db.decideApproval(approval.id, "approved");
db.claimApprovedAction(approval.id);
db.completeApprovedAction(approval.id, "The email was sent to Alex.");
db.updateRun(run.id, { status: "completed", error: null, finishedAt: new Date(Date.now() - 4_000).toISOString() });
db.close();

const socket = createServer();
await new Promise<void>((resolve) => socket.listen(0, "127.0.0.1", resolve));
const port = (socket.address() as { port: number }).port;
await new Promise<void>((resolve) => socket.close(() => resolve()));
const base = `http://127.0.0.1:${port}`;
const child2 = spawn(
  process.execPath,
  ["--import", "tsx", "src/server/index.ts"],
  {
    stdio: "ignore",
    env: {
      ...process.env,
      OPENBOT_LOAD_ENV: "0",
      OPENBOT_DATA_DIR: data,
      OPENBOT_PORT: String(port),
      OPENBOT_HOST: "127.0.0.1",
      OPENBOT_APP_URL: base,
      NODE_ENV: "production",
      OPENBOT_DEPLOYMENT_MODE: "local",
    },
  },
);
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  let ready = false;
  for (let n = 0; n < 100; n++) {
    try {
      if ((await fetch(base + "/api/healthz")).ok) { ready = true; break; }
    } catch {}
    await delay(150);
  }
  assert.ok(ready, "Fixture host starts");
  browser = await chromium.launch({
    executablePath: process.env.OPENBOT_CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  const page = await browser.newPage({ timezoneId: "Europe/Brussels", locale: "en-GB" });
  page.setDefaultTimeout(15_000);
  await page.goto(base + "/studio.html?panel=live");
  await page.waitForSelector(".live-studio-panel", { timeout: 15_000 });
  await page.screenshot({ path: path.join(output, "receipt-list.png"), fullPage: false });
  const receiptButton = page.locator(".receipt-list article button", { hasText: "Receipt" }).first();
  await receiptButton.click();
  await page.waitForSelector(".work-receipt", { timeout: 15_000 });
  const card = page.locator(".work-receipt");
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(output, "work-receipt.png"), fullPage: false });
  const text = await card.innerText();
  assert.ok(text.includes("Work receipt"), "receipt title");
  assert.ok(text.includes("Weekly brief") || text.includes("weekly brief"), "goal");
  assert.ok(text.includes("Verified here"), "host check tag");
  assert.ok(text.includes("No unresolved items recorded"), "bounded uncertainty footer");
  assert.ok(text.includes("tokens"), "usage");
  await card.getByRole("button", { name: "Save as a skill draft", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".work-receipt-propose")?.textContent?.includes("linked to this task’s receipt"));
  assert.match(await card.innerText(), /Review two different test inputs/);
  const reader = new OpenBotDatabase(root, { dataDir: data });
  try {
    const source = reader.extensionRecord<{ workflowId: string }>("run-skill-proposals-v1", run.id)!;
    assert.ok(source, "the real save endpoint records the receipt source");
    assert.equal(reader.getWorkflowRecord(source.workflowId)!.workflow.source, "proposed");
    // Re-open the same real receipt with a failed host check, not just a
    // mocked component. No model or external account is involved.
    reader.verifyRunTask(run.id, { status: "partial", summary: "The fixture source no longer matches.", checks: [{ label: "Numbers match the ledger", passed: false, source: "host", detail: "A fixture discrepancy was found." }] });
  } finally { reader.close(); }
  await page.reload();
  await receiptButton.click();
  await page.waitForSelector(".work-receipt");
  const failedText = await card.innerText();
  assert.ok(failedText.includes("Host check failed"), "failed checks never display a verified badge");
  assert.ok(!failedText.includes("Verified here"));
  assert.ok(!failedText.includes("No unresolved items recorded"));
  assert.ok(failedText.includes("Task verification is partial"));
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, "work-receipt-failed-check.png"), fullPage: false });
  console.log("PASS receipt QA:", output);
} finally {
  await browser?.close();
  child2.kill("SIGTERM");
  await delay(300);
  rmSync(root, { recursive: true, force: true });
}

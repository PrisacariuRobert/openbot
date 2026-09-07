import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { OpenBotDatabase } from "./testing/database.js";

test("approved self-extension restarts the same task with the studio coding model", { timeout: 60_000 }, async () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-self-extend-")), db = new OpenBotDatabase(root);
  db.updateBot("nova", { providerInstanceId: "local-opencode", model: "opencode/fixture-chat" });
  db.updateStudioSettings({ selfExtendEnabled: true, codingModel: "opencode/fixture-coder" });
  const run = db.createRun({ botId: "nova", threadId: "bot-nova", prompt: "Convert the invoice totals", status: "running" });
  const approval = db.createApproval({
    runId: run.id, botId: "nova", kind: "external",
    reason: "Review whether Nova may write its own code for “Currency converter”.",
    actionLabel: "Nova wants to build its own tool: convert_currency",
    action: { type: "self_extend", botId: "nova", args: { capability: "Currency converter", plan: "Write a small tool that converts amounts with a public rates feed.", toolName: "convert_currency" } },
  });
  const reservation = createServer();
  await new Promise<void>((resolve) => reservation.listen(0, "127.0.0.1", resolve));
  const address = reservation.address(); assert.ok(address && typeof address !== "string");
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  const base = `http://127.0.0.1:${address.port}`;
  const child = spawn(process.execPath, ["--import", "tsx", "src/server/index.ts"], {
    cwd: path.resolve(import.meta.dirname, "../.."),
    env: { ...process.env, OPENBOT_LOAD_ENV: "0", OPENBOT_DATA_DIR: db.dataDir, OPENBOT_PORT: String(address.port), OPENBOT_APP_URL: base, OPENBOT_HOST: "127.0.0.1", OPENBOT_DEPLOYMENT_MODE: "local", NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const exited = once(child, "exit"); let log = "";
  child.stdout.on("data", (chunk) => { log = (log + chunk).slice(-3_000); });
  child.stderr.on("data", (chunk) => { log = (log + chunk).slice(-3_000); });
  const post = (route: string, body: unknown, method = "POST") => fetch(base + route, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(5_000) });
  try {
    for (let attempt = 0; ; attempt++) {
      try { if ((await fetch(base + "/api/healthz", { signal: AbortSignal.timeout(500) })).ok) break; } catch { /* Startup. */ }
      if (child.exitCode !== null) throw new Error(`Fixture host exited (${child.exitCode}): ${log}`);
      if (attempt >= 200) throw new Error(log || "Fixture host did not start within the bounded startup window.");
      await delay(100);
    }
    const preview = await (await fetch(`${base}/api/approvals/${approval.id}/preview`)).json() as { canApprove: boolean; reviewFingerprint: string | null; fields: Array<{ label: string }> };
    assert.equal(preview.canApprove, true);
    assert.ok(preview.reviewFingerprint);
    assert.ok(preview.fields.some((field) => field.label === "Plan for the new tool"));
    assert.equal((await post(`/api/approvals/${approval.id}/decide`, { decision: "approved", reviewFingerprint: preview.reviewFingerprint })).status, 200);
    assert.equal(db.getApproval(approval.id)?.status, "approved");
    assert.equal(db.getApprovedAction(approval.id)?.status, "completed");
    const resumed = db.getRun(run.id)!;
    assert.equal(resumed.modelOverride, "opencode/fixture-coder");
    assert.match(resumed.prompt, /convert_currency/);
    assert.match(resumed.prompt, /\.opencode\/tools\/convert_currency\.ts/);
    assert.ok(db.getRun(run.id)!.activities.some((activity) => activity.label === "Self-extension approved"));
    // A coding choice outside the teammate's own connection falls back to its model.
    assert.equal((await post("/api/settings", { codingModel: "anthropic/somewhere-else" }, "PATCH")).status, 200);
    const secondRun = db.createRun({ botId: "nova", threadId: "bot-nova", prompt: "Summarize the ledger", status: "running" });
    const second = db.createApproval({
      runId: secondRun.id, botId: "nova", kind: "external", reason: "Review the ledger plan.",
      actionLabel: "Nova wants to build its own tool: ledger_summary",
      action: { type: "self_extend", botId: "nova", args: { capability: "Ledger summary", plan: "Write a small tool that totals ledger rows.", toolName: "ledger_summary" } },
    });
    const secondPreview = await (await fetch(`${base}/api/approvals/${second.id}/preview`)).json() as { canApprove: boolean; reviewFingerprint: string | null };
    assert.equal(secondPreview.canApprove, true);
    assert.equal((await post(`/api/approvals/${second.id}/decide`, { decision: "approved", reviewFingerprint: secondPreview.reviewFingerprint })).status, 200);
    assert.equal(db.getRun(secondRun.id)?.modelOverride, null);
    assert.match(db.getRun(secondRun.id)?.prompt || "", /ledger_summary/);
  } finally {
    child.kill("SIGTERM"); await Promise.race([exited, delay(4_000)]);
    if (child.exitCode === null) { child.kill("SIGKILL"); await exited; }
    db.close(); rmSync(root, { recursive: true, force: true });
  }
});

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import type { ApprovalPreview } from "../shared/approval-preview.js";
import { OpenBotDatabase } from "./database.js";

test(
  "actual host approval-preview route is bound, non-cached and read-only",
  { timeout: 25_000 },
  async () => {
    const fixtureRoot = mkdtempSync(
      path.join(tmpdir(), "openbot-approval-route-"),
    );
    const dataDir = path.join(fixtureRoot, "data");
    const repo = fileURLToPath(new URL("../../", import.meta.url));
    const db = new OpenBotDatabase(fixtureRoot, { dataDir });
    const bot = db.createBot({
      name: "Route fixture",
      emoji: "●",
      color: "#666666",
      role: "Test read-only review",
      instructions: "Never execute work in this fixture.",
      computerEnabled: false,
      browserEnabled: false,
    });
    assert.equal(bot.providerInstanceId, null);
    assert.equal(bot.model, "");
    const prompt =
      "Prepare a proposal for review.\nKeep this entire second paragraph visible; do not execute the task.";
    const pending = db.createRun({
      threadId: bot.threadId,
      botId: bot.id,
      prompt,
      status: "awaiting_approval",
      approvalReason: "Review the initial task",
    });
    assert.ok(pending.approvalId);
    const unsupportedRun = db.createRun({
      threadId: bot.threadId,
      botId: bot.id,
      prompt: "Unsupported action fixture",
      status: "awaiting_approval",
    });
    const sentinel = "PRIVATE_SENTINEL_DO_NOT_SERIALIZE_8c9d";
    const unsupported = db.createApproval({
      runId: unsupportedRun.id,
      botId: bot.id,
      kind: "terminal",
      reason: "Inspect separately",
      actionLabel: "Run a command",
      action: {
        type: "bash",
        botId: bot.id,
        args: { command: `echo ${sentinel}`, token: sentinel },
      },
    });
    const deniedRun = db.createRun({
      threadId: bot.threadId,
      botId: bot.id,
      prompt: "This fixture has already been declined.",
      status: "awaiting_approval",
      approvalReason: "Previously reviewed",
    });
    assert.ok(deniedRun.approvalId);
    db.decideApproval(deniedRun.approvalId, "denied");
    for (const id of ["notion", "todoist"] as const) {
      db.configureOAuthConnector({ id, kind: id === "notion" ? "notion_oauth" : "todoist_oauth", name: id, clientId: `fixture-${id}`, clientSecret: "fixture-secret" });
      db.completeOAuthConnector(id, { accessToken: "fixture-only-do-not-use" }, `${id}-owner@example.test`, []);
    }
    const structured = [
      { type: "notion_update", args: { pageId: "fixture-page", heading: "Notes", content: "Complete fixture note" }, account: "notion-owner@example.test" },
      { type: "todoist_task_create", args: { content: "Fixture task", description: "All fixture details", projectId: "fixture-project", dueString: "tomorrow", priority: 2 }, account: "todoist-owner@example.test" },
      { type: "mac_organize", args: { moves: [{ from: "Desktop/fixture.txt", to: "Documents/fixture.txt" }] }, account: null },
    ].map((item) => {
      const structuredRun = db.createRun({ threadId: bot.threadId, botId: bot.id, prompt: "Read-only structured preview fixture", status: "awaiting_approval" });
      return { ...item, runId: structuredRun.id, approval: db.createApproval({ runId: structuredRun.id, botId: bot.id, kind: "external", reason: "Review fixture fields", actionLabel: item.type, action: { type: item.type, botId: bot.id, args: item.args } }) };
    });
    db.close();

    const socket = createServer();
    await new Promise<void>((resolve) =>
      socket.listen(0, "127.0.0.1", resolve),
    );
    const port = (socket.address() as { port: number }).port;
    await new Promise<void>((resolve) => socket.close(() => resolve()));
    const base = `http://127.0.0.1:${port}`;
    // Deliberately do not inherit provider tokens, .env loading, remote-host
    // configuration or the owner's data location. There are no runnable jobs.
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "src/server/index.ts"],
      {
        cwd: repo,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          PATH: process.env.PATH,
          LANG: process.env.LANG || "en_US.UTF-8",
          TZ: "UTC",
          OPENBOT_LOAD_ENV: "0",
          OPENBOT_DATA_DIR: dataDir,
          OPENBOT_PORT: String(port),
          OPENBOT_HOST: "127.0.0.1",
          OPENBOT_APP_URL: base,
          OPENBOT_DEPLOYMENT_MODE: "local",
          NODE_ENV: "test",
        },
      },
    );
    let output = "";
    child.stdout.on("data", (chunk) => {
      output = (output + String(chunk)).slice(-4000);
    });
    child.stderr.on("data", (chunk) => {
      output = (output + String(chunk)).slice(-4000);
    });
    const closed = once(child, "close");
    try {
      let ready = false;
      for (let attempt = 0; attempt < 150; attempt += 1) {
        if (child.exitCode !== null)
          throw new Error(`Fixture host exited: ${output}`);
        try {
          if (
            (
              await fetch(`${base}/api/healthz`, {
                signal: AbortSignal.timeout(500),
              })
            ).ok
          ) {
            ready = true;
            break;
          }
        } catch {
          /* startup only */
        }
        await delay(100);
      }
      assert.ok(ready, `Disposable host must start: ${output}`);
      const url = (id: string) =>
        `${base}/api/approvals/${encodeURIComponent(id)}/preview`;
      const response = await fetch(url(pending.approvalId));
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      const preview = (await response.json()) as ApprovalPreview;
      assert.equal(preview.approvalId, pending.approvalId);
      assert.equal(preview.runId, pending.id);
      assert.equal(preview.status, "pending");
      assert.equal(preview.canApprove, true);
      assert.match(preview.reviewFingerprint!, /^[a-f0-9]{64}$/);
      assert.deepEqual(preview.fields, [
        { label: "Task to start", value: prompt },
      ]);

      const unsupportedResponse = await fetch(url(unsupported.id));
      assert.equal(unsupportedResponse.status, 200);
      const unsupportedText = await unsupportedResponse.text();
      assert.equal(unsupportedText.includes(sentinel), false);
      const unsupportedPreview = JSON.parse(unsupportedText) as ApprovalPreview;
      assert.equal(unsupportedPreview.runId, unsupportedRun.id);
      assert.equal(unsupportedPreview.canApprove, false);
      assert.deepEqual(unsupportedPreview.fields, []);

      for (const item of structured) {
        const result = await fetch(url(item.approval.id));
        assert.equal(result.status, 200);
        assert.equal(result.headers.get("cache-control"), "no-store");
        const details = await result.json() as ApprovalPreview;
        assert.equal(details.approvalId, item.approval.id);
        assert.equal(details.runId, item.runId);
        assert.equal(details.canApprove, true, item.type);
        assert.match(details.reviewFingerprint!, /^[a-f0-9]{64}$/);
        assert.equal(details.fields.find(field => field.label === "Connected account")?.value ?? null, item.account);
        if (item.type === "mac_organize") assert.deepEqual(details.fields.find(field => field.label === "File 1 · From"), { label: "File 1 · From", value: "Desktop/fixture.txt" });
        assert.equal(JSON.stringify(details).includes("fixture-only-do-not-use"), false);
      }

      assert.equal((await fetch(url("missing-fixture-id"))).status, 404);
      const resolved = (await (
        await fetch(url(deniedRun.approvalId))
      ).json()) as ApprovalPreview;
      assert.equal(resolved.status, "denied");
      assert.equal(resolved.canApprove, false);
      // A proxy reaching the local socket must still provide an access token.
      const unauthenticated = await fetch(url(pending.approvalId), {
        headers: { "X-Forwarded-For": "203.0.113.8" },
      });
      assert.ok([401, 403].includes(unauthenticated.status));
      assert.equal((await unauthenticated.text()).includes(prompt), false);

      const postDecision = (id: string, body: unknown) => fetch(`${base}/api/approvals/${id}/decide`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const editor = new OpenBotDatabase(fixtureRoot, { dataDir });
      try {
        for (const item of structured.filter(item => item.type !== "mac_organize")) {
          const before = await (await fetch(url(item.approval.id))).json() as ApprovalPreview;
          assert.equal((await postDecision(item.approval.id, { decision: "approved" })).status, 409);
          const direct = await fetch(`${base}/api/runs/${item.runId}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reviewFingerprint: before.reviewFingerprint }) });
          assert.equal(direct.status, 409);
          const connectorId = item.type === "notion_update" ? "notion" : "todoist";
          // Reauthorization with the same displayed account is still a new
          // authority boundary; the previous review must not authorize it.
          editor.completeOAuthConnector(connectorId, { accessToken: "new-fixture-credential" }, item.account!, []);
          assert.equal((await postDecision(item.approval.id, { decision: "approved", reviewFingerprint: before.reviewFingerprint })).status, 409);
          const reauthorized = await (await fetch(url(item.approval.id))).json() as ApprovalPreview;
          assert.notEqual(reauthorized.reviewFingerprint, before.reviewFingerprint);
          editor.completeOAuthConnector(connectorId, { accessToken: "other-fixture-credential" }, "different-owner@example.test", []);
          assert.equal((await postDecision(item.approval.id, { decision: "approved", reviewFingerprint: reauthorized.reviewFingerprint })).status, 409);
          assert.equal(editor.getApproval(item.approval.id)!.status, "pending");
          assert.equal(editor.getApprovedAction(item.approval.id), null);
        }
        const unchangedRun = editor.createRun({ threadId: bot.threadId, botId: bot.id, prompt: "Unchanged safe prompt fixture", status: "awaiting_approval", approvalReason: "Review fixture task" });
        const unchanged = await (await fetch(url(unchangedRun.approvalId!))).json() as ApprovalPreview;
        assert.equal((await postDecision(unchangedRun.approvalId!, { decision: "approved", reviewFingerprint: unchanged.reviewFingerprint })).status, 200);
        assert.equal(editor.getApproval(unchangedRun.approvalId!)!.status, "approved");
        assert.equal((await postDecision(unsupported.id, { decision: "approved", reviewFingerprint: "a".repeat(64) })).status, 409);
        const declineRun = editor.createRun({ threadId: bot.threadId, botId: bot.id, prompt: "Decline remains available", status: "awaiting_approval", approvalReason: "Review fixture task" });
        assert.equal((await postDecision(declineRun.approvalId!, { decision: "denied" })).status, 200);
        assert.equal(editor.getApproval(declineRun.approvalId!)!.status, "denied");
      } finally { editor.close(); }
    } finally {
      if (child.exitCode === null) child.kill("SIGTERM");
      const force = setTimeout(() => child.kill("SIGKILL"), 2_000);
      force.unref();
      await closed;
      clearTimeout(force);
      try {
        const persisted = new OpenBotDatabase(fixtureRoot, { dataDir });
        try {
          assert.equal(
            persisted.getApproval(pending.approvalId)!.status,
            "pending",
          );
          assert.equal(
            persisted.getApproval(unsupported.id)!.status,
            "pending",
          );
          assert.equal(persisted.getRun(pending.id)!.inputTokens, 0);
          assert.equal(persisted.getRun(pending.id)!.startedAt, null);
          for (const item of structured) {
            assert.equal(persisted.getApproval(item.approval.id)!.status, "pending");
            assert.equal(persisted.getRun(item.runId)!.startedAt, null);
            assert.equal(persisted.getApprovedAction(item.approval.id), null);
          }
        } finally {
          persisted.close();
        }
      } finally {
        rmSync(fixtureRoot, { recursive: true, force: true });
      }
    }
  },
);

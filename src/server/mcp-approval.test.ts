import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { startMcpFixture } from "../../scripts/fixtures/mcp-service.js";
import { OpenBotDatabase } from "./testing/database.js";
import { McpConnections } from "./mcp-connections.js";

test("HTTP approval endpoints refuse unsupported MCP writes without a complete bound review", { timeout: 40_000 }, async () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-mcp-approval-")), db = new OpenBotDatabase(root);
  const fixture = await startMcpFixture(), mcp = new McpConnections(db);
  const connection = mcp.create({ name: "Synthetic note service", url: fixture.url, token: "fixture-private-token", allowLoopback: true });
  await mcp.discover(connection.id); mcp.configure(connection.id, "nova", { save_note: "ask" });
  const approvals = ["normal", "lost-response", "revoked"].map((text) => {
    const run = db.createRun({ botId: "nova", threadId: "bot-nova", prompt: "Synthetic approved note", status: "awaiting_approval" });
    const prepared = mcp.prepare("nova", { connectionId: connection.id, tool: "save_note", arguments: { text } });
    return db.createApproval({ runId: run.id, botId: "nova", kind: "external", reason: "Fixture approval", actionLabel: "Save synthetic note", action: { type: "connected_call", botId: "nova", args: { ...prepared, runId: run.id } } });
  });
  const reservation = createServer();
  await new Promise<void>((resolve) => reservation.listen(0, "127.0.0.1", resolve));
  const address = reservation.address(); assert.ok(address && typeof address !== "string");
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  const base = `http://127.0.0.1:${address.port}`;
  // Fresh studio has no configured model: continuation cannot spend account
  // tokens. Only the actual host approval/action path is exercised here.
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
    const first = approvals[0]!;
    const preview = await (await fetch(`${base}/api/approvals/${first.id}/preview`)).json() as { canApprove: boolean; reviewFingerprint: string | null };
    assert.equal(preview.canApprove, false); assert.equal(preview.reviewFingerprint, null);
    assert.equal((await post(`/api/approvals/${first.id}/decide`, { decision: "approved" })).status, 409);
    assert.equal((await post(`/api/runs/${first.runId}/approve`, {})).status, 409);
    assert.equal(db.getApprovedAction(first.id), null); assert.equal(fixture.state.writes, 0);

    fixture.state.dropWriteResponse = true;
    const lost = approvals[1]!;
    assert.equal((await post(`/api/approvals/${lost.id}/decide`, { decision: "approved", reviewFingerprint: "a".repeat(64) })).status, 409);
    assert.equal(db.getApprovedAction(lost.id), null); assert.equal(fixture.state.writes, 0);
    fixture.state.dropWriteResponse = false;

    assert.equal((await post(`/api/extensions/mcp/${connection.id}/access`, { botId: "nova", grants: {} }, "PATCH")).status, 200);
    const revoked = approvals[2]!;
    assert.equal((await post(`/api/approvals/${revoked.id}/decide`, { decision: "approved" })).status, 409);
    assert.equal((await post(`/api/approvals/${revoked.id}/decide`, { decision: "denied" })).status, 200);
    assert.equal(db.getApproval(revoked.id)?.status, "denied");
    assert.equal(db.getApprovedAction(revoked.id), null); assert.equal(fixture.state.writes, 0);
  } finally {
    child.kill("SIGTERM"); await Promise.race([exited, delay(4_000)]);
    if (child.exitCode === null) { child.kill("SIGKILL"); await exited; }
    await fixture.close(); db.close(); rmSync(root, { recursive: true, force: true });
  }
});

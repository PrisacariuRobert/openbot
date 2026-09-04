import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { OpenBotDatabase } from "./database.js";
import { heartbeatURL, publicHeartbeatAddress, RunnerExternalHeartbeatMonitor, sendExternalHeartbeat } from "./external-heartbeat.js";

test("accepts only bounded public HTTPS heartbeat addresses", () => {
  assert.equal(heartbeatURL("https://pulse.example.com/secret?status=up#private").toString(), "https://pulse.example.com/secret?status=up");
  for (const value of ["http://pulse.example.com/x", "https://user:pass@pulse.example.com/x", "https://localhost/x", "https://127.0.0.1/x", "https://[::1]/x", "https://169.254.169.254/latest", "https://10.2.3.4/x", "https://pulse.example.com:8443/x"]) {
    assert.throws(() => heartbeatURL(value));
  }
  assert.equal(publicHeartbeatAddress("1.1.1.1"), true);
  assert.equal(publicHeartbeatAddress("100.64.0.1"), false);
  assert.equal(publicHeartbeatAddress("192.0.2.10"), false);
  assert.equal(publicHeartbeatAddress("198.51.100.10"), false);
  assert.equal(publicHeartbeatAddress("203.0.113.10"), false);
  assert.equal(publicHeartbeatAddress("::1"), false);
  assert.equal(publicHeartbeatAddress("2001:db8::10"), false);
  assert.equal(publicHeartbeatAddress("2606:4700:4700::1111"), true);
});

test("rejects DNS answers that include any private destination", async () => {
  await assert.rejects(sendExternalHeartbeat("https://pulse.example.com/private", {
    resolve: async () => [{ address: "1.1.1.1", family: 4 }, { address: "127.0.0.1", family: 4 }],
  }), /public address/i);
});

test("keeps the secret URL encrypted and records heartbeat success and failure", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-external-heartbeat-"));
  try {
    const db = new OpenBotDatabase(root);
    const calls: string[] = [];
    let fail = false;
    let clock = Date.parse("2026-09-04T20:00:00.000Z");
    const monitor = new RunnerExternalHeartbeatMonitor({
      db,
      now: () => clock,
      send: async (url) => { calls.push(url); if (fail) throw new Error("Service unavailable"); },
    });
    assert.throws(() => monitor.configure({ enabled: true, url: "https://127.0.0.1/private" }));
    monitor.configure({ enabled: true, url: "https://pulse.example.com/private-token" });
    assert.equal(monitor.status().provider, "pulse.example.com");
    assert.equal(JSON.stringify(monitor.status()).includes("private-token"), false);
    assert.equal(await monitor.checkNow().then((status) => status?.lastSuccessAt), "2026-09-04T20:00:00.000Z");
    fail = true;
    clock += 300_000;
    const failed = await monitor.checkNow();
    assert.equal(failed?.lastError, "Service unavailable");
    assert.equal(failed?.lastSuccessAt, "2026-09-04T20:00:00.000Z");
    assert.deepEqual(calls, ["https://pulse.example.com/private-token", "https://pulse.example.com/private-token"]);
    monitor.configure({ enabled: false });
    assert.equal(await monitor.checkNow(), null);
    db.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

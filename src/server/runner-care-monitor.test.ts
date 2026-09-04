import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { RunnerCareSnapshot } from "../shared/types.js";
import { OpenBotDatabase } from "./database.js";
import { RunnerCareMonitor } from "./runner-care-monitor.js";

function snapshot(status: "ready" | "attention"): RunnerCareSnapshot {
  return {
    checkedAt: "2026-09-04T18:00:00.000Z",
    mode: "private_runner",
    version: "0.26.0",
    uptimeSeconds: 600,
    publicUrl: "https://studio.example.com/",
    dataPath: "/srv/openbot/data",
    overall: status,
    summary: status === "ready" ? "Your private home is ready" : "1 item needs attention",
    checks: [{ id: "backup", label: "Backup", status, value: status === "ready" ? "Today" : "12 days ago", detail: "Backup state" }],
  };
}

test("sends one durable health alert, avoids repeats, and reports recovery", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-runner-monitor-"));
  try {
    const db = new OpenBotDatabase(root);
    let current = snapshot("attention"), wakes = 0, clock = Date.parse("2026-09-04T18:00:00.000Z");
    const options = { db, inspect: async () => current, destinationCount: () => 1, wakeNotifications: () => { wakes += 1; }, now: () => clock };
    const monitor = new RunnerCareMonitor(options);
    monitor.setEnabled(true);
    await monitor.checkNow();
    assert.equal(db.pendingNotifications().length, 1);
    assert.match(db.pendingNotifications()[0]!.title, /needs attention/);
    const restartedMonitor = new RunnerCareMonitor(options);
    await restartedMonitor.checkNow();
    assert.equal(db.pendingNotifications().length, 1);
    clock = Date.parse("2026-09-05T18:01:00.000Z");
    await restartedMonitor.checkNow();
    assert.equal(db.pendingNotifications().length, 2);
    current = snapshot("ready");
    await restartedMonitor.checkNow();
    assert.equal(db.pendingNotifications().length, 3);
    assert.match(db.pendingNotifications()[2]!.title, /healthy again/);
    assert.equal(restartedMonitor.status().lastStatus, "ready");
    assert.equal(wakes, 3);
    db.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("keeps monitoring quiet until the owner opts in", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-runner-monitor-"));
  try {
    const db = new OpenBotDatabase(root);
    let inspections = 0;
    const monitor = new RunnerCareMonitor({ db, inspect: async () => { inspections += 1; return snapshot("attention"); } });
    assert.equal(await monitor.checkNow(), null);
    assert.equal(inspections, 0);
    assert.equal(monitor.status().enabled, false);
    db.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

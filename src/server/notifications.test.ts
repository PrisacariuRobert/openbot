import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenBotDatabase } from "./database.js";

test("keeps notification subscriptions and delivery outbox durable without exposing keys in app state", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-notification-test-"));
  try {
    const db = new OpenBotDatabase(root);
    const subscriptionId = db.savePushSubscription({ endpoint: "https://push.example.test/device", p256dh: "public-device-key", auth: "device-auth" });
    assert.ok(subscriptionId);
    assert.equal(db.listPushSubscriptions().length, 1);
    const run = db.createRun({ threadId: "bot-nova", botId: "nova", prompt: "Prepare a useful result.", status: "queued" });
    db.updateRun(run.id, { status: "running" });
    db.updateRun(run.id, { status: "completed", summary: "Finished", finishedAt: new Date().toISOString() });
    const pending = db.pendingNotifications();
    assert.equal(pending.length, 1);
    assert.match(pending[0]!.title, /Nova finished/);
    assert.match(pending[0]!.url, /thread=bot-nova/);
    assert.equal(JSON.stringify(db.getState("bot-nova")).includes("device-auth"), false);
    db.markNotificationSent(pending[0]!.id);
    assert.equal(db.pendingNotifications().length, 0);
    assert.equal(db.deletePushSubscription("https://push.example.test/device"), true);
    const nativeId = db.saveNativePushDevice({ deviceToken: "ab".repeat(32), environment: "sandbox", bundleId: "app.openbot.mobile" });
    assert.equal(db.listNativePushDevices()[0]?.id, nativeId);
    const queued = db.createRun({ threadId: "bot-nova", botId: "nova", prompt: "Prepare another result.", status: "queued" });
    db.updateRun(queued.id, { status: "completed", summary: "Ready", finishedAt: new Date().toISOString() });
    const nativeNotification = db.pendingNotifications()[0]!;
    db.ensureNotificationDeliveries(nativeNotification.id, [{ channel: "apns", targetId: nativeId }]);
    assert.equal(db.pendingNotificationDeliveries(nativeNotification.id).length, 1);
    db.markNotificationDeliverySent(nativeNotification.id, "apns", nativeId);
    assert.equal(db.notificationDeliveriesComplete(nativeNotification.id), true);
    assert.equal(db.deleteNativePushDevice("ab".repeat(32)), true);
    db.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

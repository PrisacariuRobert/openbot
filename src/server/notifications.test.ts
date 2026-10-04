import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenBotDatabase } from "./testing/database.js";

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

test("a finished run that prepared cards says how many things wait and opens the list", () => {
  const root = mkdtempSync(path.join(tmpdir(), "sidemates-notification-queue-"));
  try {
    const db = new OpenBotDatabase(root);
    const card = (n: number, runId: string | null) => db.queueItemInsert({ kind: "reminder", title: `Pay bill ${n}`, why: "Due Friday.", sourceKey: `mail:${n}`, botId: "nova", runId, action: { title: `Pay bill ${n}` }, preview: "Add a reminder.", expiresAt: new Date(Date.now() + 86_400_000).toISOString() })!;
    const run = db.createRun({ threadId: "bot-nova", botId: "nova", prompt: "Morning review", status: "running" });
    card(1, run.id); card(2, run.id); card(3, run.id);
    const decided = card(4, run.id);
    db.queueItemTransition(decided.id, ["ready"], { status: "done", decidedBy: "rule:qr-1" });
    db.updateRun(run.id, { status: "completed", summary: "Done", finishedAt: new Date().toISOString() });
    const [note] = db.pendingNotifications();
    assert.equal(db.pendingNotifications().length, 1);
    assert.equal(note!.title, "3 things are waiting for you", "only cards still waiting for a person are counted");
    assert.match(note!.body, /Pay bill 1 and 2 more/);
    assert.equal(note!.url, "/?waiting=1");

    const other = db.createRun({ threadId: "bot-nova", botId: "nova", prompt: "One card", status: "running" });
    card(5, other.id);
    db.updateRun(other.id, { status: "completed", summary: "Done", finishedAt: new Date().toISOString() });
    assert.equal(db.pendingNotifications().find((n) => n.url === "/?waiting=1" && /^One thing/.test(n.title))?.title, "One thing is waiting for you");

    const plain = db.createRun({ threadId: "bot-nova", botId: "nova", prompt: "No cards", status: "running" });
    db.updateRun(plain.id, { status: "completed", summary: "Done", finishedAt: new Date().toISOString() });
    assert.match(db.pendingNotifications().at(-1)!.url, /thread=bot-nova/, "a run without cards still opens its conversation");
    db.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

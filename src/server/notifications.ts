import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import webpush from "web-push";
import type { OpenBotDatabase } from "./database.js";
import { ApnsClient, ApnsDeliveryError } from "./apns.js";

type VapidKeys = { publicKey: string; privateKey: string };

function readOrCreateKeys(dataDir: string): VapidKeys {
  const file = path.join(dataDir, "web-push.json");
  if (existsSync(file)) {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as VapidKeys;
    if (parsed.publicKey && parsed.privateKey) { chmodSync(file, 0o600); return parsed; }
  }
  const keys = webpush.generateVAPIDKeys();
  writeFileSync(file, JSON.stringify(keys), { encoding: "utf8", mode: 0o600 });
  return keys;
}

export class NotificationService {
  readonly publicKey: string;
  private timer: NodeJS.Timeout | null = null;
  private flushing = false;

  constructor(private readonly db: OpenBotDatabase, private readonly canDeliver: () => boolean = () => true, private readonly apns = new ApnsClient()) {
    const keys = readOrCreateKeys(db.dataDir);
    this.publicKey = keys.publicKey;
    webpush.setVapidDetails("mailto:notifications@openbot.local", keys.publicKey, keys.privateKey);
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.flush(), 2_500);
    void this.flush();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  wake() {
    void this.flush();
  }

  nativeStatus() {
    return { ...this.apns.status(), devices: this.db.listNativePushDevices().length };
  }

  private async flush() {
    if (this.flushing || !this.canDeliver()) return;
    this.flushing = true;
    try {
      const subscriptions = new Map(this.db.listPushSubscriptions().map((item) => [item.id, item]));
      const nativeDevices = new Map((this.apns.configured ? this.db.listNativePushDevices() : []).map((item) => [item.id, item]));
      for (const notification of this.db.pendingNotifications()) {
        const targets = [
          ...[...subscriptions.keys()].map((targetId) => ({ channel: "web" as const, targetId })),
          ...[...nativeDevices.keys()].map((targetId) => ({ channel: "apns" as const, targetId })),
        ];
        if (!targets.length) { this.db.markNotificationSent(notification.id); continue; }
        this.db.ensureNotificationDeliveries(notification.id, targets);
        const payload = JSON.stringify({
          title: notification.title, body: notification.body, url: notification.url,
          tag: `openbot-${notification.kind}-${notification.id}`, icon: "/icon.svg", badge: "/icon.svg",
        });
        for (const delivery of this.db.pendingNotificationDeliveries(notification.id)) {
          const subscription = delivery.channel === "web" ? subscriptions.get(delivery.targetId) : null;
          const nativeDevice = delivery.channel === "apns" ? nativeDevices.get(delivery.targetId) : null;
          if (!subscription && !nativeDevice) {
            this.db.markNotificationDeliveryFailed(notification.id, delivery.channel, delivery.targetId, "This notification destination is no longer registered.", true);
            continue;
          }
          try {
            if (subscription) {
              await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, payload, { TTL: 86_400, urgency: notification.kind.includes("approval") ? "high" : "normal" });
              this.db.recordPushSuccess(subscription.id);
            } else if (nativeDevice) {
              await this.apns.send(nativeDevice, { title: notification.title, body: notification.body, url: notification.url, kind: notification.kind });
              this.db.recordNativePushSuccess(nativeDevice.id);
            }
            this.db.markNotificationDeliverySent(notification.id, delivery.channel, delivery.targetId);
          } catch (error) {
            const statusCode = typeof error === "object" && error && "statusCode" in error ? Number((error as { statusCode?: number }).statusCode) : 0;
            const permanent = error instanceof ApnsDeliveryError ? error.permanent : statusCode === 404 || statusCode === 410;
            const message = error instanceof Error ? error.message : "The push service could not be reached.";
            if (subscription) {
              if (permanent) {
                this.db.deletePushSubscription(subscription.endpoint);
                subscriptions.delete(subscription.id);
              }
              else this.db.recordPushFailure(subscription.id);
            }
            if (nativeDevice) {
              if (permanent) {
                this.db.deleteNativePushDevice(nativeDevice.deviceToken);
                nativeDevices.delete(nativeDevice.id);
              }
              else this.db.recordNativePushFailure(nativeDevice.id);
            }
            this.db.markNotificationDeliveryFailed(notification.id, delivery.channel, delivery.targetId, message, permanent);
          }
        }
        if (this.db.notificationDeliveriesComplete(notification.id)) this.db.markNotificationSent(notification.id);
        else this.db.markNotificationFailed(notification.id, "A push service could not be reached. OpenBot will retry only the unfinished delivery.");
      }
    } finally { this.flushing = false; }
  }
}

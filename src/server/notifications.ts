import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import webpush from "web-push";
import type { OpenBotDatabase } from "./database.js";

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

  constructor(private readonly db: OpenBotDatabase, private readonly canDeliver: () => boolean = () => true) {
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

  private async flush() {
    if (this.flushing || !this.canDeliver()) return;
    this.flushing = true;
    try {
      const subscriptions = this.db.listPushSubscriptions();
      for (const notification of this.db.pendingNotifications()) {
        if (!subscriptions.length) { this.db.markNotificationSent(notification.id); continue; }
        let delivered = false, retryableFailure = false;
        const payload = JSON.stringify({
          title: notification.title, body: notification.body, url: notification.url,
          tag: `openbot-${notification.kind}-${notification.id}`, icon: "/icon.svg", badge: "/icon.svg",
        });
        for (const subscription of subscriptions) {
          try {
            await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, payload, { TTL: 86_400, urgency: notification.kind.includes("approval") ? "high" : "normal" });
            this.db.recordPushSuccess(subscription.id);
            delivered = true;
          } catch (error) {
            const statusCode = typeof error === "object" && error && "statusCode" in error ? Number((error as { statusCode?: number }).statusCode) : 0;
            if (statusCode === 404 || statusCode === 410) this.db.deletePushSubscription(subscription.endpoint);
            else { this.db.recordPushFailure(subscription.id); retryableFailure = true; }
          }
        }
        if (delivered || !retryableFailure) this.db.markNotificationSent(notification.id);
        else this.db.markNotificationFailed(notification.id, "The push service could not be reached. OpenBot will retry.");
      }
    } finally { this.flushing = false; }
  }
}

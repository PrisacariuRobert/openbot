import { createSign } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { connect as connectHttp2 } from "node:http2";

export type ApnsEnvironment = "sandbox" | "production";
export type ApnsDevice = { deviceToken: string; environment: ApnsEnvironment; bundleId: string };
export type ApnsNotification = { title: string; body: string; url: string; kind: string };
export type ApnsConfig = { teamId: string; keyId: string; privateKey: string; bundleId: string };
export type ApnsTransport = (request: { host: string; path: string; headers: Record<string, string>; body: string }) => Promise<{ status: number; body: string }>;

const permanentReasons = new Set(["BadDeviceToken", "DeviceTokenNotForTopic", "MissingDeviceToken", "Unregistered"]);

function base64url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function clean(value: string | undefined, max: number) {
  return (value || "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

export function apnsConfigFromEnv(environment: NodeJS.ProcessEnv = process.env): ApnsConfig | null {
  const teamId = clean(environment.OPENBOT_APNS_TEAM_ID, 32);
  const keyId = clean(environment.OPENBOT_APNS_KEY_ID, 32);
  const privateKeyPath = environment.OPENBOT_APNS_PRIVATE_KEY_PATH?.trim() || "";
  const bundleId = clean(environment.OPENBOT_APNS_BUNDLE_ID, 200) || "app.openbot.mobile";
  if (!teamId || !keyId || !privateKeyPath || !existsSync(privateKeyPath)) return null;
  const privateKey = readFileSync(privateKeyPath, "utf8");
  if (!privateKey.includes("BEGIN PRIVATE KEY")) return null;
  return { teamId, keyId, privateKey, bundleId };
}

export function apnsPayload(notification: ApnsNotification): string {
  const value = JSON.stringify({
    aps: {
      alert: { title: clean(notification.title, 120), body: clean(notification.body, 320) },
      sound: "default", "thread-id": "openbot", "interruption-level": notification.kind.includes("approval") ? "time-sensitive" : "active",
    },
    url: clean(notification.url, 500), kind: clean(notification.kind, 80),
  });
  if (Buffer.byteLength(value) > 4_096) throw new Error("The native notification payload is too large.");
  return value;
}

export class ApnsDeliveryError extends Error {
  constructor(message: string, readonly permanent: boolean) { super(message); }
}

export class ApnsClient {
  private token: { value: string; createdAt: number } | null = null;

  constructor(readonly config: ApnsConfig | null = apnsConfigFromEnv(), private readonly transport: ApnsTransport = http2Transport) {}

  get configured() { return Boolean(this.config); }

  status() {
    return { configured: this.configured, bundleId: this.config?.bundleId || "app.openbot.mobile" };
  }

  async send(device: ApnsDevice, notification: ApnsNotification) {
    if (!this.config) throw new ApnsDeliveryError("Native push is not configured on this Mac.", false);
    if (device.bundleId !== this.config.bundleId) throw new ApnsDeliveryError("This device belongs to a different OpenBot app identifier.", true);
    const token = device.deviceToken.toLowerCase();
    if (!/^[a-f0-9]{64,200}$/.test(token)) throw new ApnsDeliveryError("This iPhone provided an invalid push token.", true);
    const host = device.environment === "production" ? "https://api.push.apple.com" : "https://api.sandbox.push.apple.com";
    const body = apnsPayload(notification);
    const result = await this.transport({
      host, path: `/3/device/${token}`,
      headers: {
        authorization: `bearer ${this.providerToken()}`, "apns-topic": device.bundleId, "apns-push-type": "alert",
        "apns-priority": "10", "apns-expiration": String(Math.floor(Date.now() / 1_000) + 86_400), "content-type": "application/json",
      }, body,
    });
    if (result.status === 200) return;
    let reason = `HTTP ${result.status}`;
    try { reason = String((JSON.parse(result.body) as { reason?: string }).reason || reason); } catch { /* keep status */ }
    if (reason === "ExpiredProviderToken" || reason === "InvalidProviderToken") this.token = null;
    const permanent = result.status === 410 || permanentReasons.has(reason);
    throw new ApnsDeliveryError(`Apple Push Notification service rejected this delivery (${reason}).`, permanent);
  }

  private providerToken() {
    if (!this.config) throw new Error("APNs is not configured.");
    if (this.token && Date.now() - this.token.createdAt < 50 * 60_000) return this.token.value;
    const header = base64url(JSON.stringify({ alg: "ES256", kid: this.config.keyId }));
    const claims = base64url(JSON.stringify({ iss: this.config.teamId, iat: Math.floor(Date.now() / 1_000) }));
    const signingInput = `${header}.${claims}`;
    const signer = createSign("SHA256");
    signer.update(signingInput);
    signer.end();
    const signature = signer.sign({ key: this.config.privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url");
    this.token = { value: `${signingInput}.${signature}`, createdAt: Date.now() };
    return this.token.value;
  }
}

const http2Transport: ApnsTransport = ({ host, path, headers, body }) => new Promise((resolve, reject) => {
  const client = connectHttp2(host);
  const timer = setTimeout(() => { client.destroy(); reject(new Error("Apple Push Notification service timed out.")); }, 15_000);
  let status = 0, responseBody = "", settled = false;
  const finish = (error?: Error) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    client.close();
    if (error) reject(error); else resolve({ status, body: responseBody });
  };
  client.once("error", (error) => finish(error));
  const request = client.request({ ":method": "POST", ":path": path, ...headers });
  request.setEncoding("utf8");
  request.on("response", (value) => { status = Number(value[":status"] || 0); });
  request.on("data", (chunk) => { responseBody += String(chunk).slice(0, 2_000); });
  request.once("end", () => finish());
  request.once("error", (error) => finish(error));
  request.end(body);
});

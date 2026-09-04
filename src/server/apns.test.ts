import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { ApnsClient, ApnsDeliveryError, apnsPayload, type ApnsTransport } from "./apns.js";

function config() {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  return {
    teamId: "TEAM123456", keyId: "KEY1234567", bundleId: "app.openbot.mobile",
    privateKey: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
  };
}

test("creates a bounded private APNs request for the registered OpenBot app", async () => {
  const sent: Array<Parameters<ApnsTransport>[0]> = [];
  const transport: ApnsTransport = async (request) => { sent.push(request); return { status: 200, body: "" }; };
  const client = new ApnsClient(config(), transport);
  await client.send(
    { deviceToken: "ab".repeat(32), environment: "sandbox", bundleId: "app.openbot.mobile" },
    { title: "Nova finished", body: "Your result is ready.", url: "/?thread=bot-nova", kind: "completed" },
  );
  assert.equal(client.status().configured, true);
  const request = sent[0]!;
  assert.equal(request.host, "https://api.sandbox.push.apple.com");
  assert.equal(request.path, `/3/device/${"ab".repeat(32)}`);
  assert.match(request.headers.authorization, /^bearer [^.]+\.[^.]+\.[^.]+$/);
  assert.deepEqual(JSON.parse(request.body).aps.alert, { title: "Nova finished", body: "Your result is ready." });
  assert.ok(Buffer.byteLength(apnsPayload({ title: "x".repeat(500), body: "y".repeat(2_000), url: "/", kind: "completed" })) <= 4_096);
});

test("marks invalid APNs device tokens as permanent delivery failures", async () => {
  const transport: ApnsTransport = async () => ({ status: 410, body: JSON.stringify({ reason: "Unregistered" }) });
  const client = new ApnsClient(config(), transport);
  await assert.rejects(
    () => client.send({ deviceToken: "cd".repeat(32), environment: "production", bundleId: "app.openbot.mobile" }, { title: "OpenBot", body: "Ready", url: "/", kind: "completed" }),
    (error) => error instanceof ApnsDeliveryError && error.permanent,
  );
});

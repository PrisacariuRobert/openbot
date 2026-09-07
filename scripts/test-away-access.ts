// Actual OpenBot HTTP API -> built-in tunnel -> disposable relay. No account,
// personal studio, model request, external exposure or Tailscale process used.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { createRelayService } from "../src/server/relay-service.js";
import { BuiltinRelayClient } from "../src/server/relay-client.js";
import { DevicePairing } from "../src/server/device-pairing.js";

const data = mkdtempSync(path.join(tmpdir(), "openbot-away-"));
const socket = createServer();
await new Promise<void>((resolve) => socket.listen(0, "127.0.0.1", resolve));
const port = (socket.address() as { port: number }).port;
await new Promise<void>((resolve) => socket.close(() => resolve()));
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ["--import", "tsx", "src/server/index.ts"], { stdio: "ignore", env: {
  ...process.env, OPENBOT_LOAD_ENV: "0", OPENBOT_DATA_DIR: data, OPENBOT_PORT: String(port), OPENBOT_HOST: "127.0.0.1", OPENBOT_APP_URL: base,
  OPENBOT_DEPLOYMENT_MODE: "local", NODE_ENV: "production", OPENBOT_RELAY_URL: "", OPENBOT_RELAY_ENROLLMENT_TOKEN: "",
} });
const enrollmentToken = randomBytes(32).toString("base64url");
const relay = createRelayService({ enrollmentToken, database: path.join(data, "relay.sqlite") });
await new Promise<void>((resolve) => relay.server.listen(0, "127.0.0.1", resolve));
const relayUrl = `http://127.0.0.1:${(relay.server.address() as { port: number }).port}`;
const identityFile = path.join(data, "relay-client.json");
const tunnel = new BuiltinRelayClient({ relayUrl, localPort: port, identityFile, enrollmentToken, testOnlyPlaintext: true });
let devices: DevicePairing | undefined;
// Two actual API processes with independent databases, on ONE public authority.
const secondData = path.join(data, "studio-b");
mkdirSync(secondData);
const secondSocket = createServer();
await new Promise<void>((resolve) => secondSocket.listen(0, "127.0.0.1", resolve));
const secondPort = (secondSocket.address() as { port: number }).port;
await new Promise<void>((resolve) => secondSocket.close(() => resolve()));
const secondBase = `http://127.0.0.1:${secondPort}`;
const secondChild = spawn(process.execPath, ["--import", "tsx", "src/server/index.ts"], { stdio: "ignore", env: {
  ...process.env, OPENBOT_LOAD_ENV: "0", OPENBOT_DATA_DIR: secondData, OPENBOT_PORT: String(secondPort), OPENBOT_HOST: "127.0.0.1", OPENBOT_APP_URL: secondBase,
  OPENBOT_DEPLOYMENT_MODE: "local", NODE_ENV: "production", OPENBOT_RELAY_URL: "", OPENBOT_RELAY_ENROLLMENT_TOKEN: "",
} });
const secondTunnel = new BuiltinRelayClient({ relayUrl, localPort: secondPort, identityFile: path.join(secondData, "relay-client.json"), enrollmentToken, testOnlyPlaintext: true });
let secondDevices: DevicePairing | undefined;
const through = (route: string, init: RequestInit = {}) => fetch(tunnel.studioURL + route, { ...init, signal: AbortSignal.timeout(15_000) });
const throughSecond = (route: string, init: RequestInit = {}) => fetch(secondTunnel.studioURL + route, { ...init, signal: AbortSignal.timeout(15_000) });
try {
  for (let n = 0; n < 100; n++) { try { if ((await fetch(base + "/api/healthz")).ok) break; } catch {} await delay(150); }
  assert.equal((await fetch(base + "/api/healthz")).status, 200);
  for (let n = 0; n < 100; n++) { try { if ((await fetch(secondBase + "/api/healthz")).ok) break; } catch {} await delay(150); }
  assert.equal((await fetch(secondBase + "/api/healthz")).status, 200);
  tunnel.start();
  secondTunnel.start();
  for (let n = 0; n < 100 && !tunnel.connected; n++) await delay(50);
  assert.ok(tunnel.connected, "Built-in tunnel did not connect");
  for (let n = 0; n < 100 && !secondTunnel.connected; n++) await delay(50);
  assert.ok(secondTunnel.connected);
  assert.notEqual(tunnel.studioURL, secondTunnel.studioURL);
  assert.equal(new URL(tunnel.studioURL).origin, new URL(secondTunnel.studioURL).origin);
  assert.equal((await fetch(relayUrl + "/healthz")).status, 200);
  assert.equal((await fetch(relayUrl + "/api/state")).status, 404);
  assert.equal((await through("/index.html")).status, 404);
  assert.equal((await through("/api/state")).status, 401);
  assert.equal((await through("/api/access", { headers: { host: "127.0.0.1" } })).status, 401);
  assert.equal((await through("/api/state", { headers: { cookie: "openbot_access=%E0%A4%A" } })).status, 401);
  assert.equal((await through("/api/auth/pairing-guard")).status, 401);
  assert.equal((await (await fetch(base + "/api/access/away")).json()).ready, false, "LAN must not be advertised as away-ready");
  assert.equal((await fetch(base + "/api/access/pairing", { method: "POST" })).status, 409);
  devices = new DevicePairing(path.join(data, "paired-devices.sqlite"));
  const invitation = devices.invite(), deviceKey = `obd_${randomBytes(32).toString("base64url")}`;
  const claim = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticket: invitation.ticket, deviceKey, name: "Test iPhone" }) };
  const claimed = await through("/api/auth/pair", claim);
  assert.equal(claimed.status, 200);
  const result = await claimed.json() as { deviceId: string };
  assert.equal((await through("/api/auth/pair", claim)).status, 200);
  const auth = { Authorization: `Bearer ${deviceKey}` };
  assert.equal((await through("/api/state", { headers: auth })).status, 200);
  assert.equal((await throughSecond("/api/state", { headers: auth })).status, 401, "Studio A key must not unlock studio B");
  assert.equal((await throughSecond("/api/auth/pair", claim)).status, 401, "Studio A QR must not pair with studio B");
  secondDevices = new DevicePairing(path.join(secondData, "paired-devices.sqlite"));
  const secondInvite = secondDevices.invite(), secondKey = `obd_${randomBytes(32).toString("base64url")}`;
  assert.equal((await throughSecond("/api/auth/pair", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticket: secondInvite.ticket, deviceKey: secondKey, name: "Second phone" }) })).status, 200);
  const secondAuth = { Authorization: `Bearer ${secondKey}` };
  assert.equal((await throughSecond("/api/state", { headers: secondAuth })).status, 200);
  assert.equal((await through("/api/state", { headers: secondAuth })).status, 401, "Studio B key must not unlock studio A");
  assert.equal((await through("/api/state", { headers: { cookie: `openbot_access=${deviceKey}` } })).status, 401, "Shared-origin cookies are never credentials");
  assert.equal((await through("/api/state", { headers: { ...auth, origin: relayUrl } })).status, 403, "Browser origins are not supported on the native relay");
  assert.equal((await through("/api/state", { headers: { ...auth, "sec-fetch-site": "same-origin" } })).status, 403);
  assert.equal((await through("/api/access", { headers: auth })).status, 403);
  assert.equal((await through("/api/access/pairing", { method: "POST", headers: auth })).status, 403);
  const login = await through("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: deviceKey }) });
  assert.equal(login.status, 200);
  assert.equal(login.headers.get("set-cookie"), null);
  assert.match(login.headers.get("content-security-policy")!, /sandbox/);
  const state = await (await through("/api/state", { headers: auth })).json() as { threads: { id: string }[] };
  assert.ok(state.threads[0]);
  const contents = "A private attachment through the hosted-address route.\n";
  const upload = await through(`/api/attachments?threadId=${encodeURIComponent(state.threads[0]!.id)}`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/octet-stream", "X-File-Name": "relay%20test.txt", "X-File-Type": "text/plain" }, body: contents,
  });
  assert.equal(upload.status, 201, "Query string and upload bytes must reach the selected studio");
  const attachment = await upload.json() as { id: string };
  const download = await through(`/api/attachments/${attachment.id}`, { headers: auth });
  assert.equal(download.status, 200);
  assert.equal(await download.text(), contents);
  assert.equal((await throughSecond(`/api/attachments/${attachment.id}`, { headers: secondAuth })).status, 404, "Attachments are not shared across studios");
  const stream = await through("/api/events", { headers: auth });
  const reader = stream.body!.getReader();
  assert.match(new TextDecoder().decode((await reader.read()).value), /connected/);
  assert.equal((await fetch(base + `/api/access/devices/${result.deviceId}`, { method: "DELETE" })).status, 200);
  assert.ok((await reader.read()).done, "Revocation must close the existing stream");
  assert.equal((await through("/api/state", { headers: auth })).status, 401);
  tunnel.stop();
  await delay(100);
  assert.equal((await through("/api/state", { headers: auth })).status, 503);
  tunnel.start();
  for (let n = 0; n < 100 && !tunnel.connected; n++) await delay(50);
  assert.ok(tunnel.connected, "Same studio identity must reconnect");
  assert.equal((await through("/api/state", { headers: auth })).status, 401, "Revocation must survive reconnect");
  assert.equal((await throughSecond("/api/state", { headers: secondAuth })).status, 200, "Revoking/disconnecting A must not disrupt B");
  console.log("PASS: two actual studios on one relay hostname; QR, key and attachment isolation; query strings and upload/download; cookie/browser rejection; pairing/retry; owner-only settings; SSE and live revocation; offline/reconnect; independent studio remains online; no false away-ready state. No model usage.");
} finally {
  tunnel.stop();
  secondTunnel.stop();
  await relay.close();
  devices?.close();
  secondDevices?.close();
  for (const process of [child, secondChild]) {
    process.kill("SIGTERM");
    for (let n = 0; n < 50 && process.exitCode === null && process.signalCode === null; n++) await delay(100);
    if (process.exitCode === null && process.signalCode === null) { process.kill("SIGKILL"); await new Promise<void>((resolve) => process.once("close", resolve)); }
  }
  rmSync(data, { recursive: true, force: true });
}

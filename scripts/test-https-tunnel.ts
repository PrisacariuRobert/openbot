// Real HTTP server, isolated studio, simulated HTTPS reverse-proxy headers.
// No model calls, personal data, public tunnel or external app actions.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { DevicePairing } from "../src/server/device-pairing.js";

const data = mkdtempSync(path.join(tmpdir(), "openbot-https-tunnel-"));
const socket = createServer();
await new Promise<void>(resolve => socket.listen(0, "127.0.0.1", resolve));
const port = (socket.address() as { port: number }).port;
await new Promise<void>(resolve => socket.close(() => resolve()));
const base = `http://127.0.0.1:${port}`, origin = "https://app.openbots.foundation";
const child = spawn(process.execPath, ["--import", "tsx", "src/server/index.ts"], {
  stdio: "ignore", env: { ...process.env, OPENBOT_LOAD_ENV: "0", OPENBOT_DATA_DIR: data,
    OPENBOT_HOST: "127.0.0.1", OPENBOT_PORT: String(port), OPENBOT_APP_URL: origin,
    OPENBOT_DEPLOYMENT_MODE: "local", NODE_ENV: "production", OPENBOT_RELAY_URL: "", OPENBOT_RELAY_ENROLLMENT_TOKEN: "" },
});
let devices: DevicePairing | undefined;
const headers = { host: new URL(origin).host, "cf-connecting-ip": "192.0.2.1", "x-forwarded-proto": "https" };
const remote = (route: string, init: RequestInit = {}) => fetch(base + route, { ...init,
  headers: { ...headers, ...init.headers }, signal: AbortSignal.timeout(15_000) });
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(base + "/api/healthz")).ok) break; } catch {} await delay(150); }
  assert.equal((await fetch(base + "/api/state")).status, 200);
  for (const route of ["/api/state", "/api/access", "/api/auth/pairing-guard", "/api/events", "/api/attachments/missing"]) {
    assert.equal((await remote(route)).status, 401, route);
  }
  assert.equal((await remote("/api/state", { headers: { host: "127.0.0.1" } })).status, 401, "A tunnel cannot impersonate the local owner");
  assert.equal((await remote("/api/auth/pairing-probe")).status, 200);
  devices = new DevicePairing(path.join(data, "paired-devices.sqlite"));
  const invite = devices.invite(), deviceKey = `obd_${randomBytes(32).toString("base64url")}`;
  const pair = await remote("/api/auth/pair", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ticket: invite.ticket, deviceKey, name: "HTTPS fixture" }) });
  assert.equal(pair.status, 200);
  const { deviceId } = await pair.json() as { deviceId: string };
  const auth = { authorization: `Bearer ${deviceKey}` };
  assert.equal((await remote("/api/state", { headers: auth })).status, 200);
  assert.equal((await remote("/api/access/away", { headers: auth })).status, 403);
  assert.equal((await remote("/api/access/pairing", { method: "POST", headers: auth })).status, 403);
  const loginBody = JSON.stringify({ token: deviceKey });
  for (const forbidden of ["https://openbots.foundation", "https://evil.example", "null"]) {
    assert.equal((await remote("/api/auth/login", { method: "POST", headers: { origin: forbidden, "Content-Type": "application/json" }, body: loginBody })).status, 403);
  }
  const login = await remote("/api/auth/login", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: loginBody });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie")!;
  for (const attribute of ["Secure", "HttpOnly", "SameSite=Strict"]) assert.ok(cookie.includes(attribute));
  const state = await remote("/api/state", { headers: { cookie: cookie.split(";")[0]! } });
  assert.equal(state.status, 200);
  assert.equal(state.headers.get("cache-control"), "no-store");
  assert.equal(state.headers.get("x-frame-options"), "DENY");
  const stream = await remote("/api/events", { headers: auth });
  const reader = stream.body!.getReader();
  assert.match(new TextDecoder().decode((await reader.read()).value), /connected/);
  assert.equal((await fetch(base + `/api/access/devices/${deviceId}`, { method: "DELETE" })).status, 200);
  assert.ok((await reader.read()).done);
  assert.equal((await remote("/api/state", { headers: auth })).status, 401);
  assert.equal((await remote("/api/state", { headers: { cookie: cookie.split(";")[0]! } })).status, 401);
  console.log("PASS: real HTTP tunnel auth, proxy spoof rejection, pairing, native access, secure cookies, sibling-origin CSRF rejection, owner-only pairing, no-store, SSE and live revocation. No model usage.");
} finally {
  devices?.close();
  child.kill("SIGTERM");
  for (let i = 0; i < 50 && child.exitCode === null && child.signalCode === null; i++) await delay(100);
  if (child.exitCode === null && child.signalCode === null) { child.kill("SIGKILL"); await new Promise<void>(resolve => child.once("close", resolve)); }
  rmSync(data, { recursive: true, force: true });
}

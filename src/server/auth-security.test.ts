import assert from "node:assert/strict";
import test from "node:test";
import { LoginAttemptGate, readCookie, trustedLocalRequest, browserWriteAllowed, useSecureSessionCookie } from "./auth-security.js";

test("only genuine local owner requests bypass authentication", () => {
  const local = { socket: { remoteAddress: "127.0.0.1" }, headers: { host: "127.0.0.1:4311" } };
  assert.ok(trustedLocalRequest(local));
  assert.ok(trustedLocalRequest({ ...local, headers: { host: "localhost:4311", origin: "http://localhost:4310" } }));
  assert.ok(trustedLocalRequest({ socket: { remoteAddress: "::1" }, headers: { host: "[::1]:4311" } }));
  for (const headers of [
    { host: "studio.example.com" }, { host: "127.0.0.1.attacker.example" },
    { host: "127.0.0.1", "x-forwarded-for": "127.0.0.1" },
    { host: "127.0.0.1", "x-openbot-relay": "1" },
    { host: "127.0.0.1", origin: "https://attacker.example" },
    { host: "127.0.0.1", origin: "null" }, { host: "127.0.0.1", "sec-fetch-site": "cross-site" },
  ]) assert.equal(trustedLocalRequest({ ...local, headers }), false, JSON.stringify(headers));
  assert.equal(trustedLocalRequest({ ...local, socket: { remoteAddress: "192.168.1.20" } }), false);
  assert.equal(readCookie("openbot_access=%E0%A4%A", "openbot_access"), null);
});

test("rate limits repeated access-key failures and resets after the window", () => {
  const gate = new LoginAttemptGate(2, 1_000);
  gate.failed("device", 100);
  assert.equal(gate.check("device", 200).allowed, true);
  gate.failed("device", 300);
  assert.deepEqual(gate.check("device", 400), { allowed: false, retryAfterSeconds: 1 });
  assert.equal(gate.check("device", 1_101).allowed, true);
});

test("a successful login clears earlier failures", () => {
  const gate = new LoginAttemptGate(1, 1_000);
  gate.failed("device", 100);
  gate.succeeded("device");
  assert.equal(gate.check("device", 200).allowed, true);
});

test("bounds tracked clients during a distributed failure flood", () => {
  const gate = new LoginAttemptGate(1, 1_000, 2);
  gate.failed("first", 100);
  gate.failed("second", 110);
  gate.failed("third", 120);
  assert.equal(gate.check("first", 130).allowed, true);
  assert.equal(gate.check("second", 130).allowed, false);
  assert.equal(gate.check("third", 130).allowed, false);
});

test("a remote browser cannot mutate a studio from a sibling domain or a forged origin", () => {
  const url = "https://app.openbots.foundation", request = { method: "POST", socket: { remoteAddress: "127.0.0.1" }, headers: { host: "app.openbots.foundation", "cf-connecting-ip": "192.0.2.1" } };
  assert.ok(browserWriteAllowed({ ...request, headers: { ...request.headers, origin: url } }, url));
  assert.ok(browserWriteAllowed(request, url), "Native bearer clients are still supported");
  for (const origin of ["https://openbots.foundation", "https://evil.example", "null", `${url}.evil.example`]) {
    assert.equal(browserWriteAllowed({ ...request, headers: { ...request.headers, origin } }, url), false);
  }
  assert.equal(browserWriteAllowed({ ...request, headers: { ...request.headers, "sec-fetch-site": "same-site" } }, url), false);
  assert.ok(browserWriteAllowed({ method: "POST", socket: { remoteAddress: "127.0.0.1" }, headers: { host: "127.0.0.1:4311", origin: "http://127.0.0.1:4310" } }, url));
});

test("a configured HTTPS tunnel always issues Secure session cookies without trusting forwarded headers", () => {
  assert.equal(useSecureSessionCookie("https://app.openbots.foundation", false, false), true);
  assert.equal(useSecureSessionCookie("http://127.0.0.1:4311", false, false), false);
  assert.equal(useSecureSessionCookie("http://127.0.0.1:4311", false, true), true);
});

import assert from "node:assert/strict";
import test from "node:test";
import { LoginAttemptGate } from "./auth-security.js";

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

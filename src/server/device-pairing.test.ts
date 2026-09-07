import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { DevicePairing, pairingLink, PAIRING_TTL_MS } from "./device-pairing.js";
const key = () => `obd_${randomBytes(32).toString("base64url")}`;

test("QR claim is single-use, retry-safe, bounded and revocable", () => {
  const store = new DevicePairing(":memory:");
  try {
    const invitation = store.invite(100), deviceKey = key();
    const result = store.redeem(invitation.ticket, deviceKey, "My phone", 110);
    assert.ok(result);
    assert.deepEqual(store.redeem(invitation.ticket, deviceKey, "retry", 120), result);
    assert.equal(store.redeem(invitation.ticket, key(), "Another phone", 120), null);
    assert.equal(store.authenticate(deviceKey, 150), result.deviceId);
    assert.equal(store.list().length, 1);
    assert.ok(!JSON.stringify(store.list()).includes(deviceKey));
    assert.ok(store.revoke(result.deviceId, 200));
    assert.equal(store.authenticate(deviceKey, 210), null);
    assert.equal(store.redeem(invitation.ticket, deviceKey, "retry revoked", 210), null);
    assert.equal(store.redeem(invitation.ticket, deviceKey, "expired", 100 + PAIRING_TTL_MS), null);
    const first = store.invite(1000), second = store.invite(1100);
    assert.equal(store.redeem(first.ticket, key(), "replaced", 1200), null);
    store.cancel();
    assert.equal(store.redeem(second.ticket, key(), "cancelled", 1200), null);
  } finally { store.close(); }
});

test("pairing links carry an expiring fragment, never an owner key, and require HTTPS", () => {
  const ticket = randomBytes(32).toString("base64url");
  const url = new URL(pairingLink("https://studio.example.com", ticket));
  assert.equal(url.hash, `#${ticket}`);
  assert.equal(url.searchParams.size, 1);
  assert.equal(url.searchParams.get("server"), "https://studio.example.com");
  const hosted = `https://pilot.onrender.com/s/${"b".repeat(24)}`;
  assert.equal(new URL(pairingLink(hosted + "/", ticket)).searchParams.get("server"), hosted);
  for (const address of ["http://studio.example.com", "https://user:pass@studio.example.com", "https://studio.example.com/extra", "https://studio.example.com?key=x"]) assert.throws(() => pairingLink(address, ticket));
});

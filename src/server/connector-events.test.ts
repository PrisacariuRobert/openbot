import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { providerEventAttempt, slackEventIsFromApp, verifyNotionEventRequest, verifySlackEventRequest } from "./connector-events.js";

test("verifies Slack signatures against the raw body and rejects stale requests", () => {
  const secret = "slack-signing-secret", timestamp = "1700000000", body = Buffer.from('{"type":"event_callback"}');
  const signature = `v0=${createHmac("sha256", secret).update(`v0:${timestamp}:`).update(body).digest("hex")}`;
  assert.equal(verifySlackEventRequest(secret, body, timestamp, signature, 1700000200), true);
  assert.equal(verifySlackEventRequest(secret, Buffer.from("changed"), timestamp, signature, 1700000200), false);
  assert.equal(verifySlackEventRequest(secret, body, timestamp, signature, 1700000400), false);
});

test("verifies Notion webhook signatures and recognizes app-authored Slack messages", () => {
  const secret = "secret_notion", body = Buffer.from('{"type":"page.content_updated"}');
  const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  assert.equal(verifyNotionEventRequest(secret, body, signature), true);
  assert.equal(verifyNotionEventRequest(secret, Buffer.from("changed"), signature), false);
  assert.equal(slackEventIsFromApp({ event: { subtype: "bot_message" } }), true);
  assert.equal(slackEventIsFromApp({ event: { bot_id: "B123" } }), true);
  assert.equal(slackEventIsFromApp({ event: { type: "message", user: "U123" } }), false);
  assert.equal(providerEventAttempt({ attempt_number: 99 }), 8);
});

import test from "node:test";
import assert from "node:assert/strict";
import { reviewSignInRequest } from "./sign-in-review.js";

test("normal provider sign-in pages pass review", () => {
  assert.equal(reviewSignInRequest("https://accounts.google.com/v3/signin").level, "ok");
  assert.equal(reviewSignInRequest("https://github.com/login").level, "ok");
  assert.equal(reviewSignInRequest("https://www.icloud.com").level, "ok");
});

test("the obvious phishing tells are flagged", () => {
  // credentials in the URL
  const embedded = reviewSignInRequest("https://user:pass@accounts.google.com/signin");
  assert.equal(embedded.level, "warn");
  assert.match(embedded.reason!, /phishing|embeds a username/i);
  // not encrypted
  assert.match(reviewSignInRequest("http://example.com/login").reason!, /not encrypted/i);
  // punycode host
  assert.match(reviewSignInRequest("https://xn--gogle-4ve.com/login").reason!, /encoded/i);
  // digits-for-letters lookalike on the same public suffix
  assert.match(reviewSignInRequest("https://goog1e.com/login").reason!, /mimics google\.com/i);
  // brand name embedded under a different domain
  assert.match(reviewSignInRequest("https://login-accounts-google.com/verify").reason!, /mimics google\.com/i);
  // the real domain on a path-hiding host
  assert.match(reviewSignInRequest("https://google.com.evil.io/signin").reason!, /mimics google\.com/i);
});

test("unrelated sites on a shared suffix are not flagged", () => {
  assert.equal(reviewSignInRequest("https://portal.example.com/login").level, "ok");
  assert.equal(reviewSignInRequest("https://mybank.com/signin").level, "ok");
});

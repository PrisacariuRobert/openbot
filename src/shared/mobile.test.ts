import assert from "node:assert/strict";
import test from "node:test";
import { iosConnectURL, isTailscaleURL } from "./mobile.js";

test("iOS connection links carry the server origin without credentials", () => {
  const link = new URL(iosConnectURL("http://192.168.1.20:4311/private?access_key=never"));
  assert.equal(link.protocol, "openbot:");
  assert.equal(link.host, "connect");
  assert.equal(link.searchParams.get("server"), "http://192.168.1.20:4311");
  assert.equal(link.searchParams.has("access_key"), false);
  assert.equal(link.searchParams.has("token"), false);
});

test("iOS connection links reject embedded URL credentials", () => {
  assert.throws(() => iosConnectURL("https://owner:secret@example.com"), /Invalid OpenBot server URL/);
});

test("recognizes only Tailscale's private CGNAT addresses", () => {
  assert.equal(isTailscaleURL("http://100.64.0.1:4311"), true);
  assert.equal(isTailscaleURL("http://100.127.255.254:4311"), true);
  assert.equal(isTailscaleURL("http://100.128.0.1:4311"), false);
  assert.equal(isTailscaleURL("http://192.168.1.20:4311"), false);
  assert.equal(isTailscaleURL("not a URL"), false);
});

import test from "node:test";
import assert from "node:assert/strict";
import { siteForCookieDomain } from "./runtime.js";

test("cookie domains group by registrable site, never by bare suffix", () => {
  assert.equal(siteForCookieDomain("accounts.google.com"), "google.com");
  assert.equal(siteForCookieDomain(".google.com"), "google.com");
  assert.equal(siteForCookieDomain("google.com"), "google.com");
  assert.equal(siteForCookieDomain("mail.example.co.uk"), "example.co.uk");
  assert.equal(siteForCookieDomain(".example.co.uk"), "example.co.uk");
  assert.notEqual(siteForCookieDomain("example.co.uk"), siteForCookieDomain("evil.co.uk"));
  assert.equal(siteForCookieDomain("shop.example.com.au"), "example.com.au");
  assert.equal(siteForCookieDomain("co.uk"), null);
  assert.equal(siteForCookieDomain("localhost"), null);
  assert.equal(siteForCookieDomain(""), null);
  assert.equal(siteForCookieDomain(".."), null);
  assert.equal(siteForCookieDomain("not a host!"), null);
});

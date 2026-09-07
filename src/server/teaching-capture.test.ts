import test from "node:test";
import assert from "node:assert/strict";
import { captureTeachingStep, teachingAddress } from "./teaching-capture.js";

test("teaching stores repeatable placeholders, never submitted field values or forged page addresses", () => {
  const fields = new Map<string, string>();
  const url = "https://portal.example.com/tickets?code=private-oauth-code#private-fragment";
  const first = captureTeachingStep({ type: "input", selector: "#search", value: "customer-private@example.com", url: "https://forged.example.com", label: "Search" }, url, fields);
  assert.equal(first.value, "{{input_1}}"); assert.equal(first.url, "https://portal.example.com/tickets");
  assert.doesNotMatch(JSON.stringify(first), /customer-private|private-oauth|private-fragment|forged/);
  assert.equal(captureTeachingStep({ type: "input", selector: "#search", value: "another customer" }, url, fields).value, first.value);
  assert.equal(captureTeachingStep({ type: "input", selector: "#one-time-code", value: "123456" }, url, fields).value, "{{secret}}");
  assert.equal(captureTeachingStep({ type: "input", selector: "#account", privateField: true, value: "hidden-password" }, url, fields).label, "Private field — owner takeover only");
  assert.equal(captureTeachingStep({ type: "click", selector: "#review", value: "injected secret" }, url, fields).value, undefined);
  assert.throws(() => teachingAddress("https://user:password@example.com"));
  assert.throws(() => teachingAddress("javascript:alert(1)"));
  assert.throws(() => captureTeachingStep({ type: "input", selector: "x".repeat(501) }, url, fields));
});

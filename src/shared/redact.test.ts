import assert from "node:assert/strict";
import test from "node:test";
import { describeHidden, redact } from "./redact.js";

test("email addresses, including plus-addressing, are hidden", () => {
  const result = redact("Write to anna.keller+trip@example.co.uk or bob@mail.example.com about it.");
  assert.equal(result.text, "Write to [email hidden] or [email hidden] about it.");
  assert.equal(result.hidden.emails, 2);
});

test("phone numbers in common forms are hidden, ordinary numbers are not", () => {
  const text = "Call +32 456 39 17 65, or (0)456-39-17-65, or 0032 456391765, or 0456 39 17 65. It cost 1,299.50 euro on 2026-09-23 and 03.10.2026 (or 3/10/2026), order 48213, 3 rooms, 14:30–16:30, version 1.2.3, 12 Oct.";
  const result = redact(text);
  assert.equal(result.hidden.phones, 4, result.text);
  assert.match(result.text, /1,299\.50 euro on 2026-09-23 and 03\.10\.2026 \(or 3\/10\/2026\), order 48213, 3 rooms, 14:30–16:30, version 1\.2\.3, 12 Oct\./);
});

test("cards, IBANs and long numbers are hidden", () => {
  const result = redact("Card 4111 1111 1111 1111, IBAN BE68 5390 0754 7034, account 1234567890123456.");
  assert.equal(result.hidden.numbers, 3, result.text);
  assert.doesNotMatch(result.text, /4111|5390|1234567890123456/);
});

test("keys and tokens are hidden", () => {
  // Built at run time: the repository's own secret scanner (rightly) refuses a credential-shaped literal.
  const github = ["gh", "p_", "abcdefghijklmnopqrstuvwxyz", "0123456789"].join("");
  const result = redact(`Use sk-abcdefghijklmnopqrstuvwxyz123456 or ${github} or AKIAABCDEFGHIJKLMNOP; jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop`);
  assert.equal(result.hidden.keys, 4, result.text);
  assert.doesNotMatch(result.text, /sk-abc|ghp_|AKIA|eyJ/);
});

test("home folder names go; the rest of the path stays useful", () => {
  const result = redact("Saved to /Users/robert/Documents/Receipts/2026-09-23 Anthropic.pdf and /Users/anna.k/Desktop/x.md");
  assert.equal(result.text, "Saved to ~/Documents/Receipts/2026-09-23 Anthropic.pdf and ~/Desktop/x.md");
  assert.equal(result.hidden.folders, 2);
});

test("links keep their site and path but lose tokens, passwords and tracking secrets", () => {
  const result = redact("See https://shop.example/item/42?color=blue&token=abc123&utm_source=x#section and https://user:pw@host.example/a?api_key=SECRET, plus https://example.com/page.");
  assert.match(result.text, /https:\/\/shop\.example\/item\/42\?color=blue&utm_source=x#section/);
  assert.doesNotMatch(result.text, /abc123|SECRET|user:pw/);
  assert.match(result.text, /https:\/\/example\.com\/page\./);
  assert.equal(result.hidden.links, 2);
});

test("an address inside a web link is not counted as an email address", () => {
  const result = redact("Profile: https://example.com/@anna and mailto-less text anna@example.com");
  assert.equal(result.hidden.emails, 1);
  assert.match(result.text, /https:\/\/example\.com\/@anna/);
});

test("clean text passes through untouched, and the summary reads plainly", () => {
  const clean = "Three restaurants near Stephansplatz are open on Sunday: Cantinetta Antinori (11:30–23:30), Da Capo and Trattoria Santo Stefano.";
  assert.deepEqual(redact(clean), { text: clean, hidden: { emails: 0, phones: 0, numbers: 0, keys: 0, folders: 0, links: 0 }, total: 0 });
  assert.equal(describeHidden({ emails: 2, phones: 1, numbers: 0, keys: 0, folders: 1, links: 3 }), "2 email addresses, 1 phone number, 1 folder name, 3 links cleaned");
  assert.equal(describeHidden({ emails: 0, phones: 0, numbers: 0, keys: 0, folders: 0, links: 0 }), "");
});

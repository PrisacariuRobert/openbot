import assert from "node:assert/strict";
import test from "node:test";
import { describeCounts, emptyVault, fullNamesIn, learnNames, maskText, maskValue, namesIn, unmaskText, unmaskValue } from "./private-mask.js";

// Synthetic people and numbers only (example.com, a test IBAN, a test card).
const MAIL = `From: Anna Berg <anna.berg@example.com>
To: Robert Lind <owner@example.org>
Subject: Invoice 2026-118

Hi Anna,

Please call me on +44 20 7946 0958 or pay to DE89 3704 0044 0532 0130 00.
The card on file is 4111 1111 1111 1111. Dinner on Friday with Anna? Casa Verde opens at 12:00.

Best regards,
Tom Lee`;
const PLANTED = ["Anna Berg", "Anna", "anna.berg@example.com", "Robert Lind", "owner@example.org", "+44 20 7946 0958", "DE89 3704 0044 0532 0130 00", "4111 1111 1111 1111", "Tom Lee"];

test("names are found only where the text shows them to be names", () => {
  assert.deepEqual(namesIn(MAIL).sort(), ["Anna", "Anna Berg", "Robert Lind", "Tom Lee"]);
  assert.deepEqual(namesIn("Hi Team,\nFrom: Billing Support <billing@example.com>\nDear Customer,"), []);
  assert.deepEqual(namesIn("Meeting with Casa Verde on Friday. Ask May about it."), []);
  assert.deepEqual(namesIn("From: \"Jane van der Berg\" <jane@example.com>"), ["Jane van der Berg"]);
});

test("a mail masks every planted detail, and the real values come back exactly", () => {
  const vault = emptyVault();
  const masked = maskText(MAIL, vault);
  for (const detail of PLANTED) assert.ok(!masked.text.includes(detail), `${detail} must not reach the AI`);
  assert.match(masked.text, /From: \[NAME_1\] <\[EMAIL_1\]>/);
  assert.match(masked.text, /Hi \[NAME_1_FIRST\],/);
  assert.match(masked.text, /Casa Verde opens at 12:00/, "places and times are not personal details");
  assert.deepEqual(masked.counts, { name: 5, email: 2, phone: 1, iban: 1, number: 1 });
  assert.equal(describeCounts(masked.counts), "5 names, 2 email addresses, 1 phone number, 1 IBAN, 1 long number");
  assert.ok(masked.changed);
  assert.equal(unmaskText(masked.text, vault), MAIL);
});

test("placeholders stay the same across texts, and a learned name is masked later on its own", () => {
  const vault = emptyVault();
  maskText(MAIL, vault);
  const later = maskText("Reply to Anna Berg (ANNA.BERG@example.com) and tell Tom the plan. May 12 works.", vault);
  assert.equal(later.text, "Reply to [NAME_1] ([EMAIL_1]) and tell [NAME_3_FIRST] the plan. May 12 works.");
  assert.equal(maskText("nothing personal here", vault).changed, false);
  assert.equal(unmaskText("Draft for [NAME_1] at [EMAIL_1]; [EMAIL_99] is unknown.", vault), "Draft for Anna Berg at anna.berg@example.com; [EMAIL_99] is unknown.");
});

test("the owner's own list masks names mentioned in passing", () => {
  const vault = emptyVault();
  const plain = maskText("Book a table for Mira Kovac and me.", vault);
  assert.match(plain.text, /Mira Kovac/, "a name in passing isn't recognised on its own");
  const listed = maskText("Book a table for Mira Kovac and me.", vault, ["Mira Kovac"]);
  assert.equal(listed.text, "Book a table for [NAME_1] and me.");
});

test("a tool's answer: strings masked, names learned from records, ids and images kept", () => {
  const vault = emptyVault();
  const image = "A".repeat(500);
  const answer = {
    messages: [{ id: "msg-1", fromName: "Jane van der Berg", from: "jane@example.com", subject: "Hi Jane", snippet: "Jane's number is +1 415 555 0134" }],
    contacts: [{ name: "Mia Chen", phone: "+1 415 555 0199" }],
    files: [{ name: "Report", path: "/workspace/Report.md" }],
    imageBase64: image, count: 2,
  };
  const masked = maskValue(answer, vault);
  const text = JSON.stringify(masked.value);
  for (const detail of ["Jane", "jane@example.com", "+1 415 555 0134", "Mia Chen", "+1 415 555 0199"]) assert.ok(!text.includes(detail), detail);
  assert.equal(masked.value.files[0]!.name, "Report", "a file called Report is not a person");
  assert.equal(masked.value.messages[0]!.id, "msg-1");
  assert.equal(masked.value.imageBase64, image);
  assert.equal(masked.value.count, 2);
  assert.deepEqual(unmaskValue(masked.value, vault), answer);
});

test("arguments with placeholders get the real values back, nested", () => {
  const vault = emptyVault();
  maskText(MAIL, vault);
  const args = { to: ["[EMAIL_1]"], body: "Hi [NAME_1_FIRST],\nI'll call [PHONE_1].", meta: { iban: "[IBAN_1]" } };
  assert.deepEqual(unmaskValue(args, vault), { to: ["anna.berg@example.com"], body: "Hi Anna,\nI'll call +44 20 7946 0958.", meta: { iban: "DE89 3704 0044 0532 0130 00" } });
});

test("in the owner's own words, a first and last name counts as a name; a first name alone doesn't", () => {
  assert.deepEqual(fullNamesIn("Draft a reply to Anna Berg about the invoice, and ask Tom."), ["Anna Berg"]);
  assert.deepEqual(fullNamesIn("Ask Jane van der Berg and the Billing Team."), ["Jane van der Berg"]);
  assert.deepEqual(fullNamesIn("Which restaurants near the office are open on Sunday?"), []);
  const vault = emptyVault();
  assert.equal(learnNames(vault, fullNamesIn("Reply to Anna Berg.")), true);
  assert.equal(learnNames(vault, ["Anna Berg"]), false, "already known");
  assert.equal(maskText("Anna wrote again; Anna Berg's invoice is late.", vault).text, "[NAME_1_FIRST] wrote again; [NAME_1]'s invoice is late.");
});

import test from "node:test";
import assert from "node:assert/strict";
import { MailSeen, amountAppearsIn, emailAddresses } from "./queue-grounding.js";
import { queueProposalInput, type QueueProposal } from "./queue.js";

const card = (value: unknown): QueueProposal => queueProposalInput.parse(value);
const base = { title: "Reply", why: "Someone is waiting.", sourceKey: "mail:555" };
const reply = (to: string[], extra: Record<string, unknown> = {}, sourceKey = "mail:555") =>
  card({ kind: "reply_draft", ...base, sourceKey, action: { to, subject: "Re: Trip", body: "Yes.", ...extra } });

function seenWithAnna() {
  const seen = new MailSeen();
  seen.remember("run-1", [{ id: "555", from: "Anna Berg <Anna.Berg@Example.com>", subject: "Berlin trip", attachments: [{ name: "invoice-1042.pdf" }] }]);
  return seen;
}

test("finds the address inside a sender line", () => {
  assert.deepEqual(emailAddresses("Anna Berg <Anna.Berg@Example.com>"), ["anna.berg@example.com"]);
  assert.deepEqual(emailAddresses("no address here"), []);
});

test("a card about an email the run never read is refused", () => {
  const seen = new MailSeen();
  assert.match(seen.check(reply(["anna.berg@example.com"]), "run-1") ?? "", /not read that email/);
  assert.match(seenWithAnna().check(reply(["anna.berg@example.com"]), "run-2") ?? "", /not read that email/, "another run's reading does not count");
});

test("a reply may go only to the sender of the email that was read", () => {
  const seen = seenWithAnna();
  assert.equal(seen.check(reply(["anna.berg@example.com"]), "run-1"), null, "case does not matter");
  assert.match(seen.check(reply(["boss@example.com"]), "run-1") ?? "", /only go to the sender/);
  assert.match(seen.check(reply(["anna.berg@example.com", "boss@example.com"]), "run-1") ?? "", /only go to the sender/);
  assert.match(seen.check(reply(["anna.berg@example.com"], { cc: ["boss@example.com"] }), "run-1") ?? "", /cc empty/);
});

test("an attachment must be one the email really has", () => {
  const seen = seenWithAnna();
  const file = (attachment: string) => card({ kind: "file_attachment", ...base, sourceKey: `mail:555:${attachment}`, action: { id: "555", attachment, folder: "Documents/Receipts" } });
  assert.equal(seen.check(file("invoice-1042.pdf"), "run-1"), null);
  assert.match(seen.check(file("passwords.txt"), "run-1") ?? "", /no attachment called/);
});

test("reminders and events need only a real source email", () => {
  const seen = seenWithAnna();
  const reminder = card({ kind: "reminder", ...base, action: { title: "Pay the bill" } });
  assert.equal(seen.check(reminder, "run-1"), null);
  assert.match(seen.check(card({ kind: "reminder", ...base, sourceKey: "web:example.com", action: { title: "x" } }), "run-1") ?? "", /start from an email/);
});

test("memory stays bounded", () => {
  const seen = new MailSeen();
  for (let i = 0; i < 150; i++) seen.remember(`run-${i}`, [{ id: "1", from: "a@b.co", subject: "s" }]);
  assert.match(seen.check(reply(["a@b.co"], {}, "mail:1"), "run-0") ?? "", /not read that email/, "the oldest runs are forgotten");
  assert.equal(seen.check(reply(["a@b.co"], {}, "mail:1"), "run-149"), null);
});

test("an amount counts only when the email really writes it, in any usual style", () => {
  assert.equal(amountAppearsIn("Total due: 1,240.50 EUR by Friday", "1240.50"), true);
  assert.equal(amountAppearsIn("Gesamtbetrag 1.240,50 EUR", "1240.50"), true);
  assert.equal(amountAppearsIn("Montant 1 240,50 €", "1240,50"), true);
  assert.equal(amountAppearsIn("Your bill is 84.20 this month.", "84.20"), true);
  assert.equal(amountAppearsIn("Your bill is 84.20.", "84.20"), true, "a full stop after the amount is not part of it");
  assert.equal(amountAppearsIn("Invoice 184.205 pending", "84.20"), false, "the middle of a longer number does not count");
  assert.equal(amountAppearsIn("Order 84.201 shipped", "84.20"), false);
  assert.equal(amountAppearsIn("Total 99.00 EUR", "84.20"), false, "an amount that is not there is refused");
  assert.equal(amountAppearsIn("Total 84 EUR", "84"), true);
});

const receiptCard = (receipt: Record<string, unknown>) => card({ kind: "file_attachment", title: "File the invoice", why: "Acme sent an invoice.", sourceKey: "mail:777", action: { id: "777", attachment: "invoice-1042.pdf", folder: "Documents/Receipts/2026-10" }, receipt });

test("receipt details must match the email that was read; a snippet never replaces the full text", () => {
  const seen = new MailSeen();
  seen.remember("run-1", [{ id: "777", from: "Acme Billing <billing@acme.com>", subject: "Invoice 1042", snippet: "Hello, your invoice is attached.", attachments: [{ name: "invoice-1042.pdf" }] }]);
  assert.match(seen.check(receiptCard({ vendor: "Acme", amount: "84.20", currency: "EUR" }), "run-1") ?? "", /amount 84\.20 is not written/, "only a snippet was read, and it has no amount");
  seen.remember("run-1", [{ id: "777", from: "Acme Billing <billing@acme.com>", subject: "Invoice 1042", text: "Dear customer, the total of 84.20 EUR is due on 9 October. Thank you, Acme.", snippet: "Dear customer", attachments: [{ name: "invoice-1042.pdf" }] }]);
  assert.equal(seen.check(receiptCard({ vendor: "Acme", amount: "84.20", currency: "EUR", invoiceDate: "2026-10-01", reference: "1042" }), "run-1"), null);
  seen.remember("run-1", [{ id: "777", from: "Acme Billing <billing@acme.com>", subject: "Invoice 1042", snippet: "Dear customer", attachments: [{ name: "invoice-1042.pdf" }] }]);
  assert.equal(seen.check(receiptCard({ amount: "84.20", currency: "EUR" }), "run-1"), null, "listing the mail again after reading it keeps the full text");
  assert.match(seen.check(receiptCard({ amount: "99.99", currency: "EUR" }), "run-1") ?? "", /not written in the email/);
  assert.match(seen.check(receiptCard({ vendor: "Globex" }), "run-1") ?? "", /Globex/, "a vendor the email never names is refused");
  assert.equal(seen.check(receiptCard({ vendor: "ACME" }), "run-1"), null, "case does not matter for the vendor");
  assert.equal(seen.sender(receiptCard({}), "run-1"), "Acme Billing <billing@acme.com>");
});

test("receipt details are strict: a plain amount, a three-letter currency, no stray fields", () => {
  assert.equal(queueProposalInput.safeParse({ kind: "file_attachment", ...base, action: { id: "1", attachment: "a.pdf", folder: "Documents/Receipts" }, receipt: { amount: "1,240.50", currency: "EUR" } }).success, false, "thousands separators are refused");
  assert.equal(queueProposalInput.safeParse({ kind: "file_attachment", ...base, action: { id: "1", attachment: "a.pdf", folder: "Documents/Receipts" }, receipt: { amount: "84.20" } }).success, false, "an amount needs its currency");
  assert.equal(queueProposalInput.safeParse({ kind: "file_attachment", ...base, action: { id: "1", attachment: "a.pdf", folder: "Documents/Receipts" }, receipt: { amount: "84.20", currency: "eur" } }).success, false);
  assert.equal(queueProposalInput.safeParse({ kind: "file_attachment", ...base, action: { id: "1", attachment: "a.pdf", folder: "Documents/Receipts" }, receipt: { vendor: "Acme", total: "1" } }).success, false, "unknown fields fail");
  assert.equal(queueProposalInput.safeParse({ kind: "file_attachment", ...base, action: { id: "1", attachment: "a.pdf", folder: "Documents/Receipts" }, receipt: { vendor: "Acme", amount: "84,20", currency: "EUR", invoiceDate: "2026-10-01" } }).success, true);
  assert.equal(queueProposalInput.safeParse({ kind: "reminder", ...base, action: { title: "x" }, receipt: { vendor: "Acme" } }).success, false, "only filed files carry receipt details");
});

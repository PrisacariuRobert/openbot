import test from "node:test";
import assert from "node:assert/strict";
import { MailSeen, emailAddresses } from "./queue-grounding.js";
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

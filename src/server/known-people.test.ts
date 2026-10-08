import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { personKey, recipientsOf, rememberRecipients, unknownRecipients } from "./known-people.js";
import { OpenBotDatabase } from "./testing/database.js";

function studio() {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-known-people-"));
  const db = new OpenBotDatabase(root);
  return { db, close: () => { db.close(); rmSync(root, { recursive: true, force: true }); } };
}

test("people are keyed like Contacts: email lowercased, phone by its last nine digits", () => {
  assert.equal(personKey("Anna Berg <Anna@Example.com>"), "anna@example.com");
  assert.equal(personKey(" ANNA@example.com "), "anna@example.com");
  assert.equal(personKey("+32 470 12 34 56"), "470123456");
  assert.equal(personKey("not an address"), null);
  assert.equal(personKey("x@y"), null);
});

test("who a send reaches, from the arguments the owner reviews", () => {
  assert.deepEqual(recipientsOf("gmail_send", { to: "a@example.com, b@example.com", cc: "c@example.com" }), ["a@example.com", "b@example.com", "c@example.com"]);
  assert.deepEqual(recipientsOf("gmail_reply", { to: "a@example.com" }), ["a@example.com"]);
  assert.deepEqual(recipientsOf("google_calendar_create", { attendees: ["a@example.com"] }), ["a@example.com"]);
  assert.deepEqual(recipientsOf("google_calendar_create", {}), []);
  assert.deepEqual(recipientsOf("mac_note_create", { to: "a@example.com" }), []);
});

test("known means the owner wrote to them or saved them in Contacts; a stranger who wrote first stays new", async () => {
  const { db, close } = studio();
  try {
    const asked: string[] = [];
    const sources = {
      contacts: (key: string) => key === "470123456" || key === "friend@example.com",
      sentMail: async (address: string) => { asked.push(address); return address === "colleague@example.com"; },
    };
    assert.deepEqual(await unknownRecipients(db, ["friend@example.com", "+32 470 12 34 56", "colleague@example.com", "stranger@example.com", "garbled"], sources), ["stranger@example.com", "garbled"]);
    assert.deepEqual(asked, ["colleague@example.com", "stranger@example.com"], "Sent mail is checked only for those not already known");
    // Positives are remembered with where they came from; the stranger isn't.
    assert.equal(db.isKnownPerson("friend@example.com"), true);
    assert.equal(db.isKnownPerson("colleague@example.com"), true);
    assert.equal(db.isKnownPerson("stranger@example.com"), false);
    assert.deepEqual(await unknownRecipients(db, ["colleague@example.com"], {}), [], "remembered without asking Gmail again");
    // A failing source counts as not known: asking is the safe side.
    assert.deepEqual(await unknownRecipients(db, ["new@example.com"], { sentMail: async () => { throw new Error("offline"); } }), ["new@example.com"]);
    // Once the owner approves a send to someone, they're known.
    rememberRecipients(db, "gmail_reply", { to: "Stranger <stranger@example.com>" });
    assert.deepEqual(await unknownRecipients(db, ["stranger@example.com"]), []);
    assert.equal(db.knownPeopleCount(), 4);
  } finally { close(); }
});

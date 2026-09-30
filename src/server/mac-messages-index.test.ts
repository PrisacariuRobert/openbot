import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { FullDiskAccessError } from "./imessage-channel.js";
import { ContactNames, readMessageItems } from "./mac-messages-index.js";
import { PersonalIndex } from "./personal-index.js";
import { PersonalIndexer, type IndexerConfig } from "./personal-indexer.js";

const APPLE_EPOCH = 978_307_200;
const nanos = (iso: string) => (Date.parse(iso) / 1000 - APPLE_EPOCH) * 1e9;

function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), "openbot-messages-"));
  const chat = path.join(dir, "chat.db");
  const db = new DatabaseSync(chat);
  db.exec(`CREATE TABLE handle (ROWID INTEGER PRIMARY KEY, id TEXT);
    CREATE TABLE chat (ROWID INTEGER PRIMARY KEY, chat_identifier TEXT, display_name TEXT);
    CREATE TABLE message (ROWID INTEGER PRIMARY KEY, text TEXT, attributedBody BLOB, date INTEGER, is_from_me INTEGER, handle_id INTEGER, item_type INTEGER DEFAULT 0);
    CREATE TABLE chat_message_join (chat_id INTEGER, message_id INTEGER);`);
  db.prepare("INSERT INTO handle VALUES (1, '+32 456 39 17 65'), (2, 'bob@example.com')").run();
  db.prepare("INSERT INTO chat VALUES (1, '+32456391765', ''), (2, 'chat99', 'Berlin crew')").run();
  const add = (id: number, text: string | null, iso: string, fromMe: boolean, handle: number, chatId: number, type = 0, body: Buffer | null = null) => {
    db.prepare("INSERT INTO message (ROWID, text, attributedBody, date, is_from_me, handle_id, item_type) VALUES (?,?,?,?,?,?,?)").run(id, text, body, nanos(iso), fromMe ? 1 : 0, handle, type);
    db.prepare("INSERT INTO chat_message_join VALUES (?, ?)").run(chatId, id);
  };
  add(1, "Can we move dinner to 8? Berlin tickets are booked.", "2026-09-10T08:00:00Z", false, 1, 1);
  add(2, "Yes, 8 works.", "2026-09-10T08:05:00Z", true, 1, 1);
  add(3, "Hotel is near the station", "2026-09-11T09:00:00Z", false, 2, 2);
  add(4, null, "2026-09-11T09:01:00Z", false, 2, 2);
  add(5, "Anna changed the group name", "2026-09-11T09:02:00Z", false, 2, 2, 1);
  add(6, "Too old to index", "2024-01-01T09:00:00Z", false, 1, 1);
  const address = path.join(dir, "Library/Application Support/AddressBook");
  mkdirSync(address, { recursive: true });
  const book = new DatabaseSync(path.join(address, "AddressBook-v22.abcddb"));
  book.exec(`CREATE TABLE ZABCDRECORD (Z_PK INTEGER PRIMARY KEY, ZFIRSTNAME TEXT, ZLASTNAME TEXT, ZORGANIZATION TEXT);
    CREATE TABLE ZABCDPHONENUMBER (ZOWNER INTEGER, ZFULLNUMBER TEXT);
    CREATE TABLE ZABCDEMAILADDRESS (ZOWNER INTEGER, ZADDRESS TEXT);
    INSERT INTO ZABCDRECORD VALUES (1, 'Anna', 'Keller', ''), (2, 'Bob', 'Stone', '');
    INSERT INTO ZABCDPHONENUMBER VALUES (1, '+32 (0) 456-39-17-65');
    INSERT INTO ZABCDEMAILADDRESS VALUES (2, 'BOB@example.com');`);
  book.close(); db.close();
  return { dir, chat, now: Date.parse("2026-09-30T00:00:00Z") };
}

test("conversations become one item per day, with names from Contacts, skipping system events", () => {
  const { dir, chat, now } = fixture();
  try {
    const names = ContactNames.load(dir);
    assert.equal(names.lookup("+32456391765"), "Anna Keller");
    assert.equal(names.lookup("bob@EXAMPLE.com"), "Bob Stone");
    assert.equal(names.lookup("+49 170 000 0000"), null);
    const items = readMessageItems({ file: chat, days: 365, limit: 1_000, names, now });
    assert.equal(items.length, 2, "the 2024 message and the group-rename event are left out");
    const anna = items.find((item) => item.title.includes("Anna Keller"))!;
    assert.match(anna.body, /Anna Keller: Can we move dinner to 8\? Berlin tickets are booked\./);
    assert.match(anna.body, /Me: Yes, 8 works\./);
    assert.equal(anna.author, "Anna Keller");
    const crew = items.find((item) => item.title.includes("Berlin crew"))!;
    assert.match(crew.body, /Bob Stone: Hotel is near the station/);

    const index = new PersonalIndex(":memory:");
    index.upsert(items);
    const hits = index.search("what did Anna say about the Berlin trip");
    assert.equal(hits[0]!.key.startsWith("+32456391765"), true);
    assert.match(hits[0]!.snippet, /Berlin tickets/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("without Full Disk Access the owner is told exactly what to switch on", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "openbot-nomessages-"));
  try { assert.throws(() => readMessageItems({ file: path.join(dir, "missing.db"), days: 30, limit: 10 }), (error) => error instanceof FullDiskAccessError && /Full Disk Access/.test(error.message)); }
  finally { rmSync(dir, { recursive: true, force: true }); }
});

test("the indexer keeps Messages fresh and explains a missing permission", async () => {
  const { dir, chat, now } = fixture();
  try {
    let saved: IndexerConfig | null = null;
    const index = new PersonalIndex(":memory:");
    const base = { index, home: dir, platform: "darwin" as const, load: () => saved, save: (config: IndexerConfig) => { saved = structuredClone(config); } };
    const indexer = new PersonalIndexer({ ...base, messages: () => readMessageItems({ file: chat, days: 365, limit: 1_000, names: ContactNames.load(dir), now }) });
    indexer.setEnabled("messages", true);
    await indexer.refresh("messages");
    assert.equal(indexer.status().sources.find((source) => source.id === "messages")!.items, 2);
    await indexer.refresh("messages");
    assert.equal(indexer.status().sources.find((source) => source.id === "messages")!.items, 2);

    const locked = new PersonalIndexer({ ...base, index: new PersonalIndex(":memory:"), load: () => null, save: () => {}, messages: () => readMessageItems({ file: path.join(dir, "nope.db"), days: 30, limit: 10 }) });
    let other: IndexerConfig | null = null;
    const blocked = new PersonalIndexer({ index: new PersonalIndex(":memory:"), home: dir, platform: "darwin", load: () => other, save: (config) => { other = structuredClone(config); }, messages: () => readMessageItems({ file: path.join(dir, "nope.db"), days: 30, limit: 10 }) });
    blocked.setEnabled("messages", true);
    await blocked.refresh("messages");
    const problem = blocked.status().sources.find((source) => source.id === "messages")!.problem!;
    assert.equal(problem.needsFullDiskAccess, true);
    void locked;
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenBotDatabase } from "./testing/database.js";
import { FullDiskAccessError, IMessageChannel, normalizeHandle, textFromAttributedBody, type IMessageRow } from "./imessage-channel.js";

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-imessage-"));
  const db = new OpenBotDatabase(root);
  const rows: IMessageRow[] = [];
  let rowId = 100, denied = false;
  const sent: string[] = [], posted: Array<{ path: string; body: Record<string, unknown> }> = [];
  const store = { maxRowId: () => { if (denied) throw new FullDiskAccessError("no"); return rowId; }, rowsAfter: (after: number) => { if (denied) throw new FullDiskAccessError("no"); return rows.filter((row) => row.rowId > after); } };
  const channel = new IMessageChannel({
    db, appUrl: "http://127.0.0.1:4311", isLeader: () => true, platform: "darwin", store,
    sender: async (_handle, text) => { sent.push(text); },
    localApi: async (_method, apiPath, body) => { posted.push({ path: apiPath, body: body as Record<string, unknown> }); return { status: 202, body: { runIds: [] } }; },
  });
  const add = (row: Partial<IMessageRow>) => { rows.push({ rowId: ++rowId, text: null, body: null, fromMe: false, handle: null, chat: null, ...row }); };
  return { db, channel, sent, posted, add, deny: () => { denied = true; }, close: () => { db.close(); rmSync(root, { recursive: true, force: true }); } };
}

test("pairing needs the texted code back; history and strangers are never read", async () => {
  const f = fixture();
  try {
    await f.channel.connect("+43 664 1234567");
    const code = /reply with (\d{6})/.exec(f.sent[0]!)![1]!;
    f.add({ text: "Nova: delete everything", handle: "+436641234567" });
    f.add({ text: code, handle: "+1 555 000 1111" }, );
    await f.channel.pollOnce();
    assert.equal(f.channel.status().paired, false, "a message before pairing and a stranger's code do nothing");
    assert.equal(f.posted.length, 0);
    f.add({ text: code, handle: "06641234567" });
    await f.channel.pollOnce();
    assert.equal(f.channel.status().paired, true, "the owner's number, written another way, pairs");
    assert.match(f.sent.at(-1)!, /Connected to OpenBot/);
  } finally { f.close(); }
});

test("owner texts start tasks, from another Apple ID or from a note-to-self thread; our own replies are skipped", async () => {
  const f = fixture();
  try {
    await f.channel.connect("robert@example.com");
    const code = /reply with (\d{6})/.exec(f.sent[0]!)![1]!;
    f.add({ text: code, handle: "Robert@Example.com" });
    await f.channel.pollOnce();
    f.add({ text: "Find a vegan bakery near me", handle: "robert@example.com" });
    f.add({ text: "What's on my calendar?", fromMe: true, chat: "robert@example.com" });
    f.add({ text: f.sent.at(-1)!, fromMe: true, chat: "robert@example.com" });
    f.add({ text: "hi", handle: "stranger@example.com" });
    await f.channel.pollOnce();
    const bodies = f.posted.filter((item) => item.path === "/api/messages").map((item) => item.body.body);
    assert.deepEqual(bodies, ["Find a vegan bakery near me", "What's on my calendar?"]);
    assert.ok(f.posted.every((item) => String(item.body.requestId).startsWith("imessage-")), "the message row is the replay key");
  } finally { f.close(); }
});

test("without Full Disk Access the channel says so instead of failing quietly", async () => {
  const f = fixture();
  try {
    f.deny();
    await assert.rejects(f.channel.connect("+436641234567"), FullDiskAccessError);
    assert.equal(f.channel.status().needsFullDiskAccess, true);
  } finally { f.close(); }
});

test("text is read from attributedBody on newer macOS, and handles normalize", () => {
  const text = "Hallo Nova, wie geht's? 👋";
  const utf8 = Buffer.from(text, "utf8");
  const body = Buffer.concat([Buffer.from([0x04, 0x0b]), Buffer.from("streamtyped"), Buffer.from([0x81, 0xe8, 0x03, 0x84, 0x01, 0x40, 0x84, 0x84, 0x84]), Buffer.from("NSString"), Buffer.from([0x01, 0x94, 0x84, 0x01, 0x2b, utf8.length]), utf8, Buffer.from([0x86, 0x84])]);
  assert.equal(textFromAttributedBody(body), text);
  assert.equal(textFromAttributedBody(null), null);
  assert.equal(normalizeHandle("tel:+43 (664) 123-4567"), "+436641234567");
  assert.equal(normalizeHandle("MAILTO:Robert@Example.com"), "robert@example.com");
});

test("note-to-self echoes never loop: own replies are skipped in both copies, duplicates read once, and a brake pauses a flood", async () => {
  const f = fixture();
  try {
    await f.channel.connect("+32 456 39 17 65");
    const code = /reply with (\d{6})/.exec(f.sent[0]!)![1]!;
    // The code text itself echoes back as sent and as received.
    f.add({ text: f.sent[0]!, fromMe: true, chat: "+32456391765" });
    f.add({ text: f.sent[0]!, handle: "+32456391765" });
    f.add({ text: code, fromMe: true, chat: "+32456391765" });
    f.add({ text: code, handle: "+32456391765" });
    await f.channel.pollOnce();
    assert.equal(f.channel.status().paired, true);
    const greeting = f.sent.at(-1)!;
    f.add({ text: greeting, fromMe: true, chat: "+32456391765" });
    f.add({ text: greeting, handle: "+32456391765" });
    f.add({ text: "Find me a dentist nearby", fromMe: true, chat: "+32456391765" });
    f.add({ text: "Find me a dentist nearby", handle: "+32456391765" });
    await f.channel.pollOnce();
    assert.deepEqual(f.posted.map((item) => item.body.body), ["Find me a dentist nearby"], "one task, and never from our own greeting");
    for (let i = 0; i < 8; i++) f.add({ text: `message ${i}`, handle: "+32456391765" });
    await f.channel.pollOnce();
    assert.equal(f.channel.status().paused, true, "a flood pauses the channel");
    assert.ok(f.posted.length <= 7);
    assert.match(f.sent.at(-1)!, /paused iMessage/);
  } finally { f.close(); }
});

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenBotDatabase } from "./testing/database.js";
import { TesterBrowser, compactAxTree, testerUrlAllowed } from "./tester-browser.js";

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-tester-")), db = new OpenBotDatabase(root);
  return { root, db, close: () => { db.close(); rmSync(root, { recursive: true, force: true }); } };
}

test("the tester browser only ever visits the studio itself", () => {
  assert.equal(testerUrlAllowed("http://127.0.0.1:4311/"), true);
  assert.equal(testerUrlAllowed("http://localhost:4311/studio.html?panel=control"), true);
  assert.equal(testerUrlAllowed("http://[::1]:4311/"), true);
  assert.equal(testerUrlAllowed("https://127.0.0.1:4311/"), true);
  assert.equal(testerUrlAllowed("https://example.com/"), false);
  assert.equal(testerUrlAllowed("http://127.0.0.1.evil.io/"), false);
  assert.equal(testerUrlAllowed("http://evil-127.0.0.1.io/"), false);
  assert.equal(testerUrlAllowed("file:///etc/passwd"), false);
  assert.equal(testerUrlAllowed("data:text/html,hi"), false);
  assert.equal(testerUrlAllowed("http://user:pass@127.0.0.1:4311/"), false);
  assert.equal(testerUrlAllowed("not a url"), false);
  assert.equal(testerUrlAllowed(""), false);
});

test("a disallowed address is refused before any browser launches", async () => {
  const f = fixture();
  try {
    const tester = new TesterBrowser(f.root, "http://127.0.0.1:4311/");
    await assert.rejects(() => tester.open("https://example.com/"), /only visits the studio/);
    await assert.rejects(() => tester.snapshot(), /Unknown tester session/);
    await assert.rejects(() => tester.act({ kind: "click", x: 10, y: 10 }), /Unknown tester session/);
    assert.equal(await tester.close(), false);
  } finally { f.close(); }
});

test("evidence reads come from host records", () => {
  const f = fixture();
  try {
    const message = f.db.addMessage({ threadId: "team-room", senderType: "user", senderId: null, body: "Hello for the record" });
    const listed = f.db.listMessages("team-room", 10);
    assert.ok(listed.some((entry) => entry.id === message.id && entry.body === "Hello for the record"));
    const run = f.db.createRun({ threadId: "team-room", botId: "nova", prompt: "Prepare a short brief for the record", status: "queued" });
    const fetched = f.db.getRun(run.id)!;
    assert.equal(fetched.id, run.id);
    assert.deepEqual(fetched.activities, []);
  } finally { f.close(); }
});

test("compact snapshots keep dropdown options as actionable refs", () => {
  const tree = {
    nodes: [
      { nodeId: "1", backendDOMNodeId: 791, role: { value: "combobox" }, name: { value: "Teammate" }, childIds: [] },
      { nodeId: "2", backendDOMNodeId: 795, role: { value: "listbox" }, name: { value: "Teammate" }, childIds: ["3"] },
      { nodeId: "3", backendDOMNodeId: 1368, role: { value: "option" }, name: { value: "QA Reviewer" }, childIds: ["4"] },
      { nodeId: "4", backendDOMNodeId: 1367, role: { value: "StaticText" }, name: { value: "QA Reviewer" }, childIds: [] },
    ],
  };
  const lines = compactAxTree(tree);
  assert.ok(lines.some((line) => line.includes("option: QA Reviewer") && line.includes("[ref:1368]")));
});

test("compact snapshots keep interactive elements and drop prose", () => {
  const tree = {
    nodes: [
      { role: { value: "button" }, name: { value: "Send message" } },
      { role: { value: "textbox" }, name: { value: "Message the studio" }, value: { value: "hello" } },
      { role: { value: "StaticText" }, name: { value: "A long paragraph of conversation text here" } },
      { role: { value: "generic" }, name: { value: "wrapper" } },
      { role: { value: "link" }, name: { value: "" } },
      { role: { value: "heading" }, name: { value: "Activity" } },
    ],
  };
  const lines = compactAxTree(tree);
  assert.ok(lines.some((line) => line.includes("button: Send message")));
  assert.ok(lines.some((line) => line.includes("textbox") && line.includes("hello")));
  assert.ok(lines.some((line) => line.includes("heading: Activity")));
  assert.equal(lines.some((line) => line.includes("wrapper")), false);
  assert.deepEqual(compactAxTree(null), []);
  assert.deepEqual(compactAxTree({}), []);
});

test("fixture cleanup only removes unclaimed uploads", () => {
  const f = fixture();
  try {
    const created = f.db.createAttachment({ threadId: "team-room", name: "fixture.csv", mime: "text/csv", size: 3, storagePath: f.root, analysis: undefined as never });
    assert.equal(typeof created.id, "string");
    assert.equal(f.db.deleteUnclaimedAttachment(created.id), "fixture.csv");
    assert.equal(f.db.deleteUnclaimedAttachment(created.id), null);
    assert.equal(f.db.deleteUnclaimedAttachment("missing"), null);
  } finally { f.close(); }
});

test("courier drop, inbox and ack round-trip with bounds", () => {
  const f = fixture();
  try {
    const sent = f.db.sendCourierMessage({ sender: "chatgpt", recipient: "opencode", kind: "finding", subject: "H-09 test", body: "Details here.", refs: ["run-1"] });
    assert.ok(sent.id);
    assert.equal(f.db.courierInbox("opencode").length, 1);
    assert.equal(f.db.courierInbox("opencode", true).length, 1);
    assert.equal(f.db.ackCourierMessage(sent.id, "opencode"), true);
    assert.equal(f.db.courierInbox("opencode", true).length, 0);
    assert.equal(f.db.courierInbox("opencode").length, 1);
    assert.equal(f.db.ackCourierMessage(sent.id, "opencode"), false);
    assert.throws(() => f.db.sendCourierMessage({ sender: "x", recipient: "y", kind: "note", subject: "", body: "b" }), /subject/);
    // Bounded history: 201 drops keep the newest 200 (oldest-first page).
    for (let i = 0; i < 201; i++) f.db.sendCourierMessage({ sender: "x", recipient: "opencode", kind: "note", subject: `n${i}`, body: "b" });
    const page = f.db.courierInbox("opencode");
    assert.equal(page.length, 100);
    assert.equal(page[0]!.subject, "n1");
  } finally { f.close(); }
});

test("staging reset wipes test activity and keeps identity and config", () => {
  const f = fixture();
  try {
    const group = f.db.createGroupThread("QA throwaway", ["nova"]);
    f.db.addMessage({ threadId: group.id, senderType: "user", senderId: null, body: "test noise" });
    f.db.addMessage({ threadId: "team-room", senderType: "user", senderId: null, body: "also noise" });
    const counts = f.db.resetTestEnvironment();
    assert.equal(counts.threads, 1);
    assert.ok((counts.messages || 0) >= 2);
    const threads = f.db.listThreads().map((thread) => thread.id);
    assert.equal(threads.includes(group.id), false);
    assert.equal(threads.includes("team-room"), true);
    assert.ok(threads.includes("bot-nova"));
    assert.deepEqual(f.db.listBots().map((bot) => bot.id).sort(), ["nova", "pixel", "scout"]);
    // Idempotent: a second reset is a clean no-op on activity.
    const again = f.db.resetTestEnvironment();
    assert.equal(again.threads, 0);
    assert.equal(again.messages, 0);
  } finally { f.close(); }
});

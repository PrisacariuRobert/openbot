import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { OpenBotDatabase } from "./testing/database.js";

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-memory-care-")), db = new OpenBotDatabase(root);
  const run = db.createRun({ botId: "nova", threadId: "bot-nova", prompt: "A fixture task", status: "running" });
  return { root, db, run, close: () => { db.close(); rmSync(root, { recursive: true, force: true }); } };
}
test("owner corrections resist task overwrites, case aliases and stale concurrent edits/deletions", () => {
  const f = fixture();
  try {
    f.db.remember("nova", "Writing", "Use concise English.");
    const original = f.db.memoryEntries("nova")[0];
    for (const key of ["Writing", "writing", "ＷＲＩＴＩＮＧ"]) assert.throws(() => f.db.remember("nova", key, "Use another language.", { source: "task", runId: f.run.id }), /protected/);
    f.db.remember("nova", "Writing", "Use short paragraphs.", { source: "owner", expectedRevision: original.revision, requireRevision: true });
    assert.throws(() => f.db.remember("nova", "Writing", "Stale edit", { expectedRevision: original.revision, requireRevision: true }), /changed/);
    assert.throws(() => f.db.forgetMemory("nova", "Writing", original.revision, true), /changed/);
    assert.equal(f.db.memoryEntries("nova")[0].content, "Use short paragraphs.");
    assert.equal(f.db.memoryEntries("pixel").length, 0);
    const current = f.db.memoryEntries("nova")[0]; f.db.forgetMemory("nova", current.key, current.revision, true);
    assert.throws(() => f.db.remember("nova", "Writing", "Resurrected edit", { expectedRevision: current.revision }), /removed/);
  } finally { f.close(); }
});
test("task provenance is bound to the correct active run, expires by default and requires a fresh revision to update", () => {
  const f = fixture();
  try {
    f.db.remember("nova", "Project context", "The fixture launch is Tuesday.", { source: "task", runId: f.run.id });
    const note = f.db.memoryEntries("nova")[0];
    assert.equal(note.source, "task"); assert.equal(note.sourceRunId, f.run.id);
    assert.ok(Date.parse(note.expiresAt!) > Date.now() + 29 * 86400_000);
    assert.throws(() => f.db.remember("pixel", "Project", "Private", { source: "task", runId: f.run.id }), /active task/);
    assert.throws(() => f.db.remember("nova", note.key, "Changed", { source: "task", runId: f.run.id }), /fresh review/);
    assert.throws(() => f.db.remember("nova", note.key, "Changed", { source: "task", runId: f.run.id, expectedRevision: note.revision, expiresAt: null }), /expiry/);
    f.db.remember("nova", note.key, "Owner-approved permanent note", { source: "owner", expectedRevision: note.revision, expiresAt: null });
    assert.equal(f.db.memoryEntries("nova")[0].sourceRunId, null);
    assert.equal(f.db.memoryEntries("nova")[0].expiresAt, null);
  } finally { f.close(); }
});
test("expiry removes notes from retrieval and forces a new model context without deleting owner history", () => {
  const f = fixture();
  try {
    const at = Date.now();
    f.db.remember("nova", "Temporary", "Outdated context", { expiresAt: new Date(at + 60_000).toISOString() });
    const before = f.db.botSessionFingerprint("nova");
    assert.equal(f.db.memoryEntries("nova", false, at + 61_000).length, 0);
    const raw = new DatabaseSync(path.join(f.db.dataDir, "openbot.sqlite")); raw.prepare("UPDATE memories SET expires_at=?").run(new Date(at - 1).toISOString()); raw.close();
    assert.equal(f.db.searchMemories("nova", "context").length, 0); assert.equal(f.db.listMemories("nova").length, 0);
    assert.equal(f.db.memoryEntries("nova", true)[0].expired, true);
    assert.notEqual(f.db.botSessionFingerprint("nova"), before);
  } finally { f.close(); }
});
test("legacy normalized-key conflicts survive migration visibly but are excluded from prompt context", () => {
  const f = fixture();
  try {
    f.db.remember("nova", "Timezone", "Europe/Brussels");
    const raw = new DatabaseSync(path.join(f.db.dataDir, "openbot.sqlite"));
    raw.prepare("INSERT INTO memories(id,bot_id,memory_key,content,updated_at,source) VALUES (?,?,?,?,?,?)").run("fixture", "nova", "timezone", "Europe/Bucharest", new Date().toISOString(), "legacy"); raw.close();
    const reopened = new OpenBotDatabase(f.root);
    try {
      assert.equal(reopened.memoryEntries("nova").length, 2); assert.ok(reopened.memoryEntries("nova").every((note) => note.conflict));
      assert.ok(reopened.memoryEntries("nova").every((note) => note.revision !== "null"));
      assert.equal(reopened.listMemories("nova").length, 0);
      assert.throws(() => reopened.remember("nova", "TIMEZONE", "Choose one", { source: "task", runId: f.run.id }), /conflict/);
      const legacy = reopened.memoryEntries("nova").find((note) => note.key === "timezone")!;
      reopened.forgetMemory("nova", legacy.key, legacy.revision, true);
      assert.equal(reopened.listMemories("nova")[0].content, "Europe/Brussels");
    } finally { reopened.close(); }
  } finally { f.close(); }
});

test("memory retrieval ranks a partially matching note instead of hiding it behind an AND filter", () => {
  const f = fixture();
  try {
    f.db.remember("nova", "watchlist", "Watchlist owners: Ana (billing), Ravi (churn). Weekly review on Monday.");
    f.db.remember("nova", "report style", "Report language and formatting preferences.");
    assert.deepEqual(f.db.searchMemories("nova", "weekly churn review").map((note) => note.key), ["watchlist"]);
    assert.equal(f.db.searchMemories("nova", "completely unrelated aquarium").length, 0);
  } finally { f.close(); }
});

test("related history seeds background context from this bot's answers and its thread, bounded and empty for junk queries", () => {
  const f = fixture();
  try {
    f.db.addMessage({ threadId: "bot-nova", senderType: "bot", senderId: "nova", body: "Finished the Quarterly board deck template with updated revenue charts and saved it to the workspace." });
    f.db.addMessage({ threadId: "bot-nova", senderType: "user", senderId: null, body: "Reminder: the board deck must always show quarterly revenue per region." });
    f.db.addMessage({ threadId: "team-room", senderType: "bot", senderId: "pixel", body: "Unrelated pixel note about a design sprint that never mentions the deck." });
    const related = f.db.relatedHistory("nova", "bot-nova", "quarterly board deck");
    assert.equal(related.length, 2);
    assert.match(related[0].body, /board deck/i);
    assert.deepEqual(relatedHistoryJunk(f.db), []);
  } finally { f.close(); }
  function relatedHistoryJunk(db: OpenBotDatabase) { return db.relatedHistory("nova", "bot-nova", "the and of"); }
});

test("task saves that nearly duplicate a differently named owner note are refused with consolidation guidance", () => {
  const f = fixture();
  try {
    f.db.remember("nova", "brief-hours", "Morning brief is read at 07:15 Central on weekdays.");
    assert.throws(
      () => f.db.remember("nova", "daily-schedule", "Morning brief is read at 07:30 Central on weekdays.", { source: "task", runId: f.run.id }),
      /similar owner note|consolidate/i,
    );
    assert.equal(f.db.memoryEntries("nova").filter((note) => note.key === "daily-schedule").length, 0);
    assert.doesNotThrow(() => f.db.remember("nova", "daily-schedule", "Monthly audit lands each October.", { source: "task", runId: f.run.id }));
  } finally { f.close(); }
});

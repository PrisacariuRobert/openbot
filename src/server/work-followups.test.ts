import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { OpenBotDatabase } from "./testing/database.js";
import { WorkFollowups } from "./work-followups.js";

test("suggestion digests are opt-in, capped, age-bound, deduplicated across snapshots and restart-safe", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-followup-digest-")), db = new OpenBotDatabase(root);
  let clock = Date.parse("2026-09-05T09:00Z");
  const service = new WorkFollowups(db, () => clock);
  function report(texts: string[], age = 0) {
    const id = randomUUID(), at = new Date(clock - age).toISOString();
    const run = db.createRun({ botId: "nova", threadId: "bot-nova", status: "completed", prompt: "Synthetic brief" });
    db.saveWorkSnapshot({ id, runId: run.id, botId: "nova", kind: "morning", fetchedAt: at, accountEmail: "example@example.com", timeZone: "UTC", window: { from: at, until: at, mailQuery: "" }, coverage: [], sources: [{ ref: "S1", service: "slack", title: "Sample channel", sourceId: "stable-source", url: "https://app.slack.com/archives/C1", text: "Source context", truncated: false }] });
    db.saveWorkReport({ snapshotId: id, savedAt: at, markdown: "Fixture", drafts: [], items: texts.map((text) => ({ priority: "soon", text, sourceRefs: ["S1"] })) });
    return id;
  }
  try {
    report(["Old suggestion"], 8 * 86400_000);
    const firstId = report(["Confirm the date", "Review the notes", "Choose the venue", "Read the brief", "Check the invitation", "Consider a sixth item"]);
    service.refreshDigest(); assert.equal(service.list().digestEnabled, false); assert.equal(service.list().digest, null);
    const routines = db.listRoutines().length, notifications = db.pendingNotifications().length;
    service.configureDigest(true); const first = service.list().digest!; assert.equal(first.items.length, 5); assert.ok(first.items.every((item) => item.text !== "Old suggestion"));
    report(["  CONFIRM  the date  "]); assert.equal(service.list().suggestions.filter((item) => /confirm/i.test(item.text)).length, 1);
    service.refreshDigest(); assert.deepEqual(service.list().digest, first);
    service.dismissDigest(); service.refreshDigest(); assert.equal(service.list().digest, null);
    clock += 86400_001;
    service.refreshDigest(); assert.equal(service.list().digest!.items.length, 1); assert.equal(service.list().digest!.items[0].text, "Consider a sixth item");
    service.track({ snapshotId: firstId, itemIndex: 0 });
    assert.equal(service.list().suggestions.filter((item) => /confirm/i.test(item.text)).length, 0);
    const reopened = new OpenBotDatabase(root);
    try { assert.equal(new WorkFollowups(reopened, () => clock).list().digest?.items[0].text, "Consider a sixth item"); } finally { reopened.close(); }
    service.configureDigest(false); assert.equal(service.list().digest, null);
    assert.equal(db.listRoutines().length, routines); assert.equal(db.pendingNotifications().length, notifications);
  } finally { db.close(); rmSync(root, { recursive: true, force: true }); }
});

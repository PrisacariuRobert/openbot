import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { MacProductivity, MAIL_READ_SCRIPT, CALENDAR_READ_SCRIPT, type MacProductivityReader } from "./mac-productivity.js";
import { WorkReportService } from "./work-reports.js";
import { OpenBotDatabase } from "./testing/database.js";
import { GOOGLE_SCOPES } from "./google-workspace.js";
import type { WorkGoogle } from "./meeting-sources.js";

const AT = Date.parse("2026-09-05T08:00:00Z");
const mail = { id: "local-1", subject: "Review launch", from: "Mira <mira@example.test>", date: new Date(AT - 1000).toISOString(), text: "Can we review the launch?", truncated: false };
const event = { id: "local-event", title: "Review launch", start: new Date(AT + 3600_000).toISOString(), end: new Date(AT + 5400_000).toISOString(), allDay: false, description: "Review the plan", location: "Office", truncated: false, webLink: "" };
function fixture(options: { connected?: boolean; failCloud?: boolean; failLocal?: boolean; available?: boolean; revoke?: boolean } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-mac-fallback-"));
  const db = new OpenBotDatabase(root);
  db.updateStudioSettings({ macAccessEnabled: true });
  db.updateBot("nova", { browserEnabled: false }); // Mac-fallback semantics in isolation; browser coverage has its own tests.
  if (options.connected) {
    db.configureGoogleConnector({ clientId: "fixture.apps.googleusercontent.com" });
    db.completeGoogleConnector({ accessToken: "fixture", expiresAt: new Date(AT + 100_000).toISOString(), scopes: GOOGLE_SCOPES, accountEmail: "fixture@example.test" });
    db.setBotConnectorAccess("nova", { canRead: true, canSend: false });
    db.setBotConnectorAccess("nova", { canRead: true, canSend: false }, "google-calendar");
  }
  const calls = { cloud: 0, local: 0 };
  const local: MacProductivityReader = { available: options.available !== false,
    async mail() { calls.local++; if (options.failLocal) throw Error("permission denied"); if (options.revoke) db.updateStudioSettings({ macAccessEnabled: false }); return { messages: [mail], detail: "Bounded Apple Mail sample; sent messages and sync completeness are unknown." }; },
    async calendar() { calls.local++; if (options.failLocal) throw Error("permission denied"); return { events: [event], hasMore: true }; },
  };
  const cloudRead = () => { calls.cloud++; if (options.failCloud) throw Error("cloud unavailable"); };
  const cloud: WorkGoogle = {
    async workInbox() { cloudRead(); return { ids: ["cloud-1"], hasMore: false }; },
    async workThread() { cloudRead(); return { ...mail, replyState: "received_last", replyTo: "mira@example.test" }; },
    async workCalendar() { cloudRead(); return { events: [event], hasMore: false }; },
  };
  const run = db.createRun({ botId: "nova", threadId: "bot-nova", status: "running", prompt: "Prepare my sources" });
  const service = new WorkReportService(db, cloud, () => AT, local);
  return { db, run, service, calls, collect: (kind = "morning") => service.collect("nova", run.id, { kind }), close() { db.close(); rmSync(root, { recursive: true, force: true }); } };
}

test("Mac fallback saves source-labelled reports without a Google account or invented cloud links", async () => {
  const f = fixture(); try {
    const snapshot = await f.collect();
    assert.equal(f.calls.cloud, 0); assert.equal(f.calls.local, 2);
    assert.deepEqual(snapshot.coverage.map(x => x.service), ["apple-mail", "apple-calendar"]);
    assert.ok(snapshot.coverage.every(x => x.state === "limited"));
    assert.ok(snapshot.sources.every(x => x.url === null));
    const report = f.service.save("nova", f.run.id, { snapshotId: snapshot.id, items: [{ priority: "soon", text: "Review the plan", sourceRefs: ["M1", "C1"] }], drafts: [] });
    assert.match(report.markdown, /Mail on your Mac/); assert.match(report.markdown, /Calendar on your Mac/);
    assert.doesNotMatch(report.markdown, /mail\.google\.com/);
    assert.equal((await f.collect()).id, snapshot.id, "Bounded source reads may be reused while access is unchanged.");
    assert.equal(f.calls.local, 2);
  } finally { f.close(); }
});

test("Mac Mail lacks full sent-thread evidence and cannot manufacture reply drafts", async () => {
  const f = fixture(); try {
    const snapshot = await f.collect("inbox");
    assert.equal(snapshot.sources[0].replyState, "unknown");
    assert.throws(() => f.service.save("nova", f.run.id, { snapshotId: snapshot.id, items: [], drafts: [{ sourceRef: "M1", body: "I will do it" }] }), /known recipient/);
  } finally { f.close(); }
});

test("working online connectors are preferred and never read local apps unnecessarily", async () => {
  const f = fixture({ connected: true }); try {
    const snapshot = await f.collect();
    assert.equal(f.calls.local, 0); assert.equal(f.calls.cloud, 3);
    assert.deepEqual(snapshot.coverage.map(x => x.service), ["gmail", "google-calendar"]);
  } finally { f.close(); }
});

test("a failed permitted connector falls back once, with actual source provenance", async () => {
  const f = fixture({ connected: true, failCloud: true }); try {
    const snapshot = await f.collect();
    assert.equal(f.calls.cloud, 2); assert.equal(f.calls.local, 2);
    assert.ok(snapshot.sources.every(x => x.service.startsWith("apple-")));
  } finally { f.close(); }
});

test("connected-account permission denial cannot be bypassed through Mac fallback", async () => {
  const f = fixture({ connected: true, failCloud: true }); try {
    f.db.setBotConnectorAccess("nova", { canRead: false, canSend: false });
    await assert.rejects(f.collect("inbox"), /read access/);
    assert.deepEqual(f.calls, { cloud: 0, local: 0 });
  } finally { f.close(); }
});

test("non-Mac hosts and disabled Mac permissions cannot invoke a local bridge", async () => {
  for (const options of [{ available: false }, {}]) {
    const f = fixture(options); try {
      if (options.available !== false) f.db.updateStudioSettings({ macAccessEnabled: false });
      await assert.rejects(f.collect(), /enable Mac access/);
      assert.equal(f.calls.local, 0);
    } finally { f.close(); }
  }
});

test("local permission failure never becomes a verified empty inbox", async () => {
  const f = fixture({ failLocal: true }); try {
    const snapshot = await f.collect("inbox");
    assert.equal(snapshot.coverage[0].state, "unavailable");
    assert.throws(() => f.service.save("nova", f.run.id, { snapshotId: snapshot.id, items: [], drafts: [] }), /No connected app/);
  } finally { f.close(); }
});

test("revocation during a Mac read discards the snapshot and revocation after a read prevents saving", async () => {
  const f = fixture({ revoke: true }); try {
    await assert.rejects(f.collect("inbox"), /access changed/);
    assert.equal(f.db.listWorkSnapshots(f.run.id).length, 0);
  } finally { f.close(); }
  const g = fixture(); try {
    const snapshot = await g.collect("inbox"); g.db.updateStudioSettings({ macAccessEnabled: false });
    assert.throws(() => g.service.save("nova", g.run.id, { snapshotId: snapshot.id, items: [], drafts: [] }), /access was removed/);
  } finally { g.close(); }
});

test("meeting preparation works with local Calendar/Mail and explicitly missing Drive", async () => {
  const f = fixture(); try {
    const snapshot = await f.collect("meeting");
    assert.equal(f.calls.cloud, 0); assert.equal(f.calls.local, 2);
    assert.equal(snapshot.coverage.find(x => x.service === "google-drive")?.state, "unavailable");
    assert.equal(snapshot.sources.find(x => x.ref === "C1")?.service, "apple-calendar");
    assert.ok(f.service.save("nova", f.run.id, { snapshotId: snapshot.id, items: [{ priority: "soon", text: "Confirm the meeting details", sourceRefs: ["C1"] }], drafts: [] }).markdown.includes("partial coverage"));
  } finally { f.close(); }
});

test("fixed Apple Mail script bounds headers and bodies without writing message properties", () => {
  let reads = 0, headers = 0;
  const messages = Array.from({ length: 150 }, (_, i) => ({ id: () => i, dateReceived: () => { headers++; return new Date(AT - i * 1000); }, subject: () => "Review", sender: () => "Mira", readStatus: () => false, content: () => { reads++; return "x".repeat(13000); } }));
  const output = vm.runInNewContext(MAIL_READ_SCRIPT + '\nrun([input]);', { Application: (id: string) => { assert.equal(id, "com.apple.mail"); return { inbox: { messages } }; }, input: JSON.stringify({ from: new Date(AT - 7 * 86_400_000).toISOString(), unread: true }) });
  const parsed = JSON.parse(output);
  assert.equal(headers, 100); assert.equal(reads, 8); assert.equal(parsed.messages.length, 8);
  assert.equal(parsed.messages[0].text.length, 12000); assert.equal(parsed.messages[0].truncated, true);
  assert.doesNotMatch(MAIL_READ_SCRIPT, /\.activate\(|\.send\(|\.delete\(|readStatus\s*=/);
  assert.doesNotMatch(CALENDAR_READ_SCRIPT, /\.activate\(|\.make\(|\.delete\(|\.save\(/);
});

test("bridge validates input/output and explains Automation denial without leaking process output", async () => {
  let calls = 0;
  const reader = new MacProductivity(async (_script, args) => { calls++; assert.equal(args.length, 1); return JSON.stringify({ messages: [mail], detail: "bounded" }); }, "darwin");
  assert.equal((await reader.mail(new Date(AT).toISOString(), false, '"; send()', AbortSignal.timeout(1000))).messages.length, 1);
  await assert.rejects(reader.calendar("not a date", new Date(AT).toISOString(), AbortSignal.timeout(1000)));
  assert.equal(calls, 1);
  const denied = new MacProductivity(async () => { throw Error("secret process output -1743"); }, "darwin");
  await assert.rejects(denied.mail(new Date(AT).toISOString(), false, undefined, AbortSignal.timeout(1000)), error => /Automation/.test(String(error)) && !/secret/.test(String(error)));
  const bad = new MacProductivity(async () => JSON.stringify({ messages: Array(9).fill(mail), detail: "too many" }), "darwin");
  await assert.rejects(bad.mail(new Date(AT).toISOString(), false, undefined, AbortSignal.timeout(1000)));
});

test("both fixed scripts compile with Apple's JavaScript automation engine without running apps", { skip: process.platform !== "darwin" }, () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-script-compile-"));
  try {
    for (const [index, script] of [MAIL_READ_SCRIPT, CALENDAR_READ_SCRIPT].entries()) {
      const result = spawnSync("/usr/bin/osacompile", ["-l", "JavaScript", "-o", path.join(root, `read-${index}.scpt`)], { input: script, encoding: "utf8", timeout: 10_000 });
      assert.equal(result.status, 0, result.stderr);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

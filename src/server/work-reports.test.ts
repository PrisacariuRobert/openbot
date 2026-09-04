import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { OpenBotDatabase } from "./database.js";
import { decodeWorkThread, GoogleWorkspaceConnector, GOOGLE_SCOPES } from "./google-workspace.js";
import { WorkReportService } from "./work-reports.js";
import { AttachmentService } from "./attachments.js";
import { prepareWorkspace } from "./workspace.js";
import { toolAvailability } from "./tool-availability.js";

const AT = Date.parse("2026-09-05T07:00:00Z");
function mail(id: string, text: string, sent = false, date = AT - 1000) {
  return { id, internalDate: String(date), labelIds: sent ? ["SENT"] : ["INBOX", "UNREAD"], payload: { mimeType: "text/plain", headers: [{ name: "From", value: sent ? "owner@example.com" : "Mira <mira@example.com>" }, { name: "Subject", value: "Launch decision" }], body: { data: Buffer.from(text).toString("base64url") } } };
}
function fixture(options: { more?: boolean; calendarFails?: boolean; mailFails?: boolean; unreadable?: boolean; delayed?: () => Promise<void> } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-work-report-"));
  const db = new OpenBotDatabase(root);
  db.configureGoogleConnector({ clientId: "fixture.apps.googleusercontent.com" });
  db.completeGoogleConnector({ accessToken: "fixture-only", expiresAt: new Date(Date.now() + 3_600_000).toISOString(), scopes: GOOGLE_SCOPES, accountEmail: "owner@example.com" });
  db.setBotConnectorAccess("nova", { canRead: true, canSend: false });
  db.setBotConnectorAccess("nova", { canRead: true, canSend: false }, "google-calendar");
  const run = db.createRun({ botId: "nova", threadId: "bot-nova", status: "running", prompt: "Prepare my morning brief" });
  const requests: URL[] = [];
  const google = new GoogleWorkspaceConnector(db, "http://127.0.0.1:1/callback", (async (input, init) => {
    const url = new URL(String(input));
    requests.push(url);
    assert.equal(init?.headers && new Headers(init.headers).get("authorization"), "Bearer fixture-only");
    assert.equal(init?.method || "GET", "GET", "Briefs must never write to Google");
    assert.ok(init?.signal, "Every request needs a deadline");
    await options.delayed?.();
    if (url.pathname.endsWith("/threads")) {
      if (options.mailFails) throw new Error("fixture mail unavailable");
      return Response.json({ threads: [{ id: "thread1" }, { id: "thread2" }, { id: "thread1" }], ...(options.more ? { nextPageToken: "next" } : {}) });
    }
    if (url.pathname.endsWith("/threads/thread1")) return Response.json({ id: "thread1", messages: [mail("sent1", "Already approved.", true), mail("received1", "Can you approve the launch?", false, AT - 2000)] });
    if (url.pathname.endsWith("/threads/thread2")) {
      if (options.unreadable) return Response.json({ error: { message: "not found" } }, { status: 404 });
      return Response.json({ id: "thread2", messages: [mail("received2", "Please pick Tuesday or Wednesday for the review.")] });
    }
    if (url.pathname.endsWith("/calendars/primary/events")) {
      if (options.calendarFails) return Response.json({ error: { message: "calendar unavailable" } }, { status: 503 });
      return Response.json({ items: [
        { id: "c1", summary: "Launch review", start: { dateTime: "2026-09-05T08:00:00Z" }, end: { dateTime: "2026-09-05T08:30:00Z" }, htmlLink: "https://calendar.google.com/calendar/event?eid=fixture" },
        { id: "c2", summary: "Focus day", start: { date: "2026-09-05" }, end: { date: "2026-09-06" }, htmlLink: "javascript:alert(1)" },
        { id: "cancelled", status: "cancelled", summary: "Cancelled meeting" },
      ] });
    }
    throw new Error(`Unexpected fixture request: ${url.pathname}`);
  }) as typeof fetch);
  let now = AT;
  const service = new WorkReportService(db, google, () => now);
  return { root, db, run, requests, service, tick: (ms: number) => { now += ms; }, collect: (kind = "morning") => service.collect("nova", run.id, { kind, timeZone: "Europe/Brussels" }), close: () => { db.close(); rmSync(root, { recursive: true, force: true }); } };
}

test("morning brief fetches bounded real connector contracts, deduplicates threads and preserves calendar dates", async () => {
  const f = fixture();
  try {
    const snapshot = await f.collect();
    assert.deepEqual(snapshot.sources.map((source) => source.ref), ["M1", "M2", "C1", "C2"]);
    assert.equal(snapshot.sources[0]!.replyState, "sent_last");
    assert.equal(snapshot.sources[1]!.replyTo, "mira@example.com");
    assert.equal(snapshot.sources[3]!.url, null);
    assert.equal(snapshot.sources[3]!.start, "2026-09-05");
    assert.ok(snapshot.coverage.every((entry) => entry.state === "complete"));
    const calendar = f.requests.find((url) => url.pathname.endsWith("/events"))!;
    assert.equal(calendar.searchParams.get("timeMin"), "2026-09-05T07:00:00.000Z");
    assert.equal(calendar.searchParams.get("timeMax"), "2026-09-06T07:00:00.000Z");
    assert.equal(calendar.searchParams.get("timeZone"), "Europe/Brussels");
    assert.equal(f.requests.length, 4);
  } finally { f.close(); }
});

test("inbox report binds draft recipients and citations to sources and automatically creates a downloadable artifact", async () => {
  const f = fixture();
  try {
    const snapshot = await f.collect("inbox");
    const input = { snapshotId: snapshot.id, items: [{ priority: "soon", text: "Choose a review day; Tuesday is a suggestion, not a commitment.", sourceRefs: ["M2"] }], drafts: [{ sourceRef: "M2", body: "Would Tuesday work for you?" }] };
    const report = f.service.save("nova", f.run.id, input);
    assert.deepEqual(report.drafts, [{ sourceRef: "M2", to: "mira@example.com", subject: "Re: Launch decision", body: "Would Tuesday work for you?" }]);
    assert.match(report.markdown, /not sent/);
    assert.match(report.markdown, /authuser=owner%40example.com#all\/thread2/);
    assert.match(report.markdown, /not independently fact-check/);
    assert.equal(f.requests.length, 3);
    const message = f.db.addMessage({ threadId: "bot-nova", senderType: "bot", senderId: "nova", body: "Your report is ready.", runId: f.run.id });
    const artifacts = await new AttachmentService(f.db).captureWorkReports(message);
    assert.equal(artifacts.length, 1);
    assert.equal(artifacts[0]!.source, "artifact");
    assert.equal(f.db.listMessages("bot-nova").find((entry) => entry.id === message.id)!.attachments.length, 1);
    assert.deepEqual(f.service.save("nova", f.run.id, input), report, "An identical retry must be idempotent");
    assert.throws(() => f.service.save("nova", f.run.id, { ...input, items: [] }), /already has a saved/);
    const raw = new DatabaseSync(path.join(f.db.dataDir, "openbot.sqlite"), { readOnly: true });
    const encrypted = raw.prepare("SELECT snapshot_encrypted, report_encrypted FROM work_snapshots").get();
    assert.ok(!JSON.stringify(encrypted).includes("mira@example.com"));
    raw.close();
  } finally { f.close(); }
});

test("rejects forged sources, duplicate drafts and already answered conversations", async () => {
  const f = fixture();
  try {
    const snapshot = await f.collect("inbox");
    const save = (items: unknown[], drafts: unknown[] = []) => f.service.save("nova", f.run.id, { snapshotId: snapshot.id, items, drafts });
    assert.throws(() => save([{ priority: "now", text: "Invented", sourceRefs: ["M99"] }]), /actually read/);
    assert.throws(() => save([], [{ sourceRef: "M1", body: "Duplicate reply" }]), /no newer sent message/);
    assert.throws(() => save([], [{ sourceRef: "M2", body: "A" }, { sourceRef: "M2", body: "B" }]), /at most one reply/);
    assert.throws(() => save([], [{ sourceRef: "M2", body: "A", to: "intruder@example.com" }]), /Unrecognized key/);
    const another = f.db.createRun({ botId: "nova", threadId: "bot-nova", status: "running", prompt: "Another job" });
    assert.throws(() => f.service.save("nova", another.id, { snapshotId: snapshot.id, items: [] }), /this task/);
  } finally { f.close(); }
});

test("failed app reads are unavailable, not an empty or successful inbox", async () => {
  const f = fixture({ calendarFails: true, mailFails: true });
  try {
    const snapshot = await f.collect();
    assert.ok(snapshot.coverage.every((entry) => entry.state === "unavailable"));
    assert.equal(snapshot.sources.length, 0);
    assert.throws(() => f.service.save("nova", f.run.id, { snapshotId: snapshot.id, items: [] }), /No connected app could be checked/);
  } finally { f.close(); }
});

test("partial reads and pagination remain visible in the saved report", async () => {
  const f = fixture({ calendarFails: true, unreadable: true, more: true });
  try {
    const snapshot = await f.collect();
    assert.deepEqual(snapshot.coverage.map((entry) => entry.state), ["limited", "unavailable"]);
    const report = f.service.save("nova", f.run.id, { snapshotId: snapshot.id, items: [] });
    assert.match(report.markdown, /partial coverage/);
    assert.match(report.markdown, /only the first 8/);
    assert.match(report.markdown, /1 conversations could not be read/);
    assert.match(report.markdown, /no complete calendar check/);
    assert.doesNotMatch(report.markdown, /No events returned/);
  } finally { f.close(); }
});

test("snapshot reuse and concurrent calls avoid repeated connector reads; refreshes and age are bounded", async () => {
  const f = fixture();
  try {
    const [one, two] = await Promise.all([f.collect(), f.collect()]);
    assert.equal(one.id, two.id);
    assert.equal((await f.collect()).id, one.id);
    assert.equal(f.requests.length, 4);
    f.tick(16 * 60_000);
    assert.throws(() => f.service.save("nova", f.run.id, { snapshotId: one.id, items: [] }), /over 15 minutes/);
    const fresh = await f.collect();
    assert.notEqual(one.id, fresh.id);
    await f.service.collect("nova", f.run.id, { kind: "morning", timeZone: "Europe/Brussels", refresh: true });
    await assert.rejects(f.service.collect("nova", f.run.id, { kind: "morning", refresh: true }), /three source snapshots/);
  } finally { f.close(); }
});

test("revoking permissions prevents cached source reuse and report creation", async () => {
  const f = fixture();
  try {
    const snapshot = await f.collect("inbox");
    f.db.setBotConnectorAccess("nova", { canRead: false, canSend: false });
    await assert.rejects(f.collect("inbox"), /read access/);
    assert.throws(() => f.service.save("nova", f.run.id, { snapshotId: snapshot.id, items: [] }), /Source access was removed/);
  } finally { f.close(); }
});

test("account changes, cancellation and malformed time zones cannot reuse another task's data", async () => {
  const f = fixture();
  try {
    assert.throws(() => f.service.collect("nova", f.run.id, { kind: "morning", timeZone: "Made/Up" }), /time zone/);
    const snapshot = await f.collect();
    f.db.completeGoogleConnector({ accessToken: "new-account", expiresAt: new Date(Date.now() + 3600_000).toISOString(), scopes: GOOGLE_SCOPES, accountEmail: "different@example.com" });
    assert.throws(() => f.service.save("nova", f.run.id, { snapshotId: snapshot.id, items: [] }), /account changed/);
    f.db.cancelRun(f.run.id);
    assert.throws(() => f.service.collect("nova", f.run.id, { kind: "morning" }), /no longer active/);
  } finally { f.close(); }
});

test("permission removal during an in-flight collection discards its result", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const f = fixture({ delayed: () => gate });
  try {
    const pending = f.collect();
    f.db.setBotConnectorAccess("nova", { canRead: false, canSend: false });
    release();
    await assert.rejects(pending, /access changed/);
    assert.equal(f.db.listWorkSnapshots(f.run.id).length, 0);
  } finally { release(); f.close(); }
});

test("thread decoding handles long context, drafts, unknown order, Reply-To and ambiguous recipients conservatively", () => {
  const long = decodeWorkThread("thread1", [mail("a", "x".repeat(9000)), mail("b", "Latest decision needed")]);
  assert.equal(long.truncated, true);
  assert.match(long.text, /Latest decision needed/);
  assert.ok(long.text.length <= 4000);
  const received = mail("a", "Pick a date");
  received.payload.headers.push({ name: "Reply-To", value: "Scheduling <schedule@example.com>" });
  const draft = { ...mail("d", "Unsent draft", true, AT + 1000), labelIds: ["DRAFT"] };
  assert.equal(decodeWorkThread("t", [received, draft]).replyTo, "schedule@example.com");
  assert.equal(decodeWorkThread("t", [received, draft]).replyState, "received_last");
  assert.equal(decodeWorkThread("t", [{ ...received, internalDate: "invalid" }]).replyState, "unknown");
  received.payload.headers.find((item) => item.name === "Reply-To")!.value = "a@example.com, b@example.com";
  assert.equal(decodeWorkThread("t", [received]).replyTo, null);
});

test("OpenCode receives the new tools only with app access and the same source contract is available to Claude", () => {
  const f = fixture();
  try {
    const bot = f.db.getBot("nova")!;
    const workspace = prepareWorkspace(f.db, bot);
    assert.match(readFileSync(path.join(workspace, ".opencode/tools/work_collect.ts"), "utf8"), /work_collect/);
    assert.match(readFileSync(path.join(workspace, ".opencode/tools/work_report.ts"), "utf8"), /sourceRefs/);
    assert.equal(toolAvailability(f.db, bot).work_collect, true);
    f.db.disconnectGoogleConnector();
    assert.equal(toolAvailability(f.db, bot).work_collect, false);
    // This checks generated schema wiring, not Claude model behavior.
    const bridge = readFileSync(new URL("./claude-mcp.mjs", import.meta.url), "utf8");
    assert.match(bridge, /name: "work_collect"/);
    assert.match(bridge, /name: "work_report"/);
  } finally { f.close(); }
});

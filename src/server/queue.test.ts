import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenBotDatabase } from "./testing/database.js";
import { QUEUE_CARDS_PER_DAY, QueueError, WorkQueue, proposalFromFlatArgs, queueProposalInput, type QueueExecutor } from "./queue.js";

/** A Mac that records what it was asked to do. */
function fakeMac(options: { failOn?: string } = {}) {
  const calls: string[] = [];
  const maybeFail = (name: string) => { if (options.failOn === name) throw new Error(`${name} failed. Nothing was changed.`); };
  const executor: QueueExecutor = {
    async createReminder(input) { maybeFail("createReminder"); calls.push(`createReminder:${input.title}`); return { id: "rem-1", list: "Reminders", title: input.title, due: input.due ?? null }; },
    async deleteReminder(id) { maybeFail("deleteReminder"); calls.push(`deleteReminder:${id}`); },
    async createEvent(input) { maybeFail("createEvent"); calls.push(`createEvent:${input.title}`); return { id: "evt-1", calendar: "Home", title: input.title }; },
    async deleteEvent(id, calendar) { maybeFail("deleteEvent"); calls.push(`deleteEvent:${id}:${calendar}`); },
    async saveMailDraft(input) { maybeFail("saveMailDraft"); calls.push(`saveMailDraft:${input.subject}`); return { saved: true as const, subject: input.subject, at: "2026-10-05T08:00:00.000Z" }; },
    async deleteMailDraft(ref) { maybeFail("deleteMailDraft"); calls.push(`deleteMailDraft:${ref.subject}`); },
    async saveMailAttachment(input) { maybeFail("saveMailAttachment"); calls.push(`saveMailAttachment:${input.attachment}`); return { saved: `/Users/test/${input.folder}/${input.attachment}`, bytes: 1234 }; },
    async trashFile(filePath) { maybeFail("trashFile"); calls.push(`trashFile:${filePath}`); },
  };
  return { executor, calls };
}

function setup(options: { failOn?: string; now?: () => Date } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "sidemates-queue-test-"));
  const db = new OpenBotDatabase(root);
  const mac = fakeMac(options);
  const queue = new WorkQueue(db, () => mac.executor, options.now);
  return { db, queue, mac, done: () => rmSync(root, { recursive: true, force: true }) };
}

const reminder = (sourceKey: string) => ({ kind: "reminder", title: "Pay the electricity bill", why: "The bill in your mail is due Friday.", sourceKey, action: { title: "Pay the electricity bill", due: "2026-10-09T09:00:00+03:00" } });
const eventCard = (sourceKey: string) => ({ kind: "calendar_event", title: "School concert", why: "The school asked families to come.", sourceKey, action: { title: "School concert", start: "2026-10-14T18:00:00+03:00", end: "2026-10-14T19:30:00+03:00" } });
const draftCard = (sourceKey: string) => ({ kind: "reply_draft", title: "Reply to Anna", why: "Anna asked on Tuesday and nobody answered.", sourceKey, action: { to: ["anna@example.com"], subject: "Re: Berlin trip", body: "Hi Anna, Friday works for me." } });
const fileCard = (sourceKey: string) => ({ kind: "file_attachment", title: "File the invoice", why: "Acme sent an invoice PDF.", sourceKey, action: { id: "12345", attachment: "invoice-1042.pdf", folder: "Documents/Receipts/2026-10" } });

test("proposing a card runs nothing and shows what approving will do", () => {
  const { queue, mac, done } = setup();
  try {
    const result = queue.propose(reminder("mail:1"), { botId: "nova", runId: "run-1" });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.item.status, "ready");
    assert.match(result.item.preview, /Pay the electricity bill/);
    assert.deepEqual(mac.calls, [], "a proposal must never touch the Mac");
    assert.equal(queue.list().ready.length, 1);
  } finally { done(); }
});

test("invalid cards are refused with a plain reason and nothing is stored", () => {
  const { queue, done } = setup();
  try {
    const noRecipient = queue.propose({ ...draftCard("mail:2"), action: { to: [], subject: "x", body: "y" } }, { botId: null, runId: null });
    assert.equal(noRecipient.ok, false);
    const endsBeforeStart = queue.propose({ ...eventCard("mail:3"), action: { title: "x", start: "2026-10-14T19:00:00+03:00", end: "2026-10-14T18:00:00+03:00" } }, { botId: null, runId: null });
    assert.equal(endsBeforeStart.ok, false);
    const unknownKind = queue.propose({ ...reminder("mail:4"), kind: "send_email" }, { botId: null, runId: null });
    assert.equal(unknownKind.ok, false);
    const escapesHome = queue.propose({ ...fileCard("mail:5"), action: { id: "1", attachment: "a.pdf", folder: "../outside" } }, { botId: null, runId: null });
    assert.equal(escapesHome.ok, false);
    assert.equal(queue.list().ready.length, 0);
  } finally { done(); }
});

test("the same source never makes two cards, and a skipped card does not come back", async () => {
  const { queue, done } = setup();
  try {
    const first = queue.propose(reminder("mail:7"), { botId: null, runId: null });
    assert.equal(first.ok, true);
    const again = queue.propose(reminder("mail:7"), { botId: null, runId: null });
    assert.equal(again.ok && again.item.id, false);
    assert.equal(again.ok, false);
    if (!first.ok) return;
    queue.skip(first.item.id);
    const afterSkip = queue.propose(reminder("mail:7"), { botId: null, runId: null });
    assert.equal(afterSkip.ok, false, "a person who said no is not asked again");
  } finally { done(); }
});

test("a day holds at most eight cards", () => {
  const { queue, done } = setup();
  try {
    for (let i = 0; i < QUEUE_CARDS_PER_DAY; i++) assert.equal(queue.propose(reminder(`mail:cap-${i}`), { botId: null, runId: null }).ok, true);
    const ninth = queue.propose(reminder("mail:cap-extra"), { botId: null, runId: null });
    assert.equal(ninth.ok, false);
    if (!ninth.ok) assert.equal(ninth.reason, "full");
  } finally { done(); }
});

test("approving runs the saved action exactly once and keeps what Undo needs", async () => {
  const { queue, mac, done } = setup();
  try {
    const proposed = queue.propose(reminder("mail:10"), { botId: null, runId: null });
    assert.equal(proposed.ok, true);
    if (!proposed.ok) return;
    const approved = await queue.approve(proposed.item.id);
    assert.equal(approved.status, "done");
    assert.equal(approved.decidedBy, "person");
    assert.deepEqual(approved.result, { id: "rem-1", list: "Reminders", title: "Pay the electricity bill", due: "2026-10-09T09:00:00+03:00" });
    await assert.rejects(queue.approve(proposed.item.id), (error: unknown) => error instanceof QueueError && error.code === "already_handled");
    assert.deepEqual(mac.calls, ["createReminder:Pay the electricity bill"], "two taps must not make two reminders");
  } finally { done(); }
});

test("two approvals at the same moment still run once", async () => {
  const { queue, mac, done } = setup();
  try {
    const proposed = queue.propose(eventCard("mail:11"), { botId: null, runId: null });
    if (!proposed.ok) throw new Error("setup");
    const results = await Promise.allSettled([queue.approve(proposed.item.id), queue.approve(proposed.item.id)]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.deepEqual(mac.calls, ["createEvent:School concert"]);
  } finally { done(); }
});

test("a failed action is marked failed with a plain message and is never half-done", async () => {
  const { queue, db, done } = setup({ failOn: "createReminder" });
  try {
    const proposed = queue.propose(reminder("mail:12"), { botId: null, runId: null });
    if (!proposed.ok) throw new Error("setup");
    await assert.rejects(queue.approve(proposed.item.id), /createReminder failed/);
    const card = db.queueItemGet(proposed.item.id)!;
    assert.equal(card.status, "failed");
    assert.match(card.error ?? "", /Nothing was changed/);
  } finally { done(); }
});

test("undo reverses each kind of change with the right inverse", async () => {
  const { queue, mac, done } = setup();
  try {
    const cards = [reminder("mail:20"), eventCard("mail:21"), draftCard("mail:22"), fileCard("mail:23")]
      .map((card) => queue.propose(card, { botId: null, runId: null }));
    for (const card of cards) { assert.equal(card.ok, true); if (card.ok) { await queue.approve(card.item.id); await queue.undo(card.item.id); } }
    assert.deepEqual(mac.calls, [
      "createReminder:Pay the electricity bill", "deleteReminder:rem-1",
      "createEvent:School concert", "deleteEvent:evt-1:Home",
      "saveMailDraft:Re: Berlin trip", "deleteMailDraft:Re: Berlin trip",
      "saveMailAttachment:invoice-1042.pdf", "trashFile:/Users/test/Documents/Receipts/2026-10/invoice-1042.pdf",
    ]);
    assert.deepEqual(queue.list().recent.map((c) => c.status).sort(), ["undone", "undone", "undone", "undone"]);
  } finally { done(); }
});

test("a reply is only ever saved as a draft: nothing in the queue can send", () => {
  const { queue, done } = setup();
  try {
    const sendIt = queue.propose({ ...draftCard("mail:30"), action: { to: ["anna@example.com"], subject: "x", body: "y", send: true } }, { botId: null, runId: null });
    assert.equal(sendIt.ok, false, "unknown fields such as send are rejected");
  } finally { done(); }
});

test("when undo fails the card stays done so it can be tried again", async () => {
  const { queue, db, done } = setup({ failOn: "deleteReminder" });
  try {
    const proposed = queue.propose(reminder("mail:40"), { botId: null, runId: null });
    if (!proposed.ok) throw new Error("setup");
    await queue.approve(proposed.item.id);
    await assert.rejects(queue.undo(proposed.item.id), /deleteReminder failed/);
    assert.equal(db.queueItemGet(proposed.item.id)!.status, "done");
  } finally { done(); }
});

test("undo is offered for seven days, then the person is told to change it in the app", async () => {
  let now = new Date("2026-10-05T09:00:00Z");
  const { queue, done } = setup({ now: () => now });
  try {
    const proposed = queue.propose(reminder("mail:50"), { botId: null, runId: null });
    if (!proposed.ok) throw new Error("setup");
    await queue.approve(proposed.item.id);
    now = new Date("2026-10-20T09:00:00Z");
    await assert.rejects(queue.undo(proposed.item.id), (error: unknown) => error instanceof QueueError && error.code === "too_old");
  } finally { done(); }
});

test("cards nobody decided expire after a week and stop being offered", () => {
  let now = new Date("2026-10-05T09:00:00Z");
  const { queue, done } = setup({ now: () => now });
  try {
    queue.propose(reminder("mail:60"), { botId: null, runId: null });
    assert.equal(queue.list().ready.length, 1);
    now = new Date("2026-10-13T09:00:00Z");
    assert.equal(queue.list().ready.length, 0);
  } finally { done(); }
});

test("the queue survives a restart", () => {
  const root = mkdtempSync(path.join(tmpdir(), "sidemates-queue-restart-"));
  try {
    const first = new OpenBotDatabase(root);
    new WorkQueue(first, () => fakeMac().executor).propose(reminder("mail:70"), { botId: null, runId: null });
    const reopened = new OpenBotDatabase(root);
    assert.equal(new WorkQueue(reopened, () => fakeMac().executor).list().ready.length, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("flat teammate fields become a valid card and stray fields are not forwarded", () => {
  const flat = proposalFromFlatArgs({ kind: "reply_draft", title: "Reply to Anna", why: "She asked.", sourceKey: "mail:5", to: ["anna@example.com"], subject: "Re: Trip", body: "Yes.", due: "2026-10-09T09:00:00+03:00", send: true });
  const parsed = queueProposalInput.safeParse(flat);
  assert.equal(parsed.success, true, "a stray due or send field is ignored, not rejected");
  assert.deepEqual((flat as { action: object }).action, { to: ["anna@example.com"], subject: "Re: Trip", body: "Yes." });
  const reminderFlat = proposalFromFlatArgs({ kind: "reminder", title: "Pay the bill", why: "Due Friday.", sourceKey: "mail:6", due: "2026-10-09T09:00:00+03:00", list: "" });
  assert.deepEqual((reminderFlat as { action: object }).action, { title: "Pay the bill", due: "2026-10-09T09:00:00+03:00" });
  const nested = { kind: "reminder", title: "x", why: "y", sourceKey: "mail:7", action: { title: "x" } };
  assert.equal(proposalFromFlatArgs(nested), nested);
});

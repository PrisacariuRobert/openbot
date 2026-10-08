import assert from "node:assert/strict";
import test from "node:test";
import type { Routine } from "../shared/types.js";
import { fileTypesMatch, MacTriggers, mailMatches, type FolderEntry, type MacTriggerDeps, type MailEntry } from "./mac-triggers.js";

const routine = (overrides: Partial<Routine> & { triggerConfig?: Routine["triggerConfig"] }): Routine => ({
  id: "r1", name: "File receipts", botId: "nova", botName: "Nova", threadId: "t", prompt: "Add new receipts to expenses.xlsx.", intervalMinutes: 1440,
  enabled: true, triggerType: "folder", triggerConfig: { folderPath: "/Users/demo/Receipts", fileTypes: "pdf" }, ...overrides,
} as Routine);

function harness(routines: Routine[], options: Partial<MacTriggerDeps> = {}) {
  let clock = 1_000_000;
  const files: FolderEntry[] = [], mail: MailEntry[] = [], cursors = new Map<string, string>();
  const runs: Array<{ routine: string; source: string; payload: any; externalId: string; at: number }> = [], alerts: string[] = [];
  const triggers = new MacTriggers({
    routines: () => routines, macAccess: () => true,
    listFolder: () => files.map((file) => ({ ...file })), unreadMail: async () => mail.map((item) => ({ ...item })),
    cursor: { get: (id, source) => cursors.get(`${id}:${source}`) ?? null, set: (id, source, value) => { cursors.set(`${id}:${source}`, value); } },
    startedSince: (id, since) => runs.filter((run) => run.routine === id && run.at >= since).length,
    dispatch: (r, source, payload, externalId) => { runs.push({ routine: r.id, source, payload, externalId, at: clock }); },
    alert: (_r, message) => { alerts.push(message); },
    now: () => clock, quietMs: 30_000, perHour: 3, ...options,
  });
  return { triggers, files, mail, runs, alerts, advance: (ms: number) => { clock += ms; }, file: (name: string, size = 100) => files.push({ name, size, modifiedMs: clock }) };
}

test("a folder trigger starts from what's there, then reports a new file once it has settled", async () => {
  const h = harness([routine({})]);
  h.file("old-receipt.pdf");
  await h.triggers.tick();
  assert.equal(h.runs.length, 0, "what's already there never starts a run");
  h.file("new-receipt.pdf");
  await h.triggers.tick();
  assert.equal(h.runs.length, 0, "waits for a quiet moment");
  h.advance(31_000);
  await h.triggers.tick();
  assert.equal(h.runs.length, 1);
  assert.deepEqual(h.runs[0]!.payload.files.map((file: { name: string; path: string }) => [file.name, file.path]), [["new-receipt.pdf", "/Users/demo/Receipts/new-receipt.pdf"]]);
  h.advance(31_000);
  await h.triggers.tick();
  assert.equal(h.runs.length, 1, "the same file never starts a second run");
});

test("a burst of files becomes one run; a file still being written waits; other types and partial downloads are ignored", async () => {
  const h = harness([routine({})]);
  await h.triggers.tick();
  for (const name of ["a.pdf", "b.pdf", "c.pdf"]) { h.file(name); h.advance(5_000); await h.triggers.tick(); }
  h.file("photo.jpg"); h.file("d.pdf.crdownload"); h.file(".DS_Store");
  h.files.find((file) => file.name === "c.pdf")!.size = 400; // still growing
  await h.triggers.tick();
  h.advance(29_000); await h.triggers.tick();
  assert.equal(h.runs.length, 0, "the growing file reset the quiet period");
  h.advance(2_000); await h.triggers.tick();
  assert.equal(h.runs.length, 1);
  assert.deepEqual(h.runs[0]!.payload.files.map((file: { name: string }) => file.name), ["a.pdf", "b.pdf", "c.pdf"]);
  assert.equal(h.runs[0]!.payload.files[2].size, 400);
});

test("runs are capped per hour; files that arrive meanwhile wait for one later run", async () => {
  const h = harness([routine({})]);
  await h.triggers.tick();
  for (let n = 0; n < 3; n++) { h.file(`r${n}.pdf`); h.advance(31_000); await h.triggers.tick(); await h.triggers.tick(); h.advance(31_000); await h.triggers.tick(); }
  assert.equal(h.runs.length, 3);
  h.file("late-1.pdf"); h.file("late-2.pdf"); await h.triggers.tick(); h.advance(31_000); await h.triggers.tick();
  assert.equal(h.runs.length, 3, "the cap holds");
  assert.match(h.alerts.at(-1)!, /already ran 3 times this hour/);
  h.advance(3_600_000); await h.triggers.tick();
  assert.equal(h.runs.length, 4);
  assert.deepEqual(h.runs[3]!.payload.files.map((file: { name: string }) => file.name), ["late-1.pdf", "late-2.pdf"], "nothing was lost; both came in one run");
});

test("a mail trigger starts from the unread mail already there, and reports matching new mail only", async () => {
  const mailRoutine = routine({ id: "r2", name: "Invoices", triggerType: "mail", triggerConfig: { mailFrom: "accountant@", mailSubject: "invoice" } });
  const h = harness([mailRoutine]);
  h.mail.push({ id: "1", from: "Accountant <accountant@books.example>", subject: "Invoice September", date: "2026-10-01T09:00:00Z" });
  await h.triggers.tick();
  h.mail.push({ id: "2", from: "Accountant <accountant@books.example>", subject: "Invoice October", date: "2026-10-08T09:00:00Z" });
  h.mail.push({ id: "3", from: "Newsletter <news@shop.example>", subject: "Invoice your friends!", date: "2026-10-08T09:01:00Z" });
  h.mail.push({ id: "4", from: "Accountant <accountant@books.example>", subject: "Lunch?", date: "2026-10-08T09:02:00Z" });
  await h.triggers.tick(); h.advance(31_000); await h.triggers.tick();
  assert.equal(h.runs.length, 1);
  assert.deepEqual(h.runs[0]!.payload.mails.map((mail: MailEntry) => mail.id), ["2"]);
  assert.equal(h.runs[0]!.source, "mail");
});

test("matching rules, and nothing runs while Files & apps is off", async () => {
  assert.equal(fileTypesMatch("Receipt.PDF", "pdf, jpg"), true);
  assert.equal(fileTypesMatch("notes.txt", ".pdf"), false);
  assert.equal(fileTypesMatch("anything.bin", ""), true);
  assert.equal(mailMatches({ id: "1", from: "a@b.example", subject: "Hi", date: "" }, {}), false, "a mail trigger needs a sender or subject");
  const h = harness([routine({})], { macAccess: () => false });
  h.file("x.pdf"); await h.triggers.tick(); h.advance(31_000); await h.triggers.tick();
  assert.equal(h.runs.length, 0);
  assert.match(h.alerts[0]!, /turn on Files & apps/);
  assert.equal(h.alerts.length, 1, "said once, not every tick");
});

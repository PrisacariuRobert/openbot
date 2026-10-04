import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { OpenBotDatabase } from "./database.js";
import { queuePreview, queueProposalInput } from "./queue.js";

// This test never approves a card: on a Mac, approving would create a real
// reminder. Approval and undo with a fake Mac are covered in queue.test.ts.
test("the queue routes list, skip and refuse repeats, and the app state carries the count", { timeout: 240_000 }, async () => {
  const root = mkdtempSync(path.join(tmpdir(), "sidemates-queue-route-"));
  const data = path.join(root, "data");
  const db = new OpenBotDatabase(root, { dataDir: data });
  const seed = (sourceKey: string, title: string) => {
    const proposal = queueProposalInput.parse({ kind: "reminder", title, why: "A test card.", sourceKey, action: { title } });
    return db.queueItemInsert({ kind: proposal.kind, title, why: proposal.why, sourceKey, botId: null, runId: null, action: proposal.action as Record<string, unknown>, preview: queuePreview(proposal), expiresAt: new Date(Date.now() + 86_400_000).toISOString() })!;
  };
  const first = seed("mail:1", "Pay the bill");
  seed("mail:2", "Book the dentist");
  // Two patterns a person has already approved five times (written straight into the database: nothing touches the Mac).
  const approvedFive = (pattern: string) => {
    for (let n = 0; n < 5; n++) {
      const proposal = queueProposalInput.parse({ kind: "reminder", title: `Pay ${pattern} ${n}`, why: "Earlier.", sourceKey: `mail:${pattern}-${n}`, action: { title: `Pay ${pattern} ${n}`, list: "Bills" } });
      const made = db.queueItemInsert({ kind: proposal.kind, title: proposal.title, why: proposal.why, sourceKey: proposal.sourceKey, botId: null, runId: null, action: proposal.action as Record<string, unknown>, preview: queuePreview(proposal), expiresAt: new Date(Date.now() + 86_400_000).toISOString(), pattern })!;
      db.queueItemTransition(made.id, ["ready"], { status: "done", decidedBy: "person", result: { id: `r-${n}`, list: "Bills", title: proposal.title, due: null } });
    }
  };
  const filed = db.queueItemInsert({ kind: "file_attachment", title: "File the Acme invoice", why: "Acme sent an invoice.", sourceKey: "mail:77", botId: null, runId: null, action: { id: "77", attachment: "invoice-1042.pdf", folder: "Documents/Receipts/2026-10" }, preview: "Save the file.", expiresAt: new Date(Date.now() + 86_400_000).toISOString(), pattern: "file_attachment|acme.com|Documents/Receipts/YYYY-MM", meta: { vendor: "Acme", amount: "84.20", currency: "EUR" } })!;
  db.queueItemTransition(filed.id, ["ready"], { status: "done", decidedBy: "person", result: { saved: "/Users/test/Documents/Receipts/2026-10/invoice-1042.pdf", bytes: 1 } });
  const keep = "reminder|acme.com|bills", notNow = "reminder|school.example|bills";
  approvedFive(keep); approvedFive(notNow);
  db.close();

  const socket = createServer();
  await new Promise<void>((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = (socket.address() as { port: number }).port;
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["--import", "tsx", "src/server/index.ts"], {
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
    stdio: "ignore",
    env: { PATH: process.env.PATH, LANG: "en_US.UTF-8", TZ: "UTC", OPENBOT_LOAD_ENV: "0", OPENBOT_DATA_DIR: data, OPENBOT_PORT: String(port), OPENBOT_HOST: "127.0.0.1", OPENBOT_APP_URL: base, OPENBOT_DEPLOYMENT_MODE: "local", NODE_ENV: "test" },
  });
  const exited = once(child, "exit");
  const post = (route: string) => fetch(`${base}${route}`, { method: "POST" });
  try {
    let ready = false;
    for (let n = 0; n < 1800 && !ready; n++) {
      try { ready = (await fetch(base + "/api/healthz")).ok; } catch { /* still starting */ }
      if (!ready) await delay(100);
    }
    assert.ok(ready, "the disposable studio starts");

    const state = await (await fetch(base + "/api/state")).json() as { queueReady: number };
    assert.equal(state.queueReady, 2, "the app state carries how many cards are waiting");

    const listed = await (await fetch(base + "/api/queue")).json() as { ready: Array<{ id: string; preview: string }>; recent: unknown[] };
    assert.equal(listed.ready.length, 2);
    assert.match(listed.ready[0]!.preview, /Reminders/, "each card says exactly what approving will do");
    assert.equal(listed.recent.length, 11, "the ten earlier approvals show under Done for you, none of them waiting");

    const skipped = await post(`/api/queue/${first.id}/skip`);
    assert.equal(skipped.status, 200);
    assert.equal((await post(`/api/queue/${first.id}/skip`)).status, 409, "a second skip is refused");
    assert.equal((await post(`/api/queue/${first.id}/undo`)).status, 409, "a skipped card has nothing to undo");
    assert.equal((await post("/api/queue/q-missing/approve")).status, 404);
    assert.equal((await post("/api/queue/q-missing/skip")).status, 404);

    const after = await (await fetch(base + "/api/state")).json() as { queueReady: number };
    assert.equal(after.queueReady, 1);

    assert.equal((await post("/api/queue/scan")).status, 409, "the look-through needs Mac access turned on first, and says so");

    // The accountant's list: JSON for the screen and a spreadsheet file to download.
    const receipts = await (await fetch(base + "/api/queue/receipts")).json() as { month: string; rows: Array<{ vendor: string; amount: string }>; totals: Array<{ currency: string; amount: string }> };
    assert.equal(receipts.rows.length, 1);
    assert.deepEqual(receipts.totals, [{ currency: "EUR", amount: "84.20", count: 1 }]);
    const csv = await fetch(`${base}/api/queue/receipts.csv?month=${receipts.month}`);
    assert.equal(csv.status, 200);
    assert.match(csv.headers.get("content-type") ?? "", /text\/csv/);
    assert.match(csv.headers.get("content-disposition") ?? "", new RegExp(`attachment; filename="receipts-${receipts.month}\\.csv"`));
    assert.match(await csv.text(), /Acme,,,84\.20,EUR,invoice-1042\.pdf/);

    // Earned trust: two offers (five approvals each), accept one, decline the other, then pause, resume and remove.
    const json = (route: string, body: unknown, method = "POST") => fetch(`${base}${route}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const view = async () => await (await fetch(base + "/api/queue")).json() as { offers: Array<{ pattern: string; approvals: number }>; rules: Array<{ id: string; status: string; label: string }>; automaticThisWeek: number };
    assert.deepEqual((await view()).offers.map((offer) => offer.pattern).sort(), [notNow, keep].sort());
    assert.equal((await json("/api/queue/rules", { pattern: "reminder|made-up.com|bills" })).status, 404, "only a pattern that is on offer can be accepted");
    assert.equal((await json("/api/queue/rules", {})).status, 400);
    assert.equal((await json("/api/queue/rules", { pattern: keep, extra: 1 })).status, 400, "no stray fields");
    const accepted = await json("/api/queue/rules", { pattern: keep });
    assert.equal(accepted.status, 200);
    const rule = ((await accepted.json()) as { rule: { id: string; status: string } }).rule;
    assert.equal(rule.status, "active");
    assert.equal((await json("/api/queue/rules", { pattern: keep })).status, 409, "an answered offer cannot be answered twice");
    assert.equal((await json("/api/queue/offers/dismiss", { pattern: notNow })).status, 200);
    const answered = await view();
    assert.deepEqual(answered.offers, [], "answered offers are gone");
    assert.equal(answered.rules.length, 1);
    assert.match(answered.rules[0]!.label, /acme\.com/);
    assert.equal((await post(`/api/queue/rules/${rule.id}/pause`)).status, 200);
    assert.equal((await view()).rules[0]!.status, "paused");
    assert.equal((await post(`/api/queue/rules/${rule.id}/pause`)).status, 409, "pausing twice is refused");
    assert.equal((await post(`/api/queue/rules/${rule.id}/resume`)).status, 200);
    assert.equal((await fetch(`${base}/api/queue/rules/${rule.id}`, { method: "DELETE" })).status, 200);
    assert.deepEqual((await view()).rules, []);
    assert.equal((await fetch(`${base}/api/queue/rules/${rule.id}`, { method: "DELETE" })).status, 404);
  } finally {
    child.kill("SIGTERM");
    await Promise.race([exited, delay(3_000)]);
    rmSync(root, { recursive: true, force: true });
  }
});

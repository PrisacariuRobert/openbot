import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { OpenBotDatabase } from "./testing/database.js";

/** Task F5 through the real server: routines created over the API, a file dropped
 * into a folder, and new mail arriving in a staging studio's synthetic Mail. */

const mail = (id: string, from: string, subject: string, date: string) => ({ id, subject, from, date, snippet: subject, attachments: [], unread: true, text: subject });

test("folder and mail triggers: checked on save, quiet start, one run per arrival", { timeout: 120_000 }, async () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-mac-triggers-"));
  const home = path.join(root, "home"), receipts = path.join(home, "Receipts");
  mkdirSync(receipts, { recursive: true });
  writeFileSync(path.join(receipts, "already-here.pdf"), "old");
  const fixture = path.join(root, "inbox.json");
  writeFileSync(fixture, JSON.stringify({
    job: "waiting-on-me", about: "F5 mail trigger fixture", now: "2026-10-08T09:00:00+02:00", timeZone: "Europe/Brussels",
    mail: [mail("5001", "Accountant <books@accounting.example>", "Invoice September", "2026-10-07T09:00:00+02:00")],
    afterFirstRead: { mail: [mail("5002", "Accountant <books@accounting.example>", "Invoice October", "2026-10-08T08:59:00+02:00"), mail("5003", "Shop <news@shop.example>", "Sale", "2026-10-08T08:58:00+02:00")] },
    constraints: ["F5 test"], budget: { seconds: 60, steps: 5, contextTokens: 1000 },
    expect: { inOrder: [], mentions: [], neverMentions: [], maxWords: 100, sources: [], writes: {}, neverClaims: [] },
  }));
  const db = new OpenBotDatabase(root);
  db.updateStudioSettings({ macAccessEnabled: true });
  const nova = db.getBot("nova")!;
  const socket = createServer();
  await new Promise<void>((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = (socket.address() as { port: number }).port;
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  const base = `http://127.0.0.1:${port}`;
  const child: ChildProcess = spawn(process.execPath, ["--import", "tsx", "src/server/index.ts"], {
    cwd: path.resolve(import.meta.dirname, "../.."), stdio: ["ignore", "pipe", "pipe"],
    env: { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR, HOME: home, OPENBOT_LOAD_ENV: "0", OPENBOT_DATA_DIR: db.dataDir, OPENBOT_PORT: String(port), OPENBOT_HOST: "127.0.0.1", OPENBOT_APP_URL: base, OPENBOT_DEPLOYMENT_MODE: "local", NODE_ENV: "production",
      OPENBOT_STAGING: "1", OPENBOT_HERO_FIXTURE: fixture, OPENBOT_MAC_TRIGGER_INTERVAL_MS: "250", OPENBOT_MAC_TRIGGER_QUIET_MS: "600" },
  });
  const exited = once(child, "exit"); let log = "";
  for (const stream of [child.stdout, child.stderr]) stream?.on("data", (chunk) => { log = (log + chunk).slice(-3000); });
  const post = (route: string, body: unknown) => fetch(base + route, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const until = async <T>(read: () => T | undefined, label: string) => { for (let n = 0; n < 200; n++) { const value = read(); if (value) return value; await delay(100); } throw new Error(`timed out: ${label}\nalerts: ${JSON.stringify(db.listAutomationAlerts().map((alert) => alert.message))}\n${log}`); };
  try {
    let ready = false;
    for (let n = 0; n < 200 && !ready && child.exitCode === null; n++) { try { ready = (await fetch(base + "/api/healthz", { signal: AbortSignal.timeout(500) })).ok; } catch { await delay(100); } }
    assert.ok(ready, log);
    const routine = (triggerType: string, triggerConfig: Record<string, unknown>) => ({ name: `On ${triggerType}`, botId: nova.id, threadId: nova.threadId, prompt: "File it in expenses.xlsx.", intervalMinutes: 1440, enabled: true, triggerType, triggerConfig });

    for (const [config, message] of [
      [{ folderPath: "Receipts" }, /Choose a folder on this Mac/],
      [{ folderPath: "/etc" }, /inside your home folder/],
      [{ folderPath: "~/Missing" }, /doesn't exist/],
      [{ folderPath: db.dataDir }, /home folder|outside Sidemates' own data/],
    ] as const) {
      const refused = await post("/api/routines", routine("folder", config));
      assert.equal(refused.status, 400, JSON.stringify(config));
      assert.match(((await refused.json()) as { error: string }).error, message);
    }
    assert.match(((await (await post("/api/routines", routine("mail", {}))).json()) as { error: string }).error, /Say which mail starts it/);

    const folderRoutine = await (await post("/api/routines", routine("folder", { folderPath: "~/Receipts", fileTypes: "pdf" }))).json() as { id: string; triggerConfig: { folderPath: string } };
    assert.equal(folderRoutine.triggerConfig.folderPath, receipts, "~/ is saved as the real folder");
    const mailRoutine = await (await post("/api/routines", routine("mail", { mailFrom: "books@accounting.example", mailSubject: "invoice" }))).json() as { id: string };

    // The starting point is recorded first: nothing that was already there runs.
    await until(() => db.automationCursor(folderRoutine.id, "folder") ?? undefined, "folder baseline");
    await delay(1_500);
    assert.equal(db.listAutomationEvents(folderRoutine.id).length, 0);

    writeFileSync(path.join(receipts, "taxi.pdf"), "receipt");
    writeFileSync(path.join(receipts, "notes.txt"), "not a receipt");
    const fileEvent = await until(() => db.listAutomationEvents(folderRoutine.id).find((event) => event.runId), "folder event and its run");
    assert.equal(fileEvent.source, "folder");
    assert.equal(fileEvent.payloadSummary, "New file · taxi.pdf");
    const fileRun = db.getRun(fileEvent.runId!)!;
    assert.match(fileRun.prompt, /Source: folder/);
    assert.ok(fileRun.prompt.includes(path.join(receipts, "taxi.pdf")), "the teammate is told where the file is");

    const mailEvent = await until(() => db.listAutomationEvents(mailRoutine.id).find((event) => event.runId), "mail event and its run");
    assert.equal(mailEvent.payloadSummary, "New mail · Accountant <books@accounting.example>: Invoice October");
    await delay(1_500);
    assert.equal(db.listAutomationEvents(mailRoutine.id).length, 1, "September was already there and the shop's sale doesn't match");
    assert.equal(db.listAutomationEvents(folderRoutine.id).length, 1, "one file, one run");
  } finally {
    child.kill("SIGTERM"); await Promise.race([exited, delay(4000)]); if (child.exitCode === null) child.kill("SIGKILL");
    db.close(); rmSync(root, { recursive: true, force: true });
  }
});

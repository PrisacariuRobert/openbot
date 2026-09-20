// R01 production HTTP fixtures: real server, real POST /api/messages.
// Disposable data dir, loopback only, synthetic payloads. No model jobs are
// awaited (runs may fail in the background with the cli harness provider;
// receipts are asserted, not run outcomes). No paid/live accounts.
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { OpenBotDatabase } from "../src/server/testing/database.js";

const root = mkdtempSync(path.join(tmpdir(), "openbot-r01-http-"));
const data = path.join(root, "data");

// Pre-seed a local harness provider so admission reaches runnable dispatch.
{
  const seed = new OpenBotDatabase(root, { dataDir: data });
  const provider = seed.upsertProvider({ name: "Harness local", authMode: "cli" });
  seed.updateBot("nova", { providerInstanceId: provider.id, model: "harness-fixture-model" });
  seed.close();
}

const socket = createServer();
await new Promise<void>((done) => socket.listen(0, "127.0.0.1", done));
const port = (socket.address() as { port: number }).port;
await new Promise<void>((done) => socket.close(() => done()));
const base = `http://127.0.0.1:${port}`;
let child: ChildProcess | null = null;

function spawnServer(): ChildProcess {
  const proc = spawn(process.execPath, ["--import", "tsx", "src/server/index.ts"], {
    stdio: "ignore",
    env: {
      ...process.env,
      OPENBOT_LOAD_ENV: "0",
      OPENBOT_RELAY_URL: "",
      OPENBOT_DATA_DIR: data,
      OPENBOT_PORT: String(port),
      OPENBOT_HOST: "127.0.0.1",
      OPENBOT_APP_URL: base,
      OPENBOT_DEPLOYMENT_MODE: "local",
      NODE_ENV: "production",
    },
  });
  child = proc;
  return proc;
}

async function waitForHealth(): Promise<void> {
  for (let i = 0; i < 120; i++) {
    try {
      const result = await fetch(`${base}/api/healthz`);
      if (result.status === 200 || result.status === 503) return;
    } catch {
      // Not up yet.
    }
    await delay(500);
  }
  throw new Error("server did not become healthy");
}

async function killServer(): Promise<void> {
  if (!child) return;
  const proc = child;
  child = null;
  proc.kill("SIGKILL");
  await once(proc, "exit").catch(() => undefined);
}

async function postMessages(body: unknown, timeoutMs = 30_000): Promise<{ status: number; json: Record<string, unknown> }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const result = await fetch(`${base}/api/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return { status: result.status, json: (await result.json()) as Record<string, unknown> };
  } finally {
    clearTimeout(timer);
  }
}

async function userMessagesWith(body: string): Promise<Array<{ id: string }>> {
  const result = await fetch(`${base}/api/threads/team-room/messages?limit=200`);
  assert.equal(result.status, 200);
  const messages = (await result.json()) as Array<{ id: string; senderType: string; body: string }>;
  return messages.filter((message) => message.senderType === "user" && message.body === body);
}

const results: Array<{ id: string; pass: boolean; detail: string }> = [];
const record = (id: string, pass: boolean, detail: string) => {
  results.push({ id, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${id}: ${detail}`);
};

const requestFile = (n: number) => `h-file-${Date.now().toString(36)}-${n}`;
let fileAttachmentId = "";
let fileMessageId = "";
let fileRunIds: string[] = [];

try {
  spawnServer();
  await waitForHealth();

  // H0 — upload a file through the real attachment endpoint.
  {
    const upload = await fetch(`${base}/api/attachments?threadId=team-room`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream", "X-File-Name": "harness-note.txt", "X-File-Type": "text/plain" },
      body: "harness file bytes",
    });
    assert.equal(upload.status, 201, "attachment upload accepted");
    fileAttachmentId = ((await upload.json()) as { id: string }).id;
    assert.ok(fileAttachmentId);
    record("H0-upload", true, "real attachment endpoint stored the file");
  }

  // H1 — file-bearing admission, then an identical retry after claiming.
  {
    const requestId = requestFile(1);
    const first = await postMessages({ threadId: "team-room", body: "", attachmentIds: [fileAttachmentId], targetBotIds: ["nova"], requestId });
    assert.equal(first.status, 202, `first admission accepted (got ${first.status}: ${JSON.stringify(first.json).slice(0, 200)})`);
    fileMessageId = first.json.messageId as string;
    fileRunIds = first.json.runIds as string[];
    assert.ok(fileMessageId && fileRunIds.length === 1);
    const retry = await postMessages({ threadId: "team-room", body: "", attachmentIds: [fileAttachmentId], targetBotIds: ["nova"], requestId });
    assert.equal(retry.status, 200, "identical retry replays instead of 400ing on the now-claimed attachment");
    assert.equal(retry.json.replayed, true);
    assert.equal(retry.json.messageId, fileMessageId, "retry returns the original message");
    assert.deepEqual(retry.json.runIds, fileRunIds, "retry returns the original runs");
    const dupes = await userMessagesWith("Shared 1 file.");
    assert.equal(dupes.length, 1, "exactly one user message exists after retry");
    record("H1-file-retry", true, `202 then 200 replayed with identical IDs; 1 message total`);
  }

  // H2 — payload and thread conflicts change nothing.
  {
    const requestId = requestFile(2);
    const first = await postMessages({ threadId: "team-room", body: "H2 original marker", targetBotIds: ["nova"], requestId });
    assert.equal(first.status, 202);
    const conflict = await postMessages({ threadId: "team-room", body: "H2 changed marker", targetBotIds: ["nova"], requestId });
    assert.equal(conflict.status, 409);
    assert.equal(conflict.json.code, "request_conflict");
    const wrongThread = await postMessages({ threadId: "bot-nova", body: "H2 original marker", targetBotIds: ["nova"], requestId });
    assert.equal(wrongThread.status, 409, "cross-thread replay is a conflict, not a disclosure");
    const dupes = await userMessagesWith("H2 original marker");
    assert.equal(dupes.length, 1, "conflicts created nothing");
    record("H2-conflicts", true, "payload and thread mismatches are 409s with no new work");
  }

  // H3 — ten concurrent identical admissions admit exactly once.
  {
    const requestId = requestFile(3);
    const payload = { threadId: "team-room", body: "H3 race marker", targetBotIds: ["nova"], requestId };
    const outcomes = await Promise.all(Array.from({ length: 10 }, () => postMessages(payload)));
    const accepted = outcomes.filter((o) => o.status === 202);
    const replayed = outcomes.filter((o) => o.status === 200);
    const waiting = outcomes.filter((o) => o.status === 409);
    assert.ok(accepted.length <= 1, `at most one 202 (got ${accepted.length})`);
    assert.equal(replayed.length + waiting.length + accepted.length, 10);
    const ids = new Set(
      [...accepted, ...replayed].map((o) => String(o.json.messageId)),
    );
    assert.equal(ids.size, 1, "every settled response names the same message");
    const dupes = await userMessagesWith("H3 race marker");
    assert.equal(dupes.length, 1, "one message despite ten concurrent sends");
    record("H3-concurrent", true, `${accepted.length}x202 ${replayed.length}x200 ${waiting.length}x409-in-progress, one message`);
  }

  // H4 — SIGKILL after commit, restart, retry returns the original.
  {
    const requestId = requestFile(4);
    const first = await postMessages({ threadId: "team-room", body: "H4 restart marker", targetBotIds: ["nova"], requestId });
    assert.equal(first.status, 202);
    await killServer();
    spawnServer();
    await waitForHealth();
    const after = await postMessages({ threadId: "team-room", body: "H4 restart marker", targetBotIds: ["nova"], requestId });
    assert.equal(after.status, 200, "post-restart retry replays");
    assert.equal(after.json.messageId, first.json.messageId, "original IDs survive restart");
    const dupes = await userMessagesWith("H4 restart marker");
    assert.equal(dupes.length, 1, "no duplicate across restart");
    record("H4-restart", true, "SIGKILL + respawn: retry returns original IDs, one message");
  }

  // H5 — aborted (lost) response settles to exactly one admission.
  {
    const requestId = requestFile(5);
    const marker = `H5 lost-response ${requestId}`;
    const payload = { threadId: "team-room", body: marker, targetBotIds: ["nova"], requestId };
    const controller = new AbortController();
    const attempt = fetch(`${base}/api/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    setImmediate(() => controller.abort());
    await attempt.then(() => undefined, () => undefined);
    // Settle: retry until a stable replay, then confirm stability + singularity.
    let settled: { status: number; json: Record<string, unknown> } | null = null;
    for (let i = 0; i < 40; i++) {
      const probe = await postMessages(payload);
      if (probe.status === 200) {
        const again = await postMessages(payload);
        if (again.status === 200 && again.json.messageId === probe.json.messageId) {
          settled = probe;
          break;
        }
      }
      await delay(500);
    }
    assert.ok(settled && settled.status === 200, "lost response settles to a stable replay");
    const dupes = await userMessagesWith(marker);
    assert.equal(dupes.length, 1, "exactly one message after a lost response");
    record("H5-lost-response", true, "aborted send converges to one stable replayed admission");
  }

  // H6 — persistence failure fails closed: 500, nothing created, retry works.
  // File-mode injection cannot fail writes on SQLite's already-open
  // read-write fd (permission is checked at open, not per write; WAL
  // recreation defeats file removal while the directory is writable). The
  // honest injection is a held RESERVED lock: the server's first write —
  // the pending-marker staging — blocks past its 5s busy timeout and
  // fails, so the route refuses with nothing created.
  {
    const { DatabaseSync } = await import("node:sqlite");
    const locker = new DatabaseSync(path.join(data, "openbot.sqlite"));
    locker.exec("PRAGMA busy_timeout = 1000;");
    locker.exec("BEGIN IMMEDIATE;");
    let refused: { status: number; json: Record<string, unknown> } | null = null;
    const started = Date.now();
    try {
      refused = await postMessages({ threadId: "team-room", body: "H6 unwritten marker", targetBotIds: ["nova"], requestId: requestFile(6) }, 20_000);
    } finally {
      try {
        locker.exec("ROLLBACK;");
      } catch {
        // Best-effort release; the lock holder always rolls back here.
      }
      locker.close();
    }
    const blockedMs = Date.now() - started;
    assert.ok(refused && refused.status >= 500, `unstageable request refused with 5xx (got ${refused?.status})`);
    assert.equal(refused.json.code, "request_not_staged");
    assert.ok(blockedMs >= 4000, `refusal came from the persistence block, not a fast path (${blockedMs}ms)`);
    const before = await userMessagesWith("H6 unwritten marker");
    assert.equal(before.length, 0, "refused staging created nothing");
    const retry = await postMessages({ threadId: "team-room", body: "H6 unwritten marker", targetBotIds: ["nova"], requestId: requestFile(60) });
    assert.equal(retry.status, 202, "healthy store admits normally afterwards");
    const after = await userMessagesWith("H6 unwritten marker");
    assert.equal(after.length, 1);
    record("H6-fail-closed", true, `lock-held store → 500 request_not_staged after ${blockedMs}ms with zero writes; recovery admits once`);
  }

  // H7 — real Stop and takeover routes execute; cancel sticks.
  {
    const requestId = requestFile(7);
    const first = await postMessages({ threadId: "team-room", body: "H7 stoppable marker", targetBotIds: ["nova"], requestId });
    assert.equal(first.status, 202);
    const runId = (first.json.runIds as string[])[0]!;
    const cancel = await fetch(`${base}/api/runs/${runId}/cancel`, { method: "POST" });
    assert.ok(cancel.status === 200 || cancel.status === 409, `cancel route answers (got ${cancel.status})`);
    const run = (await (await fetch(`${base}/api/runs/${runId}`)).json()) as { status: string };
    assert.ok(["cancelled", "completed", "failed"].includes(run.status), `run reached a terminal state (got ${run.status})`);
    // Takeover route with no live browser: the route still executes its
    // revocation path before the input attempt fails with 400.
    const takeover = await fetch(`${base}/api/bots/nova/browser/takeover/click`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ x: 10, y: 10 }),
    });
    assert.ok([200, 400].includes(takeover.status), `takeover route answers (got ${takeover.status})`);
    record("H7-stop-takeover", true, `cancel → ${cancel.status}, run ${run.status}; takeover route → ${takeover.status}`);
  }

  // H9 — pending-only cross-thread collision: a durable unresolved marker
  // for request R in thread A, with no receipt or tombstone. Reuse from an
  // otherwise-valid thread B must 409, preserve A's marker byte-for-byte,
  // and create nothing in B — including across a restart (where repair
  // converts the marker to an orphan tombstone that still names A).
  {
    const { OpenBotDatabase } = await import("../src/server/database.js");
    const { messageSubmissionDigest } = await import("../src/server/database.js");
    const requestId = requestFile(9);
    const bodyA = "H9 pending marker payload";
    const digestA = messageSubmissionDigest({ threadId: "team-room", body: bodyA, attachmentIds: [], targetBotIds: ["nova"] });
    {
      const direct = new OpenBotDatabase(root, { dataDir: data });
      try {
        direct.saveExtensionRecord("message-submission-pending", requestId, {
          requestId, threadId: "team-room", payloadDigest: digestA, startedAt: new Date().toISOString(),
        });
      } finally {
        direct.close();
      }
    }
    const foreign = await postMessages({ threadId: "bot-nova", body: "H9 foreign payload", targetBotIds: ["nova"], requestId });
    assert.equal(foreign.status, 409, "foreign thread reuse of a pending ID conflicts");
    assert.equal(foreign.json.code, "request_conflict");
    {
      const direct = new OpenBotDatabase(root, { dataDir: data });
      try {
        const marker = direct.extensionRecord("message-submission-pending", requestId) as { threadId: string; payloadDigest: string } | null;
        assert.ok(marker, "original pending marker preserved");
        assert.equal(marker.threadId, "team-room", "marker still names thread A");
        assert.equal(marker.payloadDigest, digestA, "marker digest unchanged");
      } finally {
        direct.close();
      }
    }
    const foreignMessages = await (await fetch(`${base}/api/threads/bot-nova/messages?limit=200`)).json() as Array<{ body: string }>;
    assert.ok(!foreignMessages.some((message) => message.body === "H9 foreign payload"), "no message created in thread B");
    const matching = await postMessages({ threadId: "team-room", body: bodyA, targetBotIds: ["nova"], requestId });
    assert.equal(matching.status, 409, "matching retry waits instead of forking");
    assert.equal(matching.json.code, "request_in_progress");
    await killServer();
    spawnServer();
    await waitForHealth();
    const afterRestart = await postMessages({ threadId: "bot-nova", body: "H9 foreign payload", targetBotIds: ["nova"], requestId });
    assert.equal(afterRestart.status, 409, "foreign reuse still refused after restart");
    assert.equal(afterRestart.json.code, "request_conflict", "unmatched payload conflicts without creating work");
    const sameAfterRestart = await postMessages({ threadId: "team-room", body: bodyA, targetBotIds: ["nova"], requestId });
    assert.equal(sameAfterRestart.status, 409, "matching retry after repair still refused");
    assert.equal(sameAfterRestart.json.code, "request_uncertain", "unresolved outcome stays uncertain, never green-lit");
    {
      const direct = new OpenBotDatabase(root, { dataDir: data });
      try {
        const tomb = direct.extensionRecord("message-submission-tombstone", requestId) as { threadId: string; reason: string } | null;
        assert.ok(tomb, "orphan tombstone retained");
        assert.equal(tomb.threadId, "team-room", "tombstone still names thread A");
        assert.equal(tomb.reason, "orphan-repaired");
      } finally {
        direct.close();
      }
    }
    record("H9-pending-collision", true, "foreign pending reuse 409s pre/post-restart; marker/tombstone preserve thread A; B empty");
  }
} catch (error) {
  record("HARNESS", false, error instanceof Error ? error.message : String(error));
  throw error;
} finally {
  await killServer();
  try {
    // Takeover/browser cases launch real Chromium bound to the disposable
    // profile; SIGKILLing the server orphans it, and the live profile
    // blocks directory cleanup. Reap by profile path, then retry removal.
    const { spawnSync } = await import("node:child_process");
    spawnSync("chmod", ["-R", "u+rwX", root]);
    spawnSync("pkill", ["-f", path.join(root, "data", "computers")]);
  } catch {
    // Best-effort permission restore before cleanup.
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      rmSync(root, { recursive: true, force: true });
      break;
    } catch {
      await delay(1000);
    }
  }
}

const failed = results.filter((result) => !result.pass);
console.log(`\nR01 HTTP fixtures: ${results.length - failed.length}/${results.length} passed (real server, disposable dir, loopback only).`);
if (failed.length) process.exit(1);

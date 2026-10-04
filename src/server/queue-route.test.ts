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
test("the queue routes list, skip and refuse repeats, and the app state carries the count", { timeout: 60_000 }, async () => {
  const root = mkdtempSync(path.join(tmpdir(), "sidemates-queue-route-"));
  const data = path.join(root, "data");
  const db = new OpenBotDatabase(root, { dataDir: data });
  const seed = (sourceKey: string, title: string) => {
    const proposal = queueProposalInput.parse({ kind: "reminder", title, why: "A test card.", sourceKey, action: { title } });
    return db.queueItemInsert({ kind: proposal.kind, title, why: proposal.why, sourceKey, botId: null, runId: null, action: proposal.action as Record<string, unknown>, preview: queuePreview(proposal), expiresAt: new Date(Date.now() + 86_400_000).toISOString() })!;
  };
  const first = seed("mail:1", "Pay the bill");
  seed("mail:2", "Book the dentist");
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
    for (let n = 0; n < 250 && !ready; n++) {
      try { ready = (await fetch(base + "/api/healthz")).ok; } catch { /* still starting */ }
      if (!ready) await delay(100);
    }
    assert.ok(ready, "the disposable studio starts");

    const state = await (await fetch(base + "/api/state")).json() as { queueReady: number };
    assert.equal(state.queueReady, 2, "the app state carries how many cards are waiting");

    const listed = await (await fetch(base + "/api/queue")).json() as { ready: Array<{ id: string; preview: string }>; recent: unknown[] };
    assert.equal(listed.ready.length, 2);
    assert.match(listed.ready[0]!.preview, /Reminders/, "each card says exactly what approving will do");
    assert.deepEqual(listed.recent, []);

    const skipped = await post(`/api/queue/${first.id}/skip`);
    assert.equal(skipped.status, 200);
    assert.equal((await post(`/api/queue/${first.id}/skip`)).status, 409, "a second skip is refused");
    assert.equal((await post(`/api/queue/${first.id}/undo`)).status, 409, "a skipped card has nothing to undo");
    assert.equal((await post("/api/queue/q-missing/approve")).status, 404);
    assert.equal((await post("/api/queue/q-missing/skip")).status, 404);

    const after = await (await fetch(base + "/api/state")).json() as { queueReady: number };
    assert.equal(after.queueReady, 1);
  } finally {
    child.kill("SIGTERM");
    await Promise.race([exited, delay(3_000)]);
    rmSync(root, { recursive: true, force: true });
  }
});

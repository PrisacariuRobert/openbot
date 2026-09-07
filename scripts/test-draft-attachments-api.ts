// Real HTTP routes on a disposable studio. No credentials or model jobs needed.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { Attachment } from "../src/shared/types.js";
import { OpenBotDatabase } from "../src/server/testing/database.js";

const root = mkdtempSync(path.join(tmpdir(), "openbot-draft-files-api-"));
const data = path.join(root, "data");
const seeded = new OpenBotDatabase(root, { dataDir: data });
seeded.close();
const socket = createServer();
await new Promise<void>((done) => socket.listen(0, "127.0.0.1", done));
const port = (socket.address() as { port: number }).port;
await new Promise<void>((done) => socket.close(() => done()));
const base = `http://127.0.0.1:${port}`;
const child = spawn(
  process.execPath,
  ["--import", "tsx", "src/server/index.ts"],
  {
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
  },
);
const exited = once(child, "exit");
const endpoint = (thread = "bot-nova") => `/api/drafts/${thread}/attachments`;
const jsonRequest = (method: string, value?: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  ...(value === undefined ? {} : { body: JSON.stringify(value) }),
});
async function getSelected(thread = "bot-nova"): Promise<Attachment[]> {
  const result = await fetch(base + endpoint(thread));
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("cache-control"), "no-store");
  return result.json();
}
async function upload(name: string, thread = "bot-nova"): Promise<Attachment> {
  const result = await fetch(`${base}/api/attachments?threadId=${thread}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "X-File-Name": name,
      "X-File-Type": "text/plain",
    },
    body: "A private disposable fixture note.",
  });
  assert.equal(result.status, 201);
  return result.json();
}
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      if ((await fetch(base + "/api/healthz")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await delay(100);
  }
  assert.ok(ready, "Disposable host is ready");
  assert.equal((await fetch(base + endpoint("missing"))).status, 404);
  await fetch(
    base + "/api/drafts/bot-nova",
    jsonRequest("PUT", { body: "Keep this text draft.", source: "web" }),
  );
  const selected = await upload("selected.txt"),
    orphan = await upload("orphan.txt"),
    other = await upload("other.txt", "bot-pixel");
  assert.deepEqual(
    await getSelected(),
    [],
    "Upload alone never selects an orphan file",
  );
  assert.equal(
    (await fetch(base + endpoint(), jsonRequest("POST", { id: other.id })))
      .status,
    409,
  );
  assert.equal(
    (await fetch(base + endpoint(), jsonRequest("POST", {}))).status,
    400,
  );
  for (let attempt = 0; attempt < 2; attempt++) {
    assert.equal(
      (await fetch(base + endpoint(), jsonRequest("POST", { id: selected.id })))
        .status,
      200,
    );
  }
  assert.deepEqual(
    (await getSelected()).map((file) => file.id),
    [selected.id],
  );
  assert.equal(
    (await getSelected())[0]?.previewText,
    "A private disposable fixture note.",
  );
  await fetch(base + `${endpoint("bot-pixel")}/${selected.id}`, {
    method: "DELETE",
  });
  assert.equal(
    (await getSelected()).length,
    1,
    "Other-thread removal is isolated",
  );
  const more = await Promise.all(
    Array.from({ length: 6 }, (_, i) => upload(`extra-${i}.txt`)),
  );
  for (const file of more.slice(0, 5))
    assert.equal(
      (await fetch(base + endpoint(), jsonRequest("POST", { id: file.id })))
        .status,
      200,
    );
  assert.equal(
    (await fetch(base + endpoint(), jsonRequest("POST", { id: more[5]!.id })))
      .status,
    409,
  );
  for (let attempt = 0; attempt < 2; attempt++)
    assert.equal(
      (await fetch(base + `${endpoint()}/${selected.id}`, { method: "DELETE" }))
        .status,
      200,
    );
  assert.equal((await getSelected()).length, 5);
  assert.equal(
    (await fetch(base + selected.url)).status,
    200,
    "Removal preserves the original uploaded file",
  );
  assert.equal(
    (await fetch(base + orphan.url)).status,
    200,
    "An unselected upload remains unclaimed",
  );
  const writer = new OpenBotDatabase(root, { dataDir: data });
  try {
    const message = writer.addMessage({
      threadId: "bot-nova",
      body: "Fixture send without a model job",
      senderType: "user",
      senderId: null,
    });
    writer.claimAttachments([more[0]!.id], message.id, "bot-nova");
  } finally {
    writer.close();
  }
  assert.equal(
    (await getSelected()).length,
    4,
    "Sent attachments no longer appear in restored drafts",
  );
  assert.equal(
    (await fetch(base + endpoint(), jsonRequest("POST", { id: more[0]!.id })))
      .status,
    409,
    "Already-sent attachments cannot be selected again",
  );
  const snapshot = await (
    await fetch(base + "/api/state?threadId=bot-nova")
  ).json();
  assert.equal(snapshot.draft.body, "Keep this text draft.");
  assert.equal(snapshot.runs.length, 0, "Draft operations start no model job");
  console.log(
    "Draft attachment API passed: isolated selection, metadata, idempotence, six-file limit, non-destructive removal, sent-file exclusion and text-draft preservation.",
  );
} finally {
  child.kill("SIGTERM");
  await exited;
  rmSync(root, { recursive: true, force: true });
}

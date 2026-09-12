import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { OpenBotDatabase } from "./testing/database.js";

/** Real ChoiceMenu popover lifecycle through the tester harness (S3-H01).
 *
 * Boots a fixture studio with seeded teammates and drives the bot settings
 * panel's Teammate dropdown using ONLY snapshot refs (no selectors, no
 * coordinates): snapshot -> combobox click -> snapshot -> option click must
 * change the selection. A second test encodes the 3fa6d19a failure
 * signature — an option ref clicked after its menu closed must fail as
 * POPOVER_CLOSED with an actionable message, never as a bare
 * ELEMENT_OBSCURED mystery.
 */

interface Fixture {
  root: string;
  db: OpenBotDatabase;
  base: string;
  child: ChildProcess;
  exited: Promise<unknown>;
  log: string;
  api: (route: string, body?: unknown, method?: string) => Promise<Response>;
  close: () => Promise<void>;
}

async function bootFixture(): Promise<Fixture> {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-popover-")), db = new OpenBotDatabase(root);
  const reservation = createServer();
  await new Promise<void>((resolve) => reservation.listen(0, "127.0.0.1", resolve));
  const address = reservation.address(); assert.ok(address && typeof address !== "string");
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  const base = `http://127.0.0.1:${address.port}`;
  const child = spawn(process.execPath, ["--import", "tsx", "src/server/index.ts"], {
    cwd: path.resolve(import.meta.dirname, "../.."),
    env: {
      ...process.env, OPENBOT_LOAD_ENV: "0", OPENBOT_DATA_DIR: db.dataDir, OPENBOT_PORT: String(address.port),
      OPENBOT_HOST: "127.0.0.1", OPENBOT_APP_URL: base, OPENBOT_DEPLOYMENT_MODE: "local",
      OPENBOT_SEED_STARTER_BOTS: "1", NODE_ENV: "production",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const exited = once(child, "exit");
  const fixture = { root, db, base, child, exited, log: "" } as Fixture;
  child.stdout.on("data", (chunk) => { fixture.log = (fixture.log + chunk).slice(-3_000); });
  child.stderr.on("data", (chunk) => { fixture.log = (fixture.log + chunk).slice(-3_000); });
  fixture.api = (route: string, body?: unknown, method?: string) => fetch(`${base}${route}`, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30_000),
  });
  fixture.close = async () => {
    child.kill("SIGTERM"); await Promise.race([exited, delay(4_000)]);
    if (child.exitCode === null) { child.kill("SIGKILL"); await exited; }
    db.close(); rmSync(root, { recursive: true, force: true });
  };
  for (let attempt = 0; ; attempt++) {
    try { if ((await fetch(base + "/api/healthz", { signal: AbortSignal.timeout(500) })).ok) break; } catch { /* Startup. */ }
    if (child.exitCode !== null) throw new Error(`Fixture host exited (${child.exitCode}): ${fixture.log}`);
    if (attempt >= 200) throw new Error(fixture.log || "Fixture host did not start.");
    await delay(100);
  }
  return fixture;
}

function refOf(snapshot: string, pattern: RegExp): string {
  const line = snapshot.split("\n").find((entry) => pattern.test(entry));
  assert.ok(line, `expected a line matching ${pattern} in snapshot:\n${snapshot}`);
  const ref = /\[ref:(\d+)\]/.exec(line!);
  assert.ok(ref, `expected a ref on line: ${line}`);
  return ref![1]!;
}

async function openTeammateMenu(f: Fixture): Promise<{ sessionId: string; optionRef: string }> {
  const session = await (await f.api("/api/tester/sessions", { label: "popover-lifecycle" })).json() as { sessionId: string };
  assert.ok(session.sessionId);
  const snap = async (): Promise<string> => {
    let cursor = 0; const chunks: string[] = [];
    for (;;) {
      const page = await (await f.api(`/api/tester/browser/snapshot?sessionId=${session.sessionId}&compact=1&interactiveOnly=1&limit=200&cursor=${cursor}`, undefined, "GET")).json() as { snapshot: string; truncated: boolean; nextCursor: number | null };
      chunks.push(page.snapshot);
      if (!page.truncated || page.nextCursor === null) break;
      cursor = page.nextCursor;
    }
    return chunks.join("\n");
  };
  const clickRef = async (ref: string): Promise<void> => {
    const act = await f.api("/api/tester/browser/act", { sessionId: session.sessionId, kind: "click", ref });
    assert.equal(act.status, 200, `ref ${ref} click must dispatch: ${await act.text()}`);
  };
  const opened = await (await f.api("/api/tester/browser/open", { sessionId: session.sessionId, url: `${f.base}/?thread=bot-nova` })).json() as { url: string };
  assert.match(opened.url, /thread=bot-nova/);
  const waitFor = async (pattern: RegExp, label: string): Promise<string> => {
    for (let attempt = 0; attempt < 40; attempt++) {
      const text = await snap();
      if (pattern.test(text)) return text;
      await delay(500);
    }
    throw new Error(`timed out waiting for ${label}:\n${await snap()}`);
  };
  // Mirror the current journey: thread -> About -> Edit & manage teammate
  // -> Teammate combobox.
  await clickRef(refOf(await waitFor(/button: About Nova/, "About Nova"), /button: About Nova/));
  await clickRef(refOf(await waitFor(/link: Edit & manage teammate/, "Edit & manage teammate"), /link: Edit & manage teammate/));
  const snap1 = await waitFor(/combobox: Teammate/, "Teammate combobox");
  const comboRef = refOf(snap1, /combobox: Teammate/);
  await clickRef(comboRef);
  const open = await snap();
  assert.match(open, /listbox: Teammate/, `combobox click must leave the menu open:\n${open}`);
  return { sessionId: session.sessionId, optionRef: refOf(open, /option: Pixel/) };
}

test("teammate dropdown selects via fresh snapshot refs with no fallback", { timeout: 180_000 }, async () => {
  const f = await bootFixture();
  try {
    const { sessionId, optionRef } = await openTeammateMenu(f);
    const selectAct = await f.api("/api/tester/browser/act", { sessionId, kind: "click", ref: optionRef });
    assert.equal(selectAct.status, 200);
    let cursor = 0; const chunks: string[] = [];
    for (;;) {
      const page = await (await f.api(`/api/tester/browser/snapshot?sessionId=${sessionId}&compact=1&interactiveOnly=1&limit=200&cursor=${cursor}`, undefined, "GET")).json() as { snapshot: string; truncated: boolean; nextCursor: number | null };
      chunks.push(page.snapshot);
      if (!page.truncated || page.nextCursor === null) break;
      cursor = page.nextCursor;
    }
    const after = chunks.join("\n");
    assert.match(after, /combobox: Teammate.*Pixel/, `option click must change the selection:\n${after}`);
    assert.equal(after.includes("listbox"), false, "menu closed after selection");
  } finally {
    await f.close();
  }
});

test("option ref clicked after its menu closed reports POPOVER_CLOSED", { timeout: 180_000 }, async () => {
  const f = await bootFixture();
  try {
    const { sessionId, optionRef } = await openTeammateMenu(f);
    // Close the menu, then click the now-stale option ref: the harness must
    // name the true cause (closed popover) instead of a bare no-box error.
    const esc = await f.api("/api/tester/browser/act", { sessionId, kind: "press", key: "Escape" });
    assert.equal(esc.status, 200);
    const stale = await f.api("/api/tester/browser/act", { sessionId, kind: "click", ref: optionRef });
    assert.equal(stale.status, 409);
    const body = await stale.json() as { error: string; code?: string };
    assert.equal(body.code, "POPOVER_CLOSED", `stale option ref must report POPOVER_CLOSED, got: ${JSON.stringify(body)}`);
    assert.match(body.error, /popover menu that has since closed/);
  } finally {
    await f.close();
  }
});

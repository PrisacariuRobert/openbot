import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { OpenBotDatabase } from "./testing/database.js";
import { TesterBrowser, compactAxTree } from "./tester-browser.js";

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-tester-")), db = new OpenBotDatabase(root);
  return { root, db, close: () => { db.close(); rmSync(root, { recursive: true, force: true }); } };
}

test("session-scoped calls fail closed without a session", async () => {
  const f = fixture();
  try {
    const tester = new TesterBrowser(f.root, "http://127.0.0.1:4311/");
    await assert.rejects(() => tester.snapshot("missing"), /Unknown tester session/);
    await assert.rejects(() => tester.screenshot("missing"), /Unknown tester session/);
    await assert.rejects(() => tester.act({ kind: "click", x: 1, y: 1, sessionId: "missing" }), /Unknown tester session/);
    await assert.rejects(() => tester.wait({ kind: "text", value: "hi", sessionId: "missing" }), /Unknown tester session/);
    assert.throws(() => tester.dialogs("missing"), /Unknown tester session/);
    await assert.rejects(() => tester.resolveDialog("missing", "x", true), /Unknown tester session/);
    await assert.rejects(() => tester.upload({ fixtureIds: ["nope"], sessionId: "missing" }), /Unknown tester session/);
    await assert.rejects(() => tester.activatePage("missing", 0), /Unknown tester session/);
    await assert.rejects(() => tester.resizeSession("missing", 800, 600), /Unknown tester session/);
    assert.equal(await tester.closeSession("missing"), false);
  } finally { f.close(); }
});

test("fixture staging validates before anything is stored", async () => {
  const f = fixture();
  try {
    const tester = new TesterBrowser(f.root, "http://127.0.0.1:4311/");
    await assert.rejects(() => tester.stageFixture("empty.csv", Buffer.from("").toString("base64")), /non-empty/);
    await assert.rejects(() => tester.upload({ fixtureIds: ["ghost"] }), /Unknown tester session/);
    const staged = await tester.stageFixture("orders.csv", Buffer.from("id,total\n1,10\n").toString("base64"), "text/csv");
    assert.equal(staged.filename, "orders.csv");
    assert.equal(staged.bytes, 14);
    assert.equal(staged.sha256.length, 64);
    assert.equal(tester.fixturePath("ghost"), null);
    assert.ok(tester.fixturePath(staged.fixtureId)?.path.endsWith(".csv"));
  } finally { f.close(); }
});

test("compact snapshots scope to subtrees and honor depth", () => {
  const tree = {
    nodes: [
      { nodeId: "1", backendDOMNodeId: 11, role: { value: "RootWebArea" }, name: { value: "" }, childIds: ["2", "3"] },
      { nodeId: "2", backendDOMNodeId: 22, role: { value: "button" }, name: { value: "Send message" }, childIds: [] },
      { nodeId: "3", backendDOMNodeId: 33, role: { value: "generic" }, name: { value: "" }, childIds: ["4"] },
      { nodeId: "4", backendDOMNodeId: 44, role: { value: "textbox" }, name: { value: "Message" }, value: { value: "hi" }, childIds: [] },
    ],
  };
  const all = compactAxTree(tree);
  assert.ok(all.some((line) => line.includes("button: Send message") && line.includes("[ref:22]")));
  assert.ok(all.some((line) => line.includes("textbox: Message")));
  const subtree = compactAxTree(tree, { ref: 33 });
  assert.equal(subtree.some((line) => line.includes("Send message")), false);
  assert.ok(subtree.some((line) => line.includes("textbox: Message")));
  assert.deepEqual(compactAxTree(tree, { ref: 999 }), []);
  const shallow = compactAxTree(tree, { maxDepth: 1 });
  assert.ok(shallow.some((line) => line.includes("Send message")));
  assert.equal(shallow.some((line) => line.includes("textbox: Message")), false);
});

test("tester session lifecycle over HTTP against a fixture studio", { timeout: 180_000 }, async () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-tester-route-")), db = new OpenBotDatabase(root);
  const reservation = createServer();
  await new Promise<void>((resolve) => reservation.listen(0, "127.0.0.1", resolve));
  const address = reservation.address(); assert.ok(address && typeof address !== "string");
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  const base = `http://127.0.0.1:${address.port}`;
  const child = spawn(process.execPath, ["--import", "tsx", "src/server/index.ts"], {
    cwd: path.resolve(import.meta.dirname, "../.."),
    env: { ...process.env, OPENBOT_LOAD_ENV: "0", OPENBOT_DATA_DIR: db.dataDir, OPENBOT_PORT: String(address.port), OPENBOT_HOST: "127.0.0.1", OPENBOT_APP_URL: base, OPENBOT_DEPLOYMENT_MODE: "local", NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const exited = once(child, "exit"); let log = "";
  child.stdout.on("data", (chunk) => { log = (log + chunk).slice(-3_000); });
  child.stderr.on("data", (chunk) => { log = (log + chunk).slice(-3_000); });
  const api = (route: string, body?: unknown, method?: string) => fetch(`${base}${route}`, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30_000),
  });
  try {
    for (let attempt = 0; ; attempt++) {
      try { if ((await fetch(base + "/api/healthz", { signal: AbortSignal.timeout(500) })).ok) break; } catch { /* Startup. */ }
      if (child.exitCode !== null) throw new Error(`Fixture host exited (${child.exitCode}): ${log}`);
      if (attempt >= 200) throw new Error(log || "Fixture host did not start.");
      await delay(100);
    }
    // Two isolated sessions: desktop and narrow touch-emulated.
    const desktop = await (await api("/api/tester/sessions", { label: "desktop" })).json() as { sessionId: string };
    assert.ok(desktop.sessionId);
    const narrow = await (await api("/api/tester/sessions", { label: "narrow", width: 390, height: 844, mobile: true })).json() as { sessionId: string; mobile: boolean; viewport: { width: number; height: number } };
    assert.equal(narrow.mobile, true);
    assert.deepEqual(narrow.viewport, { width: 390, height: 844 });
    const listed = await (await api("/api/tester/sessions", undefined, "GET")).json() as Array<{ sessionId: string }>;
    assert.equal(listed.length, 2);
    // Open the studio itself in both; external origins stay refused.
    for (const session of [desktop, narrow]) {
      const opened = await (await api("/api/tester/browser/open", { sessionId: session.sessionId })).json() as { url: string; sessionId: string };
      assert.equal(opened.sessionId, session.sessionId);
      assert.match(opened.url, /^http:\/\/127\.0\.0\.1:/);
    }
    assert.equal((await api("/api/tester/browser/open", { url: "https://example.com/" })).status, 400);
    // Compact snapshot, ref subtree, PNG screenshot, honest wait timeout.
    const snapshot = await (await api(`/api/tester/browser/snapshot?sessionId=${desktop.sessionId}&compact=1&limit=40`, undefined, "GET")).json() as { snapshot: string; truncated: boolean; nextCursor: number | null };
    assert.ok(snapshot.snapshot.length > 0);
    const shot = await (await api(`/api/tester/browser/screenshot?sessionId=${desktop.sessionId}`, undefined, "GET")).json() as { pngBase64: string };
    assert.ok(Buffer.from(shot.pngBase64, "base64").subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));
    const timeout = await api("/api/tester/browser/wait", { sessionId: desktop.sessionId, kind: "text", value: "no-such-text-anywhere-zzz", timeoutMs: 1_000 });
    assert.equal(timeout.status, 409);
    const timeoutBody = await timeout.json() as { error: string; code?: string };
    assert.equal(timeoutBody.code, "TIMEOUT");
    assert.match(timeoutBody.error, /current page/);
    // Events journal records the session's own actions.
    const events = await (await api(`/api/tester/events?sessionId=${desktop.sessionId}&limit=50`, undefined, "GET")).json() as { events: Array<{ type: string }>; nextCursor: number | null };
    assert.ok(events.events.some((event) => event.type === "navigation"));
    // Snapshot refs resolve to live controls; ambiguous selectors fail
    // instead of silently acting on the first match; targetless keys work.
    const refMatch = /\[ref:(\d+)\]/.exec(snapshot.snapshot);
    assert.ok(refMatch, "compact snapshot carries node refs");
    const hoverByRef = await api("/api/tester/browser/act", { sessionId: desktop.sessionId, kind: "hover", ref: refMatch![1] });
    assert.equal(hoverByRef.status, 200);
    const ambiguous = await api("/api/tester/browser/act", { sessionId: desktop.sessionId, kind: "hover", selector: "div" });
    assert.equal(ambiguous.status, 409);
    assert.match(((await ambiguous.json()) as { error: string }).error, /AMBIGUOUS_ELEMENT/);
    assert.equal((await api("/api/tester/browser/act", { sessionId: desktop.sessionId, kind: "press", key: "Escape" })).status, 200);
    const staged = await (await api("/api/tester/fixtures/stage", { filename: "qa.csv", contentBase64: Buffer.from("id,total\n1,10\n").toString("base64"), mime: "text/csv" })).json() as { fixtureId: string; sha256: string; filename: string };
    assert.equal(staged.sha256.length, 64);
    assert.equal(staged.filename, "qa.csv");
    const uploaded = await (await api("/api/tester/browser/upload", { sessionId: desktop.sessionId, fixtureIds: [staged.fixtureId] })).json() as { files: Array<{ filename: string; sha256: string }> };
    assert.equal(uploaded.files[0]?.sha256, staged.sha256);
    // Resize preserves the session; dialogs list is empty; close cleans up.
    const resized = await (await api(`/api/tester/sessions/${desktop.sessionId}`, { width: 1280, height: 800 }, "PATCH")).json() as { width: number; height: number };
    assert.deepEqual(resized, { width: 1280, height: 800 });
    assert.deepEqual(await (await api(`/api/tester/dialogs?sessionId=${desktop.sessionId}`, undefined, "GET")).json(), []);
    assert.equal(((await (await api(`/api/tester/sessions/${narrow.sessionId}`, undefined, "DELETE")).json()) as { closed: boolean }).closed, true);
    const closeResponse = await api("/api/tester/browser/close", { sessionId: desktop.sessionId });
    const closeText = await closeResponse.text();
    assert.equal((JSON.parse(closeText) as { closed: boolean }).closed, true);
  } finally {
    child.kill("SIGTERM"); await Promise.race([exited, delay(4_000)]);
    if (child.exitCode === null) { child.kill("SIGKILL"); await exited; }
    db.close(); rmSync(root, { recursive: true, force: true });
  }
});

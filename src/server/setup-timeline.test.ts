import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import express from "express";
import { OpenBotDatabase } from "./database.js";
import { registerSetupRoutes } from "./setup-routes.js";
import { SetupSharingUnavailable, SetupTimeline } from "./setup-timeline.js";
import { SETUP_MILESTONES, formatElapsed, setupAiKind, setupTimelineText, type SetupTimelineView } from "../shared/setup-timeline.js";

function studio() {
  const root = mkdtempSync(path.join(tmpdir(), "sidemates-setup-timeline-"));
  const db = new OpenBotDatabase(root, { dataDir: path.join(root, "data") });
  return { db, close: () => { db.close(); rmSync(root, { recursive: true, force: true }); } };
}

/** A clock that moves in local calendar days from local noon, so neither midnight nor a
 * daylight-saving change can skew "the next day". */
function clock(start = new Date(2026, 0, 15, 12, 0, 0)) {
  let current = new Date(start);
  return {
    now: () => new Date(current),
    later(days: number, hours = 0) { const next = new Date(start); next.setDate(next.getDate() + days); next.setHours(next.getHours() + hours); current = next; },
  };
}

const reached = (view: SetupTimelineView) => Object.fromEntries(view.milestones.map((entry) => [entry.name, entry.at]));

test("a new studio records each step of its first days once, in order", () => {
  const { db, close } = studio();
  try {
    const time = clock();
    const timeline = new SetupTimeline(db, time.now);
    let view = timeline.view();
    assert.deepEqual(view.milestones.map((entry) => entry.name), SETUP_MILESTONES.map((entry) => entry.name));
    assert.equal(view.olderThanTimeline, false);
    assert.ok(reached(view).installed, "the first start comes from the studio's own records");
    assert.equal(reached(view).studio_opened, null);

    timeline.noteVisit();
    const opened = reached(timeline.view()).studio_opened;
    assert.ok(opened);
    time.later(0, 3);
    timeline.noteVisit();
    view = timeline.view();
    assert.equal(reached(view).studio_opened, opened, "a second visit doesn't move the first");
    assert.equal(reached(view).returned_next_day, null, "the same day isn't coming back");

    timeline.noteConnections([
      { id: "local-opencode", provider: "opencode", apiConfig: null, connected: false },
      { id: "local-google", provider: "google", apiConfig: null, connected: true },
    ]);
    timeline.noteConnections([{ id: "local-claude", provider: "claude", apiConfig: null, connected: true }]);
    const ai = timeline.view().milestones.find((entry) => entry.name === "ai_connected")!;
    assert.ok(ai.at);
    assert.equal(ai.detail, "Gemini", "the first working connection wins, by kind only");

    const bot = db.createBot({ name: "Remy", emoji: "🙂", color: "#6757d9", role: "Helper", instructions: "Help", providerInstanceId: "local-google", model: "google/gemini-flash-lite-latest" });
    const answer = db.createRun({ threadId: bot.threadId, botId: bot.id, prompt: "hello", status: "running" });
    db.updateRun(answer.id, { status: "completed", finishedAt: new Date().toISOString() });
    view = timeline.view();
    assert.ok(reached(view).first_teammate);
    assert.ok(reached(view).first_answer);
    assert.equal(reached(view).first_job, null, "an answer without tools isn't a finished job");

    const job = db.createRun({ threadId: bot.threadId, botId: bot.id, prompt: "save the receipt", status: "running" });
    db.addActivity({ runId: job.id, botId: bot.id, kind: "file", label: "Saved a file", detail: null });
    db.updateRun(job.id, { status: "completed", finishedAt: new Date().toISOString() });
    assert.ok(reached(timeline.view()).first_job);

    time.later(1);
    timeline.noteVisit();
    view = timeline.view();
    assert.ok(reached(view).returned_next_day);
    assert.equal(reached(view).returned_within_week, reached(view).returned_next_day);

    // Milestones stay put after the records behind them change, and survive a restart.
    db.retireBot(bot.id);
    const restarted = new SetupTimeline(db, time.now).view();
    assert.deepEqual(reached(restarted), reached(view));
    assert.equal(restarted.startedAt, view.startedAt);
  } finally { close(); }
});

test("coming back after a gap counts within a week, but not as the next day, and not after a week", () => {
  const { db, close } = studio();
  try {
    const time = clock();
    const timeline = new SetupTimeline(db, time.now);
    timeline.noteVisit();
    time.later(3);
    timeline.noteVisit();
    let view = timeline.view();
    assert.equal(reached(view).returned_next_day, null);
    assert.ok(reached(view).returned_within_week);

    const late = studio();
    try {
      const lateTime = clock();
      const lateTimeline = new SetupTimeline(late.db, lateTime.now);
      lateTimeline.noteVisit();
      lateTime.later(8);
      lateTimeline.noteVisit();
      view = lateTimeline.view();
      assert.equal(reached(view).returned_next_day, null);
      assert.equal(reached(view).returned_within_week, null);
    } finally { late.close(); }
  } finally { close(); }
});

test("a studio from before the timeline keeps what its records prove and doesn't invent visits or connections", () => {
  const { db, close } = studio();
  try {
    const bot = db.createBot({ name: "Nova", emoji: "🙂", color: "#6757d9", role: "Helper", instructions: "Help" });
    const time = clock(new Date(Date.now() + 3 * 60 * 60 * 1000));
    const timeline = new SetupTimeline(db, time.now);
    timeline.noteVisit();
    timeline.noteConnections([{ id: "local-google", provider: "google", apiConfig: null, connected: true }]);
    time.later(1);
    timeline.noteVisit();
    const view = timeline.view();
    assert.equal(view.olderThanTimeline, true);
    assert.ok(reached(view).installed);
    assert.equal(reached(view).first_teammate, bot.createdAt);
    for (const name of ["studio_opened", "ai_connected", "returned_next_day", "returned_within_week"]) assert.equal(reached(view)[name], null, `${name} is unknown, not dated to the update`);
  } finally { close(); }
});

test("sharing setup counts is off, can't be turned on in this version, and would send no content", () => {
  const { db, close } = studio();
  try {
    const timeline = new SetupTimeline(db);
    assert.deepEqual(timeline.view().sharing, { available: false, enabled: false });
    assert.throws(() => timeline.setSharing(true), SetupSharingUnavailable);
    timeline.setSharing(false);
    assert.equal(timeline.countsToSend({ appVersion: "0.43.0", macosMajor: 26 }), null);

    // If the owner ever adds an endpoint, this is everything that could leave the Mac.
    const time = clock();
    const optedIn = new SetupTimeline(db, time.now, "https://counts.example.invalid/setup");
    assert.deepEqual(optedIn.view().sharing, { available: true, enabled: false }, "off until the owner turns it on");
    assert.equal(optedIn.countsToSend({ appVersion: "0.43.0", macosMajor: 26 }), null);
    const bot = db.createBot({ name: "Private Name", emoji: "🙂", color: "#6757d9", role: "Reads my private mail", instructions: "secret instructions", providerInstanceId: "local-opencode", model: "opencode-go/deepseek-v4.1-flash" });
    const run = db.createRun({ threadId: bot.threadId, botId: bot.id, prompt: "my private prompt", status: "running" });
    db.updateRun(run.id, { status: "completed", finishedAt: new Date().toISOString() });
    optedIn.noteVisit();
    optedIn.noteConnections([{ id: "nous-portal", provider: "custom", apiConfig: { baseUrl: "https://inference-api.nousresearch.com/v1", protocol: "openai-compatible", modelIds: ["m"] }, connected: true }]);
    optedIn.setSharing(true);
    const payload = optedIn.countsToSend({ appVersion: "0.43.0", macosMajor: 26 })!;
    assert.deepEqual(Object.keys(payload).sort(), ["aiKind", "appVersion", "id", "macosMajor", "milestones"]);
    assert.match(payload.id, /^[0-9a-f-]{36}$/);
    assert.equal(payload.aiKind, "nous");
    for (const entry of payload.milestones) {
      assert.deepEqual(Object.keys(entry).sort(), ["name", "seconds"]);
      assert.ok(SETUP_MILESTONES.some((milestone) => milestone.name === entry.name));
      assert.ok(Number.isInteger(entry.seconds) && entry.seconds >= 0);
    }
    const sent = JSON.stringify(payload);
    for (const privateText of ["Private Name", "private mail", "secret instructions", "my private prompt", "deepseek", "nous-portal", "nousresearch", bot.id, db.dataDir]) {
      assert.ok(!sent.includes(privateText), `the payload doesn't contain ${privateText}`);
    }
  } finally { close(); }
});

test("the kind of AI is named without the account, key or model", () => {
  const kind = (provider: Parameters<typeof setupAiKind>[0]["provider"], id = "x", baseUrl?: string) =>
    setupAiKind({ id, provider, apiConfig: baseUrl ? { baseUrl, protocol: "openai-compatible", modelIds: ["m"] } : null });
  assert.equal(kind("google"), "gemini");
  assert.equal(kind("openai"), "chatgpt");
  assert.equal(kind("claude"), "claude");
  assert.equal(kind("github-copilot"), "copilot");
  assert.equal(kind("xai"), "grok");
  assert.equal(kind("opencode"), "opencode");
  assert.equal(kind("custom", "nous-portal"), "nous");
  assert.equal(kind("custom", "ollama", "http://127.0.0.1:11434/v1"), "local");
  assert.equal(kind("custom", "hosted", "https://api.example.com/v1"), "api");
});

test("Settings reads the timeline, the studio notes visits, and sharing stays refused", async () => {
  const { db, close } = studio();
  const app = express();
  app.use(express.json());
  registerSetupRoutes(app, new SetupTimeline(db));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const send = (route: string, method = "GET", body?: unknown) => fetch(base + route, { method, headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  try {
    const first = await send("/api/setup");
    assert.equal(first.status, 200);
    assert.equal(first.headers.get("cache-control"), "no-store");
    assert.equal(reached(await first.json() as SetupTimelineView).studio_opened, null);
    assert.equal((await send("/api/setup/visit", "POST")).status, 204);
    assert.ok(reached(await (await send("/api/setup")).json() as SetupTimelineView).studio_opened);

    const refused = await send("/api/setup/sharing", "PATCH", { enabled: true });
    assert.equal(refused.status, 409);
    assert.match((await refused.json() as { error: string }).error, /isn't available/);
    assert.equal((await send("/api/setup/sharing", "PATCH", { enabled: "yes" })).status, 400);
    const off = await send("/api/setup/sharing", "PATCH", { enabled: false });
    assert.equal(off.status, 200);
    assert.deepEqual((await off.json() as SetupTimelineView).sharing, { available: false, enabled: false });
  } finally {
    server.close();
    close();
  }
});

test("elapsed times and the copied timeline read plainly", () => {
  assert.equal(formatElapsed(-5), "0 s");
  assert.equal(formatElapsed(12_400), "12 s");
  assert.equal(formatElapsed(59_600), "1 min");
  assert.equal(formatElapsed(4 * 60_000), "4 min");
  assert.equal(formatElapsed(65 * 60_000), "1 h 5 min");
  assert.equal(formatElapsed(2 * 3_600_000), "2 h");
  assert.equal(formatElapsed(26 * 3_600_000), "1 day");
  assert.equal(formatElapsed(3 * 86_400_000), "3 days");
  const entry = (name: SetupTimelineView["milestones"][number]["name"], at: string | null, detail: string | null = null) =>
    ({ name, label: SETUP_MILESTONES.find((milestone) => milestone.name === name)!.label, at, detail });
  const text = setupTimelineText({
    milestones: [entry("installed", "2026-10-07T10:00:00.000Z"), entry("studio_opened", null), entry("ai_connected", "2026-10-07T10:03:00.000Z", "Gemini"), entry("first_teammate", null)],
    startedAt: "2026-10-07T09:00:00.000Z", olderThanTimeline: true, sharing: { available: false, enabled: false },
  }, (iso) => iso.slice(0, 16));
  assert.equal(text, [
    "Sidemates setup timeline (kept on this Mac)",
    "Sidemates started for the first time: 2026-10-07T10:00",
    "Opened the studio: not recorded",
    "Connected an AI (Gemini): 2026-10-07T10:03, 3 min after the first start",
    "Made the first teammate: not yet",
  ].join("\n"));
});

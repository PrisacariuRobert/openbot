// Installed OpenCode + real runner/tool wrappers/storage, deterministic local
// model endpoint and synthetic app data. This is NOT a model-quality benchmark.
import assert from "node:assert/strict";
import { validToolToken } from "../src/server/tool-auth.js";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { OpenBotDatabase } from "../src/server/testing/database.js";
import { OpenCodeRunner } from "../src/server/opencode.js";
import { AttachmentService } from "../src/server/attachments.js";
import { WorkReportService } from "../src/server/work-reports.js";
import { WorkExtraSources } from "../src/server/work-extra-sources.js";
import { AppReadService, MacAppReader, type AppReadReceipt } from "../src/server/mac-app-read.js";
import { GOOGLE_SCOPES } from "../src/server/google-workspace.js";
import type { WorkSnapshot } from "../src/shared/work-reports.js";
import { z } from "zod";
import { DEFAULT_EXECUTION_LIMITS } from "../src/server/execution-policy.js";

// Opt-in only. Never silently substitute a paid model.
// Owner-authorized live paths (2026-09-12): OpenCode provider with
// DeepSeek 4.1 Flash or Muse Spark 1.3 Contributor (paid), plus the
// existing free fixtures for CI. Browser-first for accounts; owner signs in on demand.
const liveModel = process.env.OPENBOT_PRODUCTIVITY_LIVE_MODEL;
assert.ok(!liveModel || ["opencode/muse-spark-1.2-contributor-free", "opencode/muse-spark-1.3-contributor-free", "opencode-go/deepseek-v4.1-flash", "opencode-go/muse-spark-1.3-contributor"].includes(liveModel), "Only an explicitly selected owner-authorized model is accepted by this small live check; no fallback is selected.");

const root = mkdtempSync(path.join(tmpdir(), "openbot-productivity-runtime-"));
const db = new OpenBotDatabase(root);
const internalToken = "disposable-fixture-token";
const snapshots = new Map<string, WorkSnapshot>();
const counts = new Map<string, number>();
let observedTools: string[] = [];
let currentRunId = "", googleReads = 0;
let extraReads = 0;
const extraSources = new WorkExtraSources(db, {
  workChannels: async () => ({ choices: [], limited: false }),
  workMessages: async (channelId) => { extraReads++; return { messages: [{ channelId, channelName: "launch", timestamp: String(Date.now() / 1000 - 60), threadTimestamp: null, author: "Mira", text: "Decision needed before Tuesday: keep the launch gated until the security review passes.", permalink: null }], hasMore: true, omitted: false }; },
}, {
  search: async () => [],
  read: async (id) => { extraReads++; return { id, title: "Launch checklist", url: "https://www.notion.so/fixture", lastEditedAt: new Date().toISOString(), content: "Security review remains open. Proposed dates are suggestions, not approvals.", truncated: true }; },
}, {
  workProjects: async () => ({ choices: [], limited: false }),
  workTasks: async (projectId) => { extraReads++; return { tasks: [{ id: "task1", projectId, content: "Complete the security review before Tuesday", description: "Ask Mira for review context", priority: 4, due: "Tuesday", completed: false, url: "https://app.todoist.com/app/task/fixture" }], hasMore: false, omitted: false }; },
});
let appReadMode = false;
const appReceipts: AppReadReceipt[] = [];
const appReader = new AppReadService(db, new MacAppReader(async (_script, args) => {
  const { app } = JSON.parse(args[0]);
  return JSON.stringify({ app, bundleId: `fixture.${app}`, windowTitle: "Synthetic project context", blocks: [{ ref: "A1", role: "AXStaticText", text: app === "Notes" ? "The project review is Tuesday." : "Mira asked for the draft before the review." }], examined: 2, omitted: 0, limited: true });
}, "darwin"));
const reports = new WorkReportService(db, {
  workInbox: async () => { googleReads++; return { ids: ["thread1"], hasMore: false }; },
  workThread: async () => { googleReads++; return { id: "thread1", subject: "Review date", from: "mira@example.com", date: new Date().toISOString(), text: "Can we review the plan on Tuesday?", truncated: false, replyState: "received_last", replyTo: "mira@example.com" }; },
  workCalendar: async () => { googleReads++; return { hasMore: false, events: [{ id: "event1", title: "Review date", start: new Date(Date.now() + 3600_000).toISOString(), end: new Date(Date.now() + 5400_000).toISOString(), allDay: false, description: "Review the plan with Mira.", truncated: false, location: "Online", webLink: "https://calendar.google.com/calendar/event?eid=fixture" }] }; },
}, Date.now, {
  available: process.platform === "darwin",
  async mail() { return { messages: [{ id: "local-mail", subject: "Review date", from: "Mira <mira@example.com>", date: new Date().toISOString(), text: "Can we review the plan on Tuesday?", truncated: false }], detail: "Synthetic Apple Mail read; sent history and sync completeness are unknown." }; },
  async calendar() { return { events: [{ id: "local-event", title: "Review date", start: new Date(Date.now() + 3600_000).toISOString(), end: new Date(Date.now() + 5400_000).toISOString(), allDay: false, description: "Review the plan", location: "Online", truncated: false, webLink: "" }], hasMore: true }; },
}, extraSources);
const server = createServer(async (request, response) => {
  try {
    let raw = "";
    for await (const chunk of request) { raw += String(chunk); if (raw.length > 1_000_000) throw new Error("Oversized fixture request"); }
    const body = JSON.parse(raw || "{}");
    if (request.url === "/api/internal/tools" && request.method === "POST") {
      assert.ok(validToolToken(internalToken, body.botId, body.runId, request.headers["x-openbot-token"]));
      assert.equal(body.runId, currentRunId);
      assert.equal(body.botId, "nova");
      if (body.action === "mac_app_read" && appReadMode) {
        const receipt = await appReader.read(body.botId, body.runId, body.args);
        appReceipts.push(receipt);
        response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(receipt));
      } else if (body.action === "work_collect") {
        const snapshot = await reports.collect(body.botId, body.runId, body.args);
        snapshots.set(currentRunId, snapshot);
        response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ snapshot }));
      } else if (body.action === "work_report") {
        const report = reports.save(body.botId, body.runId, body.args);
        response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ saved: true, snapshotId: report.snapshotId }));
      } else if (body.action === "task_plan") {
        const input = z.object({ goal: z.string().max(240), deliverable: z.string().max(240), steps: z.array(z.string().max(140)).min(1).max(8), requiredApps: z.array(z.enum(["gmail", "google-calendar"])).max(2).default([]), approvalBoundary: z.string().max(240).optional() }).parse(body.args);
        response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ task: db.setRunTaskPlan(body.runId, input) }));
      } else if (body.action === "task_progress") {
        const input = z.object({ stepId: z.number().int().min(1).max(8), status: z.enum(["active", "completed", "blocked", "skipped"]), detail: z.string().max(220).optional() }).parse(body.args);
        response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ task: db.updateRunTaskStep(body.runId, input.stepId, input.status, input.detail) }));
      } else if (body.action === "task_verify") {
        const input = z.object({ status: z.enum(["passed", "partial", "blocked"]), summary: z.string().max(500), checks: z.array(z.object({ label: z.string().max(180), passed: z.boolean() })).min(1).max(8) }).parse(body.args);
        response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ task: db.verifyRunTask(body.runId, input) }));
      } else throw new Error(`Unexpected tool ${body.action}; this fixture permits only work_collect, work_report and task plan/progress/verification. No real apps are available.`);
      return;
    }
    assert.equal(request.url, "/v1/chat/completions");
    assert.equal(request.headers.authorization, "Bearer fixture-only-key");
    observedTools = (body.tools || []).map((tool: { function?: { name?: string } }) => tool.function?.name || "unknown");
    const workflowCall = observedTools.includes("work_collect");
    const snapshot = snapshots.get(currentRunId);
    const saved = snapshot && db.getWorkReport(snapshot.id);
    const step = (counts.get(currentRunId) || 0) + 1;
    counts.set(currentRunId, step);
    assert.ok(step <= 8, "Unexpected tool loop in fixture runtime");
    const tool = appReadMode ? appReceipts.length < 2 ? { name: "mac_app_read", arguments: JSON.stringify({ app: appReceipts.length ? "Slack" : "Notes" }) } : null : !workflowCall || saved ? null : !snapshot
      ? { name: "work_collect", arguments: JSON.stringify({ kind: body.model.includes("inbox") ? "inbox" : body.model.includes("meeting") ? "meeting" : body.model.includes("weekly") ? "weekly" : "morning", timeZone: "Europe/Brussels" }) }
      : { name: "work_report", arguments: JSON.stringify({ snapshotId: snapshot.id, items: [{ priority: "soon", text: "Review Mira's request for Tuesday; no commitment has been made.", sourceRefs: ["M1"] }], drafts: snapshot.kind === "inbox" ? [{ sourceRef: "M1", body: "Would Tuesday afternoon work?" }] : [] }) };
    const finalText = appReadMode ? `The review is Tuesday; prepare the draft beforehand. Sources: ${appReceipts.map(receipt => `[${receipt.app} A1](/api/app-reads/${receipt.id})`).join("; ")}. Partial window snapshots only. Nothing was sent.` : workflowCall ? "Your source-linked report is ready. Nothing was sent." : "Ready.";
    const delta = tool ? { role: "assistant", tool_calls: [{ index: 0, id: `call_${step}`, type: "function", function: tool }] } : { role: "assistant", content: finalText };
    const chunk = { id: `completion_${step}`, object: "chat.completion.chunk", created: 1, model: body.model };
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.write(`data: ${JSON.stringify({ ...chunk, choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`);
    response.write(`data: ${JSON.stringify({ ...chunk, choices: [{ index: 0, delta: {}, finish_reason: tool ? "tool_calls" : "stop" }], usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 } })}\n\n`);
    response.end("data: [DONE]\n\n");
  } catch (error) { response.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) })); }
});
let runner: OpenCodeRunner | undefined;
try {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  db.configureGoogleConnector({ clientId: "fixture.apps.googleusercontent.com" });
  db.completeGoogleConnector({ accessToken: "never-used", expiresAt: new Date(Date.now() + 3600_000).toISOString(), scopes: GOOGLE_SCOPES, accountEmail: "owner@example.com" });
  db.setBotConnectorAccess("nova", { canRead: true, canSend: false });
  db.setBotConnectorAccess("nova", { canRead: true, canSend: false }, "google-calendar");
  for (const service of ["slack", "notion", "todoist"] as const) {
    db.configureOAuthConnector({ id: service, kind: `${service}_oauth`, name: service, clientId: "synthetic", clientSecret: "never-used" });
    db.completeOAuthConnector(service, { accessToken: "never-used" }, "Synthetic account", ["read"]);
    db.setBotConnectorAccess("nova", { canRead: true, canSend: false }, service, service);
  }
  db.setWorkSources("nova", { selections: [{ service: "slack", id: "C1", label: "#launch" }, { service: "notion", id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", label: "Launch checklist" }, { service: "todoist", id: "project1", label: "Launch" }] });
  db.upsertProvider({ id: "workflow-fixture", name: "Local fixture", provider: "custom", authMode: "api_key", runtime: "opencode", secret: "fixture-only-key", apiConfig: { baseUrl: `${base}/v1`, protocol: "openai-compatible", modelIds: ["fixture-morning", "fixture-inbox", "fixture-meeting", "fixture-weekly"] } });
  const fixtureHome = path.join(root, "runtime-home"); mkdirSync(fixtureHome);
  runner = new OpenCodeRunner({
    db, internalUrl: base, internalToken, onChange: () => {}, attachments: new AttachmentService(db),
    limits: { ...DEFAULT_EXECUTION_LIMITS, maxActiveMs: 180_000, maxSteps: 12, maxTokens: 30_000, maxJobTokens: 30_000 },
    spawnProcess: (command, args, options) => {
      const env = { ...options.env };
      const config = JSON.parse(String(env.OPENCODE_CONFIG_CONTENT || "{}"));
      if (liveModel) config.enabled_providers = liveModel.startsWith("opencode-go/") ? ["opencode", "opencode-go"] : ["opencode"];
      config.model = db.getBot("nova")!.model;
      config.small_model = config.model;
      config.share = "disabled"; config.autoupdate = false;
      // Match the production generated workspace policy; the fixture endpoint
      // itself only emits the two bounded read/report tool calls.
      config.permission = "allow";
      return spawn(command, args, { ...options, env: { ...env, OPENCODE_CONFIG_CONTENT: JSON.stringify(config), ...(!liveModel ? { HOME: fixtureHome, XDG_CONFIG_HOME: path.join(fixtureHome, "config"), XDG_DATA_HOME: path.join(fixtureHome, "data"), XDG_CACHE_HOME: path.join(fixtureHome, "cache") } : {}), OPENCODE_DISABLE_SHARE: "true" } });
    },
  });
  for (const kind of ["morning", "inbox", "meeting", "weekly"] as const) {
    db.updateBot("nova", { providerInstanceId: liveModel ? "local-opencode" : "workflow-fixture", model: liveModel || `openbot-workflow-fixture/fixture-${kind}`, computerEnabled: false, browserEnabled: false, weeklyTokenBudget: 100_000 });
    const threadId = kind === "morning" ? "bot-nova" : "team-room";
    const request = kind === "morning" ? "morning brief including my selected Slack, Notion and Todoist context" : kind === "weekly" ? "weekly review including my selected Slack, Notion and Todoist context" : kind === "meeting" ? "next-meeting preparation" : "inbox follow-ups with one useful unsent reply draft to Mira";
    const run = db.createRun({ botId: "nova", threadId, status: "queued", prompt: `Prepare my ${request} in Europe/Brussels. Save a reviewable report with source-linked priorities${kind === "inbox" ? " and one unsent reply draft" : " without reply drafts"}. Finish with a short summary. Do not send anything, make commitments, or change connected apps. Mention missing coverage.` });
    currentRunId = run.id;
    // Match the explicit starter contract before model execution.
    db.updateRun(run.id, { status: "running" });
    db.requireWorkReport(run.id, kind);
    db.updateRun(run.id, { status: "queued" });
    const started = Date.now();
    void runner["executeRun"](db.getRun(run.id)!);
    while (Date.now() - started < (liveModel ? 185_000 : 60_000)) {
      await delay(100);
      if (["completed", "failed", "cancelled"].includes(db.getRun(run.id)!.status)) break;
    }
    if (!liveModel) assert.deepEqual(observedTools.sort(), ["work_collect", "work_report"], "Report starters must expose only their two tools to the real runtime.");
    assert.equal(db.getRun(run.id)!.status, "completed", JSON.stringify(db.getRun(run.id)));
    // Completion is persisted just before async attachment preparation.
    for (let attempt = 0; attempt < 30 && (db.listMessages(threadId).find((message) => message.runId === run.id)?.attachments.length || 0) < 2; attempt++) await delay(100);
    const message = db.listMessages(threadId).find((message) => message.runId === run.id)!;
    assert.equal(message.attachments.length, 2, `The server must attach the work report and usage receipt. Tools: ${observedTools.join(", ")}; snapshot: ${Boolean(snapshots.get(run.id))}; answer: ${message.body}`);
    assert.equal(message.attachments.filter((attachment) => attachment.name === "provider-usage.md").length, 1);
    assert.match(message.body, /Sources:/);
    const snapshot = snapshots.get(run.id)!;
    const report = db.getWorkReport(snapshot.id)!;
    assert.equal(report.drafts.length, kind === "inbox" ? 1 : 0);
    assert.ok(report.items.length >= 1);
    assert.match(report.markdown, /Tuesday/i);
    assert.ok(report.items.every((item) => item.sourceRefs.every((ref) => snapshot.sources.some((source) => source.ref === ref))));
    if (kind === "morning" || kind === "weekly") {
      assert.ok(["slack", "notion", "todoist"].every((service) => snapshot.coverage.some((entry) => entry.service === service && entry.state === "limited")));
      if (liveModel) assert.ok(report.items.some((item) => item.sourceRefs.some((ref) => /^[SNT]/.test(ref))), "The model must use at least one selected extra source for a priority.");
    }
    const usage = db.getRun(run.id)!;
    console.log(JSON.stringify({ result: "PASS", workflow: kind, model: liveModel || "scripted local fixture", elapsedMs: Date.now() - started, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, reasoningTokens: usage.reasoningTokens, steps: usage.modelSteps, draftCount: report.drafts.length, artifacts: message.attachments.length, sourceRefsValid: true }));
  }
  assert.equal(googleReads, 11);
  assert.equal(extraReads, 6);
  db.setWorkSources("nova", { selections: [] });
  if (!liveModel) {
    db.setBotConnectorAccess("nova", { canRead: false, canSend: false });
    db.setBotConnectorAccess("nova", { canRead: false, canSend: false }, "google-calendar");
    const run = db.createRun({ botId: "nova", threadId: "bot-nova", status: "queued", prompt: "Say Ready. Do not call any tools." });
    currentRunId = run.id;
    observedTools = [];
    void runner["executeRun"](run);
    const started = Date.now();
    while (Date.now() - started < 60_000) {
      await delay(100);
      if (["completed", "failed", "cancelled"].includes(db.getRun(run.id)!.status)) break;
    }
    assert.equal(db.getRun(run.id)!.status, "completed", JSON.stringify(db.getRun(run.id)));
    assert.ok(observedTools.length > 0, "The ordinary agent must retain its permitted tools.");
    assert.ok(!observedTools.some((name) => /^(gmail_|browser_|computer_)/.test(name)), `Disabled app/computer tools leaked into the ordinary agent: ${observedTools.join(", ")}`);
    assert.equal(googleReads, 11, "Revoked app access must not cause additional source reads.");
    console.log(JSON.stringify({ result: "PASS", workflow: "ordinary-agent-permissions", enabledToolCount: observedTools.length }));
    if (process.platform === "darwin") {
      db.disconnectGoogleConnector();
      db.updateStudioSettings({ macAccessEnabled: true });
      db.updateBot("nova", { model: "openbot-workflow-fixture/fixture-morning" });
      const localRun = db.createRun({ botId: "nova", threadId: "bot-nova", status: "queued", expectedWorkKind: "morning", prompt: "Prepare a source-backed morning report. Google is disconnected; use the enabled Mac fallback through work_collect, then work_report. No draft or external writes." });
      currentRunId = localRun.id;
      void runner["executeRun"](localRun);
      const localStart = Date.now();
      while (Date.now() - localStart < 60_000) {
        await delay(100);
        if (["completed", "failed", "cancelled"].includes(db.getRun(localRun.id)!.status)) break;
      }
      assert.equal(db.getRun(localRun.id)!.status, "completed", JSON.stringify(db.getRun(localRun.id)));
      const snapshot = snapshots.get(localRun.id)!;
      const report = db.getWorkReport(snapshot.id)!;
      assert.deepEqual(snapshot.coverage.map(item => item.service), ["apple-mail", "apple-calendar"]);
      assert.equal(report.drafts.length, 0);
      assert.ok(snapshot.sources.every(source => source.url === null));
      assert.equal(googleReads, 11, "The disconnected workflow must not read Google.");
      assert.deepEqual(observedTools.sort(), ["work_collect", "work_report"]);
      console.log(JSON.stringify({ result: "PASS", workflow: "mac-app-fallback", sourceServices: snapshot.coverage.map(item => item.service), realMacAppRead: false, savedReport: true }));
      appReadMode = true;
      const crossApp = db.createRun({ botId: "nova", threadId: "bot-nova", status: "queued", prompt: "Read the open Notes and Slack windows, combine their project context, and cite both saved source snapshots. Do not click, type or send anything." });
      currentRunId = crossApp.id;
      void runner["executeRun"](crossApp);
      const crossStart = Date.now();
      while (Date.now() - crossStart < 60_000) {
        await delay(100);
        if (["completed", "failed", "cancelled"].includes(db.getRun(crossApp.id)!.status)) break;
      }
      assert.equal(db.getRun(crossApp.id)!.status, "completed", JSON.stringify(db.getRun(crossApp.id)));
      assert.equal(appReceipts.length, 2);
      for (const receipt of appReceipts) assert.equal(db.getAppReadReceipt(receipt.id)?.runId, crossApp.id);
      for (let attempt = 0; attempt < 30 && !db.listMessages("bot-nova").find(message => message.runId === crossApp.id); attempt++) await delay(100);
      const answer = db.listMessages("bot-nova").find(message => message.runId === crossApp.id)!;
      assert.ok(appReceipts.every(receipt => answer.body.includes(`/api/app-reads/${receipt.id}`)));
      assert.equal(googleReads, 11);
      console.log(JSON.stringify({ result: "PASS", workflow: "cross-app-source-digest", realMacAppRead: false, savedSources: 2, allCited: true }));
    }
  }
  console.log(liveModel ? "Used only the explicitly selected owner-authorized model and synthetic app data. Four small successes do not establish model-class or competitor parity." : "No model subscription, real inbox, or external write was used. These scripted model replies verify integration, not reasoning quality.");
} finally {
  await runner?.stop();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  db.close();
  rmSync(root, { recursive: true, force: true });
}

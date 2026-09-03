import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenBotDatabase } from "./database.js";
import { connectedAppsText, prepareWorkspace } from "./workspace.js";

test("seeds persistent teammates and creates a routable task", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-db-test-"));
  try {
    mkdirSync(path.join(root, "skills", "use-mac-apps"), { recursive: true });
    writeFileSync(path.join(root, "skills", "use-mac-apps", "SKILL.md"), "---\nname: use-mac-apps\ndescription: Test skill\n---\n", "utf8");
    const db = new OpenBotDatabase(root);
    const state = db.getState("team-room");
    assert.deepEqual(state.bots.map((bot) => bot.name), ["Nova", "Pixel", "Scout"]);
    assert.equal(state.activeThreadId, "team-room");
    assert.equal(state.bots[0]?.model, "opencode/muse-spark-1.2-contributor-free");
    assert.equal(state.settings.macAccessEnabled, false);
    assert.equal(state.bots[0]?.macAccessEnabled, false);
    assert.equal(db.updateStudioSettings({ macAccessEnabled: true }).macAccessEnabled, true);
    assert.equal(db.listBots().every((bot) => bot.macAccessEnabled), true);
    const newBot = db.createBot({ name: "Mochi", emoji: "•", color: "#6757d9", role: "Helper", instructions: "Help clearly." });
    assert.equal(newBot.macAccessEnabled, true);
    const restyled = db.updateBot("nova", { mascot: "sunny", color: "#3187dc" });
    assert.equal(restyled?.mascot, "sunny");
    assert.equal(restyled?.color, "#3187dc");
    const novaWorkspace = prepareWorkspace(db, state.bots[0]!);
    assert.equal(existsSync(path.join(novaWorkspace, ".opencode", "skills", "use-mac-apps", "SKILL.md")), true);
    assert.equal(existsSync(path.join(novaWorkspace, ".claude", "skills", "use-mac-apps", "SKILL.md")), true);

    const message = db.addMessage({
      threadId: "bot-nova",
      senderType: "user",
      senderId: null,
      body: "Make a small note",
    });
    const run = db.createRun({
      threadId: "bot-nova",
      botId: "nova",
      prompt: message.body,
      status: "queued",
    });
    assert.equal(db.nextQueuedRun([])?.id, run.id);
    db.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("hands an unfinished draft between web and iPhone", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-draft-handoff-test-"));
  try {
    const db = new OpenBotDatabase(root);
    assert.deepEqual(db.getDraft("team-room"), { threadId: "team-room", body: "", source: null, updatedAt: null });
    const fromWeb = db.saveDraft("team-room", "Continue this on my phone", "web");
    assert.equal(fromWeb?.body, "Continue this on my phone");
    assert.equal(db.getState("team-room").draft.source, "web");
    const fromPhone = db.saveDraft("team-room", "Finished on iPhone", "ios");
    assert.equal(fromPhone?.source, "ios");
    assert.equal(db.saveDraft("missing-thread", "No", "web"), null);
    db.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("organizes the studio, searches durable work, and keeps replies and reactions", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-live-studio-test-"));
  try {
    const db = new OpenBotDatabase(root);
    const organized = db.updateThread("bot-nova", { section: "Launch", pinned: true });
    assert.equal(organized?.section, "Launch");
    assert.equal(organized?.pinned, true);
    const source = db.addMessage({ threadId: "bot-nova", senderType: "bot", senderId: "nova", body: "The launch brief is ready to review." });
    const reply = db.addMessage({ threadId: "bot-nova", senderType: "user", senderId: null, body: "Please tighten the opening.", replyToId: source.id });
    assert.equal(reply.replyTo?.senderName, "Nova");
    assert.match(reply.replyTo?.body || "", /launch brief/i);
    assert.throws(() => db.addMessage({ threadId: "bot-pixel", senderType: "user", senderId: null, body: "Wrong room", replyToId: source.id }), /no longer available/i);
    assert.equal(db.toggleMessageReaction(source.id, "✅")?.reactions[0]?.reactedByYou, true);
    assert.equal(db.toggleMessageReaction(source.id, "✅")?.reactions.length, 0);
    const run = db.createRun({ threadId: "bot-nova", botId: "nova", prompt: "Finish the launch brief", status: "running" });
    assert.equal(db.listStudioRuns().some((item) => item.id === run.id), true);
    assert.equal(db.searchStudio("launch").some((item) => item.kind === "message" && item.threadId === "bot-nova"), true);
    const duplicate = db.duplicateBot("nova");
    assert.equal(duplicate?.role, "Researcher");
    assert.equal(db.getThread(duplicate!.threadId)?.section, "Launch");
    assert.equal(db.updateThread("bot-nova", { hidden: true })?.hidden, true);
    db.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("stores and advances a five-minute enabled routine", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-routine-test-"));
  try {
    const db = new OpenBotDatabase(root);
    const before = Date.now();
    const routine = db.createRoutine({ name: "Tiny hello", botId: "nova", threadId: "bot-nova", prompt: "Post hello in this conversation.", intervalMinutes: 5 });
    assert.equal(routine.enabled, true);
    assert.equal(routine.intervalMinutes, 5);
    assert.ok(routine.nextRunAt);
    assert.ok(new Date(routine.nextRunAt).getTime() >= before + 5 * 60_000);
    db.markRoutineRan(routine);
    const advanced = db.getRoutine(routine.id)!;
    assert.equal(advanced.intervalMinutes, 5);
    assert.ok(advanced.nextRunAt);
    db.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("edits, pauses, retries, inspects, and deletes a routine without losing its results", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-routine-ops-test-"));
  try {
    const db = new OpenBotDatabase(root);
    const routine = db.createRoutine({ name: "Daily pulse", botId: "nova", threadId: "bot-nova", prompt: "Make a pulse.", intervalMinutes: 1440 });
    const edited = db.updateRoutine(routine.id, { name: "Hourly pulse", botId: "scout", threadId: "bot-scout", prompt: "Make a checked pulse.", intervalMinutes: 60, enabled: false });
    assert.equal(edited?.botName, "Scout");
    assert.equal(edited?.enabled, false);
    assert.equal(edited?.intervalMinutes, 60);
    const run = db.createRun({ threadId: "bot-scout", botId: "scout", prompt: edited!.prompt, status: "queued", routineId: routine.id });
    db.updateRun(run.id, { status: "failed", error: "Temporary problem" });
    assert.equal(db.listRoutineRuns(routine.id)[0]?.routineId, routine.id);
    assert.equal(db.getRoutine(routine.id)?.lastStatus, "failed");
    assert.equal(db.deleteRoutine(routine.id), true);
    assert.equal(db.getRoutine(routine.id), null);
    assert.equal(db.getRun(run.id)?.error, "Temporary problem");
    db.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("deduplicates automation events, retains replay input, and pauses repeated failures", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-automation-reliability-test-"));
  try {
    const db = new OpenBotDatabase(root);
    const routine = db.createRoutine({
      name: "Issue triage", botId: "nova", threadId: "bot-nova", prompt: "Triage the issue.", intervalMinutes: 1440,
      triggerType: "github", triggerConfig: { githubEvent: "issues", githubAction: "opened", repository: "acme/app" }, webhookSecret: "hook-secret",
    });
    assert.equal(routine.triggerType, "github");
    assert.deepEqual(routine.triggerConfig, { githubEvent: "issues", githubAction: "opened", repository: "acme/app" });
    assert.equal(routine.hasWebhookSecret, true);
    assert.equal(db.routineWebhookSecret(routine.id), "hook-secret");

    const payload = { action: "opened", repository: { full_name: "acme/app" }, issue: { number: 42 } };
    const first = db.receiveAutomationEvent({ routine, source: "github", externalId: "delivery-1", dedupeKey: "github:delivery-1", payloadSummary: "acme/app · #42", payload });
    const duplicate = db.receiveAutomationEvent({ routine, source: "github", externalId: "delivery-1", dedupeKey: "github:delivery-1", payloadSummary: "acme/app · #42", payload });
    assert.equal(first.duplicate, false);
    assert.equal(duplicate.duplicate, true);
    assert.equal(duplicate.event.id, first.event.id);
    assert.deepEqual(db.automationEventPayload(first.event.id), payload);
    assert.equal(db.getRoutine(routine.id)?.deduplicatedCount, 1);

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const receipt = attempt === 1 ? first : db.receiveAutomationEvent({ routine: db.getRoutine(routine.id)!, source: "github", externalId: `delivery-${attempt}`, dedupeKey: `github:delivery-${attempt}`, payloadSummary: `attempt ${attempt}`, payload: { attempt } });
      const run = db.createRun({ threadId: routine.threadId, botId: routine.botId, prompt: routine.prompt, status: "queued", routineId: routine.id, automationEventId: receipt.event.id });
      db.linkAutomationEvent(receipt.event.id, run.id);
      db.updateRun(run.id, { status: "running", startedAt: new Date().toISOString() });
      db.updateRun(run.id, { status: "failed", finishedAt: new Date().toISOString(), error: `temporary failure ${attempt}` });
    }
    const paused = db.getRoutine(routine.id)!;
    assert.equal(paused.enabled, false);
    assert.equal(paused.consecutiveFailures, 3);
    assert.match(paused.pausedReason || "", /three consecutive failures/);
    assert.equal(db.listAutomationEvents(routine.id).filter((event) => event.status === "failed").length, 3);
    assert.ok(db.listAutomationAlerts().some((alert) => alert.kind === "failure" && /paused/i.test(alert.message)));
    db.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rate limits event floods without starting extra work", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-automation-rate-test-"));
  try {
    const db = new OpenBotDatabase(root);
    const routine = db.createRoutine({ name: "Webhook pulse", botId: "scout", threadId: "bot-scout", prompt: "Check the pulse.", intervalMinutes: 60, triggerType: "webhook", webhookSecret: "secret" });
    const accepted = db.receiveAutomationEvent({ routine, source: "webhook", externalId: "one", dedupeKey: "webhook:one", payloadSummary: "one", payload: {}, rateLimit: 1 });
    const limited = db.receiveAutomationEvent({ routine, source: "webhook", externalId: "two", dedupeKey: "webhook:two", payloadSummary: "two", payload: {}, rateLimit: 1 });
    assert.equal(accepted.rateLimited, false);
    assert.equal(limited.rateLimited, true);
    assert.equal(limited.event.status, "rate_limited");
    assert.ok(db.listAutomationAlerts().some((alert) => alert.kind === "rate_limit"));
    db.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("keeps learned skills globally discoverable with unique slash commands", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-skills-test-"));
  try {
    const db = new OpenBotDatabase(root);
    const firstSlug = db.nextWorkflowSlug("nova", "Morning brief");
    const first = db.saveWorkflow({ botId: "nova", name: "Morning brief", startUrl: "https://example.com", steps: [{ type: "navigate" }], skillPath: "/tmp/morning-brief/SKILL.md", skillSlug: firstSlug });
    const secondSlug = db.nextWorkflowSlug("pixel", "Morning brief");
    const second = db.saveWorkflow({ botId: "pixel", name: "Morning brief", startUrl: "https://example.org", steps: [], skillPath: "/tmp/morning-brief-pixel/SKILL.md", skillSlug: secondSlug });
    assert.equal(first.skillSlug, "morning-brief");
    assert.equal(second.skillSlug, "morning-brief-pixel");
    assert.equal(db.getState("team-room").workflows.length, 2);
    const revised = db.updateWorkflowRecord(first.id, { name: "Daily brief", description: "A clearer brief.", instructions: "Gather and verify today's updates.", startUrl: "https://example.net", skillSlug: "daily-brief", skillPath: "/tmp/daily-brief/SKILL.md" });
    assert.equal(revised?.skillSlug, "daily-brief");
    assert.equal(revised?.version, 2);
    assert.equal(db.listWorkflowVersions(first.id).length, 2);
    assert.equal(db.getWorkflowVersion(first.id, 1)?.name, "Morning brief");
    assert.equal(db.deleteWorkflowRecord(second.id)?.botId, "pixel");
    assert.equal(db.listWorkflows().length, 1);
    db.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("keeps approvals pending across a full database restart", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-approval-test-"));
  try {
    const first = new OpenBotDatabase(root);
    const run = first.createRun({
      threadId: "bot-nova", botId: "nova", prompt: "Delete a draft", status: "awaiting_approval", approvalReason: "This may delete files or data.",
    });
    assert.ok(run.approvalId);
    first.close();
    const reopened = new OpenBotDatabase(root);
    assert.equal(reopened.listApprovals().length, 1);
    assert.equal(reopened.listApprovals()[0]?.status, "pending");
    assert.equal(reopened.getRun(run.id)?.status, "awaiting_approval");
    assert.equal(reopened.getRun(run.id)?.task.stage, "waiting");
    reopened.decideApproval(run.approvalId!, "approved");
    assert.equal(reopened.getRun(run.id)?.status, "queued");
    assert.equal(reopened.getRun(run.id)?.task.stage, "working");
    assert.equal(reopened.cancelRun(run.id)?.status, "cancelled");
    assert.equal(reopened.listApprovals().length, 0);
    reopened.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("keeps a task contract, advances its checklist, and records verification", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-completion-test-"));
  try {
    const first = new OpenBotDatabase(root);
    const run = first.createRun({
      threadId: "bot-nova",
      botId: "nova",
      prompt: "Create a launch brief, review it, and verify that every required section is present.",
      status: "queued",
    });
    assert.equal(run.task.tracked, true);
    assert.equal(run.task.stage, "queued");

    first.startRunTask(run.id);
    const planned = first.setRunTaskPlan(run.id, {
      goal: "Create a launch-ready brief",
      deliverable: "A reviewed Markdown brief",
      requiredApps: ["computer"],
      approvalBoundary: "Do not publish anything",
      steps: ["Draft the brief", "Review every section", "Deliver the final file"],
    });
    assert.equal(planned?.steps[0]?.status, "active");
    assert.equal(planned?.requiredApps[0], "computer");

    const afterDraft = first.updateRunTaskStep(run.id, 1, "completed", "Brief saved");
    assert.equal(afterDraft?.steps[1]?.status, "active");
    first.updateRunTaskStep(run.id, 2, "completed", "All sections present");
    first.updateRunTaskStep(run.id, 3, "completed", "Final path confirmed");
    const checked = first.verifyRunTask(run.id, {
      status: "passed",
      summary: "The brief was reopened and all required sections were found.",
      checks: [{ label: "Required headings are present", passed: true }, { label: "Final file can be read", passed: true }],
    });
    assert.equal(checked?.verificationStatus, "passed");
    first.updateRun(run.id, { status: "completed", finishedAt: new Date().toISOString() });
    first.finishRunTask(run.id, "completed");
    first.close();

    const reopened = new OpenBotDatabase(root);
    const persisted = reopened.getRun(run.id)!;
    assert.equal(persisted.task.stage, "done");
    assert.equal(persisted.task.verificationStatus, "passed");
    assert.equal(persisted.task.steps.every((step) => step.status === "completed"), true);
    assert.equal(persisted.task.verificationChecks.length, 2);
    reopened.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("keeps casual conversation lightweight until it becomes a real job", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-casual-test-"));
  try {
    const db = new OpenBotDatabase(root);
    const run = db.createRun({ threadId: "bot-pixel", botId: "pixel", prompt: "Hello!", status: "queued" });
    assert.equal(run.task.tracked, false);
    assert.equal(run.task.steps.length, 0);
    const planned = db.setRunTaskPlan(run.id, { goal: "Help with a concrete request", deliverable: "A checked result", steps: ["Do it", "Check it"] });
    assert.equal(planned?.tracked, true);
    assert.equal(planned?.steps.length, 2);
    db.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("finds an active run and remembers which task a new direction replaced", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-steering-test-"));
  try {
    const db = new OpenBotDatabase(root);
    const first = db.createRun({ threadId: "bot-nova", botId: "nova", prompt: "Research the launch market", status: "queued" });
    db.updateRun(first.id, { status: "running", startedAt: new Date().toISOString() });
    assert.equal(db.runningRun("bot-nova", "nova")?.id, first.id);
    const redirected = db.createRun({ threadId: "bot-nova", botId: "nova", prompt: "Also compare pricing", status: "queued", steeredFromRunId: first.id });
    assert.equal(redirected.steeredFromRunId, first.id);
    assert.equal(redirected.task.tracked, true);
    assert.equal(db.runningRun("bot-pixel", "nova"), null);
    db.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("does not label a failed verification check as fully passed", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-verification-test-"));
  try {
    const db = new OpenBotDatabase(root);
    const run = db.createRun({ threadId: "bot-scout", botId: "scout", prompt: "Create and verify a short report", status: "queued" });
    db.setRunTaskPlan(run.id, { goal: "Create a checked report", deliverable: "One report", steps: ["Create report", "Check report"] });
    const verification = db.verifyRunTask(run.id, { status: "passed", summary: "One check still failed.", checks: [{ label: "Report exists", passed: true }, { label: "Report opens", passed: false }] });
    assert.equal(verification?.verificationStatus, "partial");
    assert.equal(verification?.steps.some((step) => step.status !== "completed"), true);
    db.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("blocks work after a bot reaches its weekly budget", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-budget-test-"));
  try {
    const db = new OpenBotDatabase(root);
    db.updateBot("nova", { weeklyTokenBudget: 1 });
    const run = db.createRun({ threadId: "bot-nova", botId: "nova", prompt: "test", status: "queued" });
    db.updateRun(run.id, { inputTokens: 2 });
    assert.deepEqual(db.budgetAvailable("nova"), { allowed: false, used: 2, budget: 1 });
    db.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("stores provider runtimes and bounded teammate signals", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-team-test-"));
  try {
    const db = new OpenBotDatabase(root);
    const provider = db.upsertProvider({ id: "local-claude", name: "Claude", provider: "claude", authMode: "subscription", runtime: "claude_code" });
    assert.equal(provider.runtime, "claude_code");

    const parent = db.createRun({ threadId: "team-room", botId: "nova", prompt: "Coordinate this", status: "queued" });
    const child = db.createRun({ threadId: "team-room", botId: "scout", prompt: "Check the details", status: "queued", parentRunId: parent.id });
    db.markRunConsultationPending(parent.id);
    assert.equal(db.getRun(parent.id)?.consultationPending, true);
    assert.equal(db.pauseRunForConsultation(parent.id)?.status, "waiting_for_teammate");
    assert.equal(db.runningRun("team-room", "nova")?.id, parent.id);
    assert.equal(db.hasPendingChildRuns(parent.id), true);
    assert.equal(db.readyConsultationCoordinators().length, 0);
    assert.equal(db.runDepth(child.id), 1);
    assert.equal(db.rootRunId(child.id), parent.id);
    assert.equal(db.descendantRunCount(child.id), 2);

    const signal = db.addAgentMessage({ threadId: "team-room", fromBotId: "nova", toBotId: "scout", body: "Verify the checklist", kind: "question", expectsReply: true, runId: parent.id, hopCount: 1, dedupeKey: "one-question" });
    assert.equal(signal?.toBotName, "Scout");
    assert.equal(db.hasAgentMessage(parent.id, "nova", "scout"), true);
    assert.equal(db.hasAgentMessage(parent.id, "scout", "nova"), false);
    assert.equal(db.addAgentMessage({ threadId: "team-room", fromBotId: "nova", toBotId: "scout", body: "Verify the checklist", kind: "question", expectsReply: true, runId: parent.id, hopCount: 1, dedupeKey: "one-question" }), null);
    assert.equal(db.listAgentInbox("scout", "team-room").length, 1);
    db.updateRun(child.id, { status: "completed", finishedAt: new Date().toISOString() });
    assert.equal(db.hasPendingChildRuns(parent.id), false);
    assert.equal(db.readyConsultationCoordinators()[0]?.id, parent.id);
    const resumed = db.resumeRunAfterConsultation(parent.id, "Give one combined answer");
    assert.equal(resumed?.status, "queued");
    assert.equal(resumed?.consultationPending, false);
    assert.equal(resumed?.prompt, "Give one combined answer");
    db.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("keeps uploaded files private until they are claimed by a message", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-attachment-test-"));
  try {
    const db = new OpenBotDatabase(root);
    const id = "attachment-test-id", directory = path.join(db.attachmentsDir, id), storagePath = path.join(directory, "brief.md");
    mkdirSync(directory, { recursive: true });
    writeFileSync(storagePath, "# Launch brief\n");
    const attachment = db.createAttachment({ threadId: "team-room", name: "brief.md", mime: "text/markdown", size: 15, storagePath });
    assert.equal(attachment.messageId, null);
    const message = db.addMessage({ threadId: "team-room", senderType: "user", senderId: null, body: "@nova review this" });
    assert.equal(db.claimAttachments([attachment.id], message.id, "team-room").length, 1);
    assert.equal(db.listMessages("team-room").find((item) => item.id === message.id)?.attachments[0]?.name, "brief.md");
    assert.throws(() => db.claimAttachments([attachment.id], message.id, "team-room"));
    db.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("encrypts Google credentials and keeps Gmail access separate for every teammate", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-connector-test-"));
  try {
    const db = new OpenBotDatabase(root);
    const oldFingerprint = db.botSessionFingerprint("pixel");
    const oldRun = db.createRun({ threadId: "bot-pixel", botId: "pixel", prompt: "Before connection", status: "completed" });
    db.updateRun(oldRun.id, { sessionId: "old-session" });
    db.rememberSessionCapabilities("old-session", oldFingerprint);
    assert.equal(db.previousSession("bot-pixel", "pixel", oldFingerprint), "old-session");
    db.configureGoogleConnector({ clientId: "desktop-client.apps.googleusercontent.com", clientSecret: "google-secret-example" });
    const connection = db.completeGoogleConnector({ accessToken: "access-token-example", refreshToken: "refresh-token-example", expiresAt: new Date(Date.now() + 3_600_000).toISOString(), scopes: ["gmail.readonly", "gmail.send"], accountEmail: "owner@example.com" });
    assert.equal(connection.connected, true);
    assert.equal(connection.accountEmail, "owner@example.com");
    assert.deepEqual(db.listBotConnectorAccess().filter((access) => access.botId === "pixel").map((access) => access.service), ["gmail", "google-drive", "google-calendar"]);
    const connectedFingerprint = db.botSessionFingerprint("pixel");
    assert.notEqual(connectedFingerprint, oldFingerprint);
    assert.equal(db.previousSession("bot-pixel", "pixel", connectedFingerprint), null);
    assert.match(connectedAppsText(db, db.getBot("pixel")!), /Gmail search and reading are available now/);
    assert.deepEqual(db.setBotConnectorAccess("nova", { canRead: true, canSend: false }), { botId: "nova", connectorId: "google-workspace", service: "gmail", canRead: true, canSend: false, updatedAt: db.getBotConnectorAccess("nova")?.updatedAt });
    db.addConnectorEvent({ botId: "nova", action: "gmail_read", status: "completed", summary: "Nova read a launch update" });
    assert.equal(db.listConnectorEvents()[0]?.botName, "Nova");
    db.close();
    const stored = readFileSync(path.join(root, ".openbot", "openbot.sqlite"));
    assert.equal(stored.includes(Buffer.from("google-secret-example")), false);
    assert.equal(stored.includes(Buffer.from("access-token-example")), false);
    assert.equal(stored.includes(Buffer.from("refresh-token-example")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("encrypts reusable OAuth connectors and revokes stale model capabilities", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-oauth-connectors-test-"));
  try {
    const db = new OpenBotDatabase(root), before = db.botSessionFingerprint("nova");
    db.configureOAuthConnector({ id: "slack", kind: "slack_oauth", name: "Slack", clientId: "slack-client", clientSecret: "slack-secret-private" });
    db.completeOAuthConnector("slack", { bot: { accessToken: "slack-bot-private" }, user: { accessToken: "slack-user-private" }, teamId: "T1", teamName: "Studio" }, "Studio", ["search:read", "chat:write"]);
    db.configureOAuthConnector({ id: "notion", kind: "notion_oauth", name: "Notion", clientId: "notion-client", clientSecret: "notion-secret-private" });
    db.completeOAuthConnector("notion", { accessToken: "notion-token-private", workspaceId: "W1", workspaceName: "Notes", botId: "B1" }, "Notes", ["read_content", "insert_content"]);
    db.setBotConnectorAccess("nova", { canRead: true, canSend: true }, "slack", "slack");
    db.setBotConnectorAccess("nova", { canRead: true, canSend: false }, "notion", "notion");
    assert.match(connectedAppsText(db, db.getBot("nova")!), /Slack search and conversation reading are available now/);
    assert.match(connectedAppsText(db, db.getBot("nova")!), /Notion search and page reading are available now/);
    assert.notEqual(db.botSessionFingerprint("nova"), before);
    assert.equal(db.disconnectOAuthConnector("slack")?.connected, false);
    assert.equal(db.getBotConnectorAccess("nova", "notion", "notion")?.canSend, false);
    db.close();
    const stored = readFileSync(path.join(root, ".openbot", "openbot.sqlite"));
    for (const secret of ["slack-secret-private", "slack-bot-private", "slack-user-private", "notion-secret-private", "notion-token-private"]) assert.equal(stored.includes(Buffer.from(secret)), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

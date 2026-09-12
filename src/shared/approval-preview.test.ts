import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { approvalPreview as buildPreview } from "./approval-preview";
import type { Approval } from "./types";
import type { CodePublicationReview } from "./code-publication";

const approval: Approval = {
  id: "approval",
  runId: "run",
  botId: "bot",
  botName: "Robin",
  kind: "external",
  reason: "Sending email needs your review",
  actionLabel: "Send the proposed email",
  status: "pending",
  createdAt: "2026-09-06",
  decidedAt: null,
};
const run = { id: "run", botId: "bot", prompt: "Draft an email for review." };
const approvalPreview = (...args: Parameters<typeof buildPreview>) =>
  buildPreview(args[0], args[1], args[2], "fixture@example.test");

test('browser review shows the exact control and visible fields without pretending an API account is the browser account', () => {
  const input = { selector: '#save', targetFingerprint: 'a'.repeat(64), targetReview: { url: 'https://calendar.google.com/', label: 'Save', control: 'button', complete: true, fields: [{ label: 'Title', value: 'Dinner' }, { label: 'Time', value: '21:00 Europe/Brussels' }] } };
  const action = { type: 'browser_click', botId: 'bot', args: input };
  const browserApproval = { ...approval, kind: 'browser' as const };
  const result = buildPreview(browserApproval, run, action);
  assert.equal(result.canApprove, true); assert.equal(result.limitation, null);
  assert.ok(result.fields.some(field => field.label === 'On the page: Title' && field.value === 'Dinner'));
  assert.ok(result.fields.some(field => field.label === 'Private browser'));
  assert.equal(result.fields.some(field => field.label === 'Connected account'), false);
  for (const args of [{ selector: '#save', targetFingerprint: input.targetFingerprint }, { ...input, targetReview: { ...input.targetReview, complete: false } }, { ...input, targetReview: { ...input.targetReview, fields: [{ label: 'password', value: 'password=secret' }] } }, { ...input, targetFingerprint: 'invalid' }, { ...input, value: 'unreviewed' }]) assert.equal(buildPreview(browserApproval, run, { ...action, args }).canApprove, false);
  const typed = buildPreview(browserApproval, run, { ...action, type: 'browser_type', args: { ...input, value: 'A complete replacement' } });
  assert.equal(typed.canApprove, true); assert.ok(typed.fields.some(field => field.value === 'A complete replacement'));
});

test('browser disclosure review stays approval-gated but gives a truthful one-click preview without form fields', () => {
  const input = {
    selector: '#browse-channels',
    targetFingerprint: 'b'.repeat(64),
    targetReview: {
      url: 'https://app.slack.com/client/workspace',
      label: 'Browse channels',
      control: 'button',
      fields: [],
      contextScope: 'navigation' as const,
      disclosure: { expanded: false as const, controls: ['channel-browser'] },
      complete: true as const,
    },
  };
  const result = buildPreview({ ...approval, kind: 'browser' }, run, { type: 'browser_click', botId: 'bot', args: input });
  assert.equal(result.canApprove, true);
  assert.equal(result.limitation, null);
  assert.match(result.fields.find(field => field.label === 'Page state')?.value || '', /does not prove the click is read-only/);
  assert.match(result.fields.find(field => field.label === 'Review scope')?.value || '', /Unrelated page content is excluded/);
  assert.match(result.fields.find(field => field.label === 'Effect')?.value || '', /may run website code or affect content outside this navigation area/);
  assert.match(result.fields.find(field => field.label === 'Effect')?.value || '', /excluded page content is not/);

  const generic = buildPreview({ ...approval, kind: 'browser' }, run, { type: 'browser_click', botId: 'bot', args: { ...input, targetReview: { ...input.targetReview, disclosure: null } } });
  assert.equal(generic.canApprove, true, 'a precise non-form control review does not require visible fields');
  assert.equal(generic.fields.some(field => field.label === 'Page state'), false);

  const privateNavigation = buildPreview({ ...approval, kind: 'browser' }, run, { type: 'browser_click', botId: 'bot', args: { ...input, targetReview: { ...input.targetReview, complete: false, fields: [{ label: 'Password', value: '[Private field hidden]' }] } } });
  assert.equal(privateNavigation.canApprove, false, 'private navigation fields remain fail-closed');
  const oversizedPage = buildPreview({ ...approval, kind: 'browser' }, run, { type: 'browser_click', botId: 'bot', args: { ...input, targetReview: { ...input.targetReview, contextScope: 'page', disclosure: null, complete: false, fields: [{ label: 'Editor', value: 'x'.repeat(2000) }] } } });
  assert.equal(oversizedPage.canApprove, false, 'an incomplete body fallback remains blocked');
  const form = buildPreview({ ...approval, kind: 'browser' }, run, { type: 'browser_click', botId: 'bot', args: { ...input, targetReview: { ...input.targetReview, contextScope: 'form', disclosure: null, fields: [{ label: 'Title', value: 'Project charter' }] } } });
  assert.equal(form.canApprove, true);
  assert.ok(form.fields.some(field => field.label === 'On the page: Title' && field.value === 'Project charter'), 'form fields retain full review priority');

  for (const targetReview of [
    { ...input.targetReview, disclosure: { expanded: true, controls: ['channel-browser'] } },
    { ...input.targetReview, disclosure: { expanded: false, controls: [] } },
    { ...input.targetReview, contextScope: 'unknown' },
    { ...input.targetReview, label: '' },
  ]) assert.equal(buildPreview({ ...approval, kind: 'browser' }, run, { type: 'browser_click', botId: 'bot', args: { ...input, targetReview } }).canApprove, false);
});

test('browser navigation allowance is a strict optional offer on an exact click review', () => {
  const input = {
    selector: '#search',
    targetFingerprint: 'c'.repeat(64),
    targetReview: { url: 'https://app.example.test/workspace', label: 'Search', control: 'button', fields: [], contextScope: 'navigation' as const, complete: true as const },
    navigationAllowanceOffer: { version: 1 as const, origin: 'https://app.example.test', maxClicks: 12 as const, expiresInMinutes: 15 as const },
  };
  const browserApproval = { ...approval, kind: 'browser' as const };
  const result = buildPreview(browserApproval, run, { type: 'browser_click', botId: 'bot', args: input });
  assert.equal(result.canApprove, true);
  assert.deepEqual(result.browserNavigationAllowance, input.navigationAllowanceOffer);
  for (const navigationAllowanceOffer of [
    { ...input.navigationAllowanceOffer, maxClicks: 99 },
    { ...input.navigationAllowanceOffer, expiresInMinutes: 60 },
    { ...input.navigationAllowanceOffer, origin: 'https://user:secret@app.example.test' },
    { ...input.navigationAllowanceOffer, extra: true },
  ]) assert.equal(buildPreview(browserApproval, run, { type: 'browser_click', botId: 'bot', args: { ...input, navigationAllowanceOffer } }).canApprove, false);
  assert.equal(buildPreview(browserApproval, run, { type: 'browser_type', botId: 'bot', args: { ...input, value: 'query' } }).canApprove, false, 'typing can never carry a navigation offer');
});

function publicationFixture() {
  const snapshot: CodePublicationReview = {
    version: 1, projectId: "project", projectName: "Orders", ownerId: "owner", botId: "bot", runId: "run",
    projectRoot: "/private/source", workspaceRoot: "/private/task", repository: "fixture/orders", remoteUrl: "https://github.com/fixture/orders.git",
    branch: "openbot/fix-total", base: "main", headCommit: "a".repeat(40), baseCommit: "b".repeat(40), mergeBaseCommit: "b".repeat(40),
    title: "Fix order totals", body: "Multiply the unit price by the quantity.\nIncludes a regression test.", draft: true,
    files: ["total.js", "total.test.js"], commits: ["a".repeat(40)], diff: "Commit " + "a".repeat(40) + "\nFix order totals\n--- a/total.js\n+++ b/total.js\n-return price;\n+return price * quantity;",
    grant: { canRead: true, canWrite: true, canRun: true, updatedAt: "2026-09-06" },
    reviewerGrant: { canRead: true, canWrite: false, canRun: false, updatedAt: "2026-09-06" },
    checks: [{ id: "check", command: "node --test total.test.js", headCommit: "a".repeat(40), exitCode: 0, finishedAt: "2026-09-06T12:00:00Z", detail: "Two regression tests passed." }],
    review: { id: "review", reviewerRunId: "review-run", reviewerBotId: "reviewer", reviewerBotName: "Moss", headCommit: "a".repeat(40), summary: "The change fixes quantities above one, with regression coverage.", findings: [], createdAt: "2026-09-06T12:01:00Z" },
  };
  return {
    type: "code_publish_pr", botId: "bot", args: {
      projectId: snapshot.projectId, workspaceRunId: snapshot.runId, expectedHeadCommit: snapshot.headCommit,
      title: snapshot.title, body: snapshot.body, base: snapshot.base, draft: snapshot.draft,
      publicationReview: snapshot, publicationIdentity: { host: "github.com", accountLogin: "fixture-owner" },
    },
  };
}

test("pull request approval shows the complete immutable change and pinned destination", () => {
  const action = publicationFixture(), result = buildPreview(approval, run, action, "fixture-owner");
  assert.equal(result.canApprove, true);
  for (const label of ["Connected account", "GitHub host", "Repository", "Project", "Publish branch", "Into branch", "Exact code commit", "Required base commit", "Pull request title", "Pull request description", "Pull request state", "Files in outgoing history", "Commits to upload", "Complete outgoing patch history", "Check 1", "Independent reviewer", "Review of this commit", "Review findings", "Access", "Effect"]) assert(result.fields.some((field) => field.label === label), label);
  assert.equal(result.fields.find((field) => field.label === "Complete outgoing patch history")?.value, action.args.publicationReview.diff);
  assert.match(result.fields.at(-1)!.value, /OpenBot does not merge or deploy; the repository's own automations may run/);
  assert.doesNotMatch(JSON.stringify(result), /\/private\/|ownerId|workspaceRoot/);
});

test("pull request approval fails closed for missing or changed accounts, code and evidence", () => {
  const cases: Array<(action: ReturnType<typeof publicationFixture>) => void> = [
    (action) => { action.args.publicationIdentity.accountLogin = "another-owner"; },
    (action) => { action.args.publicationIdentity.host = "example.com"; },
    (action) => { action.args.publicationReview.diff = ""; },
    (action) => { action.args.publicationReview.diff = "x".repeat(30_001); },
    (action) => { action.args.publicationReview.diff = "password=secret-value\n"; },
    (action) => { action.args.publicationReview.checks = []; },
    (action) => { action.args.publicationReview.checks[0]!.headCommit = "c".repeat(40); },
    (action) => { action.args.publicationReview.review.headCommit = "c".repeat(40); },
    (action) => { action.args.publicationReview.review.reviewerBotId = "bot"; },
    (action) => { action.args.publicationReview.grant.canWrite = false; },
    (action) => { action.args.publicationReview.grant.canRun = false; },
    (action) => { action.args.publicationReview.runId = "another-run"; },
    (action) => { action.args.publicationReview.remoteUrl = "https://github.com/another/orders.git"; },
    (action) => { action.args.expectedHeadCommit = "d".repeat(40); },
    (action) => { action.args.title = "A different title"; },
    (action) => { action.args.body = "Different content"; },
    (action) => { action.args.base = "release"; },
    (action) => { action.args.draft = false; },
  ];
  for (const change of cases) {
    const action = publicationFixture(); change(action);
    const result = buildPreview(approval, run, action, "fixture-owner");
    assert.equal(result.canApprove, false, change.toString());
    assert.doesNotMatch(JSON.stringify(result), /secret-value/);
  }
  assert.equal(buildPreview(approval, run, publicationFixture()).canApprove, false);
  assert.equal(buildPreview(approval, run, { type: "code_publish_pr", botId: "bot", args: { title: "Old approval", body: "No snapshot" } }, "fixture-owner").canApprove, false);
});

test("GitHub issue review requires the same pinned account and shows its host", () => {
  const action = { type: "github_issue_create", botId: "bot", args: { repository: "fixture/orders", title: "Quantity regression", body: "Orders above quantity one are undercounted.", publicationIdentity: { host: "github.com", accountLogin: "fixture-owner" } } };
  const result = buildPreview(approval, run, action, "fixture-owner");
  assert.equal(result.canApprove, true);
  assert.deepEqual(result.fields.map((field) => field.label), ["Connected account", "GitHub host", "Repository", "Issue title", "Issue description"]);
  assert.equal(buildPreview(approval, run, action, "another-owner").canApprove, false);
  assert.equal(buildPreview(approval, run, { ...action, args: { ...action.args, publicationIdentity: undefined } }, "fixture-owner").canApprove, false);
});

test("email preview includes all executed message fields but no credential metadata", () => {
  const result = approvalPreview(approval, run, {
    type: "gmail_send",
    botId: "bot",
    secret: "do-not-expose",
    args: {
      to: "person@example.test",
      cc: "copy@example.test",
      subject: "Agenda",
      body: "Shall we meet?",
      token: "do-not-expose",
    },
  });
  assert.equal(result.canApprove, true);
  assert.deepEqual(
    result.fields.map(({ label }) => label),
    ["Connected account", "To", "Cc", "Subject", "Message", "Email format"],
  );
  assert.equal(JSON.stringify(result).includes("do-not-expose"), false);
});
test("sensitive content is masked and compact approval becomes unavailable", () => {
  const result = approvalPreview(approval, run, {
    type: "gmail_send",
    botId: "bot",
    args: {
      to: "person@example.test",
      subject: "Credentials",
      body: "password=very-secret\nBearer abcdefghijklmnop",
    },
  });
  assert.equal(result.canApprove, false);
  assert.equal(JSON.stringify(result).includes("very-secret"), false);
  assert.equal(JSON.stringify(result).includes("abcdefghijklmnop"), false);
  assert.match(result.limitation!, /hidden/);
});
test("unknown, browser, terminal and mismatched actions cannot be generically approved", () => {
  for (const type of [
    "bash",
    "browser_click",
    "connected_call",
    "new_future_tool",
  ]) {
    const result = approvalPreview(approval, run, {
      type,
      botId: "bot",
      args: { command: "private command", token: "secret" },
    });
    assert.equal(result.canApprove, false);
    assert.deepEqual(result.fields, []);
  }
  assert.equal(
    approvalPreview(
      approval,
      { ...run, botId: "other" },
      { type: "gmail_send", botId: "bot" },
    ).canApprove,
    false,
  );
});
test("oversized or malformed action content is not silently truncated for approval", () => {
  for (const body of [
    "x".repeat(30_001),
    { text: "not a plain string" },
    undefined,
  ]) {
    assert.equal(
      approvalPreview(approval, run, {
        type: "gmail_send",
        botId: "bot",
        args: { to: "a@example.test", subject: "Hi", body },
      }).canApprove,
      false,
    );
  }
});
test("calendar preview includes attendees, location, time offsets and meeting creation", () => {
  const result = approvalPreview(approval, run, {
    type: "google_calendar_create",
    botId: "bot",
    args: {
      title: "Review",
      start: "2026-09-07T09:00:00+02:00",
      end: "2026-09-07T10:00:00+02:00",
      description: "Read the proposal",
      location: "Office",
      attendees: ["a@example.test"],
      addGoogleMeet: true,
    },
  });
  assert.equal(result.canApprove, true);
  assert.equal(
    result.fields.find(({ label }) => label === "Invitees")?.value,
    "a@example.test",
  );
  assert.equal(
    result.fields.find(({ label }) => label === "Google Meet link")?.value,
    "Create",
  );
  assert.match(
    result.fields.find(({ label }) => label === "Invitations")!.value,
    /all listed/,
  );
  assert.match(
    result.fields.find(({ label }) => label === "Calendar")!.value,
    /Primary/,
  );
});
test("prompt-only task approval displays the full prompt and never approves a resolved decision", () => {
  const result = approvalPreview({ ...approval, kind: "prompt" }, run, {
    type: "run",
  });
  assert.equal(result.canApprove, true);
  assert.equal(result.fields[0]?.value, run.prompt);
  assert.equal(
    approvalPreview({ ...approval, kind: "prompt", status: "denied" }, run, {
      type: "run",
    }).canApprove,
    false,
  );
});

test("unidentified connected account cannot authorize an otherwise complete message", () => {
  assert.equal(
    buildPreview(approval, run, {
      type: "gmail_send",
      botId: "bot",
      args: { to: "a@example.test", subject: "Hello", body: "Hi" },
    }).canApprove,
    false,
  );
});

test("calendar times without an explicit time zone are not offered for compact approval", () => {
  assert.equal(
    approvalPreview(approval, run, {
      type: "google_calendar_create",
      botId: "bot",
      args: {
        title: "Review",
        start: "2026-09-07T09:00:00",
        end: "2026-09-07T10:00:00",
      },
    }).canApprove,
    false,
  );
});

test("supported executor argument sets match the complete projected review contract", () => {
  // A new executor input must get a review field (or disable compact approval).
  // This complements the executable projection tests; it is not a live send.
  const source = readFileSync(
    new URL("../server/index.ts", import.meta.url),
    "utf8",
  );
  const executor = source.slice(
    source.indexOf("async function performApprovedAction"),
    source.indexOf("function connectorActionFor"),
  );
  const expected: Record<string, string[]> = {
    gmail_send: ["to", "cc", "subject", "body"],
    google_drive_create: ["name", "content", "mimeType"],
    google_calendar_create: [
      "title",
      "start",
      "end",
      "description",
      "location",
      "attendees",
      "addGoogleMeet",
    ],
    slack_post: ["channelId", "text", "threadTimestamp"],
    github_issue_create: ["repository", "title", "body", "publicationIdentity"],
    notion_update: ["pageId", "content", "heading"],
    todoist_task_create: ["content", "description", "dueString", "projectId", "priority"],
    mac_organize: ["moves"],
  };
  for (const [type, keys] of Object.entries(expected)) {
    const start = executor.indexOf(`if (parsed.data.type === "${type}")`);
    assert(start >= 0);
    const next = executor.indexOf("\n  if (", start + 1);
    const block = executor.slice(start, next < 0 ? undefined : next);
    const consumed = [
      ...new Set(
        [...block.matchAll(/\bargs\.([A-Za-z]+)/g)].map((match) => match[1]!),
      ),
    ];
    assert.deepEqual(
      consumed.sort(),
      [...keys].sort(),
      `Review projection needs updating for ${type}`,
    );
  }
});

test("Notion append reviews the exact page, heading, full content and account", () => {
  const result = approvalPreview(approval, run, { type: "notion_update", botId: "bot", args: { pageId: "page-123", heading: "Decisions", content: "First paragraph.\n\nSecond paragraph.", accessToken: "private metadata" } });
  assert.equal(result.canApprove, true);
  assert.deepEqual(result.fields.slice(0, 4), [
    { label: "Connected account", value: "fixture@example.test" },
    { label: "Page ID or link", value: "page-123" },
    { label: "Heading", value: "Decisions" },
    { label: "Content to append", value: "First paragraph.\n\nSecond paragraph." },
  ]);
  assert.match(result.fields[4]!.value, /not replaced/);
  assert.doesNotMatch(JSON.stringify(result), /private metadata/);
  assert.equal(approvalPreview(approval, run, { type: "notion_update", botId: "bot", args: { pageId: "page-123", heading: null, content: "Note" } }).canApprove, true);
});

test("Todoist reviews project, literal due phrase, all content and exact priority", () => {
  const result = approvalPreview(approval, run, { type: "todoist_task_create", botId: "bot", args: { content: "Review the proposal", description: "Read both sections", projectId: "project-45", dueString: "tomorrow at 9am", priority: 4 } });
  assert.equal(result.canApprove, true);
  assert.deepEqual(result.fields.slice(0, 7), [
    { label: "Connected account", value: "fixture@example.test" },
    { label: "Task title", value: "Review the proposal" },
    { label: "Description", value: "Read both sections" },
    { label: "Project ID", value: "project-45" },
    { label: "Due-date phrase", value: "tomorrow at 9am" },
    { label: "Priority", value: "4 — Urgent" },
    { label: "Date interpretation", value: "Todoist interprets the due-date phrase using the connected account's settings. This review does not convert it into a verified date or time." },
  ]);
  const defaults = approvalPreview(approval, run, { type: "todoist_task_create", botId: "bot", args: { content: "Read" } });
  assert.equal(defaults.canApprove, true);
  assert.match(defaults.fields.find(field => field.label === "Project ID")!.value, /default inbox/);
  assert.match(defaults.fields.find(field => field.label === "Priority")!.value, /default \(normal\)/);
});

test("new connected actions fail closed for missing identity and malformed optional fields", () => {
  const cases = [
    { type: "notion_update", valid: { pageId: "page-123", content: "A note" }, bad: [{ heading: 7 }, { heading: {} }, { heading: "x".repeat(201) }, { content: " " }, { content: "x".repeat(8_001) }, { pageId: null }] },
    { type: "todoist_task_create", valid: { content: "A task" }, bad: [{ description: null }, { description: [] }, { dueString: 123 }, { projectId: false }, { priority: "4" }, { priority: 1.5 }, { priority: 0 }, { priority: 5 }, { priority: null }, { priority: Number.NaN }, { content: "" }] },
  ];
  for (const entry of cases) {
    assert.equal(buildPreview(approval, run, { type: entry.type, botId: "bot", args: entry.valid }).canApprove, false, `${entry.type} needs account identity`);
    for (const patch of entry.bad) assert.equal(approvalPreview(approval, run, { type: entry.type, botId: "bot", args: { ...entry.valid, ...patch } }).canApprove, false, `${entry.type}: ${JSON.stringify(patch)}`);
  }
});

test("Mac organization reviews every exact source/destination and never invents a connected account", () => {
  const result = buildPreview(approval, run, { type: "mac_organize", botId: "bot", args: { moves: [{ from: "Desktop/report.pdf", to: "Documents/Reports/report.pdf" }, { from: "/Users/fixture/Desktop/note.txt", to: "~/Documents/note.txt" }], token: "private metadata" } });
  assert.equal(result.canApprove, true);
  assert.deepEqual(result.fields.slice(2, 6), [
    { label: "File 1 · From", value: "Desktop/report.pdf" },
    { label: "File 1 · To", value: "Documents/Reports/report.pdf" },
    { label: "File 2 · From", value: "/Users/fixture/Desktop/note.txt" },
    { label: "File 2 · To", value: "~/Documents/note.txt" },
  ]);
  assert.match(result.fields[0]!.value, /Mac running/);
  assert.match(result.fields.at(-1)!.value, /checked again/);
  assert.equal(result.fields.some(field => field.label === "Connected account"), false);
  assert.doesNotMatch(JSON.stringify(result), /private metadata/);
  const hundred = Array.from({ length: 100 }, (_, i) => ({ from: `Desktop/${i}.txt`, to: `Documents/${i}.txt` }));
  const maximum = buildPreview(approval, run, { type: "mac_organize", botId: "bot", args: { moves: hundred } });
  assert.equal(maximum.canApprove, true);
  assert.equal(maximum.fields.filter(field => field.label.startsWith("File ")).length, 200);
});

test("Mac move review never authorizes incomplete, oversized, masked or malformed paths", () => {
  for (const moves of [undefined, {}, [], [null], [{ from: "Desktop/a", to: 1 }], [{ from: "", to: "Documents/a" }], [{ from: "Desktop/a\nDocuments/b", to: "Documents/a" }], [{ from: "x".repeat(1_001), to: "Documents/a" }], Array.from({ length: 101 }, () => ({ from: "Desktop/a", to: "Documents/a" }))]) {
    assert.equal(buildPreview(approval, run, { type: "mac_organize", botId: "bot", args: { moves } }).canApprove, false);
  }
  const masked = buildPreview(approval, run, { type: "mac_organize", botId: "bot", args: { moves: [{ from: "Desktop/password=privatevalue", to: "Documents/a" }] } });
  assert.equal(masked.canApprove, false);
  assert.doesNotMatch(JSON.stringify(masked), /privatevalue/);
});

test("each new review stays bound to the exact pending approval, run and teammate", () => {
  const actions = [
    { type: "notion_update", botId: "bot", args: { pageId: "page", content: "Note" } },
    { type: "todoist_task_create", botId: "bot", args: { content: "Task" } },
    { type: "mac_organize", botId: "bot", args: { moves: [{ from: "Desktop/a", to: "Documents/a" }] } },
  ];
  for (const action of actions) {
    assert.equal(approvalPreview(approval, run, action).canApprove, true);
    for (const wrong of [null, { ...run, id: "another-run" }, { ...run, botId: "another-bot" }]) assert.equal(approvalPreview(approval, wrong, action).canApprove, false);
    assert.equal(approvalPreview(approval, run, { ...action, botId: "another-bot" }).canApprove, false);
    for (const status of ["approved", "denied"] as const) assert.equal(approvalPreview({ ...approval, status }, run, action).canApprove, false);
  }
});

test("unsupported and incomplete guidance does not send users to a mythical richer review screen", () => {
  const unsupported = approvalPreview(approval, run, { type: "connected_call", botId: "bot", args: {} });
  assert.match(unsupported.limitation!, /does not have a complete in-app review/);
  assert.doesNotMatch(unsupported.limitation!, /full review screen/);
  const incomplete = approvalPreview(approval, run, { type: "todoist_task_create", botId: "bot", args: {} });
  assert.match(incomplete.limitation!, /Decline this proposal/);
  assert.doesNotMatch(incomplete.limitation!, /full review screen/);
});

test("self-extension review shows the capability, plan and tool effect without a connected account", () => {
  const action = { type: "self_extend", botId: "bot", args: { capability: "Currency converter", plan: "Write a small tool that converts amounts with a public rates feed.", toolName: "currency_converter" } };
  const result = approvalPreview(approval, run, action);
  assert.equal(result.canApprove, true);
  for (const label of ["Missing capability", "Plan for the new tool", "New tool file", "Effect"]) assert(result.fields.some((field) => field.label === label), label);
  assert.equal(result.fields.some((field) => field.label === "Connected account"), false);
  assert.match(result.fields.find((field) => field.label === "Effect")!.value, /coding model/);
  const leaked = approvalPreview(approval, run, { type: "self_extend", botId: "bot", args: { capability: "Converter", plan: "Handle password=hunter2 carefully", toolName: "converter" } });
  assert.equal(leaked.canApprove, false);
  assert.doesNotMatch(JSON.stringify(leaked), /hunter2/);
  assert.equal(approvalPreview(approval, run, { type: "self_extend", botId: "bot", args: { capability: "Converter" } }).canApprove, false);
});

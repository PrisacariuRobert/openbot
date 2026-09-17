import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenBotDatabase } from "./testing/database.js";
import { TodoistConnector, todoistTaskMatchesCreate } from "./todoist.js";
import { ApprovalReviewChangedError, ApprovedConnectorOutcomeUncertainError } from "./approval-review-binding.js";

type LoggedRequest = { method: string; url: string; body: string };

function seedConnected(db: OpenBotDatabase) {
  db.configureOAuthConnector({ id: "todoist", kind: "todoist_oauth", name: "Todoist", clientId: "test-client", clientSecret: "test-secret" });
  db.completeOAuthConnector(
    "todoist",
    { accessToken: "fixture-token", refreshToken: "fixture-refresh", expiresAt: new Date(Date.now() + 3_600_000).toISOString() },
    "robert@example.com",
    ["data:read_write"],
  );
}

async function fixture(
  work: (connector: TodoistConnector, requests: LoggedRequest[], db: OpenBotDatabase) => Promise<void>,
  respond: (method: string, url: string, body: string, db: OpenBotDatabase) => Response | Promise<Response>,
) {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-todoist-identity-"));
  const db = new OpenBotDatabase(root);
  try {
    seedConnected(db);
    const requests: LoggedRequest[] = [];
    const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input), method = String(init?.method || "GET"), body = String(init?.body || "");
      requests.push({ method, url, body });
      return respond(method, url, body, db);
    }) as typeof fetch;
    const connector = new TodoistConnector(db, "http://localhost:4311/api/connectors/todoist/callback", fakeFetch);
    await work(connector, requests, db);
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
}

const createdTask = {
  id: "task-9", content: "Ship OpenBot", description: "Final review",
  project_id: "project-1", priority: 4, due: { date: "2026-09-18" },
  url: "https://app.todoist.com/app/task/task-9",
};

test("complete create response verifies with one POST and no readback", async () => {
  await fixture(async (connector, requests) => {
    const result = await connector.create({ content: "Ship OpenBot", description: "Final review", projectId: "project-1", priority: 4, dueString: "tomorrow" });
    assert.equal(result.recovered, false);
    assert.equal(result.task.id, "task-9");
    assert.equal(result.task.url, "https://app.todoist.com/app/task/task-9");
    assert.deepEqual(requests.map((entry) => entry.method), ["POST"]);
  }, (method) => {
    assert.equal(method, "POST");
    return Response.json(createdTask);
  });
});

test("truncated create response recovers with exactly one readback GET", async () => {
  await fixture(async (connector, requests) => {
    const result = await connector.create({ content: "Ship OpenBot", description: "Final review", projectId: "project-1", priority: 4, dueString: "tomorrow" });
    assert.equal(result.recovered, true);
    assert.equal(result.task.id, "task-9");
    assert.deepEqual(requests.map((entry) => entry.method), ["POST", "GET"]);
    assert.match(requests[1]!.url, /\/api\/v1\/tasks\/task-9$/);
  }, (method) => {
    if (method === "POST") return Response.json({ id: "task-9" });
    return Response.json(createdTask);
  });
});

test("lost create response stays uncertain with no repeat and no blind readback", async () => {
  await fixture(async (connector, requests) => {
    await assert.rejects(connector.create({ content: "Ship OpenBot" }), ApprovedConnectorOutcomeUncertainError);
    assert.deepEqual(requests.map((entry) => entry.method), ["POST"]);
  }, () => {
    throw new Error("Socket closed after Todoist accepted the task");
  });
});

test("mismatched readback never completes and never re-posts", async () => {
  await fixture(async (connector, requests) => {
    await assert.rejects(connector.create({ content: "Ship OpenBot" }), ApprovedConnectorOutcomeUncertainError);
    assert.deepEqual(requests.map((entry) => entry.method), ["POST", "GET"]);
  }, (method) => {
    if (method === "POST") return Response.json({ id: "task-9", content: "Something else" });
    return Response.json({ id: "task-9", content: "Something else" });
  });
});

test("missing readback stays uncertain instead of failing closed or retrying", async () => {
  await fixture(async (connector, requests) => {
    await assert.rejects(connector.create({ content: "Ship OpenBot" }), ApprovedConnectorOutcomeUncertainError);
    assert.deepEqual(requests.map((entry) => entry.method), ["POST", "GET"]);
  }, (method) => {
    if (method === "POST") return Response.json({ id: "task-9", content: "Something else" });
    return Response.json({ error: "Not found" }, { status: 404 });
  });
});

test("account replacement mid-flight aborts before any readback", async () => {
  await fixture(async (connector, requests) => {
    await assert.rejects(connector.create({ content: "Ship OpenBot" }), ApprovalReviewChangedError);
    assert.deepEqual(requests.map((entry) => entry.method), ["POST"]);
  }, (_method, _url, _body, db) => {
    db.completeOAuthConnector(
      "todoist",
      { accessToken: "replacement-token", refreshToken: "replacement-refresh" },
      "someone-else@example.com",
      ["data:read_write"],
    );
    return Response.json(createdTask);
  });
});

test("getTask maps a missing task to null and surfaces other failures", async () => {
  await fixture(async (connector, requests) => {
    assert.equal(await connector.getTask("gone"), null);
    assert.equal((await connector.getTask("task-9"))?.content, "Ship OpenBot");
    await assert.rejects(connector.getTask("flaky"), /could not complete/);
    assert.deepEqual(requests.map((entry) => entry.method), ["GET", "GET", "GET"]);
  }, (_method, url) => {
    if (url.endsWith("/tasks/gone")) return Response.json({ error: "Not found" }, { status: 404 });
    if (url.endsWith("/tasks/flaky")) return Response.json({ error: "boom" }, { status: 500 });
    return Response.json(createdTask);
  });
});

test("matcher binds requested fields and tolerates server defaults", () => {
  const requested = { content: "Ship OpenBot", description: "", dueString: "", projectId: "", priority: 1 };
  const task = { id: "t", content: "Ship OpenBot", description: "", projectId: "inbox", priority: 1, due: null, completed: false, url: "u" };
  assert.equal(todoistTaskMatchesCreate(task, requested), true, "unspecified project takes the server default");
  assert.equal(todoistTaskMatchesCreate({ ...task, content: "Other" }, requested), false);
  assert.equal(todoistTaskMatchesCreate({ ...task, priority: 4 }, requested), false);
  assert.equal(todoistTaskMatchesCreate({ ...task, due: "2026-09-18" }, requested), false, "an unrequested due date must stay absent");
  assert.equal(
    todoistTaskMatchesCreate({ ...task, due: "2026-09-18" }, { ...requested, dueString: "tomorrow" }),
    true,
    "a requested due date is server-normalized, not strictly compared",
  );
  assert.equal(todoistTaskMatchesCreate({ ...task, id: "" }, requested), false);
});

test("task reference binds scope and survives restart with a refreshable state", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-todoist-ref-"));
  let db = new OpenBotDatabase(root);
  try {
    seedConnected(db);
    const version = db.connectorAuthorizationVersion("todoist");
    const run = db.createRun({ threadId: "team-room", botId: "nova", prompt: "Create the follow-up", status: "running" });
    const reviewedFields = { content: "Ship OpenBot", description: "", dueString: "", projectId: "", priority: 4 };
    const saved = db.saveConnectorTaskRef({
      connectorId: "todoist", resourceId: "task-9", account: "robert@example.com", authorizationVersion: version,
      threadId: "team-room", runId: run.id, botId: "nova",
      reviewedFields,
      lastState: { id: "task-9", content: "Ship OpenBot", description: "", projectId: "inbox", priority: 4, due: null, completed: false, url: "https://app.todoist.com/app/task/task-9" },
    });
    assert.equal(saved.account, "robert@example.com");
    assert.equal(saved.authorizationVersion, version);
    assert.deepEqual(saved.reviewedFields, reviewedFields);
    assert.equal(db.getConnectorTaskRef("todoist", "missing"), null, "unknown resources resolve to nothing, never to a title guess");
    db.close();

    db = new OpenBotDatabase(root);
    const after = db.getConnectorTaskRef("todoist", "task-9")!;
    assert.equal(after.runId, run.id);
    assert.equal(after.lastState.content, "Ship OpenBot");
    const refreshed = db.saveConnectorTaskRef({
      connectorId: "todoist", resourceId: "task-9", account: "robert@example.com", authorizationVersion: version,
      threadId: "team-room", runId: run.id, botId: "nova",
      reviewedFields, lastState: { ...after.lastState, completed: true },
    });
    assert.equal(refreshed.lastState.completed, true);
    assert.equal(db.getConnectorTaskRef("todoist", "task-9")?.lastState.completed, true);
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

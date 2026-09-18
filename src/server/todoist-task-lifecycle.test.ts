import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenBotDatabase } from "./testing/database.js";
import {
  TodoistConnector,
  TodoistNotFoundError,
  todoistTaskCompleteInput,
  todoistTaskMatchesUpdate,
  todoistTaskUpdateInput,
} from "./todoist.js";
import { ApprovalReviewChangedError, ApprovedConnectorOutcomeUncertainError } from "./approval-review-binding.js";

type LoggedRequest = { method: string; url: string; body: string };
type TaskRow = Record<string, unknown>;

function seedConnected(db: OpenBotDatabase, expiresAt = new Date(Date.now() + 3_600_000).toISOString()) {
  db.configureOAuthConnector({ id: "todoist", kind: "todoist_oauth", name: "Todoist", clientId: "test-client", clientSecret: "test-secret" });
  db.completeOAuthConnector(
    "todoist",
    { accessToken: "fixture-token", refreshToken: "fixture-refresh", expiresAt },
    "robert@example.com",
    ["data:read_write"],
  );
}

async function fixture(
  work: (connector: TodoistConnector, requests: LoggedRequest[], db: OpenBotDatabase) => Promise<void>,
  respond: (method: string, url: string, body: string, db: OpenBotDatabase) => Response | Promise<Response>,
  expiresAt?: string,
) {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-todoist-lifecycle-"));
  const db = new OpenBotDatabase(root);
  try {
    seedConnected(db, expiresAt);
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

function taskRow(overrides: TaskRow = {}): TaskRow {
  return {
    id: "task-7", content: "Ship OpenBot", description: "Final review",
    project_id: "project-1", priority: 2, due: { date: "2026-09-18" }, is_completed: false,
    url: "https://app.todoist.com/app/task/task-7",
    ...overrides,
  };
}

function applyUpdate(state: TaskRow, body: string): TaskRow {
  const patch = JSON.parse(body) as Record<string, unknown>;
  const next: TaskRow = { ...state };
  if (typeof patch.content === "string") next.content = patch.content;
  if (typeof patch.description === "string") next.description = patch.description;
  if (typeof patch.priority === "number") next.priority = patch.priority;
  if (typeof patch.due_string === "string") next.due = patch.due_string ? { date: "2026-09-19" } : null;
  return next;
}

test("update sends only requested fields and verifies the readback", async () => {
  let state = taskRow();
  await fixture(async (connector, requests) => {
    const result = await connector.update("task-7", { content: "Ship OpenBot v2", dueString: "tomorrow" });
    assert.equal(result.task.id, "task-7");
    assert.equal(result.task.content, "Ship OpenBot v2");
    assert.equal(result.base.content, "Ship OpenBot");
    const posts = requests.filter((entry) => entry.method === "POST");
    assert.equal(posts.length, 1);
    assert.deepEqual(JSON.parse(posts[0]!.body), { content: "Ship OpenBot v2", due_string: "tomorrow" });
    assert.deepEqual(requests.map((entry) => entry.method), ["GET", "POST", "GET"]);
  }, (method, url, body) => {
    if (method === "GET") return Response.json(state);
    state = applyUpdate(state, body);
    return Response.json(state);
  });
});

test("update passes an empty description through instead of dropping it as falsy", async () => {
  let state = taskRow();
  await fixture(async (connector, requests) => {
    const result = await connector.update("task-7", { description: "" });
    assert.equal(result.task.description, "");
    const sent = JSON.parse(requests.find((entry) => entry.method === "POST")!.body) as Record<string, unknown>;
    assert.equal("description" in sent, true, "an intentional clear must reach Todoist");
    assert.equal(sent.description, "");
  }, (method, url, body) => {
    if (method === "GET") return Response.json(state);
    state = applyUpdate(state, body);
    return Response.json(state);
  });
});

test("clearDue drops the due date and the readback must show its absence", async () => {
  let state = taskRow();
  await fixture(async (connector, requests) => {
    const result = await connector.update("task-7", { clearDue: true });
    assert.equal(result.task.due, null);
    const sent = JSON.parse(requests.find((entry) => entry.method === "POST")!.body) as Record<string, unknown>;
    assert.equal(sent.due_string, "");
  }, (method, url, body) => {
    if (method === "GET") return Response.json(state);
    state = applyUpdate(state, body);
    return Response.json(state);
  });
});

test("update rejects an empty change, priority zero and set-plus-clear due", async () => {
  await fixture(async (connector, requests) => {
    await assert.rejects(connector.update("task-7", {}), /what should change/);
    await assert.rejects(connector.update("task-7", { priority: 0 }));
    await assert.rejects(connector.update("task-7", { dueString: "tomorrow", clearDue: true }), /or clear it/);
    await assert.rejects(connector.update("", { content: "x" }), /exact Todoist task id/);
    assert.equal(requests.length, 0, "invalid changes never reach Todoist");
  }, () => Response.json(taskRow()));
  assert.equal(todoistTaskUpdateInput.safeParse({}).success, false);
  assert.equal(todoistTaskUpdateInput.safeParse({ taskId: "t", priority: 0 }).success, false);
  assert.equal(todoistTaskUpdateInput.safeParse({ taskId: "t", dueString: "x", clearDue: true }).success, false);
  assert.equal(todoistTaskUpdateInput.safeParse({ taskId: "t", content: "x" }).success, true);
  assert.equal(todoistTaskCompleteInput.safeParse({ taskId: "" }).success, false);
});

test("update on a missing task throws not-found without writing", async () => {
  await fixture(async (connector, requests) => {
    await assert.rejects(connector.update("gone", { content: "x" }), TodoistNotFoundError);
    assert.deepEqual(requests.map((entry) => entry.method), ["GET"]);
  }, () => Response.json({ error: "Not found" }, { status: 404 }));
});

test("update on an already-completed task refuses without writing", async () => {
  await fixture(async (connector, requests) => {
    await assert.rejects(connector.update("task-7", { content: "x" }), /already completed/);
    assert.deepEqual(requests.map((entry) => entry.method), ["GET"]);
  }, () => Response.json(taskRow({ is_completed: true })));
});

test("a lost update response stays uncertain and is never repeated", async () => {
  let calls = 0;
  await fixture(async (connector, requests) => {
    await assert.rejects(connector.update("task-7", { content: "Ship OpenBot v2" }), ApprovedConnectorOutcomeUncertainError);
    assert.equal(requests.filter((entry) => entry.method === "POST").length, 1);
  }, (method) => {
    if (method === "GET") return Response.json(taskRow());
    calls += 1;
    if (calls === 1) throw new TypeError("fetch failed");
    return Response.json(taskRow({ content: "Ship OpenBot v2" }));
  });
});

test("a mismatched readback after update is uncertain, not success", async () => {
  await fixture(async (connector) => {
    await assert.rejects(connector.update("task-7", { content: "Ship OpenBot v2" }), ApprovedConnectorOutcomeUncertainError);
  }, (method, url, body) => {
    if (method === "GET") return Response.json(taskRow());
    return Response.json(applyUpdate(taskRow({ content: "Something else" }), body));
  });
});

test("account replacement mid-update aborts with a typed conflict", async () => {
  await fixture(async (connector, requests) => {
    await assert.rejects(connector.update("task-7", { content: "x" }), ApprovalReviewChangedError);
    assert.deepEqual(requests.map((entry) => entry.method), ["GET"]);
  }, (_method, _url, _body, db) => {
    db.completeOAuthConnector(
      "todoist",
      { accessToken: "replacement-token", refreshToken: "replacement-refresh" },
      "someone-else@example.com",
      ["data:read_write"],
    );
    return Response.json(taskRow());
  });
});

test("a 401 refresh during update retries once without duplicating the change", async () => {
  let state = taskRow();
  let posts = 0;
  await fixture(async (connector, requests) => {
    const result = await connector.update("task-7", { content: "Ship OpenBot v2" });
    assert.equal(result.task.content, "Ship OpenBot v2");
    assert.equal(posts, 2, "expired token refresh plus exactly one logical update");
    const bodies = requests.filter((entry) => entry.method === "POST" && entry.url.includes("/tasks/")).map((entry) => entry.body);
    assert.equal(bodies.length, 2);
    assert.equal(bodies[0], bodies[1], "the retry repeats the identical reviewed payload");
  }, (method, url, body) => {
    if (url.includes("/oauth/access_token")) return Response.json({ access_token: "fresh-token", refresh_token: "fresh-refresh", expires_in: 3600 });
    if (method === "GET") return Response.json(state);
    posts += 1;
    if (posts === 1) return Response.json({ error: "Unauthorized" }, { status: 401 });
    state = applyUpdate(state, body);
    return Response.json(state);
  }, new Date(Date.now() - 60_000).toISOString());
});

test("complete closes one task and verifies the completed readback", async () => {
  let state = taskRow();
  await fixture(async (connector, requests) => {
    const result = await connector.complete("task-7");
    assert.equal(result.alreadyCompleted, false);
    assert.equal(result.task.completed, true);
    const closes = requests.filter((entry) => entry.url.endsWith("/close"));
    assert.equal(closes.length, 1);
    assert.equal(closes[0]!.method, "POST");
    assert.deepEqual(requests.map((entry) => entry.method), ["GET", "POST", "GET"]);
  }, (method, url) => {
    if (method === "GET") return Response.json(state);
    state = { ...state, is_completed: true };
    return Response.json(null);
  });
});

test("complete is idempotent on an already-completed task", async () => {
  await fixture(async (connector, requests) => {
    const result = await connector.complete("task-7");
    assert.equal(result.alreadyCompleted, true);
    assert.deepEqual(requests.map((entry) => entry.method), ["GET"]);
  }, () => Response.json(taskRow({ is_completed: true })));
});

test("complete on a missing task throws not-found without writing", async () => {
  await fixture(async (connector, requests) => {
    await assert.rejects(connector.complete("gone"), TodoistNotFoundError);
    assert.deepEqual(requests.map((entry) => entry.method), ["GET"]);
  }, () => Response.json({ error: "Not found" }, { status: 404 }));
});

test("complete on a rescheduled recurring task counts as completed", async () => {
  let closed = false;
  await fixture(async (connector, requests) => {
    const result = await connector.complete("task-7");
    assert.equal(result.alreadyCompleted, false);
    assert.equal(result.task.due, "2026-09-25");
    assert.equal(requests.filter((entry) => entry.url.endsWith("/close")).length, 1);
  }, (method) => {
    // Base read shows the current occurrence; the post-close readback shows
    // the same id moved to its next occurrence instead of completed=true.
    if (method === "GET" && !closed) return Response.json(taskRow({ due: { date: "2026-09-18" } }));
    if (method === "GET") return Response.json(taskRow({ due: { date: "2026-09-25" } }));
    closed = true;
    return Response.json(null);
  });
});

test("complete without a confirming readback is uncertain, not success", async () => {
  await fixture(async (connector) => {
    await assert.rejects(connector.complete("task-7"), ApprovedConnectorOutcomeUncertainError);
  }, (method, url) => {
    if (method === "GET" && !url.endsWith("/close")) return Response.json(taskRow());
    if (method === "POST") return Response.json(null);
    return Response.json({ error: "Not found" }, { status: 404 });
  });
});

test("matcher binds only requested update fields", () => {
  const task = { id: "t", content: "Ship", description: "d", projectId: "p", priority: 2, due: "2026-09-18", completed: false, url: "u" };
  assert.equal(todoistTaskMatchesUpdate(task, { content: "Ship" }), true);
  assert.equal(todoistTaskMatchesUpdate(task, { content: "Other" }), false);
  assert.equal(todoistTaskMatchesUpdate(task, { description: "" }), false);
  assert.equal(todoistTaskMatchesUpdate({ ...task, description: "" }, { description: "" }), true, "an intentional clear must read back empty");
  assert.equal(todoistTaskMatchesUpdate(task, { dueString: "tomorrow" }), true, "a requested due phrase is server-normalized");
  assert.equal(todoistTaskMatchesUpdate({ ...task, due: null }, { dueString: "tomorrow" }), false);
  assert.equal(todoistTaskMatchesUpdate(task, { clearDue: true }), false);
  assert.equal(todoistTaskMatchesUpdate({ ...task, due: null }, { clearDue: true }), true);
  assert.equal(todoistTaskMatchesUpdate({ ...task, priority: 4 }, { priority: 2 }), false);
  assert.equal(todoistTaskMatchesUpdate({ ...task, id: "" }, { content: "Ship" }), false);
});

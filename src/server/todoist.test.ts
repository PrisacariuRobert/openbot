import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenBotDatabase } from "./database.js";
import { TodoistConnector } from "./todoist.js";

test("registers a private Todoist client, reads tasks, and creates only through the connector action", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-todoist-test-"));
  try {
    const db = new OpenBotDatabase(root), requests: Array<{ url: string; method: string; body: string }> = [];
    const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input), method = String(init?.method || "GET"), body = String(init?.body || ""); requests.push({ url, method, body });
      if (url.endsWith("/oauth/register")) return new Response(JSON.stringify({ client_id: "tdd_local", client_secret: "private-secret" }), { status: 201 });
      if (url.endsWith("/oauth/access_token")) return new Response(JSON.stringify({ access_token: "todo-token", refresh_token: "todo-refresh", expires_in: 3600 }), { status: 200 });
      if (url.endsWith("/api/v1/user")) return new Response(JSON.stringify({ full_name: "Robert", email: "robert@example.com" }), { status: 200 });
      if (url.includes("/api/v1/tasks?") && method === "GET") return new Response(JSON.stringify({ results: [{ id: "task-1", content: "Prepare launch", description: "Final review", project_id: "project-1", priority: 3, due: { date: "2026-09-04" } }] }), { status: 200 });
      if (url.includes("/api/v1/activities?") && method === "GET") return new Response(JSON.stringify({ results: [{ id: "activity-1", event_type: "completed", object_id: "task-1", event_date: "2026-09-04T10:00:00Z", parent_project_id: "project-1", extra_data: { content: "Prepare launch" } }] }), { status: 200 });
      if (url.endsWith("/api/v1/tasks") && method === "POST") return new Response(JSON.stringify({ id: "task-2", content: "Ship OpenBot", description: "", project_id: "project-1", priority: 4, url: "https://app.todoist.com/app/task/task-2" }), { status: 200 });
      return new Response(JSON.stringify({ error: "unexpected" }), { status: 400 });
    }) as typeof fetch;
    const connector = new TodoistConnector(db, "http://localhost:4311/api/connectors/todoist/callback", fakeFetch);
    const oauth = await connector.beginOAuth(), authorize = new URL(oauth.url);
    assert.equal(authorize.origin, "https://app.todoist.com");
    assert.equal(authorize.searchParams.get("scope"), "data:read_write");
    assert.match(requests[0]?.body || "", /refresh_token/);
    await connector.completeOAuth(oauth.state, "oauth-code");
    assert.equal(db.getConnector("todoist")?.accountEmail, "Robert");
    assert.equal((await connector.tasks("launch"))[0]?.due, "2026-09-04");
    assert.deepEqual((await connector.activities())[0], { id: "activity-1", eventType: "completed", objectId: "task-1", content: "Prepare launch", occurredAt: "2026-09-04T10:00:00Z", projectId: "project-1" });
    assert.equal((await connector.create({ content: "Ship OpenBot", priority: 4 })).content, "Ship OpenBot");
    assert.equal((await connector.health()).email, "robert@example.com");
    await assert.rejects(() => connector.completeOAuth(oauth.state, "replay"), /sign-in expired/);
    db.close();
  } finally { rmSync(root, { recursive: true, force: true }); }
});

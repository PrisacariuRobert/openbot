import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenBotDatabase } from "./database.js";
import { NotionConnector } from "./notion.js";

const pageId = "12345678-1234-1234-1234-1234567890ab";
const page = { id: pageId, url: `https://notion.so/${pageId}`, last_edited_time: "2026-09-02T08:00:00.000Z", properties: { Name: { type: "title", title: [{ plain_text: "Launch notes" }] } } };

test("connects through Notion OAuth, reads selected pages, and appends bounded blocks", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-notion-test-"));
  try {
    const db = new OpenBotDatabase(root);
    db.configureOAuthConnector({ id: "notion", kind: "notion_oauth", name: "Notion", clientId: "notion-client", clientSecret: "notion-secret" });
    const requests: Array<{ url: string; method: string; version: string; body: string }> = [];
    const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input), method = String(init?.method || "GET"), version = String(new Headers(init?.headers).get("notion-version") || ""), body = String(init?.body || "");
      requests.push({ url, method, version, body });
      if (url.endsWith("/v1/oauth/token")) return new Response(JSON.stringify({ access_token: "notion-access", refresh_token: "notion-refresh", bot_id: "bot", workspace_id: "workspace", workspace_name: "Product studio", owner: { user: { name: "Robert" } } }), { status: 200 });
      if (url.endsWith("/v1/search")) return new Response(JSON.stringify({ results: [page] }), { status: 200 });
      if (url.includes(`/v1/blocks/${pageId}/children`) && method === "PATCH") return new Response(JSON.stringify({ results: [] }), { status: 200 });
      if (url.includes(`/v1/blocks/${pageId}/children`)) return new Response(JSON.stringify({ results: [{ id: "block-1", type: "heading_2", heading_2: { rich_text: [{ plain_text: "Decisions" }] } }, { id: "block-2", type: "paragraph", paragraph: { rich_text: [{ plain_text: "Ship on Friday." }] } }] }), { status: 200 });
      if (url.includes(`/v1/pages/${pageId}`)) return new Response(JSON.stringify(page), { status: 200 });
      if (url.endsWith("/v1/users/me")) return new Response(JSON.stringify({ id: "bot", name: "OpenBot", type: "bot" }), { status: 200 });
      return new Response(JSON.stringify({ code: "unexpected_endpoint" }), { status: 400 });
    }) as typeof fetch;
    const connector = new NotionConnector(db, "http://127.0.0.1:4311/api/connectors/notion/callback", fakeFetch);
    const oauth = connector.beginOAuth(), authorize = new URL(oauth.url);
    assert.equal(authorize.origin, "https://api.notion.com");
    assert.equal(authorize.searchParams.get("owner"), "user");
    await connector.completeOAuth(oauth.state, "oauth-code");
    assert.equal(db.getConnector("notion")?.accountEmail, "Product studio");
    await assert.rejects(() => connector.completeOAuth(oauth.state, "replayed-code"), /sign-in expired/);
    assert.equal(db.getConnector("notion")?.connected, true);
    assert.equal((await connector.search("launch"))[0]?.title, "Launch notes");
    const detail = await connector.read(pageId);
    assert.match(detail.content, /## Decisions/);
    assert.match(detail.content, /Ship on Friday/);
    const update = await connector.append(pageId, "Ready for review.\n\nShip after approval.", "Update");
    assert.equal(update.blocksAdded, 3);
    assert.equal((await connector.health()).name, "OpenBot");
    assert.ok(requests.filter((item) => item.url.startsWith("https://api.notion.com/v1/")).every((item) => item.version === "2026-03-11"));
    const patch = requests.find((item) => item.method === "PATCH");
    assert.match(patch?.body || "", /Ready for review/);
    db.close();
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("surfaces Notion rate limits without hiding when it is safe to retry", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-notion-limit-test-"));
  try {
    const db = new OpenBotDatabase(root);
    db.configureOAuthConnector({ id: "notion", kind: "notion_oauth", name: "Notion", clientId: "notion-client", clientSecret: "notion-secret" });
    db.completeOAuthConnector("notion", { accessToken: "token", botId: "bot", workspaceId: "workspace", workspaceName: "Studio" }, "Studio", ["read_content"]);
    const connector = new NotionConnector(db, "http://127.0.0.1/callback", (async () => new Response(JSON.stringify({ code: "rate_limited", message: "Slow down" }), { status: 429, headers: { "retry-after": "3" } })) as typeof fetch);
    await assert.rejects(() => connector.search("launch"), /Try again in 3 seconds/);
    db.close();
  } finally { rmSync(root, { recursive: true, force: true }); }
});

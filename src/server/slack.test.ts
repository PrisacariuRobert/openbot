import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenBotDatabase } from "./database.js";
import { SlackConnector } from "./slack.js";

test("uses Slack user authority for search and bot authority for approved posting", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-slack-test-"));
  try {
    const db = new OpenBotDatabase(root);
    db.configureOAuthConnector({ id: "slack", kind: "slack_oauth", name: "Slack", clientId: "slack-client", clientSecret: "slack-secret" });
    const requests: Array<{ url: string; authorization: string; body: string }> = [];
    const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input), authorization = String(new Headers(init?.headers).get("authorization") || ""), body = String(init?.body || "");
      requests.push({ url, authorization, body });
      if (url.endsWith("/oauth.v2.access")) return new Response(JSON.stringify({ ok: true, access_token: "xoxb-bot", bot_user_id: "B1", team: { id: "T1", name: "Launch room" }, authed_user: { id: "U1", access_token: "xoxp-user" } }), { status: 200 });
      if (url.endsWith("/search.messages")) return new Response(JSON.stringify({ ok: true, messages: { matches: [{ channel_id: "C1", channel_name: "launch", ts: "1700.1", username: "Ada", text: "Launch review is ready", permalink: "https://example.slack.com/archives/C1/p17001" }] } }), { status: 200 });
      if (url.endsWith("/conversations.history")) return new Response(JSON.stringify({ ok: true, messages: [{ ts: "1700.1", user: "U2", text: "Launch review is ready" }] }), { status: 200 });
      if (url.endsWith("/chat.postMessage")) return new Response(JSON.stringify({ ok: true, channel: "C1", ts: "1700.2" }), { status: 200 });
      if (url.endsWith("/auth.test")) return new Response(JSON.stringify({ ok: true, team: "Launch room", user: "OpenBot", team_id: "T1", user_id: "B1" }), { status: 200 });
      return new Response(JSON.stringify({ ok: false, error: "unexpected_endpoint" }), { status: 400 });
    }) as typeof fetch;
    const connector = new SlackConnector(db, "http://127.0.0.1:4311/api/connectors/slack/callback", fakeFetch);
    const oauth = connector.beginOAuth(), authorize = new URL(oauth.url);
    assert.equal(authorize.origin, "https://slack.com");
    assert.ok(authorize.searchParams.get("user_scope")?.includes("search:read"));
    assert.ok(authorize.searchParams.get("scope")?.includes("chat:write"));
    await connector.completeOAuth(oauth.state, "oauth-code");
    assert.equal(db.getConnector("slack")?.accountEmail, "Launch room");
    await assert.rejects(() => connector.completeOAuth(oauth.state, "replayed-code"), /sign-in expired/);
    assert.equal(db.getConnector("slack")?.connected, true);
    const found = await connector.search("launch", 6);
    assert.equal(found[0]?.channelName, "launch");
    assert.equal(found[0]?.text, "Launch review is ready");
    assert.equal((await connector.read("C1", "1700.1")).messages[0]?.channelId, "C1");
    assert.equal((await connector.post("C1", "Approved reply")).timestamp, "1700.2");
    assert.equal((await connector.health()).team, "Launch room");
    assert.equal(requests.find((item) => item.url.endsWith("/search.messages"))?.authorization, "Bearer xoxp-user");
    assert.equal(requests.find((item) => item.url.endsWith("/chat.postMessage"))?.authorization, "Bearer xoxb-bot");
    assert.match(requests.find((item) => item.url.endsWith("/chat.postMessage"))?.body || "", /text=Approved\+reply/);
    db.close();
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("turns Slack scope failures into useful recovery guidance", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-slack-scope-test-"));
  try {
    const db = new OpenBotDatabase(root);
    db.configureOAuthConnector({ id: "slack", kind: "slack_oauth", name: "Slack", clientId: "slack-client", clientSecret: "slack-secret" });
    db.completeOAuthConnector("slack", { bot: { accessToken: "bot" }, user: { accessToken: "user" }, teamId: "T1", teamName: "Team" }, "Team", ["search:read"]);
    const connector = new SlackConnector(db, "http://127.0.0.1/callback", (async () => new Response(JSON.stringify({ ok: false, error: "missing_scope", needed: "channels:history" }), { status: 200 })) as typeof fetch);
    await assert.rejects(() => connector.read("C1", "1700.1"), /channels:history permission/);
    db.close();
  } finally { rmSync(root, { recursive: true, force: true }); }
});

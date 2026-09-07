import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { startMcpFixture } from "../../scripts/fixtures/mcp-service.js";
import { OpenBotDatabase } from "./testing/database.js";
import { McpConnections } from "./mcp-connections.js";
import { McpOAuth, mcpOAuthFetch } from "./mcp-oauth.js";

async function setup() {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-oauth-test-")), db = new OpenBotDatabase(root), fixture = await startMcpFixture(true);
  const oauth = new McpOAuth(db, "http://127.0.0.1:4311/api/extensions/oauth/callback");
  const mcp = new McpConnections(db, 2500, (id) => oauth.token(id));
  const connection = mcp.create({ name: "OAuth fixture", url: fixture.url, allowLoopback: true });
  const begin = async () => {
    const result = await oauth.begin(connection.id), url = new URL(result.url);
    assert.equal(url.origin, new URL(fixture.url).origin); assert.equal(url.searchParams.get("code_challenge_method"), "S256");
    fixture.state.challenge = url.searchParams.get("code_challenge")!;
    assert.ok(fixture.state.challenge); return url.searchParams.get("state")!;
  };
  return { root, db, fixture, oauth, mcp, connection, begin, close: async () => { await fixture.close(); db.close(); rmSync(root, { recursive: true, force: true }); } };
}

test("MCP OAuth discovers, registers a public client, verifies PKCE, survives restart and never grants tools implicitly", async () => {
  const f = await setup();
  try {
    const state = await f.begin();
    await assert.rejects(f.oauth.complete("forged", "fixture-code"), /invalid/);
    const restarted = new McpOAuth(f.db, f.oauth.redirectUrl);
    await restarted.complete(state, "fixture-code");
    await assert.rejects(restarted.complete(state, "fixture-code"), /already used/);
    assert.equal(f.fixture.state.tokenCalls, 1); assert.deepEqual(f.mcp.toolsFor("nova"), []);
    await f.mcp.discover(f.connection.id); f.mcp.configure(f.connection.id, "nova", { read_project: "read" });
    assert.equal(await restarted.token(f.connection.id), "fixture-private-token", "grant revisions must not invalidate the sign-in generation");
    const run = f.db.createRun({ botId: "nova", threadId: "bot-nova", prompt: "Read fixture", status: "running" });
    const receipt = await f.mcp.call("nova", run.id, { connectionId: f.connection.id, tool: "read_project", arguments: { project: "Cedar" } });
    assert.match(receipt.text, /CEDAR-42/); assert.ok(!receipt.text.includes("fixture-private-token"));
    assert.ok(!JSON.stringify(f.mcp.list()).includes("fixture-private"));
    assert.ok(!readFileSync(path.join(f.db.dataDir, "openbot.sqlite-wal")).includes(Buffer.from("fixture-private-refresh")));
    await f.begin(); assert.deepEqual(f.mcp.toolsFor("nova"), []); await assert.rejects(restarted.token(f.connection.id), /Sign in/);
    assert.equal(f.fixture.state.writes, 0);
  } finally { await f.close(); }
});

test("MCP OAuth rejects replaced, wrong-verifier and wrong-issuer callbacks", async () => {
  const f = await setup();
  try {
    const old = await f.begin(); const current = await f.begin();
    await assert.rejects(f.oauth.complete(old, "fixture-code"), /expired/);
    await assert.rejects(f.oauth.complete(current, "fixture-code", "https://wrong-issuer.example"), /could not be verified/);
    assert.equal(f.fixture.state.tokenCalls, 0);
    const wrong = await f.begin(); f.fixture.state.challenge = "wrong";
    await assert.rejects(f.oauth.complete(wrong, "fixture-code"), /could not be verified/);
    await assert.rejects(f.oauth.token(f.connection.id), /Sign in/);
  } finally { await f.close(); }
});

test("MCP OAuth coalesces refreshes and an in-flight refresh cannot restore disconnected credentials", async () => {
  const f = await setup();
  try {
    f.fixture.state.expiresIn = 1; await f.oauth.complete(await f.begin(), "fixture-code");
    f.fixture.state.tokenDelayMs = 50;
    await Promise.all([f.oauth.token(f.connection.id), f.oauth.token(f.connection.id)]);
    assert.equal(f.fixture.state.tokenCalls, 2);
    const refresh = f.oauth.token(f.connection.id); const rejection = assert.rejects(refresh, /fresh sign-in/);
    while (f.fixture.state.tokenCalls < 3) await new Promise((resolve) => setTimeout(resolve, 5));
    f.oauth.disconnect(f.connection.id); await rejection;
    assert.equal(f.db.extensionRecord("mcp-oauth", f.connection.id), null);
    assert.deepEqual(f.mcp.toolsFor("nova"), []);
  } finally { await f.close(); }
});

test("OAuth network discovery refuses private destinations and cross-origin loopback even for opted-in local services", async () => {
  const fetcher = mcpOAuthFetch("http://127.0.0.1:7777/mcp", true, AbortSignal.timeout(1000));
  for (const url of ["http://127.0.0.1:8888/token", "https://10.0.0.1/token", "http://example.com/token", "https://user:secret@example.com/token"]) {
    await assert.rejects(async () => fetcher(url));
  }
});

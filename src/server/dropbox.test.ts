import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenBotDatabase } from "./database.js";
import { DropboxConnector } from "./dropbox.js";

const file = { ".tag": "file", id: "id:launch", name: "launch.md", path_display: "/Projects/launch.md", server_modified: "2026-09-03T10:00:00Z", size: 42, is_downloadable: true };

test("connects Dropbox with offline OAuth and keeps cloud file access read-only and bounded", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-dropbox-test-"));
  try {
    const db = new OpenBotDatabase(root); db.configureOAuthConnector({ id: "dropbox", kind: "dropbox_oauth", name: "Dropbox", clientId: "dropbox-key", clientSecret: "dropbox-secret" });
    const requests: Array<{ url: string; authorization: string; body: string }> = [];
    const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input), headers = new Headers(init?.headers), body = String(init?.body || ""); requests.push({ url, authorization: headers.get("authorization") || "", body });
      if (url.endsWith("/oauth2/token")) return new Response(JSON.stringify({ access_token: "dropbox-token", refresh_token: "dropbox-refresh", expires_in: 3600, account_id: "dbid:1" }), { status: 200 });
      if (url.endsWith("/2/users/get_current_account")) return new Response(JSON.stringify({ account_id: "dbid:1", email: "robert@example.com", name: { display_name: "Robert" } }), { status: 200 });
      if (url.endsWith("/2/files/search_v2")) return new Response(JSON.stringify({ matches: [{ metadata: { metadata: file } }] }), { status: 200 });
      if (url.endsWith("/2/files/get_metadata")) return new Response(JSON.stringify(body.includes("secret.pdf") ? { ...file, id: "id:pdf", name: "secret.pdf", path_display: "/Projects/secret.pdf" } : file), { status: 200 });
      if (url.endsWith("/2/files/download")) return new Response("# Launch\nShip after review.", { status: 200, headers: { "content-type": "text/markdown" } });
      return new Response(JSON.stringify({ error_summary: "unexpected" }), { status: 400 });
    }) as typeof fetch;
    const connector = new DropboxConnector(db, "http://127.0.0.1:4311/api/connectors/dropbox/callback", fakeFetch);
    const oauth = connector.beginOAuth(), authorize = new URL(oauth.url);
    assert.equal(authorize.searchParams.get("token_access_type"), "offline");
    assert.match(authorize.searchParams.get("scope") || "", /files\.content\.read/);
    await connector.completeOAuth(oauth.state, "oauth-code");
    assert.equal(db.getConnector("dropbox")?.accountEmail, "Robert");
    assert.equal((await connector.search("launch"))[0]?.path, "/Projects/launch.md");
    assert.match((await connector.read("id:launch")).content, /Ship after review/);
    assert.equal(requests.find((item) => item.url.endsWith("/2/files/download"))?.authorization, "Bearer dropbox-token");
    await assert.rejects(() => connector.read("/Projects/secret.pdf"), /supported text or code/);
    db.close();
  } finally { rmSync(root, { recursive: true, force: true }); }
});

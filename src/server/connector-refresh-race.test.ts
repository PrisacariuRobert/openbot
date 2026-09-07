import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenBotDatabase } from "./testing/database.js";
import { SlackConnector } from "./slack.js";
import { NotionConnector } from "./notion.js";
import { TodoistConnector } from "./todoist.js";
import { GoogleWorkspaceConnector } from "./google-workspace.js";

for (const app of ["slack", "notion", "todoist", "google-workspace"] as const) test(`${app}: in-flight refresh cannot reconnect a revoked or replaced account`, async () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-refresh-race-")), db = new OpenBotDatabase(root);
  try {
    let started!: () => void, finish!: () => void;
    const pending = new Promise<void>((resolve) => { started = resolve; }), hold = new Promise<void>((resolve) => { finish = resolve; });
    const expired = "2000-01-01T00:00:00Z";
    if (app === "google-workspace") {
      db.configureGoogleConnector({ clientId: "fixture" });
      db.completeGoogleConnector({ accessToken: "old", refreshToken: "refresh", expiresAt: expired, scopes: [], accountEmail: "fixture@example.com" });
    } else {
      db.configureOAuthConnector({ id: app, kind: `${app}_oauth`, name: app, clientId: "fixture", clientSecret: "secret" });
      db.completeOAuthConnector(app, { accessToken: "old", refreshToken: "refresh", expiresAt: expired, user: { accessToken: "old", refreshToken: "refresh", expiresAt: expired }, bot: { accessToken: "old", refreshToken: "refresh", expiresAt: expired } }, "Fixture", []);
    }
    const fetcher = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("oauth") || url.endsWith("/token")) { started(); await hold; return Response.json({ ok: true, access_token: "must-not-be-restored", token_type: "Bearer", expires_in: 3600 }); }
      if (app === "notion") return Response.json({ message: "Expired" }, { status: 401 });
      throw new Error("A revoked refresh must not dispatch a source read");
    }) as typeof fetch;
    const callback = "http://127.0.0.1/callback";
    const work = app === "slack" ? new SlackConnector(db, callback, fetcher).workChannels()
      : app === "notion" ? new NotionConnector(db, callback, fetcher).read("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
      : app === "todoist" ? new TodoistConnector(db, callback, fetcher).workProjects()
      : new GoogleWorkspaceConnector(db, callback, fetcher).search("in:inbox");
    const rejected = assert.rejects(work, /account changed|refresh/);
    await pending;
    if (app === "google-workspace") db.disconnectGoogleConnector(); else db.disconnectOAuthConnector(app);
    finish(); await rejected;
    if (app === "google-workspace") assert.equal(db.googleConnectorCredentials()?.accessToken, null);
    else assert.equal(db.oauthConnectorCredentials(app)?.credentials, null);
    const revision = db.connectorAuthorizationVersion(app);
    if (app === "google-workspace") db.configureGoogleConnector({ clientId: "different" });
    else db.configureOAuthConnector({ id: app, kind: `${app}_oauth`, name: app, clientId: "different", clientSecret: "secret" });
    assert.ok(db.connectorAuthorizationVersion(app) > revision);
  } finally { db.close(); rmSync(root, { recursive: true, force: true }); }
});

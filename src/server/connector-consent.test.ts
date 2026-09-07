import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenBotDatabase } from "./testing/database.js";

for (const service of ["todoist", "dropbox"] as const) {
  test(`${service}: account connection does not grant or restore teammate access`, () => {
    const root = mkdtempSync(path.join(tmpdir(), "openbot-connector-consent-"));
    const db = new OpenBotDatabase(root);
    try {
      db.configureOAuthConnector({ id: service, kind: `${service}_oauth`, name: service, clientId: "synthetic", clientSecret: "fixture-only" });
      const bots = db.listBots();
      assert(bots.length >= 2);
      db.setBotConnectorAccess(bots[0]!.id, { canRead: false, canSend: false }, service, service);
      db.setBotConnectorAccess(bots[1]!.id, { canRead: true, canSend: false }, service, service);
      const before = db.listBotConnectorAccess();
      db.completeOAuthConnector(service, { accessToken: "fixture-one" }, "First account", []);
      assert.deepEqual(db.listBotConnectorAccess(), before, "First connection preserves explicit choices and ungranted teammates");
      db.disconnectOAuthConnector(service);
      const disconnected = db.listBotConnectorAccess();
      db.completeOAuthConnector(service, { accessToken: "fixture-two" }, "Replacement account", []);
      assert.deepEqual(db.listBotConnectorAccess(), disconnected, "Reconnect cannot silently grant access");
      // The callback must not undo the database invariant with per-bot writes.
      // This route contract complements the real database checks above; it is
      // not a live OAuth provider test.
      const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
      const start = source.indexOf(`app.get("/api/connectors/${service}/callback"`);
      const end = source.indexOf(`app.post("/api/connectors/${service}/disconnect"`, start);
      assert(start >= 0 && end > start);
      const callback = source.slice(start, end);
      assert.match(callback, /completeOAuth\(/);
      assert.doesNotMatch(callback, /setBotConnectorAccess|ensureBotConnectorAccess|listBots\(/);
    } finally { db.close(); rmSync(root, { recursive: true, force: true }); }
  });
}

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenBotDatabase } from "./testing/database.js";
import { GOOGLE_SCOPES } from "./google-workspace.js";

/** C01a: the auth/data matrix as executable drift pins. If any of these
 * fail, the promises in docs/AUTH_DATA_MATRIX.md need re-audit — do not
 * just update the numbers. Deterministic, no network, no accounts. */

const SECRET = "MATRIX-PROBE-SECRET-not-for-real-services";

test("fresh installs operate with no connected services and no stored credentials", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-auth-matrix-"));
  const db = new OpenBotDatabase(root);
  try {
    for (const id of ["todoist", "google-workspace", "slack", "notion", "dropbox"]) {
      const connection = db.getConnector(id);
      assert.ok(!connection || connection.connected !== true, `${id} must start unconnected`);
    }
    assert.equal(db.oauthConnectorCredentials("todoist"), null);
    const providers = db.listProviders();
    assert.ok(providers.every((provider) => provider.hasSecret === false), "fresh installs store no key material");
    const gauge = JSON.stringify({ providers, bots: db.listBots() });
    assert.doesNotMatch(gauge, /ciphertext/, "no ciphertext field names leak into projections");
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("provider secrets stay in the vault and out of every projection", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-auth-matrix-"));
  const db = new OpenBotDatabase(root);
  try {
    const hosted = db.upsertProvider({
      name: "Matrix hosted", authMode: "api_key", secret: SECRET,
      apiConfig: { baseUrl: "https://example.com/v1/", protocol: "openai-compatible", modelIds: ["probe-model"] },
    });
    db.updateBot("nova", { providerInstanceId: hosted.id, model: `openbot-${hosted.id}/probe-model` });
    assert.equal(db.getProvider(hosted.id)?.hasSecret, true, "presence is signaled without material");
    const projections = JSON.stringify({
      providers: db.listProviders(),
      provider: db.getProvider(hosted.id),
      bot: db.getBot("nova"),
      bots: db.listBots(),
      connector: db.getConnector("todoist"),
    });
    assert.doesNotMatch(projections, /MATRIX-PROBE-SECRET/, "key material reaches no projection");
    assert.doesNotMatch(projections, /ciphertext/, "no ciphertext field names leak either");
    db.close();
    const reopened = new OpenBotDatabase(root);
    try {
      assert.equal(reopened.getProvider(hosted.id)?.hasSecret, true, "presence survives restart");
      assert.doesNotMatch(JSON.stringify(reopened.listProviders()), /MATRIX-PROBE-SECRET/);
    } finally {
      reopened.close();
    }
  } finally {
    try { db.close(); } catch { /* already closed */ }
    rmSync(root, { recursive: true, force: true });
  }
});

test("requested Google scopes are pinned while connectors stay dormant", () => {
  // Restricted scopes (gmail.send, calendar.events.owned) would require
  // Google verification before public use. If this set changes, the matrix
  // document and the OAuth submission packet must be re-audited deliberately.
  assert.deepEqual([...GOOGLE_SCOPES].sort(), [
    "email",
    "https://www.googleapis.com/auth/calendar.events.owned",
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "openid",
    "profile",
  ]);
});

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenBotDatabase } from "./database.js";
import { buildRawEmail, connectorCatalog, decodeGmailMessage, GOOGLE_SCOPES, GoogleWorkspaceConnector } from "./google-workspace.js";

test("builds a safe Gmail message and rejects header injection", () => {
  const raw = buildRawEmail({ to: "friend@example.com", subject: "A useful update", body: "Hello from OpenBot." });
  const message = Buffer.from(raw, "base64url").toString("utf8");
  assert.match(message, /^To: friend@example\.com\r\nSubject: A useful update/m);
  assert.match(message, /\r\n\r\nHello from OpenBot\.$/);
  assert.throws(() => buildRawEmail({ to: "friend@example.com\r\nBcc: hidden@example.com", subject: "Hello", body: "No" }));
  assert.throws(() => buildRawEmail({ to: "not-an-address", subject: "Hello", body: "No" }));
});

test("turns Gmail payloads into bounded readable messages", () => {
  const decoded = decodeGmailMessage({
    id: "message_123", threadId: "thread_1", labelIds: ["INBOX", "UNREAD"], snippet: "A small preview",
    payload: { mimeType: "multipart/alternative", headers: [{ name: "From", value: "Friend <friend@example.com>" }, { name: "Subject", value: "Project update" }], parts: [{ mimeType: "text/plain", body: { data: Buffer.from("The launch is ready.").toString("base64url") } }] },
  });
  assert.equal(decoded.subject, "Project update");
  assert.equal(decoded.body, "The launch is ready.");
  assert.equal(decoded.unread, true);
});

test("uses state and PKCE for Google sign-in and calls Gmail with encrypted credentials", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-google-test-"));
  try {
    const db = new OpenBotDatabase(root);
    db.configureGoogleConnector({ clientId: "desktop-client.apps.googleusercontent.com", clientSecret: "client-secret" });
    db.completeGoogleConnector({ accessToken: "fresh-access", refreshToken: "refresh-token", expiresAt: new Date(Date.now() + 3_600_000).toISOString(), scopes: GOOGLE_SCOPES, accountEmail: "owner@example.com" });
    const requests: string[] = [];
    const fakeFetch = (async (input: string | URL | Request) => {
      const url = String(input); requests.push(url);
      if (url.includes("/messages?")) return new Response(JSON.stringify({ messages: [{ id: "message_123" }] }), { status: 200, headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify({ id: "message_123", threadId: "thread_1", snippet: "Ready", payload: { headers: [{ name: "From", value: "Friend <friend@example.com>" }, { name: "Subject", value: "Hello" }] } }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const connector = new GoogleWorkspaceConnector(db, "http://127.0.0.1:4311/api/connectors/google/callback", fakeFetch);
    const oauth = new URL(connector.beginOAuth().url);
    assert.equal(oauth.searchParams.get("code_challenge_method"), "S256");
    assert.ok(oauth.searchParams.get("state"));
    assert.ok(oauth.searchParams.get("code_challenge"));
    assert.ok(oauth.searchParams.get("scope")?.includes("gmail.readonly"));
    const messages = await connector.search("from:friend@example.com", 4);
    assert.equal(messages[0]?.subject, "Hello");
    assert.ok(requests.every((url) => url.startsWith("https://gmail.googleapis.com/")));
    db.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("searches Drive, reads supported files, and returns a bounded calendar agenda", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-workspace-test-"));
  try {
    const db = new OpenBotDatabase(root);
    db.configureGoogleConnector({ clientId: "desktop-client.apps.googleusercontent.com" });
    db.completeGoogleConnector({ accessToken: "workspace-access", refreshToken: "workspace-refresh", expiresAt: new Date(Date.now() + 3_600_000).toISOString(), scopes: GOOGLE_SCOPES, accountEmail: "owner@example.com" });
    const fakeFetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("calendar/v3")) return new Response(JSON.stringify({ items: [{ id: "event_1", summary: "Launch review", start: { dateTime: "2026-09-02T09:00:00Z" }, end: { dateTime: "2026-09-02T09:30:00Z" }, location: "Meet", attendees: [{}, {}] }] }), { status: 200 });
      if (url.includes("alt=media")) return new Response("Current launch notes", { status: 200, headers: { "content-type": "text/plain" } });
      if (url.includes("/drive/v3/files/file_123?")) return new Response(JSON.stringify({ id: "file_123", name: "Launch notes.txt", mimeType: "text/plain", modifiedTime: "2026-09-01T12:00:00Z", webViewLink: "https://drive.google.com/file/file_123", size: "20" }), { status: 200 });
      return new Response(JSON.stringify({ files: [{ id: "file_123", name: "Launch notes.txt", mimeType: "text/plain", modifiedTime: "2026-09-01T12:00:00Z", webViewLink: "https://drive.google.com/file/file_123", size: "20" }] }), { status: 200 });
    }) as typeof fetch;
    const connector = new GoogleWorkspaceConnector(db, "http://127.0.0.1:4311/api/connectors/google/callback", fakeFetch);
    assert.deepEqual(connectorCatalog(true, GOOGLE_SCOPES).filter((entry) => entry.connected).map((entry) => entry.id), ["gmail", "google-drive", "google-calendar"]);
    assert.equal((await connector.searchDrive("launch", 3))[0]?.name, "Launch notes.txt");
    assert.equal((await connector.readDriveFile("file_123")).content, "Current launch notes");
    const agenda = await connector.calendarAgenda(7, 10);
    assert.equal(agenda[0]?.title, "Launch review");
    assert.equal(agenda[0]?.attendeeCount, 2);
    db.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("keeps Gmail connected when another Google service still needs setup", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-google-service-health-test-"));
  try {
    const db = new OpenBotDatabase(root);
    db.configureGoogleConnector({ clientId: "desktop-client.apps.googleusercontent.com" });
    db.completeGoogleConnector({ accessToken: "workspace-access", refreshToken: "workspace-refresh", expiresAt: new Date(Date.now() + 3_600_000).toISOString(), scopes: GOOGLE_SCOPES, accountEmail: "owner@example.com" });
    const fakeFetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/drive/v3/")) return new Response(JSON.stringify({ error: { message: "Google Drive API has not been used in project 123 before or it is disabled." } }), { status: 403 });
      if (url.includes("/messages?")) return new Response(JSON.stringify({ messages: [] }), { status: 200 });
      return new Response(JSON.stringify({}), { status: 200 });
    }) as typeof fetch;
    const connector = new GoogleWorkspaceConnector(db, "http://127.0.0.1:4311/api/connectors/google/callback", fakeFetch);

    await assert.rejects(() => connector.searchDrive("launch", 3), /Drive API has not been used/);
    assert.equal(db.getConnector("google-workspace")?.connected, true);
    assert.equal(db.listConnectorServiceErrors()[0]?.service, "google-drive");
    assert.deepEqual(await connector.search("in:inbox", 1), []);
    assert.equal(db.getConnector("google-workspace")?.connected, true);
    assert.equal(db.listConnectorServiceErrors()[0]?.service, "google-drive");
    db.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("treats a refreshed successful OAuth callback as already connected", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-google-refresh-test-"));
  try {
    const db = new OpenBotDatabase(root);
    db.configureGoogleConnector({ clientId: "desktop-client.apps.googleusercontent.com" });
    db.completeGoogleConnector({ accessToken: "access", refreshToken: "refresh", expiresAt: new Date(Date.now() + 3_600_000).toISOString(), scopes: GOOGLE_SCOPES, accountEmail: "owner@example.com" });
    db.markConnectorError("google-workspace", "That Google sign-in expired. Start it again from OpenBot.");
    const connector = new GoogleWorkspaceConnector(db, "http://127.0.0.1:4311/api/connectors/google/callback", async () => { throw new Error("A refreshed callback must not call Google again."); });
    const connection = await connector.completeOAuth("already-used-state", "already-used-code");
    assert.equal(connection.accountEmail, "owner@example.com");
    assert.equal(connection.connected, true);
    db.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

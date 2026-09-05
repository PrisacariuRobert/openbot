import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenBotDatabase } from "./database.js";
import { toolAvailability } from "./tool-availability.js";
import { prepareWorkspace } from "./workspace.js";
import { GOOGLE_SCOPES } from "./google-workspace.js";

test("keeps irrelevant app schemas out of a file-only task and updates after capability changes", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-tool-context-"));
  const db = new OpenBotDatabase(root);
  try {
    const bot = db.updateBot("nova", {
      browserEnabled: false,
      computerEnabled: false,
    })!;
    const flags = toolAvailability(db, bot);
    for (const name of [
      "gmail_send",
      "gmail_search",
      "slack_read",
      "notion_update",
      "browser_click",
      "bash",
      "code_write",
      "mac_read",
    ])
      assert.equal(flags[name], false, name);
    assert.equal(flags.task_plan, undefined);
    assert.equal(flags.message_teammate, undefined);
    const workspace = prepareWorkspace(db, bot);
    const config = JSON.parse(
      readFileSync(path.join(workspace, "opencode.json"), "utf8"),
    );
    assert.equal(config.tools.gmail_search, false);
    db.updateStudioSettings({ macAccessEnabled: true });
    const updated = db.updateBot("nova", { browserEnabled: true })!;
    assert.equal(toolAvailability(db, updated).browser_click, true);
    assert.equal(toolAvailability(db, updated).mac_read, true);
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("exposes Google creation tools only after both OAuth scope and teammate permission", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-google-tool-context-"));
  const db = new OpenBotDatabase(root);
  try {
    const bot = db.getBot("nova")!;
    db.configureGoogleConnector({ clientId: "desktop-client.apps.googleusercontent.com" });
    db.completeGoogleConnector({ accessToken: "old-access", expiresAt: new Date(Date.now() + 3_600_000).toISOString(), scopes: ["https://www.googleapis.com/auth/drive.readonly", "https://www.googleapis.com/auth/calendar.readonly"], accountEmail: "owner@example.com" });
    db.setBotConnectorAccess(bot.id, { canRead: true, canSend: true }, "google-drive");
    db.setBotConnectorAccess(bot.id, { canRead: true, canSend: true }, "google-calendar");
    assert.equal(toolAvailability(db, bot).google_drive_read, true);
    assert.equal(toolAvailability(db, bot).google_drive_create, false);
    assert.equal(toolAvailability(db, bot).google_calendar_create, false);

    db.completeGoogleConnector({ accessToken: "new-access", expiresAt: new Date(Date.now() + 3_600_000).toISOString(), scopes: GOOGLE_SCOPES, accountEmail: "owner@example.com" });
    assert.equal(toolAvailability(db, bot).google_drive_create, false);
    db.setBotConnectorAccess(bot.id, { canRead: true, canSend: true }, "google-drive");
    db.setBotConnectorAccess(bot.id, { canRead: true, canSend: true }, "google-calendar");
    assert.equal(toolAvailability(db, bot).google_drive_create, true);
    assert.equal(toolAvailability(db, bot).google_calendar_create, true);
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

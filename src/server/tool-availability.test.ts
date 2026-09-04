import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenBotDatabase } from "./database.js";
import { toolAvailability } from "./tool-availability.js";
import { prepareWorkspace } from "./workspace.js";

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

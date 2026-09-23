import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenBotDatabase } from "./testing/database.js";
import { prepareWorkspace } from "./workspace.js";

function instructions(configure: (db: OpenBotDatabase) => void = () => {}) {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-instructions-"));
  const db = new OpenBotDatabase(root);
  try {
    db.updateBot("nova", { providerInstanceId: "local-opencode", model: "opencode-go/deepseek-v4.1-flash", computerEnabled: false, browserEnabled: false });
    configure(db);
    return readFileSync(path.join(prepareWorkspace(db, db.getBot("nova")!), "AGENTS.md"), "utf8");
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
}

test("a teammate only receives rules for capabilities it has", () => {
  const text = instructions();
  // Core rules every teammate keeps.
  for (const rule of ["Never claim an external action succeeded", "task_verify", "routine_create", "table_summary", "workspace_read", "persistent approval", "remember"]) {
    assert.ok(text.includes(rule), `core rule missing: ${rule}`);
  }
  // Rules for tools this teammate cannot call.
  for (const rule of ["Gmail search results", "Slack search results", "Notion search results", "Todoist results", "Dropbox results", "GitHub results", "code_projects", "mac_list", "mac_app_read", "use-mac-apps", "isolated bash", "Use only your own persistent browser profile", "browser_snapshot"]) {
    assert.ok(!text.includes(rule), `rule for an unavailable capability: ${rule}`);
  }
  assert.equal(text.match(/your browser is off/g)?.length, 1, "unavailable services share one line");
  assert.ok(!text.includes("Conversation style:"), "the per-task prompt already carries the conversation style");
});

test("turning a capability on brings its rules back", () => {
  const browser = instructions((db) => db.updateBot("nova", { browserEnabled: true }));
  for (const rule of ["Use the browser tools for websites.", "Use only your own persistent browser profile", "browser_request_sign_in"]) assert.ok(browser.includes(rule), rule);
  assert.ok(!browser.includes("your browser is off"));

  const computer = instructions((db) => db.updateBot("nova", { computerEnabled: true }));
  assert.ok(computer.includes("Use the isolated bash tool for terminal work."));

  const mac = instructions((db) => db.updateStudioSettings({ macAccessEnabled: true }));
  for (const rule of ["mac_list", "mac_app_read", "use-mac-apps", "hidden folders"]) assert.ok(mac.includes(rule), rule);
});

test("slim instructions stay well under the old size", () => {
  const text = instructions();
  assert.ok(text.length < 16_000, `instructions grew to ${text.length} characters`);
});

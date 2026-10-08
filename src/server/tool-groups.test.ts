import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { normalizeToolGroups, TOOL_GROUPS, toolGroupOf, toolTurnedOff } from "../shared/tool-groups.js";
import { OpenBotDatabase } from "./testing/database.js";
import { toolAvailability } from "./tool-availability.js";
import { prepareWorkspace } from "./workspace.js";
import { skillAuthoringFixture } from "./testing/skill-authoring-fixture.js";
import { TEAM_TEMPLATES } from "./team-templates.js";

test("tool groups: known ids only, in order; no choice keeps every group", () => {
  assert.equal(normalizeToolGroups(null), null);
  assert.equal(normalizeToolGroups(undefined), null);
  assert.deepEqual(normalizeToolGroups(["teamwork", "unknown", "documents", "teamwork"]), ["documents", "teamwork"]);
  assert.deepEqual(normalizeToolGroups([]), []);
  assert.equal(toolGroupOf("routine_pause"), "routines");
  assert.equal(toolGroupOf("workspace_read"), null, "core tools belong to no group");
  assert.equal(toolTurnedOff(null, "routine_create"), false);
  assert.equal(toolTurnedOff(["documents"], "routine_create"), true);
  assert.equal(toolTurnedOff(["documents"], "task_verify"), false, "core tools can't be turned off");
  const all = TOOL_GROUPS.flatMap((group) => [...group.tools]);
  assert.equal(new Set(all).size, all.length, "a tool is in one group at most");
});

function studio(configure: (db: OpenBotDatabase) => void) {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-tool-groups-"));
  const db = new OpenBotDatabase(root);
  db.updateBot("nova", { providerInstanceId: "local-opencode", model: "opencode-go/deepseek-v4.1-flash", computerEnabled: false, browserEnabled: false });
  configure(db);
  return { db, close: () => { db.close(); rmSync(root, { recursive: true, force: true }); } };
}

test("a teammate gets only its groups' tools, in its instructions and its runtime config, and is told what's off", () => {
  const { db, close } = studio((db) => db.updateBot("nova", { toolGroups: ["teamwork"] }));
  try {
    const bot = db.getBot("nova")!;
    assert.deepEqual(bot.toolGroups, ["teamwork"]);
    const available = toolAvailability(db, bot);
    for (const tool of ["routine_create", "routine_list", "spreadsheet_export", "table_summary", "document_export"]) assert.equal(available[tool], false, tool);
    for (const tool of ["message_teammate", "handoff", "task_verify", "remember", "skill_propose"]) assert.equal(available[tool], true, tool);
    const workspace = prepareWorkspace(db, bot);
    const agents = readFileSync(path.join(workspace, "AGENTS.md"), "utf8");
    assert.match(agents, /The owner turned off these tools for you: documents and spreadsheets; routines and reminders\./);
    assert.doesNotMatch(agents, /routine_create|table_summary|spreadsheet_export/, "no rules for tools it doesn't have");
    const config = JSON.parse(readFileSync(path.join(workspace, "opencode.json"), "utf8"));
    assert.equal(config.tools.routine_create, false);
    assert.notEqual(config.permission.routine_create, "allow");
    assert.equal(config.permission.message_teammate, "allow");

    db.updateBot("nova", { toolGroups: null });
    assert.equal(db.getBot("nova")!.toolGroups, null);
    assert.equal(toolAvailability(db, db.getBot("nova")!).routine_create, true, "back to every group");
    assert.doesNotMatch(readFileSync(path.join(prepareWorkspace(db, db.getBot("nova")!), "AGENTS.md"), "utf8"), /turned off/);
  } finally { close(); }
});

test("changing tool groups starts a fresh runtime session; a copy keeps them", () => {
  const { db, close } = studio(() => {});
  try {
    const before = db.botSessionFingerprint("nova");
    db.updateBot("nova", { toolGroups: ["documents"] });
    assert.notEqual(db.botSessionFingerprint("nova"), before);
    assert.deepEqual(db.duplicateBot("nova")!.toolGroups, ["documents"]);
  } finally { close(); }
});

test("the starter specialists get the groups their jobs need; the first teammate keeps every group", () => {
  const starter = TEAM_TEMPLATES.find((template) => template.id === "starter-team")!;
  const groups = Object.fromEntries(starter.members.map((member) => [member.key, member.toolGroups ?? null]));
  assert.deepEqual(groups, { chief: null, researcher: ["documents", "teamwork"], writer: ["documents", "teamwork"] });
});

test("the host refuses a tool from a group the owner turned off, even if the runtime asks for it", { timeout: 60_000 }, async () => {
  const runtime = `#!${process.execPath}
const fs = require('node:fs');
const endpoint = process.env.OPENBOT_INTERNAL_URL, runId = process.env.OPENBOT_RUN_ID;
if (!endpoint || !runId) { console.log('Fixture runtime'); process.exit(0); }
const call = (action, args) => fetch(endpoint + '/api/internal/tools', { method: 'POST', headers: { 'content-type': 'application/json', 'x-openbot-token': process.env.OPENBOT_INTERNAL_TOKEN }, body: JSON.stringify({ botId: process.env.OPENBOT_BOT_ID, runId, action, args }) }).then(async (r) => ({ status: r.status, body: await r.json() }));
(async () => {
  const routine = await call('routine_create', { name: 'Check invoices', prompt: 'Check invoices', intervalMinutes: 60 });
  const memory = await call('memory_search', { query: 'invoices' });
  fs.writeFileSync('.tool-groups-' + runId + '.json', JSON.stringify({ routine, memory }));
  console.log(JSON.stringify({ type: 'text', text: 'Done.' }));
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
`;
  const f = await skillAuthoringFixture({ runtime, configure: (db) => db.updateBot("nova", { toolGroups: ["documents"] }) });
  try {
    const sent = await f.post("/api/messages", { threadId: "bot-nova", body: "Look into my invoices for me.", targetBotIds: ["nova"] });
    assert.equal(sent.status, 202);
    const { runs } = await sent.json() as { runs: Array<{ id: string }> };
    const file = path.join(f.db.workspacesDir, "nova", `.tool-groups-${runs[0]!.id}.json`);
    const observed = await f.until(() => existsSync(file) && JSON.parse(readFileSync(file, "utf8")));
    assert.equal(observed.routine.status, 403);
    assert.match(observed.routine.body.error, /turned off routines and reminders for Nova/);
    assert.equal(observed.memory.status, 200, "core tools still work");
    assert.equal(f.db.listRoutines().length, 0, "nothing was created");

    const patched = await f.post("/api/bots/nova", { toolGroups: ["documents", "routines"] }, "PATCH");
    assert.equal(patched.status, 200);
    assert.deepEqual(((await patched.json()) as { toolGroups: string[] }).toolGroups, ["documents", "routines"]);
    assert.equal((await f.post("/api/bots/nova", { toolGroups: ["everything"] }, "PATCH")).status, 400);
  } finally { await f.close(); }
});

import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenBotDatabase } from "./testing/database.js";
import { CommunitySkills } from "./community-skills.js";
import { prepareWorkspace } from "./workspace.js";
import { toolAvailability } from "./tool-availability.js";

test("bundled methods work out of the box, preserve attribution and grant no account access", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-bundled-")), db = new OpenBotDatabase(root);
  try {
    const library = new CommunitySkills(db), skills = library.list();
    assert.equal(skills.length, 7);
    for (const skill of skills) {
      assert.equal(skill.bundled, true); assert.deepEqual(skill.blockers, []);
      assert.ok(skill.botIds.includes("nova") && skill.botIds.includes("pixel"));
      assert.match(library.read("nova", skill.id, "LICENSE").content!, /Permission is hereby granted/);
      assert.ok(skill.instructions.length < 3_000);
    }
    const adapted = skills.filter((skill) => skill.source.includes("hermes-agent"));
    assert.equal(adapted.length, 5);
    assert.ok(adapted.every((skill) => skill.source.includes("622883bad7f55f56a6393cd994e36c65fbdff253")));
    assert.ok(db.listConnectors().every((connection) => !connection.connected));
    assert.deepEqual(db.extensionRecords("mcp"), []);
    assert.equal(toolAvailability(db, db.getBot("nova")!, false).community_skill_search, true);
    prepareWorkspace(db, db.getBot("nova")!);
    assert.match(readFileSync(path.join(db.workspacesDir, "nova/AGENTS.md"), "utf8"), /do not ask the user to import it/);
  } finally { db.close(); rmSync(root, { recursive: true, force: true }); }
});

test("default skills include new teammates and opt-outs persist across restart", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-bundled-access-"));
  let db = new OpenBotDatabase(root);
  try {
    const id = "bundled-meeting-action-items";
    const library = new CommunitySkills(db), before = db.botSessionFingerprint("nova");
    library.assign(id, ["pixel"]);
    assert.notEqual(db.botSessionFingerprint("nova"), before);
    assert.throws(() => library.read("nova", id), /no longer shared/);
    assert.ok(library.read("pixel", id).content);
    db.close(); db = new OpenBotDatabase(root);
    const reopened = new CommunitySkills(db);
    assert.throws(() => reopened.read("nova", id), /no longer shared/);
    const newcomer = db.createBot({ name: "Newcomer", emoji: "N", color: "#555555", role: "Helper", instructions: "Help", computerEnabled: false, browserEnabled: false });
    assert.ok(reopened.read(newcomer.id, id).content);
    reopened.remove(id);
    const later = db.createBot({ name: "Later", emoji: "L", color: "#555555", role: "Helper", instructions: "Help" });
    assert.throws(() => reopened.read(later.id, id), /no longer shared/);
    assert.equal(reopened.list().find((skill) => skill.id === id)?.botIds.length, 0);
    reopened.assign(id, ["nova"]);
    assert.ok(reopened.read("nova", id).content);
    assert.throws(() => reopened.read("pixel", id), /no longer shared/);
    assert.throws(() => reopened.assign(id, ["unknown"]), /available teammate/);
    assert.throws(() => reopened.read("nova", id, "../../secret"));
  } finally { db.close(); rmSync(root, { recursive: true, force: true }); }
});

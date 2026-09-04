import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { OpenBotDatabase } from "./database.js";
import { BrowserManager } from "./runtime.js";
import { createSkillPackage, parseSkillPackage, skillSecretFindings, SKILL_TEMPLATES } from "./skill-library.js";

const definition = {
  name: "Release check",
  description: "Check a release page and report anything broken.",
  instructions: "Open the page, inspect the important path, and verify the result.",
  startUrl: "https://example.com/releases",
  steps: [{ type: "navigate" as const, url: "https://example.com/releases", label: "Open releases" }],
  version: 3,
};

test("exports and verifies a portable skill without owner data", () => {
  const packaged = createSkillPackage(definition);
  assert.equal(packaged.format, "openbot.skill");
  assert.match(packaged.integrity, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(parseSkillPackage(packaged), definition);
  assert.equal(JSON.stringify(packaged).includes("botId"), false);
});

test("rejects changed packages and private values while allowing placeholders", () => {
  const packaged = createSkillPackage(definition);
  assert.throws(() => parseSkillPackage({ ...packaged, skill: { ...packaged.skill, name: "Changed" } }), /changed after it was exported/i);
  const exposed = { ...definition, steps: [{ type: "input" as const, url: "https://example.com/login", label: "Password", value: "real-password" }] };
  assert.match(skillSecretFindings(exposed).join(" "), /private field/i);
  assert.match(skillSecretFindings({ ...definition, instructions: "Use access_token=very-private-value" }).join(" "), /credential value/i);
  const placeholder = { ...exposed, steps: [{ ...exposed.steps[0], value: "{{secret}}" }] };
  assert.deepEqual(skillSecretFindings(placeholder), []);
});

test("starter skills stay bounded and secret-free", () => {
  assert.ok(SKILL_TEMPLATES.length >= 3);
  for (const template of SKILL_TEMPLATES) {
    assert.ok(template.steps.length <= 3);
    assert.deepEqual(skillSecretFindings({ ...template, version: 1 }), []);
  }
});

test("imports, versions, rolls back, and assigns skills without sharing private history", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-portable-skill-test-"));
  try {
    const db = new OpenBotDatabase(root), manager = new BrowserManager(db);
    const imported = manager.importTaughtWorkflow("nova", createSkillPackage(definition));
    assert.equal(imported.source, "imported");
    assert.equal(imported.version, 1);
    const skillPath = path.join(db.workspacesDir, "nova", ".opencode", "skills", imported.skillSlug, "SKILL.md");
    assert.equal(existsSync(skillPath), true);
    assert.match(readFileSync(skillPath, "utf8"), /Check a release page/);
    const edited = manager.updateTaughtWorkflow(imported.id, {
      name: imported.name, description: "Review the release page carefully.",
      instructions: imported.instructions, startUrl: imported.startUrl,
    });
    assert.equal(edited?.version, 2);
    assert.equal(db.listWorkflowVersions(imported.id).length, 2);
    const restored = manager.rollbackTaughtWorkflow(imported.id, 1);
    assert.equal(restored?.version, 3);
    assert.equal(restored?.description, definition.description);
    const assigned = manager.assignTaughtWorkflow(imported.id, "pixel");
    assert.equal(assigned.source, "assigned");
    assert.equal(assigned.botId, "pixel");
    assert.notEqual(assigned.id, imported.id);
    assert.deepEqual(parseSkillPackage(manager.exportTaughtWorkflow(assigned.id)).name, definition.name);
    await manager.close();
    db.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

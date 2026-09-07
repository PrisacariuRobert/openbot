import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CommunitySkills, inspectCommunitySkill, skillFilePath } from "./community-skills.js";
import { OpenBotDatabase } from "./testing/database.js";
import { prepareWorkspace } from "./workspace.js";
import { toolAvailability } from "./tool-availability.js";

const markdown = "---\nname: project-brief\ndescription: Prepare a concise project brief\nlicense: MIT\n---\nRead the current sources and use [the format](references/format.md).";
const bundle = { source: "Fixture created for OpenBot tests", files: { "SKILL.md": markdown, "references/format.md": "Include Owner, Deadline, Blocker, Source." } };

test("portable skill bundles preserve provenance and explicit references without a browser URL", () => {
  const inspected = inspectCommunitySkill(bundle);
  assert.equal(inspected.name, "project-brief"); assert.equal(inspected.blockers.length, 0); assert.equal(inspected.license, "MIT");
  assert.equal(inspected.files["references/format.md"], bundle.files["references/format.md"]);
  assert.notEqual(inspected.digest, inspectCommunitySkill({ ...bundle, source: "Different source" }).digest);
});

test("traversal, hidden files, scripts, alias bombs, oversized files and missing references fail visibly", () => {
  for (const name of ["../SKILL.md", "references/../secret.md", "references//x.md", "/SKILL.md", "scripts/install.py", ".env", "references\\secret.md", "references/%2e%2e/x.md"]) assert.throws(() => skillFilePath(name));
  assert.throws(() => inspectCommunitySkill({ ...bundle, files: { "SKILL.md": "x".repeat(33_000) } }));
  assert.throws(() => inspectCommunitySkill({ ...bundle, files: { "SKILL.md": "---\nname: &a alias\ndescription: *a\n---\nbody" } }));
  assert.match(inspectCommunitySkill({ ...bundle, files: { "SKILL.md": markdown } }).blockers.join(), /Missing referenced/);
});

test("Hermes metadata, tool approval policies, and scripts require adaptation instead of silent compatibility", () => {
  for (const extra of ["allowed-tools: Bash\n", "metadata:\n  hermes:\n    requires_tools: [terminal]\n", "platforms: [linux]\n"]) {
    const inspected = inspectCommunitySkill({ ...bundle, files: { ...bundle.files, "SKILL.md": markdown.replace("license: MIT\n", extra) } });
    assert.ok(inspected.blockers.length > 0);
  }
  assert.ok(inspectCommunitySkill({ ...bundle, files: { ...bundle.files, "SKILL.md": markdown + "\nRun scripts/setup.py" } }).blockers.length > 0);
});

test("review is bound to exact skill bytes; access can be revoked without touching source files", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-skills-test-")), db = new OpenBotDatabase(root);
  try {
    const library = new CommunitySkills(db), inspected = inspectCommunitySkill(bundle);
    assert.throws(() => library.install({ ...bundle, source: "changed" }, inspected.digest, ["nova"]), /changed after review/);
    const skill = library.install(bundle, inspected.digest, ["nova"]);
    assert.ok(library.search("nova", "project").some((item) => item.id === skill.id));
    assert.ok(!library.search("pixel").some((item) => item.id === skill.id));
    assert.equal(library.search("nova", "project brief for Cedar")[0]?.id, skill.id);
    assert.equal(library.read("nova", skill.id, "references/format.md").content, bundle.files["references/format.md"]);
    assert.throws(() => library.read("pixel", skill.id), /no longer shared/);
    const fingerprint = db.botSessionFingerprint("nova");
    library.assign(skill.id, []); assert.notEqual(db.botSessionFingerprint("nova"), fingerprint);
    assert.throws(() => library.read("nova", skill.id), /no longer shared/);
  } finally { db.close(); rmSync(root, { recursive: true, force: true }); }
});

test("memory correction and deletion invalidate old sessions; notes stay private and bounded", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-memory-test-")), db = new OpenBotDatabase(root);
  try {
    db.remember("nova", "timezone", "Europe/Brussels");
    const fingerprint = db.botSessionFingerprint("nova");
    db.remember("nova", "timezone", "Europe/Bucharest");
    assert.notEqual(fingerprint, db.botSessionFingerprint("nova"));
    assert.equal(db.searchMemories("nova", "timezone")[0]!.content, "Europe/Bucharest"); assert.equal(db.searchMemories("pixel", "timezone").length, 0);
    db.forgetMemory("nova", "timezone"); assert.equal(db.searchMemories("nova", "").length, 0);
    assert.throws(() => db.remember("nova", "huge", "x".repeat(1_201)), /short memory/);
    for (let i = 0; i < 30; i++) db.remember("nova", `note-${i}`, "A useful preference. ".repeat(50));
    prepareWorkspace(db, db.getBot("nova")!);
    const profile = readFileSync(path.join(db.workspacesDir, "nova", "AGENTS.md"), "utf8");
    const memory = profile.split("## Durable memory")[1]!.split("## Optional community")[0]!;
    assert.ok(memory.length < 4_600);
    assert.equal(toolAvailability(db, db.getBot("nova")!, true).memory_search, false);
  } finally { db.close(); rmSync(root, { recursive: true, force: true }); }
});

import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenBotDatabase } from "./testing/database.js";
import { applyProfileImport, previewProfileImport } from "./profile-import.js";

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-profile-import-")), db = new OpenBotDatabase(root);
  return { root, db, close: () => { db.close(); rmSync(root, { recursive: true, force: true }); } };
}

function writeHermesProfile(root: string): string {
  const profile = path.join(root, "hermes", "profiles", "researcher");
  mkdirSync(path.join(profile, "memories"), { recursive: true });
  mkdirSync(path.join(profile, "skills", "devops", "deploy-notes"), { recursive: true });
  mkdirSync(path.join(profile, "skills", "devops", "deploy-notes", "references"), { recursive: true });
  writeFileSync(path.join(profile, "SOUL.md"), `---\nname: Ranger\n---\n\n# Ranger, the careful researcher\n\nYou double-check every claim before stating it. You prefer sources over vibes.\nWhen unsure, you say what you would check next instead of guessing.\n`);
  writeFileSync(path.join(profile, "memories", "MEMORY.md"), "User's project is a Rust web service at ~/code/myapi using Axum + SQLx§\n§This machine runs Ubuntu 22.04 with Docker installed\n");
  writeFileSync(path.join(profile, "memories", "USER.md"), "Prefers concise responses§Dislikes verbose explanations\n");
  writeFileSync(path.join(profile, "skills", "devops", "deploy-notes", "SKILL.md"), `---\nname: deploy-notes\ndescription: Where deploy notes live and how to write them.\n---\n\n# Deploy notes\n\nWrite the notes to references/last.md after each deploy.\n`);
  writeFileSync(path.join(profile, "skills", "devops", "deploy-notes", "references", "format.md"), "# Format\n\nOne heading per service.\n");
  writeFileSync(path.join(profile, "skills", "devops", "deploy-notes", "hack.sh"), "rm -rf /\n");
  writeFileSync(path.join(profile, "config.yaml"), "provider: openrouter\nmodel: google/gemini-3-flash-preview\nopenrouter_api_key: sk-secret-value\n");
  return profile;
}

function writeOpenClawHome(root: string): string {
  const home = path.join(root, "openclaw");
  mkdirSync(path.join(home, "skills", "expense-filing"), { recursive: true });
  writeFileSync(path.join(home, "SOUL.md"), "# Penny\n\nYou keep receipts tidy and flag anything odd.\n");
  writeFileSync(path.join(home, "MEMORY.md"), "Expense portal is at portal.example.com\n");
  writeFileSync(path.join(home, "USER.md"), "Owner files expenses weekly\n");
  writeFileSync(path.join(home, "skills", "expense-filing", "SKILL.md"), "---\nname: expense-filing\ndescription: File an expense end to end.\n---\n\n# Expense filing\n\nOpen the portal, attach the receipt, submit.\n");
  return home;
}

test("a Hermes profile previews with persona, memories, skills and honest skips", () => {
  const f = fixture();
  try {
    const profile = writeHermesProfile(f.root);
    const plan = previewProfileImport(profile);
    assert.equal(plan.kind, "hermes");
    assert.equal(plan.name, "Ranger");
    assert.equal(plan.nameSource, "frontmatter");
    assert.match(plan.role, /careful researcher/);
    assert.match(plan.instructions, /double-check every claim/);
    assert.equal(plan.instructionsTruncated, false);
    assert.equal(plan.memories.filter((memory) => memory.kind === "agent").length, 2);
    assert.equal(plan.memories.filter((memory) => memory.kind === "owner").length, 2);
    assert.match(plan.memories[0]!.text, /Rust web service/);
    assert.equal(plan.skills.length, 1);
    assert.equal(plan.skills[0]!.slug, "deploy-notes");
    assert.equal(plan.skills[0]!.files, 2);
    assert.equal(plan.hints.provider, "openrouter");
    assert.equal(plan.hints.model, "google/gemini-3-flash-preview");
    assert.equal(plan.skipped.some((entry) => /Credentials and API keys/.test(entry)), true);
    assert.equal(plan.skipped.some((entry) => /Chat history/.test(entry)), true);
    // The secret is detected as present but never copied into the plan.
    assert.equal(JSON.stringify(plan).includes("sk-secret-value"), false);
    assert.equal(plan.warnings.some((warning) => /credential/.test(warning)), true);
  } finally { f.close(); }
});

test("the default Hermes home (no profiles/ folder) imports as itself", () => {
  const f = fixture();
  try {
    const home = writeHermesProfile(f.root);
    const flat = path.join(f.root, "hermes");
    assert.equal(previewProfileImport(home).kind, "hermes");
    // The hermes root itself has no SOUL.md; the named profile is the target.
    assert.throws(() => previewProfileImport(flat), /does not look like a Hermes profile/);
  } finally { f.close(); }
});

test("an OpenClaw home previews with flat memory files", () => {
  const f = fixture();
  try {
    const home = writeOpenClawHome(f.root);
    const plan = previewProfileImport(home);
    assert.equal(plan.kind, "openclaw");
    assert.equal(plan.name, "Penny");
    assert.equal(plan.nameSource, "heading");
    assert.equal(plan.memories.length, 2);
    assert.equal(plan.skills[0]!.slug, "expense-filing");
  } finally { f.close(); }
});

test("applying creates a working teammate with memories and copied text skills", () => {
  const f = fixture();
  try {
    const profile = writeHermesProfile(f.root);
    const result = applyProfileImport(f.db, profile, { name: "Ranger" });
    const bot = f.db.getBot(result.botId)!;
    assert.equal(bot.name, "Ranger");
    assert.match(bot.instructions, /double-check every claim/);
    assert.match(bot.instructions, /different agent tool/);
    const memories = f.db.listMemories(bot.id);
    assert.equal(memories.length, 4);
    assert.ok(memories.some((memory) => /Rust web service/.test(memory.content)));
    const skillFile = path.join(f.db.workspacesDir, bot.id, ".opencode", "skills", "deploy-notes", "SKILL.md");
    const claudeFile = path.join(f.db.workspacesDir, bot.id, ".claude", "skills", "deploy-notes", "SKILL.md");
    assert.equal(existsSync(skillFile), true);
    assert.equal(existsSync(claudeFile), true);
    assert.match(readFileSync(skillFile, "utf8"), /Deploy notes/);
    assert.equal(existsSync(path.join(path.dirname(skillFile), "hack.sh")), false);
    assert.equal(existsSync(path.join(path.dirname(skillFile), "references", "format.md")), true);
    // A second import of the same profile does not collide on the name.
    const again = applyProfileImport(f.db, profile);
    assert.equal(again.name, "Ranger (imported)");
    assert.notEqual(again.botId, result.botId);
  } finally { f.close(); }
});

test("junk input fails with a clear message and changes nothing", () => {
  const f = fixture();
  try {
    const empty = path.join(f.root, "empty");
    mkdirSync(empty, { recursive: true });
    assert.throws(() => previewProfileImport(empty), /does not look like a Hermes profile/);
    assert.throws(() => previewProfileImport(path.join(f.root, "missing")), /does not exist/);
    assert.throws(() => previewProfileImport(""), /Give the folder/);
    assert.equal(f.db.listBots().length, 3);
  } finally { f.close(); }
});

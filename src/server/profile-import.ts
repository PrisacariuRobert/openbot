import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { OpenBotDatabase } from "./database.js";

/** Import a Hermes or OpenClaw agent profile into an OpenBot teammate.
 * What moves: the persona (SOUL.md → role + instructions), curated memories
 * (MEMORY.md/USER.md → private notes), and text skills (SKILL.md bundles →
 * the teammate's skill directories). What never moves: credentials and API
 * keys, chat history, messaging-platform settings, cron jobs — the preview
 * says so explicitly, and secrets are detected and refused, not copied. */

export type ImportSourceKind = "hermes" | "openclaw";

export interface ProfileImportSkill {
  name: string;
  slug: string;
  description: string;
  files: number;
}

export interface ProfileImportPlan {
  source: string;
  kind: ImportSourceKind;
  name: string;
  nameSource: "frontmatter" | "heading" | "folder";
  role: string;
  instructions: string;
  instructionsTruncated: boolean;
  memories: Array<{ kind: "agent" | "owner"; text: string }>;
  skills: ProfileImportSkill[];
  hints: { provider: string | null; model: string | null };
  skipped: string[];
  warnings: string[];
}

export interface ProfileImportResult {
  botId: string;
  name: string;
  memories: number;
  skills: number;
  warnings: string[];
}

const MAX_INSTRUCTION_CHARS = 6_000;
const MAX_MEMORIES = 40;
const MAX_MEMORY_CHARS = 700;
const MAX_SKILLS = 40;
const MAX_SKILL_FILE_CHARS = 256_000;
const MAX_SKILL_FILES = 24;
const ADAPTATION_NOTE = `Imported persona — the original was written for a different agent tool. Some of its habits may name tools you do not have here. Your real capabilities in OpenBot: browser work with owner sign-in takeover, connectors the owner grants, files, and scheduled routines. Never claim a Hermes/OpenClaw tool you do not have; ask the owner instead.`;

function expandHome(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Give the folder that holds the profile (for example ~/.hermes or ~/.openclaw).");
  const expanded = trimmed.startsWith("~") ? path.join(homedir(), trimmed.slice(1)) : path.resolve(trimmed);
  if (!existsSync(expanded) || !statSync(expanded).isDirectory()) throw new Error("That folder does not exist. Give the profile folder, e.g. ~/.hermes, ~/.hermes/profiles/research, or ~/.openclaw.");
  return expanded;
}

function readText(file: string): string {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function stripFrontmatter(markdown: string): { frontmatter: string; body: string } {
  const normalized = markdown.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---")) return { frontmatter: "", body: normalized };
  const end = normalized.indexOf("\n---", 3);
  if (end === -1) return { frontmatter: "", body: normalized };
  return { frontmatter: normalized.slice(4, end), body: normalized.slice(end + 4).replace(/^\n+/, "") };
}

function frontmatterValue(frontmatter: string, key: string): string | null {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  return match ? match[1]!.trim().replace(/^["']|["']$/g, "") || null : null;
}

function slugify(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 48);
}

function parseMemoryFile(file: string, kind: "agent" | "owner", plan: ProfileImportPlan): void {
  const raw = readText(file).replace(/\r\n/g, "\n");
  if (!raw.trim()) return;
  const entries = raw.includes("§") ? raw.split("§") : raw.split("\n");
  for (const entry of entries) {
    const text = entry.replace(/^[-*#\s]+/, "").trim();
    if (!text || /^={3,}|^memory\b|^user profile\b/i.test(text)) continue;
    if (plan.memories.length >= MAX_MEMORIES) {
      plan.warnings.push(`More than ${MAX_MEMORIES} memory entries exist; the rest stay in the original file.`);
      return;
    }
    if (text.length > MAX_MEMORY_CHARS) {
      plan.warnings.push("One memory entry was longer than OpenBot's note size and was kept out — review it by hand.");
      continue;
    }
    plan.memories.push({ kind, text });
  }
}

/** Text-only skill files, same safety line as the community-skill importer:
 * no scripts, no hidden files, no parent paths, bounded size. */
const SKILL_FILE_PATTERN = /^(SKILL\.md|LICENSE(\.[A-Za-z-]+)?|(references|templates|assets|examples)\/[A-Za-z0-9][A-Za-z0-9._-]{0,80})$/;

function skillFiles(skillDir: string): string[] {
  const collected: string[] = [];
  const walk = (relative: string) => {
    if (collected.length >= MAX_SKILL_FILES) return;
    for (const entry of readdirSync(path.join(skillDir, relative || "."), { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(childRelative);
      else if (SKILL_FILE_PATTERN.test(childRelative)) collected.push(childRelative);
    }
  };
  walk("");
  return collected;
}

function collectSkills(sourceDir: string, skillsRoot: string, plan: ProfileImportPlan): void {
  const root = path.join(sourceDir, skillsRoot);
  if (!existsSync(root) || !statSync(root).isDirectory()) return;
  const scan = (dir: string, depth: number) => {
    if (plan.skills.length >= MAX_SKILLS) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const child = path.join(dir, entry.name);
      const skillFile = path.join(child, "SKILL.md");
      if (existsSync(skillFile)) {
        const { frontmatter, body } = stripFrontmatter(readText(skillFile));
        const description = frontmatterValue(frontmatter, "description") || body.split("\n").find((line) => line.trim() && !line.startsWith("#"))?.trim() || "";
        const heading = body.match(/^#\s+(.+)$/m)?.[1]?.trim();
        plan.skills.push({
          name: frontmatterValue(frontmatter, "name") || heading || entry.name,
          slug: slugify(entry.name) || `skill-${plan.skills.length + 1}`,
          description: description.slice(0, 200),
          files: skillFiles(child).length,
        });
      } else if (depth < 2) {
        scan(child, depth + 1);
      }
    }
  };
  scan(root, 0);
}

function detectKind(dir: string): ImportSourceKind {
  const has = (relative: string) => existsSync(path.join(dir, relative));
  if (has(path.join("memories", "MEMORY.md")) || has("config.yaml") || has("profiles")) return "hermes";
  if (has("MEMORY.md") || has("USER.md")) return "openclaw";
  throw new Error("That folder does not look like a Hermes profile or an OpenClaw home. Look for SOUL.md inside it — for example ~/.hermes, ~/.hermes/profiles/<name>, or ~/.openclaw.");
}

export function previewProfileImport(rawPath: string): ProfileImportPlan {
  const source = expandHome(rawPath);
  const kind = detectKind(source);
  if (!existsSync(path.join(source, "SOUL.md"))) {
    throw new Error("That folder does not look like a Hermes profile or an OpenClaw home. Look for SOUL.md inside it — for example ~/.hermes, ~/.hermes/profiles/<name>, or ~/.openclaw.");
  }
  const baseName = path.basename(source);
  const folder = baseName === ".hermes" || baseName === ".openclaw" ? kind : baseName;
  const { frontmatter, body } = stripFrontmatter(readText(path.join(source, "SOUL.md")));
  const heading = body.match(/^#\s+(.+)$/m)?.[1]?.trim() || null;
  const nameRaw = frontmatterValue(frontmatter, "name") || heading || folder;
  const roleRaw = heading || body.split("\n").map((line) => line.trim()).find((line) => line && !line.startsWith("#")) || "Imported teammate";
  const instructionsRaw = body.trim();
  const memories: ProfileImportPlan["memories"] = [];
  const skills: ProfileImportSkill[] = [];
  const hints = { provider: null as string | null, model: null as string | null };
  const warnings: string[] = [];
  const plan: ProfileImportPlan = {
    source, kind,
    name: nameRaw.replace(/\s+/g, " ").trim().slice(0, 40) || "Imported teammate",
    nameSource: frontmatterValue(frontmatter, "name") ? "frontmatter" : heading ? "heading" : "folder",
    role: roleRaw.replace(/\s+/g, " ").trim().slice(0, 90),
    instructions: instructionsRaw.length > MAX_INSTRUCTION_CHARS ? `${instructionsRaw.slice(0, MAX_INSTRUCTION_CHARS)}\n\n[Truncated for import — the full SOUL.md stays in the original folder.]` : instructionsRaw,
    instructionsTruncated: instructionsRaw.length > MAX_INSTRUCTION_CHARS,
    memories, skills, hints, warnings,
    skipped: [
      "Credentials and API keys (config.yaml, .env) — never copied. Connect the model in OpenBot; the owner re-enters any key.",
      "Chat history and sessions (state.db) — they stay in the original tool.",
      "Messaging platform settings (Telegram, Discord, Slack, …).",
      "Cron jobs — recreate them as OpenBot routines when you are ready.",
    ],
  };
  parseMemoryFile(path.join(source, kind === "hermes" ? path.join("memories", "MEMORY.md") : "MEMORY.md"), "agent", plan);
  parseMemoryFile(path.join(source, kind === "hermes" ? path.join("memories", "USER.md") : "USER.md"), "owner", plan);
  collectSkills(source, "skills", plan);
  const config = readText(path.join(source, "config.yaml"));
  hints.provider = config.match(/^\s*provider:\s*["']?([\w./-]+)/m)?.[1] ?? null;
  hints.model = config.match(/^\s*model:\s*["']?([\w./:-]+)/m)?.[1] ?? null;
  const secretEvidence = /(api[_-]?key|token|secret|password)\s*:/i.test(config) || existsSync(path.join(source, ".env"));
  if (secretEvidence) warnings.push("This profile contains credential-looking settings. They are listed as skipped and are not part of this import.");
  return plan;
}

function copySkill(sourceDir: string, skill: ProfileImportSkill, botId: string, db: OpenBotDatabase): number {
  const originDir = findSkillDir(sourceDir, skill.slug);
  if (!originDir) return 0;
  const relativeFiles = skillFiles(originDir);
  let copied = 0;
  for (const provider of [".opencode", ".claude"]) {
    const target = path.join(db.workspacesDir, botId, provider, "skills", skill.slug);
    for (const relative of relativeFiles) {
      const content = readText(path.join(originDir, relative));
      if (!content || content.length > MAX_SKILL_FILE_CHARS) continue;
      mkdirSync(path.dirname(path.join(target, relative)), { recursive: true });
      writeFileSync(path.join(target, relative), content, "utf8");
      if (provider === ".opencode") copied += 1;
    }
  }
  return copied;
}

function findSkillDir(sourceDir: string, slug: string): string | null {
  const root = path.join(sourceDir, "skills");
  if (!existsSync(root)) return null;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const child = path.join(root, entry.name);
    if (slugify(entry.name) === slug) return child;
    const nested = path.join(child, "SKILL.md");
    if (!existsSync(nested)) {
      for (const nestedEntry of readdirSync(child, { withFileTypes: true })) {
        if (nestedEntry.isDirectory() && slugify(nestedEntry.name) === slug) return path.join(child, nestedEntry.name);
      }
    }
  }
  return null;
}

export function applyProfileImport(db: OpenBotDatabase, rawPath: string, options: { name?: string } = {}): ProfileImportResult {
  const plan = previewProfileImport(rawPath);
  let name = (options.name || plan.name).replace(/\s+/g, " ").trim().slice(0, 40) || "Imported teammate";
  if (db.listBots().some((bot) => bot.name.toLowerCase() === name.toLowerCase() && !bot.retiredAt)) {
    name = `${name} (imported)`.slice(0, 40);
  }
  const bot = db.createBot({
    name,
    emoji: "✳️",
    mascot: "orbit",
    color: "#6b6b6b",
    role: plan.role,
    instructions: `${plan.instructions}\n\n${ADAPTATION_NOTE}`,
    computerEnabled: false,
    browserEnabled: true,
  });
  for (const [index, memory] of plan.memories.entries()) {
    db.remember(bot.id, `imported:${memory.kind}:${index + 1}`, memory.text, { source: "owner", expiresAt: null });
  }
  let skillFilesCopied = 0;
  for (const skill of plan.skills) skillFilesCopied += copySkill(plan.source, skill, bot.id, db);
  return {
    botId: bot.id,
    name: bot.name,
    memories: plan.memories.length,
    skills: plan.skills.length,
    warnings: [
      ...plan.warnings,
      skillFilesCopied ? `Copied ${skillFilesCopied} skill files.` : plan.skills.length ? "No skill files could be copied safely — review the originals." : "",
    ].filter(Boolean),
  };
}

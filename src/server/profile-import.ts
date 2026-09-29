import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { OpenBotDatabase } from "./database.js";
import type { RoutineSchedule } from "../shared/calendar-schedule.js";

/** Import a Hermes or OpenClaw agent profile into an OpenBot teammate.
 * What moves: the persona (SOUL.md → role + instructions), curated memories
 * (MEMORY.md/USER.md → private notes), and text skills (SKILL.md bundles →
 * the teammate's skill directories). What never moves: credentials and API
 * keys, chat history, messaging-platform settings — the preview
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
  /** Hermes cron jobs. Convertible ones become paused OpenBot routines. */
  jobs: ProfileImportJob[];
  skipped: string[];
  warnings: string[];
}

export interface ProfileImportJob {
  name: string;
  scheduleDisplay: string;
  /** Null when the schedule has no faithful OpenBot equivalent. */
  schedule: ConvertedSchedule | null;
  reason: string | null;
  prompt: string;
}

export interface ConvertedSchedule { intervalMinutes: number; schedule: RoutineSchedule; label: string }

export interface ProfileImportResult {
  botId: string;
  name: string;
  memories: number;
  skills: number;
  routines: number;
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

const MAX_JOBS = 20;
const MAX_JOB_PROMPT_CHARS = 8_000;
const DAY_NAMES: Record<string, number> = { sun: 7, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

/** Map a Hermes schedule onto an OpenBot one only when it is exact:
 * daily or weekday clock times, every N minutes, hourly, or a single time.
 * Anything else (day-of-month, month, ranges of hours…) is left for the
 * owner rather than approximated. */
export function convertHermesSchedule(schedule: unknown, timeZone: string): ConvertedSchedule | { reason: string } {
  const value = (schedule && typeof schedule === "object" ? schedule : {}) as Record<string, unknown>;
  const kind = String(value.kind || "");
  if (kind === "interval" || kind === "every") {
    const minutes = Number(value.minutes ?? (Number(value.seconds) / 60));
    if (Number.isFinite(minutes) && minutes >= 5 && minutes <= 7 * 24 * 60 && Number.isInteger(minutes)) return { intervalMinutes: minutes, schedule: { kind: "interval" }, label: `Every ${minutes} minutes` };
    return { reason: "Its repeat interval is shorter than five minutes or not a whole number of minutes." };
  }
  if (kind === "once" || kind === "at") {
    const at = String(value.at || value.run_at || "");
    if (Number.isFinite(Date.parse(at))) return { intervalMinutes: 24 * 60, schedule: { kind: "once", timeZone, at: new Date(at).toISOString() }, label: `Once at ${at}` };
    return { reason: "Its one-time run has no readable date." };
  }
  if (kind !== "cron") return { reason: `Its "${kind || "unknown"}" schedule type has no OpenBot equivalent.` };
  const fields = String(value.expr || "").trim().split(/\s+/);
  if (fields.length !== 5) return { reason: "Its cron expression is not the standard five fields." };
  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields as [string, string, string, string, string];
  const every = /^\*\/(\d{1,4})$/.exec(minute);
  if (every && hour === "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    const minutes = Number(every[1]);
    if (minutes >= 5) return { intervalMinutes: minutes, schedule: { kind: "interval" }, label: `Every ${minutes} minutes` };
    return { reason: "It repeats more often than every five minutes." };
  }
  if (/^\d{1,2}$/.test(minute) && hour === "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") return { intervalMinutes: 60, schedule: { kind: "interval" }, label: "Every hour" };
  if (!/^\d{1,2}$/.test(minute) || !/^\d{1,2}$/.test(hour) || Number(minute) > 59 || Number(hour) > 23) return { reason: "It does not run at one fixed time of day." };
  if (dayOfMonth !== "*" || month !== "*") return { reason: "It depends on the day of the month or the month." };
  const days = new Set<number>();
  if (dayOfWeek === "*") [1, 2, 3, 4, 5, 6, 7].forEach((day) => days.add(day));
  else for (const part of dayOfWeek.toLowerCase().split(",")) {
    const range = /^([a-z]{3}|\d)(?:-([a-z]{3}|\d))?$/.exec(part);
    if (!range) return { reason: "Its day-of-week field is not a simple list or range." };
    const toDay = (token: string) => /^\d$/.test(token) ? (Number(token) === 0 ? 7 : Number(token)) : DAY_NAMES[token];
    const start = toDay(range[1]!), end = range[2] ? toDay(range[2]) : start;
    if (!start || !end || start > end) return { reason: "Its day-of-week field is not a simple list or range." };
    for (let day = start; day <= end; day++) days.add(day);
  }
  const time = `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
  const daysOfWeek = [...days].sort((a, b) => a - b);
  const label = daysOfWeek.length === 7 ? `Daily at ${time}` : JSON.stringify(daysOfWeek) === "[1,2,3,4,5]" ? `Weekdays at ${time}` : `At ${time} on ${daysOfWeek.map((day) => ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][day]).join(", ")}`;
  return { intervalMinutes: 24 * 60, schedule: { kind: "calendar", timeZone, time, daysOfWeek }, label };
}

function readHermesJobs(source: string): ProfileImportJob[] {
  const raw = readText(path.join(source, "cron", "jobs.json"));
  if (!raw) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return []; }
  const list = Array.isArray(parsed) ? parsed : Array.isArray((parsed as { jobs?: unknown })?.jobs) ? (parsed as { jobs: unknown[] }).jobs : [];
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  return list.slice(0, MAX_JOBS).flatMap((item) => {
    const job = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const prompt = typeof job.prompt === "string" ? job.prompt.trim() : "";
    if (!prompt) return []; // script-only jobs have nothing for a teammate to do
    const converted = convertHermesSchedule(job.schedule, typeof job.timezone === "string" ? job.timezone : timeZone);
    const display = String((job.schedule as { display?: unknown } | undefined)?.display || job.schedule_display || "");
    return [{
      name: String(job.name || "Imported automation").replace(/\s+/g, " ").trim().slice(0, 80),
      scheduleDisplay: "label" in converted ? converted.label : display || "unknown schedule",
      schedule: "label" in converted ? converted : null,
      reason: "reason" in converted ? converted.reason : null,
      prompt: prompt.slice(0, MAX_JOB_PROMPT_CHARS),
    }];
  });
}

export interface DiscoveredProfile { path: string; kind: ImportSourceKind; name: string; memories: number; skills: number; jobs: number; importedBotId: string | null }

/** Hermes and OpenClaw agents already on this Mac, ready to bring over. */
export function discoverAgentProfiles(db: OpenBotDatabase, home = homedir()): DiscoveredProfile[] {
  const candidates = [path.join(home, ".hermes"), path.join(home, ".openclaw")];
  const profilesDir = path.join(home, ".hermes", "profiles");
  if (existsSync(profilesDir)) {
    for (const entry of readdirSync(profilesDir, { withFileTypes: true })) if (entry.isDirectory() && !entry.name.startsWith(".")) candidates.push(path.join(profilesDir, entry.name));
  }
  const found: DiscoveredProfile[] = [];
  for (const candidate of candidates) {
    if (!existsSync(path.join(candidate, "SOUL.md"))) continue;
    try {
      const plan = previewProfileImport(candidate);
      const record = db.extensionRecord<{ botId: string }>("profile-import", candidate);
      const bot = record ? db.getBot(record.botId) : null;
      found.push({ path: candidate, kind: plan.kind, name: plan.name, memories: plan.memories.length, skills: plan.skills.length, jobs: plan.jobs.length, importedBotId: bot && !bot.retiredAt ? bot.id : null });
    } catch { /* not an importable profile */ }
  }
  return found;
}

export function previewProfileImport(rawPath: string): ProfileImportPlan {
  const source = expandHome(rawPath);
  const kind = detectKind(source);
  if (!existsSync(path.join(source, "SOUL.md"))) {
    throw new Error("That folder does not look like a Hermes profile or an OpenClaw home. Look for SOUL.md inside it — for example ~/.hermes, ~/.hermes/profiles/<name>, or ~/.openclaw.");
  }
  const baseName = path.basename(source);
  const folder = baseName === ".hermes" ? "Hermes" : baseName === ".openclaw" ? "OpenClaw" : baseName;
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
    source, kind, jobs: kind === "hermes" ? readHermesJobs(source) : [],
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
      "Cron jobs with schedules OpenBot cannot express exactly — listed below; recreate those by hand.",
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
  // Imported automations always start paused: the owner reviews each one
  // in Automations and turns it on; nothing runs on import.
  let routines = 0;
  for (const job of plan.jobs) {
    if (!job.schedule) continue;
    db.createRoutine({ name: job.name, botId: bot.id, threadId: bot.threadId, prompt: job.prompt, intervalMinutes: job.schedule.intervalMinutes, schedule: job.schedule.schedule, enabled: false });
    routines += 1;
  }
  db.saveExtensionRecord("profile-import", plan.source, { botId: bot.id, importedAt: new Date().toISOString() });
  const leftOut = plan.jobs.filter((job) => !job.schedule);
  return {
    botId: bot.id,
    name: bot.name,
    memories: plan.memories.length,
    skills: plan.skills.length,
    routines,
    warnings: [
      ...plan.warnings,
      skillFilesCopied ? `Copied ${skillFilesCopied} skill files.` : plan.skills.length ? "No skill files could be copied safely — review the originals." : "",
      routines ? `${routines} automation${routines === 1 ? "" : "s"} added paused — review and turn them on in Automations.` : "",
      ...leftOut.map((job) => `“${job.name}” was not converted: ${job.reason}`),
    ].filter(Boolean),
  };
}

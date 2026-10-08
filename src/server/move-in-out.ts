/** Task F8: move in, move out. A teammate leaves as plain files (persona,
 * memory, skills, routines) that also work elsewhere: AGENTS.md for any
 * agent that reads one, skills in the Agent Skills format. Memory comes in
 * from a ChatGPT or Claude data export, fact by fact through T5's review
 * queue; a Sidemates export comes back as the same teammate. */
import { randomUUID } from "node:crypto";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { MemoryReviewItem } from "../shared/memory-origin.js";
import type { OpenBotDatabase } from "./database.js";
import { CommunitySkills, inspectCommunitySkill } from "./community-skills.js";
import { exportBot, importBot, type BotShareBundle } from "./sharing.js";
import { pendingMemories } from "./memory-review.js";
import { memoryKeyIdentity } from "../shared/private-memory.js";

export const FILES_KIND = "sidemates-teammate-files";
const MAX_UPLOAD = 200 * 1024 * 1024, MAX_ENTRIES = 5_000, MAX_FACTS = 200;

export interface TeammateFiles {
  kind: typeof FILES_KIND; version: 1;
  teammate: BotShareBundle;
  memories: Array<{ key: string; content: string }>;
  skills: Array<{ name: string; source: string; digest: string; files: Record<string, string> }>;
}

const slug = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "teammate";

/** Plain files, keyed by path. */
export function teammateFiles(db: OpenBotDatabase, botId: string): { folder: string; files: Record<string, string> } {
  const bundle = exportBot(db, botId);
  // Sorted, so the same teammate always gives the same files.
  const memories = db.memoryEntries(botId).filter((entry) => !entry.expired).map((entry) => ({ key: entry.key, content: entry.content })).sort((a, b) => a.key.localeCompare(b.key));
  const skills = new CommunitySkills(db).list().filter((skill) => skill.botIds.includes(botId) && !skill.tampered)
    .map((skill) => ({ name: skill.name, source: skill.source, digest: skill.digest, files: skill.files })).sort((a, b) => a.name.localeCompare(b.name));
  const folder = slug(bundle.bot.name);
  const manifest: TeammateFiles = { kind: FILES_KIND, version: 1, teammate: bundle, memories, skills };
  const files: Record<string, string> = {};
  files[`${folder}/AGENTS.md`] = [
    `# ${bundle.bot.name}`, "", `${bundle.bot.role}.`, "", "## Instructions", "", bundle.bot.instructions, "",
    "## What I remember", "", ...(memories.length ? memories.map((memory) => `- **${memory.key}:** ${memory.content}`) : ["- Nothing yet."]), "",
    ...(bundle.routines.length ? ["## Routines", "", ...bundle.routines.map((routine) => `- **${routine.name}** (every ${routine.intervalMinutes} minutes, or on its schedule): ${routine.prompt}`), ""] : []),
    ...(skills.length ? ["## Skills", "", ...skills.map((skill) => `- \`skills/${skill.name}/SKILL.md\``), ""] : []),
  ].join("\n");
  files[`${folder}/memory.md`] = memories.length ? memories.map((memory) => `## ${memory.key}\n\n${memory.content}\n`).join("\n") : "Nothing remembered yet.\n";
  for (const skill of skills) for (const [file, content] of Object.entries(skill.files)) files[`${folder}/skills/${skill.name}/${file}`] = content;
  files[`${folder}/teammate.json`] = `${JSON.stringify(manifest, null, 2)}\n`;
  files[`${folder}/README.md`] = [
    `# ${bundle.bot.name}, as files`, "",
    "- `AGENTS.md`: who this teammate is, what it remembers and its routines. Agents that read AGENTS.md (Codex, OpenCode and others) can use it as is; for Claude Code, copy it to CLAUDE.md.",
    "- `skills/`: each folder is an Agent Skill (`SKILL.md`). Copy them into `.claude/skills/` or `.opencode/skills/`. Scripts in them are text; read them before you run them.",
    "- `memory.md`: everything it remembers, one heading per memory.",
    "- `teammate.json`: the same, for Sidemates. Import it under Team → Move in, and it comes back as the same teammate; its memories wait for your review.",
    "", "Nothing here holds a password, a key, a conversation or a connection.", "",
  ].join("\n");
  return { folder, files };
}

export function teammateZip(db: OpenBotDatabase, botId: string): { filename: string; bytes: Uint8Array } {
  const { folder, files } = teammateFiles(db, botId);
  return { filename: `${folder}.sidemates.zip`, bytes: zipSync(Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)])), { level: 6 }) };
}

// ---- Moving in -------------------------------------------------------------

export type MoveInKind = "sidemates" | "chatgpt" | "claude";
export interface MoveInResult { kind: MoveInKind; botId: string; botName: string; created: boolean; queued: number; skills: number; routines: number }

/** The files inside an upload: a zip, or one JSON file. Bounded, so an archive can't blow up. */
export function readUpload(bytes: Uint8Array, filename: string): Record<string, string> {
  if (bytes.byteLength > MAX_UPLOAD) throw new Error("That file is over 200 MB. For a ChatGPT or Claude export, upload conversations.json on its own.");
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (!isZip) return { [filename.split(/[\\/]/).at(-1) || "upload.json"]: strFromU8(bytes) };
  let entries = 0, total = 0;
  const wanted = (name: string) => /(?:^|\/)(?:conversations\.json|teammate\.json|memories\.json|memory\.json)$/i.test(name) || /(?:^|\/)skills\/[^/]+\/.+\.(?:md|txt|json|csv|ya?ml|py|sh|bash|js|mjs|cjs|ts|rb|pl)$/i.test(name) || /(?:^|\/)LICENSE(?:\.txt|\.md)?$/.test(name);
  const files = unzipSync(bytes, { filter: (file) => {
    entries += 1;
    if (entries > MAX_ENTRIES) throw new Error("That archive has too many files.");
    if (!wanted(file.name)) return false;
    total += file.originalSize;
    if (total > MAX_UPLOAD * 2) throw new Error("That archive unpacks to more than 400 MB.");
    return true;
  } });
  return Object.fromEntries(Object.entries(files).map(([name, data]) => [name, strFromU8(data)]));
}

/** Sentences where the person described themselves: "I work at…", "My daughter is…", "I prefer…". */
const SELF = /^(?:I am|I'm|I work|I live|I have (?:a|an|two|three|\d)|I prefer|I like|I love|I hate|I don't (?:like|eat|drink|use|want)|I do not|I usually|I always|I never|I speak|I study|I teach|I run|I own|I'm allergic|My (?:name|wife|husband|partner|son|daughter|kids?|children|job|company|team|birthday|role|boss|manager|dog|cat|favou?rite|hometown|native language)\b|Call me|Please (?:always|never)|Remember that|For context)\b/i;
export function selfFacts(text: string): string[] {
  return text.replace(/\r/g, "").split(/(?<=[.!])\s+|\n+/).map((sentence) => sentence.trim().replace(/^[-*•]\s*/, ""))
    .filter((sentence) => sentence.length >= 12 && sentence.length <= 300 && !sentence.includes("?") && SELF.test(sentence) && !/-----BEGIN|\b(?:sk-|gh[pousr]_|xox[baprs]-)[A-Za-z0-9_-]{10,}/.test(sentence));
}

type Said = { text: string; at: string };
function chatgptUserMessages(conversations: unknown): Said[] {
  const said: Said[] = [];
  for (const conversation of Array.isArray(conversations) ? conversations : []) {
    const mapping = (conversation as { mapping?: Record<string, { message?: { author?: { role?: string }; content?: { parts?: unknown[] }; create_time?: number } }> }).mapping || {};
    for (const node of Object.values(mapping)) {
      const message = node?.message;
      if (message?.author?.role !== "user") continue;
      const text = (message.content?.parts || []).filter((part): part is string => typeof part === "string").join("\n");
      if (text) said.push({ text, at: message.create_time ? new Date(message.create_time * 1000).toISOString() : "" });
    }
  }
  return said;
}
function claudeUserMessages(conversations: unknown): Said[] {
  const said: Said[] = [];
  for (const conversation of Array.isArray(conversations) ? conversations : []) {
    for (const message of (conversation as { chat_messages?: Array<{ sender?: string; text?: string; created_at?: string }> }).chat_messages || []) {
      if (message.sender === "human" && message.text) said.push({ text: message.text, at: message.created_at || "" });
    }
  }
  return said;
}

/** What kind of upload this is. */
export function uploadKind(files: Record<string, string>): { kind: MoveInKind; conversations?: unknown; manifest?: TeammateFiles; memoryFile?: unknown } {
  const find = (pattern: RegExp) => Object.entries(files).find(([name]) => pattern.test(name));
  const manifest = find(/(?:^|\/)teammate\.json$/i);
  if (manifest) {
    const parsed = JSON.parse(manifest[1]) as TeammateFiles;
    if (parsed?.kind === FILES_KIND) return { kind: "sidemates", manifest: parsed };
  }
  const conversations = find(/(?:^|\/)conversations\.json$/i) ?? (Object.keys(files).length === 1 ? Object.entries(files)[0] : undefined);
  const memoryFile = find(/(?:^|\/)memor(?:y|ies)\.json$/i);
  if (conversations) {
    let parsed: unknown;
    try { parsed = JSON.parse(conversations[1]); } catch { throw new Error("That file isn't JSON from a ChatGPT or Claude export."); }
    const first = Array.isArray(parsed) ? parsed.find((item) => item && typeof item === "object") as Record<string, unknown> | undefined : undefined;
    if (first && "mapping" in first) return { kind: "chatgpt", conversations: parsed, memoryFile: memoryFile && JSON.parse(memoryFile[1]) };
    if (first && "chat_messages" in first) return { kind: "claude", conversations: parsed, memoryFile: memoryFile && JSON.parse(memoryFile[1]) };
  }
  throw new Error("This isn't a ChatGPT or Claude data export, or a teammate exported from Sidemates.");
}

/** Saved memories in an export, when it has a file of them: strings, or objects with text in them. */
function exportedMemories(file: unknown): string[] {
  const list = Array.isArray(file) ? file : Array.isArray((file as { memories?: unknown })?.memories) ? (file as { memories: unknown[] }).memories : [];
  return list.map((item) => typeof item === "string" ? item : String((item as { content?: unknown; text?: unknown; memory?: unknown })?.content ?? (item as { text?: unknown })?.text ?? (item as { memory?: unknown })?.memory ?? "")).map((text) => text.trim()).filter((text) => text.length >= 3 && text.length <= 1_200);
}

/** Each fact waits for review under a name no memory or waiting fact already uses, so keeping one never overwrites another. */
function queue(db: OpenBotDatabase, botId: string, facts: Array<{ key: string; content: string }>, from: string): number {
  const start = Date.now();
  const taken = new Set([...db.memoryEntries(botId, true).map((entry) => memoryKeyIdentity(entry.key)), ...pendingMemories(db, botId).map((item) => memoryKeyIdentity(item.key))]);
  let added = 0;
  for (const fact of facts) {
    let key = fact.key.slice(0, 74) || "Imported note";
    for (let n = 2; taken.has(memoryKeyIdentity(key)); n += 1) key = `${fact.key.slice(0, 70)} (${n})`;
    taken.add(memoryKeyIdentity(key));
    // A millisecond apart, so the queue keeps the export's order.
    const item: MemoryReviewItem = { id: randomUUID(), botId, runId: null, key, content: fact.content.slice(0, 1_200), origin: "file", origins: ["file"], at: new Date(start + added).toISOString(), expiresAt: null, from };
    db.saveExtensionRecord("memory-review", item.id, item);
    added += 1;
  }
  return added;
}

export function moveIn(db: OpenBotDatabase, files: Record<string, string>, target: { botId?: string }): MoveInResult {
  const found = uploadKind(files);
  if (found.kind === "sidemates") {
    const manifest = found.manifest!;
    const { bot, skills: bundled, routines } = importBot(db, manifest.teammate);
    const library = new CommunitySkills(db);
    let skills = bundled;
    for (const skill of manifest.skills.filter((entry) => !entry.source.startsWith("bundled") && !library.list().some((known) => known.bundled && known.name === entry.name))) {
      const inspected = inspectCommunitySkill({ files: skill.files, source: skill.source });
      if (inspected.blockers.length) continue;
      library.install({ files: skill.files, source: skill.source }, inspected.digest, [bot.id]);
      skills += 1;
    }
    const queued = queue(db, bot.id, manifest.memories, `${manifest.teammate.bot.name}'s exported files`);
    return { kind: "sidemates", botId: bot.id, botName: bot.name, created: true, queued, skills, routines };
  }
  const bot = target.botId ? db.getBot(target.botId) : null;
  if (!bot) throw new Error("Choose which teammate should get these memories.");
  const said = found.kind === "chatgpt" ? chatgptUserMessages(found.conversations) : claudeUserMessages(found.conversations);
  // Nothing already remembered or already waiting is suggested again.
  const seen = new Set([...db.memoryEntries(bot.id, true).map((entry) => entry.content), ...pendingMemories(db, bot.id).map((item) => item.content)].map((content) => content.toLowerCase()));
  const facts: Array<{ key: string; content: string }> = [];
  const add = (content: string) => {
    const normalized = content.toLowerCase();
    if (seen.has(normalized) || facts.length >= MAX_FACTS) return;
    seen.add(normalized);
    facts.push({ key: content.split(/\s+/).slice(0, 6).join(" ").replace(/[.,:;!]+$/, ""), content });
  };
  for (const memory of exportedMemories(found.memoryFile)) add(memory);
  for (const message of said) for (const fact of selfFacts(message.text)) add(fact);
  const name = found.kind === "chatgpt" ? "ChatGPT" : "Claude";
  return { kind: found.kind, botId: bot.id, botName: bot.name, created: false, queued: queue(db, bot.id, facts, `your ${name} export`), skills: 0, routines: 0 };
}

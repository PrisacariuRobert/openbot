/** Task T5: where a memory came from, and a review queue for facts a teammate
 * learned after reading something from outside (mail, web pages, files,
 * messages, calendars, apps). Those wait for the owner instead of becoming
 * memories, because memory poisoning is a documented attack: a page or an
 * email that gets a teammate to "remember" an instruction keeps acting on
 * every later task. */
import { randomUUID } from "node:crypto";
import type { Run } from "../shared/types.js";
import { memoryKeyIdentity } from "../shared/private-memory.js";
import { MEMORY_ORIGIN_TEXT, UNTRUSTED_ORIGINS, type MemoryOrigin, type MemoryReviewItem } from "../shared/memory-origin.js";
import type { OpenBotDatabase } from "./database.js";
import { sentLog, SENT_ENTRIES_LIMIT } from "./sent-log.js";

const ACTION_ORIGIN: Record<string, MemoryOrigin> = {
  mac_mail_read: "email", mac_mail_search: "email", mac_mail_unread: "email", gmail_read: "email", gmail_search: "email", work_collect: "email",
  web_search: "web", web_read: "web", browser_open: "web", browser_snapshot: "web", browser_observe: "web", browser_see: "web", browser_download_results: "web", community_skill_read: "web",
  workspace_read: "file", workspace_list: "file", mac_read: "file", mac_list: "file", search_my_mac: "file", mac_notes_search: "file", mac_note_read: "file",
  google_drive_read: "file", google_drive_search: "file", dropbox_read: "file", dropbox_search: "file", code_read: "file", code_search: "file", spreadsheet_inspect: "file", table_summary: "file", table_reconcile: "file",
  slack_read: "message", slack_search: "message", github_issues: "message", github_notifications: "message", notion_read: "message", notion_search: "message",
  mac_calendar_events: "calendar", google_calendar_agenda: "calendar",
  connected_call: "app", mac_app_read: "app", mac_app_inspect: "app", mac_contacts_find: "app", todoist_tasks: "app",
};
const TRIGGER_ORIGIN: Record<string, MemoryOrigin> = { mail: "email", folder: "file", dropbox: "file", webhook: "app", todoist: "app", github: "message", slack: "message", notion: "message", webpage: "web", calendar: "calendar" };

/** What this run had read from outside before now. Unknown counts as outside. */
export function runOrigins(db: OpenBotDatabase, run: Run): MemoryOrigin[] {
  const found = new Set<MemoryOrigin>();
  const log = sentLog(db, run.id);
  if (log.length > SENT_ENTRIES_LIMIT) found.add("app");
  for (const entry of log) {
    if (entry.kind !== "tool" || entry.label.endsWith("(refused)")) continue;
    const origin = ACTION_ORIGIN[entry.label];
    if (origin) found.add(origin);
  }
  if (run.attachmentIds.length) found.add("file");
  if (run.automationEventId) {
    // A scheduled or manual start carries nothing from outside; any other trigger does.
    const source = db.getAutomationEvent(run.automationEventId)?.source;
    if (source && source !== "schedule" && source !== "manual") found.add(TRIGGER_ORIGIN[source] ?? "app");
  }
  return [...found];
}

const REVIEW = "memory-review", ORIGIN = "memory-origin";
export const MEMORY_REVIEW_LIMIT = 50;

export function memoryOrigin(db: OpenBotDatabase, botId: string, key: string): { origin: MemoryOrigin; runId: string | null } | null {
  return db.extensionRecord(ORIGIN, `${botId}:${memoryKeyIdentity(key)}`);
}
function saveOrigin(db: OpenBotDatabase, botId: string, key: string, origin: MemoryOrigin, runId: string | null) {
  db.saveExtensionRecord(ORIGIN, `${botId}:${memoryKeyIdentity(key)}`, { origin, runId });
}

/** The teammate's remember tool. Saved at once when the task read nothing from outside; otherwise queued. */
export function rememberFromTask(db: OpenBotDatabase, run: Run, input: { key: string; content: string; expectedRevision?: string; expiresAt?: string }) {
  const origins = runOrigins(db, run).filter((origin) => UNTRUSTED_ORIGINS.includes(origin));
  if (!origins.length) {
    const saved = db.remember(run.botId, input.key, input.content, { ...input, source: "task", runId: run.id });
    saveOrigin(db, run.botId, input.key, "conversation", run.id);
    return { saved, review: false as const };
  }
  const pending = pendingMemories(db, run.botId);
  if (pending.length >= MEMORY_REVIEW_LIMIT) throw new Error("The owner has many memories waiting for review already. Don't save more; mention what you'd remember in your answer instead.");
  const item: MemoryReviewItem = { id: randomUUID(), botId: run.botId, runId: run.id, key: input.key, content: input.content, origin: origins[0]!, origins, at: new Date().toISOString(), expiresAt: input.expiresAt ?? null };
  db.saveExtensionRecord(REVIEW, item.id, item);
  return { saved: null, review: true as const, item };
}

export function pendingMemories(db: OpenBotDatabase, botId?: string): MemoryReviewItem[] {
  return db.extensionRecords<MemoryReviewItem>(REVIEW).map(({ value }) => value).filter((item) => !botId || item.botId === botId).sort((a, b) => a.at.localeCompare(b.at));
}

/** The owner's decision. Keeping saves it (as edited) as the owner's own note, since the owner
 * reviewed it, and it keeps its origin; discarding forgets it. */
export function decideMemory(db: OpenBotDatabase, id: string, decision: "keep" | "discard", content?: string) {
  const item = db.extensionRecord<MemoryReviewItem>(REVIEW, id);
  if (!item) throw new Error("That memory was already decided.");
  db.deleteExtensionRecord(REVIEW, id);
  if (decision === "discard") return null;
  const existing = db.memoryEntries(item.botId, true).find((entry) => memoryKeyIdentity(entry.key) === memoryKeyIdentity(item.key));
  db.remember(item.botId, item.key, (content ?? item.content).trim() || item.content, { source: "owner", ...(existing ? { expectedRevision: existing.revision } : {}), ...(item.expiresAt ? { expiresAt: item.expiresAt } : {}) });
  saveOrigin(db, item.botId, item.key, item.origin, item.runId);
  return db.memoryEntries(item.botId, true).find((entry) => memoryKeyIdentity(entry.key) === memoryKeyIdentity(item.key)) ?? null;
}

/** An owner edit makes the memory the owner's own. */
export function noteOwnerMemory(db: OpenBotDatabase, botId: string, key: string) { saveOrigin(db, botId, key, "you", null); }

export function reviewMessage(item: MemoryReviewItem): string {
  return `Not saved yet: this task read ${item.origins.map((origin) => MEMORY_ORIGIN_TEXT[origin].replace(/^From /, "")).join(" and ")}, so the owner reviews memories from it first. Carry on with the task; don't try to save it another way.`;
}

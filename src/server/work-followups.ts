import { createHash } from "node:crypto";
import { z } from "zod";
import type { WorkFollowup, WorkFollowupSuggestion, WorkFollowupStatus, WorkSuggestionDigest } from "../shared/work-followups.js";
import type { OpenBotDatabase } from "./database.js";

const KIND = "work-followup";
const trackInput = z.object({ snapshotId: z.string().uuid(), itemIndex: z.number().int().min(0).max(7) }).strict();

// Owner-only local tracking. Models cannot turn a suggestion into an accepted
// action, an automation or an external write. Saved sources remain historical.
export class WorkFollowups {
  constructor(private readonly db: OpenBotDatabase, private readonly now: () => number = Date.now) {}
  private identity(item: WorkFollowupSuggestion) {
    const snapshot = this.db.getWorkSnapshot(item.snapshotId);
    const identities = snapshot?.sources.filter((source) => item.sources.some((entry) => entry.ref === source.ref)).map((source) => `${source.service}:${source.sourceId || source.url || source.title}`).sort() || item.sources.map((entry) => entry.url || entry.title).sort();
    return createHash("sha256").update(JSON.stringify([item.botId, snapshot?.accountEmail || "", snapshot?.coverage.map((entry) => [entry.service, entry.account || ""]).sort() || [], item.text.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " "), identities])).digest("hex");
  }
  private suggestion(snapshotId: string, itemIndex: number): WorkFollowupSuggestion {
    const snapshot = this.db.getWorkSnapshot(snapshotId), report = this.db.getWorkReport(snapshotId), item = report?.items[itemIndex];
    if (!snapshot || !report || !item) throw new Error("Choose a priority from a saved work report.");
    const sources = item.sourceRefs.map((ref) => snapshot.sources.find((entry) => entry.ref === ref));
    if (sources.some((source) => !source)) throw new Error("This priority has no matching saved source receipt.");
    return { id: createHash("sha256").update(`${snapshotId}:${itemIndex}`).digest("hex"), snapshotId, itemIndex, botId: snapshot.botId, text: item.text, priority: item.priority, sources: sources.map((source) => ({ ref: source!.ref, title: source!.title, url: source!.url })), capturedAt: snapshot.fetchedAt };
  }
  list(): WorkFollowupStatus {
    const tracked = this.db.extensionRecords<WorkFollowup>(KIND).map(({ value }) => value).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const existing = new Set(tracked.map((entry) => this.identity(entry)));
    const suggestions = this.db.recentWorkSnapshots().flatMap((snapshot) => (this.db.getWorkReport(snapshot.id)?.items || []).flatMap((_item, index) => {
      try { return [this.suggestion(snapshot.id, index)]; } catch { return []; }
    })).filter((entry) => { const identity = this.identity(entry); if (existing.has(identity)) return false; existing.add(identity); return true; }).slice(0, 24);
    const digestEnabled = this.db.extensionRecord<boolean>("followup-settings", "digest-enabled") === true;
    const digest = digestEnabled ? this.db.extensionRecord<WorkSuggestionDigest>("followup-digest", "current") : null;
    return { suggestions, tracked, digestEnabled, digest: digest ? { ...digest, items: digest.items.filter((item) => !tracked.some((entry) => this.identity(entry) === this.identity(item))) } : null };
  }
  configureDigest(enabled: unknown) {
    const value = z.boolean().parse(enabled);
    this.db.saveExtensionRecord("followup-settings", "digest-enabled", value);
    if (!value) this.db.deleteExtensionRecord("followup-digest", "current");
    else this.refreshDigest();
    return this.list();
  }
  // Called after a saved report, never by a model instruction. In-app only:
  // no notification delivery, model call, routine or external task creation.
  refreshDigest() {
    if (this.db.extensionRecord<boolean>("followup-settings", "digest-enabled") !== true) return;
    const at = this.now(), last = this.db.extensionRecord<number>("followup-settings", "last-digest-at") || 0;
    if (at - last < 86_400_000) return;
    const seen = (this.db.extensionRecord<Array<{ key: string; at: number }>>("followup-digest", "seen") || []).filter((item) => at - item.at < 90 * 86_400_000);
    const keys = new Set(seen.map((item) => item.key));
    const items = this.list().suggestions.filter((item) => Date.parse(item.capturedAt) <= at && at - Date.parse(item.capturedAt) <= 7 * 86_400_000 && !keys.has(this.identity(item))).sort((a, b) => ({ now: 0, soon: 1, fyi: 2 })[a.priority] - ({ now: 0, soon: 1, fyi: 2 })[b.priority]).slice(0, 5);
    if (!items.length) return;
    this.db.saveExtensionRecord("followup-digest", "current", { createdAt: new Date(at).toISOString(), items });
    this.db.saveExtensionRecord("followup-digest", "seen", [...seen, ...items.map((item) => ({ key: this.identity(item), at }))].slice(-450));
    this.db.saveExtensionRecord("followup-settings", "last-digest-at", at);
  }
  dismissDigest() { this.db.deleteExtensionRecord("followup-digest", "current"); }
  track(raw: unknown): WorkFollowup {
    const input = trackInput.parse(raw), suggestion = this.suggestion(input.snapshotId, input.itemIndex);
    const existing = this.db.extensionRecord<WorkFollowup>(KIND, suggestion.id);
    if (existing) return existing;
    if (this.db.extensionRecords(KIND).length >= 250) throw new Error("You have 250 tracked items. Remove finished items before tracking more.");
    const now = new Date().toISOString(), result: WorkFollowup = { ...suggestion, status: "open", trackedAt: now, updatedAt: now };
    this.db.saveExtensionRecord(KIND, result.id, result);
    return result;
  }
  update(id: string, status: unknown) {
    const value = this.db.extensionRecord<WorkFollowup>(KIND, id);
    if (!value) throw new Error("That tracked item no longer exists.");
    const result: WorkFollowup = { ...value, status: z.enum(["open", "done", "dismissed"]).parse(status), updatedAt: new Date().toISOString() };
    this.db.saveExtensionRecord(KIND, id, result); return result;
  }
  remove(id: string) { this.db.deleteExtensionRecord(KIND, id); }
}

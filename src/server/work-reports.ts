import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { WorkSnapshot, WorkSource, WorkReport, WorkCoverage, WorkService } from "../shared/work-reports.js";
import type { OpenBotDatabase } from "./database.js";
import type { GoogleWorkspaceConnector } from "./google-workspace.js";

export const workCollectInput = z.object({
  kind: z.enum(["morning", "inbox"]),
  timeZone: z.string().trim().max(80).default("UTC"),
  refresh: z.boolean().default(false),
}).strict();
export const workReportInput = z.object({
  snapshotId: z.string().uuid(),
  items: z.array(z.object({
    priority: z.enum(["now", "soon", "fyi"]), text: z.string().trim().min(1).max(600),
    sourceRefs: z.array(z.string().max(20)).min(1).max(5),
  }).strict()).max(8),
  drafts: z.array(z.object({ sourceRef: z.string().max(20), body: z.string().trim().min(1).max(2000) }).strict()).max(5).default([]),
}).strict();

const MAX_AGE = 15 * 60_000;
const md = (text: string) => text.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "").replace(/[\\`*_{}\[\]()<>#+.!|~-]/g, "\\$&");
function calendarLink(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && (url.hostname === "calendar.google.com" || (url.hostname === "www.google.com" && url.pathname.startsWith("/calendar/"))) ? url.href : null;
  } catch { return null; }
}
function sourceLink(source: WorkSource) {
  return source.url ? `[${md(source.ref)} · ${md(source.title)}](<${source.url}>)` : `${md(source.ref)} · ${md(source.title)} (link unavailable)`;
}
function dateLabel(value: string, zone: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Intl.DateTimeFormat("en", { timeZone: zone, dateStyle: "medium", timeStyle: "short" }).format(timestamp) : "Time unavailable";
}

export function renderWorkReport(snapshot: WorkSnapshot, report: Pick<WorkReport, "items" | "drafts">): string {
  const sources = new Map(snapshot.sources.map((source) => [source.ref, source]));
  const lines = [
    `# ${snapshot.kind === "morning" ? "Your next 24 hours" : "Inbox follow-ups"}`,
    `Prepared from a snapshot taken ${dateLabel(snapshot.fetchedAt, snapshot.timeZone)} (${md(snapshot.timeZone)}). Nothing was sent or changed in your connected apps.`,
    "## What was checked",
    ...snapshot.coverage.map((item) => `- **${item.service === "gmail" ? "Gmail" : "Primary calendar"} — ${item.state === "complete" ? "checked within this scope" : item.state === "limited" ? "partial coverage" : "not checked"}:** ${md(item.detail)}`),
    `Mail scope: ${md(snapshot.window.mailQuery)}. Calendar window: ${dateLabel(snapshot.window.from, snapshot.timeZone)} to ${dateLabel(snapshot.window.until, snapshot.timeZone)}.`,
  ];
  const events = snapshot.sources.filter((source) => source.service === "google-calendar");
  if (snapshot.kind === "morning") {
    lines.push("## Schedule");
    if (!events.length) lines.push(snapshot.coverage.some((entry) => entry.service === "google-calendar" && entry.state === "complete") ? "No events returned in this window on your primary calendar." : "There is no complete calendar check to report.");
    for (const event of events) lines.push(`- **${event.allDay ? `All day · ${md(event.start || "date unavailable")} (ends ${md(event.end || "date unavailable")}, exclusive)` : `${dateLabel(event.start || "", snapshot.timeZone)} – ${dateLabel(event.end || "", snapshot.timeZone)}`}** · ${sourceLink(event)}`);
  }
  lines.push("## Suggested priorities", "These are your teammate’s interpretations. Open the sources before acting; source matching does not independently verify the advice.");
  for (const priority of ["now", "soon", "fyi"] as const) {
    for (const item of report.items.filter((entry) => entry.priority === priority)) {
      lines.push(`- **${priority === "now" ? "First" : priority === "soon" ? "Next" : "For context"}:** ${md(item.text)}\n  ${item.sourceRefs.map((ref) => sourceLink(sources.get(ref)!)).join(" · ")}`);
    }
  }
  if (!report.items.length) lines.push("No priorities were proposed. This is not a claim that your entire inbox needs no attention.");
  if (report.drafts.length) {
    lines.push("## Reply drafts — not sent", "Review names, dates and promises before sending. These are saved only in OpenBot, not in Gmail Drafts.");
    for (const draft of report.drafts) lines.push(`### ${md(draft.subject)}\nTo: ${md(draft.to)}\n\n${md(draft.body)}\n\nSource: ${sourceLink(sources.get(draft.sourceRef)!)}`);
  }
  lines.push("## Source receipt", "The app matched every reference and draft recipient to this saved snapshot. It did not independently fact-check the model’s interpretation.");
  for (const source of snapshot.sources) lines.push(`- ${sourceLink(source)}${source.from ? ` · ${md(source.from)}` : ""}${source.date ? ` · ${md(source.date)}` : ""}${source.replyState === "sent_last" ? " · Latest message is already sent by you; no reply draft was prepared" : source.replyState === "unknown" ? " · Reply status could not be established" : ""}${source.truncated ? " · Shortened context" : ""}`);
  return lines.join("\n\n") + "\n";
}

export class WorkReportService {
  private readonly pending = new Map<string, Promise<WorkSnapshot>>();
  constructor(private readonly db: OpenBotDatabase, private readonly google: Pick<GoogleWorkspaceConnector, "workInbox" | "workThread" | "workCalendar">, private readonly now: () => number = Date.now) {}

  private assertRun(botId: string, runId: string) {
    const run = this.db.getRun(runId);
    if (!run || run.botId !== botId || run.status !== "running") throw new Error("This task is no longer active.");
  }

  private canRead(botId: string, service: WorkService) {
    const connection = this.db.getConnector("google-workspace");
    const scope = service === "gmail" ? "gmail.readonly" : "calendar.readonly";
    return Boolean(connection?.connected && connection.scopes.some((value) => value.endsWith(`/${scope}`)) && this.db.getBotConnectorAccess(botId, service)?.canRead);
  }

  collect(botId: string, runId: string, args: unknown): Promise<WorkSnapshot> {
    const input = workCollectInput.parse(args);
    new Intl.DateTimeFormat("en", { timeZone: input.timeZone }); // Reject invalid zones, never silently use the host zone.
    this.assertRun(botId, runId);
    const key = runId;
    const active = this.pending.get(key);
    if (active) return active.then((snapshot) => {
      this.assertRun(botId, runId);
      if (snapshot.kind !== input.kind || snapshot.timeZone !== input.timeZone) throw new Error("Another source collection just finished in this task. Try again with the requested job settings.");
      return snapshot;
    });
    const operation = this.collectOnce(botId, runId, input).finally(() => this.pending.delete(key));
    this.pending.set(key, operation);
    return operation;
  }

  private async collectOnce(botId: string, runId: string, input: z.infer<typeof workCollectInput>): Promise<WorkSnapshot> {
    const prior = this.db.listWorkSnapshots(runId);
    const services: WorkService[] = input.kind === "morning" ? ["gmail", "google-calendar"] : ["gmail"];
    const allowed = new Map(services.map((service) => [service, this.canRead(botId, service)]));
    const accountEmail = this.db.getConnector("google-workspace")?.accountEmail || "";
    if (![...allowed.values()].some(Boolean)) throw new Error("Connect Gmail or Calendar and give this teammate read access in Apps & Tools first.");
    const cached = prior.find((snapshot) => snapshot.accountEmail === accountEmail && snapshot.kind === input.kind && snapshot.timeZone === input.timeZone && this.now() - Date.parse(snapshot.fetchedAt) <= MAX_AGE && snapshot.coverage.every((entry) => entry.state !== "unavailable" && allowed.get(entry.service)));
    if (cached && !input.refresh) return cached;
    if (prior.length >= 3) throw new Error("This task has already gathered three source snapshots. Start a new request for another refresh.");
    const from = new Date(this.now()).toISOString(), until = new Date(this.now() + 86_400_000).toISOString();
    const snapshot: WorkSnapshot = {
      id: randomUUID(), botId, runId, accountEmail, kind: input.kind, fetchedAt: from, timeZone: input.timeZone,
      window: { from, until, mailQuery: input.kind === "morning" ? "in:inbox is:unread newer_than:7d" : "in:inbox newer_than:7d" },
      coverage: [], sources: [],
    };
    const signal = AbortSignal.timeout(45_000);
    const batches = await Promise.all(services.map(async (service): Promise<{ coverage: WorkCoverage; sources: WorkSource[] }> => {
      if (!allowed.get(service)) return { coverage: { service, state: "unavailable", count: 0, detail: "Not connected or this teammate has no read access. Nothing was read from this app." }, sources: [] };
      try {
        if (service === "google-calendar") {
          const result = await this.google.workCalendar(from, until, input.timeZone, signal);
          const events = [...new Map(result.events.map((event) => [event.id, event])).values()];
          return {
            coverage: { service, state: result.hasMore || events.some((event) => event.truncated) ? "limited" : "complete", count: events.length, detail: `${events.length} primary-calendar events read for the next 24 hours.${result.hasMore ? " More events exist; only the first 20 were read." : ""} Other calendars were not checked.${events.some((event) => event.truncated) ? " Long descriptions were shortened." : ""}` },
            sources: events.map((event, index) => ({ ref: `C${index + 1}`, service, title: event.title, url: calendarLink(event.webLink), text: `${event.location}\n${event.description}`.trim(), truncated: event.truncated, start: event.start, end: event.end, allDay: event.allDay })),
          };
        }
        const result = await this.google.workInbox(snapshot.window.mailQuery, signal);
        const ids = [...new Set(result.ids)].slice(0, 8);
        const sources: WorkSource[] = [];
        let failures = 0;
        // Batches of three bound concurrency. Stable ref order survives individual failures.
        for (let offset = 0; offset < ids.length; offset += 3) {
          const batch = await Promise.all(ids.slice(offset, offset + 3).map(async (id, index) => {
            try {
              const thread = await this.google.workThread(id, signal);
              const email = accountEmail;
              return { ref: `M${offset + index + 1}`, service, title: thread.subject.slice(0, 300), url: `https://mail.google.com/mail/?authuser=${encodeURIComponent(email)}#all/${encodeURIComponent(id)}`, text: thread.text, truncated: thread.truncated, from: thread.from.slice(0, 300), date: thread.date, replyState: thread.replyState, replyTo: thread.replyTo } satisfies WorkSource;
            } catch { failures++; return null; }
          }));
          sources.push(...batch.filter((source): source is NonNullable<typeof source> => source !== null));
        }
        const shortened = sources.some((source) => source.truncated);
        return { sources, coverage: { service, state: failures || result.hasMore || shortened ? "limited" : "complete", count: sources.length, detail: `${sources.length} conversations read matching “${snapshot.window.mailQuery}”.${result.hasMore ? " More matches exist; only the first 8 were checked." : ""}${failures ? ` ${failures} conversations could not be read.` : ""}${shortened ? " Some conversation context was shortened; attachments were not read." : " Attachments were not read."} This is not your whole inbox.` } };
      } catch {
        return { coverage: { service, state: "unavailable", count: 0, detail: "This app could not be checked. Try again or check its connection in Apps & Tools." }, sources: [] };
      }
    }));
    this.assertRun(botId, runId);
    if (this.db.getConnector("google-workspace")?.accountEmail !== accountEmail) throw new Error("The connected Google account changed. Gather fresh sources from the new account.");
    for (const batch of batches) {
      if (allowed.get(batch.coverage.service) && !this.canRead(botId, batch.coverage.service)) throw new Error("App access changed while gathering sources. No result was saved; check this teammate’s permissions.");
      snapshot.coverage.push(batch.coverage);
      snapshot.sources.push(...batch.sources);
    }
    this.db.saveWorkSnapshot(snapshot);
    return snapshot;
  }

  save(botId: string, runId: string, args: unknown): WorkReport {
    this.assertRun(botId, runId);
    const input = workReportInput.parse(args);
    const snapshot = this.db.listWorkSnapshots(runId).find((entry) => entry.id === input.snapshotId);
    if (!snapshot || snapshot.botId !== botId) throw new Error("Use a source snapshot gathered by this teammate in this task.");
    if (this.db.getConnector("google-workspace")?.accountEmail !== snapshot.accountEmail) throw new Error("The connected Google account changed. Gather fresh sources from the new account.");
    for (const source of snapshot.sources) if (!this.canRead(botId, source.service)) throw new Error("Source access was removed. Check app permissions before preparing this result.");
    const existing = this.db.getWorkReport(snapshot.id);
    if (existing) {
      if (JSON.stringify(existing.items) !== JSON.stringify(input.items) || JSON.stringify(existing.drafts.map(({ sourceRef, body }) => ({ sourceRef, body }))) !== JSON.stringify(input.drafts)) throw new Error("This snapshot already has a saved result. Gather a fresh snapshot to revise it.");
      return existing;
    }
    if (this.now() - Date.parse(snapshot.fetchedAt) > MAX_AGE) throw new Error("These sources are over 15 minutes old. Gather a fresh snapshot before preparing the result.");
    if (snapshot.coverage.every((entry) => entry.state === "unavailable")) throw new Error("No connected app could be checked. Fix the connection and try again; there is no verified empty inbox to report.");
    const sources = new Map(snapshot.sources.map((source) => [source.ref, source]));
    for (const item of input.items) if (new Set(item.sourceRefs).size !== item.sourceRefs.length || item.sourceRefs.some((ref) => !sources.has(ref))) throw new Error("Every priority must reference sources actually read in this snapshot, without duplicate references.");
    if (new Set(input.drafts.map((draft) => draft.sourceRef)).size !== input.drafts.length) throw new Error("Prepare at most one reply per conversation.");
    const drafts = input.drafts.map((draft) => {
      const source = sources.get(draft.sourceRef);
      if (source?.service !== "gmail" || source.replyState !== "received_last" || !source.replyTo || source.truncated) throw new Error("A reply draft needs a fully read conversation with a known recipient and no newer sent message. Open the source and review it manually instead.");
      return { ...draft, to: source.replyTo, subject: /^re:/i.test(source.title) ? source.title : `Re: ${source.title}` };
    });
    const report: WorkReport = { snapshotId: snapshot.id, savedAt: new Date(this.now()).toISOString(), items: input.items, drafts, markdown: "" };
    report.markdown = renderWorkReport(snapshot, report);
    this.db.saveWorkReport(report);
    return report;
  }
}

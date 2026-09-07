import type { WorkCoverage, WorkService, WorkSnapshot, WorkSource } from "../shared/work-reports.js";
import type { GoogleWorkspaceConnector } from "./google-workspace.js";

export type WorkGoogle = Pick<GoogleWorkspaceConnector, "workInbox" | "workThread" | "workCalendar"> & Partial<Pick<GoogleWorkspaceConnector, "searchDrive" | "readDriveFile">>;
type Batch = { coverage: WorkCoverage; sources: WorkSource[] };
const unavailable = (service: WorkService, detail: string): Batch => ({ coverage: { service, state: "unavailable", count: 0, detail }, sources: [] });

// Select the event on the host before asking a model to interpret documents.
// Title matches are candidates, never proof that a document concerns a meeting.
export async function collectMeetingSources(google: WorkGoogle, snapshot: WorkSnapshot, allowed: Map<WorkService, boolean>, signal: AbortSignal): Promise<Batch[]> {
  if (!allowed.get("google-calendar")) return ["google-calendar", "gmail", "google-drive"].map((service) => unavailable(service as WorkService, "Calendar read access is needed to identify the next meeting. No related sources were searched."));
  let calendar: Awaited<ReturnType<WorkGoogle["workCalendar"]>>;
  try { calendar = await google.workCalendar(snapshot.window.from, snapshot.window.until, snapshot.timeZone, signal); }
  catch { return ["google-calendar", "gmail", "google-drive"].map((service) => unavailable(service as WorkService, "The next meeting could not be checked. Restore Calendar access and try again; no related sources were searched.")); }
  const meeting = calendar.events.filter((event) => !event.allDay && Date.parse(event.start) >= Date.parse(snapshot.window.from))
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))[0];
  if (!meeting) return [{ coverage: { service: "google-calendar", state: calendar.hasMore ? "limited" : "complete", count: 0, detail: "No upcoming timed meeting was found in the checked primary-calendar window. All-day events were excluded." + (calendar.hasMore ? " Only the first 20 events were checked; more exist." : "") }, sources: [] }, ...(["gmail", "google-drive"] as const).map((service) => unavailable(service, "Not searched because no next meeting was identified."))];
  let eventURL: string | null = null;
  try { const url = new URL(meeting.webLink); if (url.protocol === "https:" && url.hostname === "calendar.google.com" && !url.username && !url.password) eventURL = url.toString(); } catch { /* Keep the source even without a safe link. */ }
  const result: Batch[] = [{ coverage: { service: "google-calendar", state: calendar.hasMore || meeting.truncated ? "limited" : "complete", count: 1, detail: "Selected the next timed event from the primary calendar over the next seven days. All-day events were excluded." + (calendar.hasMore ? " More than 20 events exist in this window." : "") }, sources: [{ ref: "C1", service: "google-calendar", title: meeting.title, url: eventURL, text: `${meeting.location}\n${meeting.description}`, truncated: meeting.truncated, start: meeting.start, end: meeting.end, allDay: false }] }];
  const title = meeting.title.replace(/["\\\r\n]/g, " ").trim().slice(0, 160);
  if (title.length < 3 || /^(busy|untitled|meeting)$/i.test(title)) return [...result, ...(["gmail", "google-drive"] as const).map((service) => unavailable(service, "The event title is too generic to search related information safely. Open the event and provide a more specific topic."))];
  snapshot.window.mailQuery = `newer_than:30d subject:"${title}"`;
  const related = await Promise.all((["gmail", "google-drive"] as const).map(async (service): Promise<Batch> => {
    if (!allowed.get(service)) return unavailable(service, "Not connected or this teammate has no read access. Nothing was read from this app.");
    try {
      let sources: WorkSource[] = [], limited = false, failures = 0;
      if (service === "gmail") {
        const matches = await google.workInbox(snapshot.window.mailQuery, signal);
        const ids = [...new Set(matches.ids)].slice(0, 5);
        limited = matches.hasMore || matches.ids.length > 5;
        for (const [index, id] of ids.entries()) {
          try {
            const thread = await google.workThread(id, signal);
            sources.push({ ref: `M${index + 1}`, service, title: thread.subject.slice(0, 300), url: `https://mail.google.com/mail/?authuser=${encodeURIComponent(snapshot.accountEmail)}#all/${encodeURIComponent(id)}`, text: thread.text, truncated: thread.truncated, from: thread.from.slice(0, 300), date: thread.date, replyState: thread.replyState, replyTo: thread.replyTo });
          } catch { failures++; }
        }
      } else {
        if (!google.searchDrive || !google.readDriveFile) return unavailable(service, "Document collection is unavailable on this runner.");
        // Ask for a fourth candidate to make the three-document coverage limit visible.
        const matches = await google.searchDrive(title, 4, signal);
        limited = matches.length > 3;
        for (const [index, file] of matches.slice(0, 3).entries()) {
          try {
            const document = await google.readDriveFile(file.id, signal);
            sources.push({ ref: `D${index + 1}`, service, title: document.name.slice(0, 300), url: `https://drive.google.com/file/d/${encodeURIComponent(file.id)}/view`, text: document.content.slice(0, 12_000), truncated: document.content.length > 12_000, date: document.modifiedTime });
          } catch { failures++; }
        }
      }
      limited ||= failures > 0 || sources.some((source) => source.truncated);
      return { sources, coverage: { service, state: limited ? "limited" : "complete", count: sources.length, detail: `${sources.length} candidate ${service === "gmail" ? "conversations from the last 30 days" : "documents"} read using the event title. Title matches do not establish that material is about the same meeting; review sources before relying on them.${limited ? ` Coverage is bounded or shortened; ${failures} candidates could not be read.` : ""}` } };
    } catch { return unavailable(service, "Related sources could not be checked. No claim of an empty result is made."); }
  }));
  return [...result, ...related];
}

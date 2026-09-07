import type { WorkGoogle } from "./meeting-sources.js";
import type { MacProductivityReader } from "./mac-productivity.js";
import type { WorkService } from "../shared/work-reports.js";

export const macService = (service: WorkService): WorkService | null => service === "gmail" ? "apple-mail" : service === "google-calendar" ? "apple-calendar" : null;

// A collection owns this router; no mail cache crosses a run or account.
export function workSourceRouter(google: WorkGoogle, local: MacProductivityReader | undefined, allowed: Map<WorkService, boolean>, fallback: (service: WorkService) => boolean, from: string) {
  const used = new Map<WorkService, WorkService>();
  const details = new Map<WorkService, string>();
  const messages = new Map<string, Awaited<ReturnType<MacProductivityReader["mail"]>>["messages"][number]>();
  const reader: WorkGoogle = {
    ...google,
    // Preserve methods of class-backed connectors instead of object-spreading prototypes.
    searchDrive: google.searchDrive?.bind(google), readDriveFile: google.readDriveFile?.bind(google),
    async workCalendar(start, end, zone, signal) {
      if (allowed.get("google-calendar")) {
        try { return await google.workCalendar(start, end, zone, signal); }
        catch (error) { if (!fallback("google-calendar") || signal?.aborted) throw error; }
      }
      if (!local || !fallback("google-calendar")) throw new Error("Calendar read access is unavailable.");
      const result = await local.calendar(start, end, signal || AbortSignal.timeout(20_000));
      used.set("google-calendar", "apple-calendar");
      details.set("google-calendar", "Read Calendar on this Mac, not Google Calendar. At most 20 calendars and 20 returned events were checked. Local sync, recurring-event expansion and global earliest-event coverage are not guaranteed. Open Calendar to confirm; this is partial coverage.");
      return result;
    },
    async workInbox(query, signal) {
      if (allowed.get("gmail")) {
        try { return await google.workInbox(query, signal); }
        catch (error) { if (!fallback("gmail") || signal?.aborted) throw error; }
      }
      if (!local || !fallback("gmail")) throw new Error("Mail read access is unavailable.");
      const title = /subject:"([^"]*)"/.exec(query)?.[1];
      const days = query.includes("newer_than:30d") ? 30 : 7;
      const result = await local.mail(new Date(Date.parse(from) - days * 86_400_000).toISOString(), query.includes("is:unread"), title, signal || AbortSignal.timeout(20_000));
      used.set("gmail", "apple-mail"); details.set("gmail", result.detail);
      for (const item of result.messages) messages.set(item.id, item);
      return { ids: [...messages.keys()], hasMore: true };
    },
    async workThread(id, signal) {
      if (!used.has("gmail")) return google.workThread(id, signal);
      const message = messages.get(id);
      if (!message) throw new Error("This Mail message was not in the current bounded read.");
      return { ...message, replyState: "unknown" as const, replyTo: null };
    },
  };
  return { reader, used, details };
}

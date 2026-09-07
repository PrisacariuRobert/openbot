import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import type { OpenBotDatabase } from "./database.js";

export function macFallbackAllowed(db: OpenBotDatabase, botId: string, service: string, available = process.platform === "darwin") {
  const onlineService = service === "apple-mail" ? "gmail" : service === "apple-calendar" ? "google-calendar" : service;
  if (!["gmail", "google-calendar"].includes(onlineService) || !available || !db.getStudioSettings().macAccessEnabled || !db.getBot(botId)) return false;
  const access = db.getBotConnectorAccess(botId, onlineService as "gmail" | "google-calendar");
  if (access && !access.canRead) return false;
  return !db.getConnector("google-workspace")?.connected || Boolean(access?.canRead);
}

const exec = promisify(execFile);
const text = z.string().max(12_000);
const mailSchema = z.object({ messages: z.array(z.object({ id: z.string().max(300), subject: text, from: text, date: z.string().datetime(), text, truncated: z.boolean() })).max(8), detail: z.string().max(1200) });
const calendarSchema = z.object({ events: z.array(z.object({ id: z.string().max(600), title: text, start: z.string().datetime(), end: z.string().datetime(), allDay: z.boolean(), description: text, location: text, truncated: z.boolean(), webLink: z.string().max(1) })).max(20), hasMore: z.boolean() });
export interface MacProductivityReader {
  available: boolean;
  mail(from: string, unread: boolean, subject: string | undefined, signal: AbortSignal): Promise<z.infer<typeof mailSchema>>;
  calendar(from: string, until: string, signal: AbortSignal): Promise<z.infer<typeof calendarSchema>>;
}

// Fixed read-only application dictionaries, not model-authored scripts or pixel clicks.
// Reading content never assigns readStatus or invokes send/create/delete commands.
export const MAIL_READ_SCRIPT = `
function run(argv) {
  var input = JSON.parse(argv[0]), mail = Application("com.apple.mail");
  var messages = mail.inbox.messages, count = Math.min(messages.length, 100), found = [], failed = 0;
  for (var i = 0; i < count; i++) {
    try {
      var message = messages[i], date = message.dateReceived(), subject = String(message.subject() || "Untitled message");
      if (date < new Date(input.from) || (input.unread && message.readStatus())) continue;
      if (input.subject && subject.toLowerCase().indexOf(input.subject.toLowerCase()) < 0) continue;
      found.push({ message: message, date: date, subject: subject });
    } catch (e) { failed++; }
  }
  found.sort(function(a,b) { return b.date - a.date; });
  var output = [];
  for (var j = 0; j < Math.min(found.length, 8); j++) {
    try {
      var item = found[j], body = String(item.message.content() || "");
      output.push({ id: String(item.message.id()), subject: item.subject.slice(0,300), from: String(item.message.sender() || "").slice(0,300), date: item.date.toISOString(), text: body.slice(0,12000), truncated: body.length > 12000 });
    } catch(e) { failed++; }
  }
  if ((count > 0 && failed === count) || (found.length > 0 && output.length === 0)) throw new Error("Mail messages could not be read.");
  return JSON.stringify({ messages: output, detail: "Apple Mail on this Mac: inspected at most 100 inbox message headers and read at most 8 matching messages, sorted newest first within that sample. Local sync may be incomplete. Sent messages, full conversation history and attachments were not checked; reply status is unknown. " + failed + " items could not be read." });
}`;

export const CALENDAR_READ_SCRIPT = `
function run(argv) {
  var input = JSON.parse(argv[0]), app = Application("com.apple.iCal"), calendars = app.calendars;
  var output = [], limit = Math.min(calendars.length,20);
  for (var c = 0; c < limit; c++) {
    var calendar = calendars[c];
    var events = calendar.events.whose({ _and: [{ startDate: { _lessThan: new Date(input.until) } }, { endDate: { _greaterThan: new Date(input.from) } }] });
    for (var i = 0; i < Math.min(events.length,21); i++) {
      var event = events[i];
      if (String(event.status()).toLowerCase() === "cancelled") continue;
      var description = String(event.description() || ""), location = String(event.location() || "");
      output.push({ id: String(c) + ":" + String(event.uid()), title: String(event.summary() || "Untitled event").slice(0,300), start: event.startDate().toISOString(), end: event.endDate().toISOString(), allDay: Boolean(event.alldayEvent()), description: description.slice(0,12000), location: location.slice(0,300), truncated: description.length > 12000, webLink: "" });
    }
  }
  output.sort(function(a,b) { return Date.parse(a.start) - Date.parse(b.start); });
  return JSON.stringify({ events: output.slice(0,20), hasMore: true });
}`;

export class MacProductivity implements MacProductivityReader {
  readonly available: boolean;
  constructor(private readonly execute: (script: string, args: string[], signal: AbortSignal) => Promise<string> = async (script, args, signal) => {
    const result = await exec("/usr/bin/osascript", ["-l", "JavaScript", "-e", script, ...args], { timeout: 20_000, maxBuffer: 512 * 1024, signal });
    return result.stdout;
  }, platform: NodeJS.Platform = process.platform) { this.available = platform === "darwin"; }

  private async read(script: string, args: object, signal: AbortSignal): Promise<unknown> {
    if (!this.available) throw new Error("This runner is not a Mac. Connect an online service or use your Mac runner.");
    signal.throwIfAborted();
    try { return JSON.parse(await this.execute(script, [JSON.stringify(args)], signal)); }
    catch (error) {
      if (/-1743|not authorized|not permitted|authorization/i.test(String(error))) throw new Error("Allow OpenBot to read this app in System Settings → Privacy & Security → Automation, then try again. Nothing was read.");
      throw new Error("The Mac app could not be read. Check that this Mac is available, the app has your account, and Automation permission is allowed. Nothing was sent or changed.");
    }
  }
  async mail(from: string, unread: boolean, subject: string | undefined, signal: AbortSignal) {
    z.string().datetime().parse(from);
    if (subject !== undefined) z.string().max(160).parse(subject);
    return mailSchema.parse(await this.read(MAIL_READ_SCRIPT, { from, unread, subject }, signal));
  }
  async calendar(from: string, until: string, signal: AbortSignal) {
    z.string().datetime().parse(from); z.string().datetime().parse(until);
    if (Date.parse(until) <= Date.parse(from) || Date.parse(until) - Date.parse(from) > 7 * 86_400_000) throw new Error("Choose a calendar window of up to seven days.");
    return calendarSchema.parse(await this.read(CALENDAR_READ_SCRIPT, { from, until }, signal));
  }
}

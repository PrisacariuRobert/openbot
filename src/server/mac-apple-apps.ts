import { execFile } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { MacMail } from "./mac-mail-index.js";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";

/** Your team works in your own Apple apps: Reminders, Notes, Contacts,
 * Calendar, Mail and Shortcuts on this Mac. Every call runs a fixed script
 * with its input passed as JSON data, never model-authored code. Reading is
 * bounded; creating something (a reminder, note, event or a shortcut run)
 * waits for the owner's approval in the caller. A Mail draft opens for the
 * owner to send themselves; nothing is ever sent from here. */

const exec = promisify(execFile);
const line = (max: number) => z.string().trim().min(1).max(max);
const iso = z.string().datetime({ offset: true });

export const remindersInput = z.object({ list: z.string().trim().max(120).optional(), includeCompleted: z.boolean().default(false), limit: z.number().int().min(1).max(50).default(25) }).strict();
export const reminderCreateInput = z.object({ title: line(300), notes: z.string().max(4000).optional(), due: iso.optional(), list: z.string().trim().max(120).optional() }).strict();
export const notesSearchInput = z.object({ query: line(200), limit: z.number().int().min(1).max(10).default(8) }).strict();
export const noteReadInput = z.object({ id: line(400) }).strict();
export const noteCreateInput = z.object({ title: line(200), body: z.string().max(20_000), folder: z.string().trim().max(120).optional() }).strict();
export const contactsFindInput = z.object({ query: line(120) }).strict();
export const eventCreateInput = z.object({ title: line(300), start: iso, end: iso, location: z.string().max(300).optional(), notes: z.string().max(4000).optional(), calendar: z.string().trim().max(120).optional(), allDay: z.boolean().default(false) }).strict()
  .refine((value) => Date.parse(value.end) > Date.parse(value.start), "The event must end after it starts.")
  .refine((value) => Date.parse(value.end) - Date.parse(value.start) <= 14 * 86_400_000, "Events can be at most 14 days long.");
export const mailDraftInput = z.object({ to: z.array(z.string().trim().email()).min(1).max(20), cc: z.array(z.string().trim().email()).max(20).default([]), subject: z.string().max(300), body: z.string().max(20_000) }).strict();
export const mailSearchInput = z.object({ query: line(200), days: z.number().int().min(1).max(365).default(60), limit: z.number().int().min(1).max(10).default(6) }).strict();
export const mailReadInput = z.object({ id: z.string().regex(/^\d{1,15}$/) }).strict();
export const mailSaveAttachmentInput = z.object({ id: z.string().regex(/^\d{1,15}$/), attachment: line(300), folder: z.string().trim().min(1).max(300).regex(/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[^\0]+$/, "Use a folder inside your home folder, like Documents/Receipts.") }).strict();
export const shortcutRunInput = z.object({ name: line(200), input: z.string().max(20_000).optional() }).strict();

const reminderSchema = z.object({ id: z.string().max(400), title: z.string().max(300), notes: z.string().max(4000), due: z.string().nullable(), list: z.string().max(120), completed: z.boolean() });
const noteSummarySchema = z.object({ id: z.string().max(400), title: z.string().max(300), folder: z.string().max(200), modified: z.string(), snippet: z.string().max(400) });
const contactSchema = z.object({ name: z.string().max(300), organization: z.string().max(300), emails: z.array(z.string().max(300)).max(10), phones: z.array(z.string().max(100)).max(10) });

export const REMINDERS_READ_SCRIPT = `
function run(argv) {
  var input = JSON.parse(argv[0]), app = Application("Reminders"), lists = app.lists(), out = [], listNames = [];
  for (var l = 0; l < lists.length; l++) {
    var name = String(lists[l].name()); listNames.push(name);
    if (input.list && name.toLowerCase() !== input.list.toLowerCase()) continue;
    var items = input.includeCompleted ? lists[l].reminders() : lists[l].reminders.whose({ completed: false })();
    for (var i = 0; i < items.length && out.length < input.limit; i++) {
      var r = items[i], due = null;
      try { var d = r.dueDate(); if (d) due = d.toISOString(); } catch (e) {}
      out.push({ id: String(r.id()), title: String(r.name() || "").slice(0,300), notes: String(r.body() || "").slice(0,4000), due: due, list: name.slice(0,120), completed: Boolean(r.completed()) });
    }
  }
  if (input.list && listNames.map(function(n){return n.toLowerCase();}).indexOf(input.list.toLowerCase()) < 0) return JSON.stringify({ error: "no_list", lists: listNames.slice(0,30) });
  return JSON.stringify({ reminders: out, lists: listNames.slice(0,30) });
}`;

export const REMINDER_CREATE_SCRIPT = `
function run(argv) {
  var input = JSON.parse(argv[0]), app = Application("Reminders"), list = null, lists = app.lists();
  for (var l = 0; l < lists.length; l++) if (input.list && String(lists[l].name()).toLowerCase() === input.list.toLowerCase()) list = lists[l];
  if (input.list && !list) return JSON.stringify({ error: "no_list" });
  if (!list) list = app.defaultList();
  var props = { name: input.title };
  if (input.notes) props.body = input.notes;
  if (input.due) props.dueDate = new Date(input.due);
  var reminder = app.Reminder(props);
  list.reminders.push(reminder);
  var due = null; try { var d = reminder.dueDate(); if (d) due = d.toISOString(); } catch (e) {}
  return JSON.stringify({ id: String(reminder.id()), list: String(list.name()), title: String(reminder.name()), due: due });
}`;

export const NOTES_SEARCH_SCRIPT = `
function run(argv) {
  var input = JSON.parse(argv[0]), app = Application("Notes"), q = input.query.toLowerCase(), out = [];
  var notes = app.notes(), scanned = Math.min(notes.length, 400);
  for (var i = 0; i < scanned && out.length < input.limit; i++) {
    var n = notes[i], title = String(n.name() || ""), text = "";
    if (title.toLowerCase().indexOf(q) < 0) { text = String(n.plaintext() || ""); if (text.toLowerCase().indexOf(q) < 0) continue; }
    else text = String(n.plaintext() || "");
    var at = Math.max(0, text.toLowerCase().indexOf(q) - 120), folder = "";
    try { folder = String(n.container().name()); } catch (e) {}
    out.push({ id: String(n.id()), title: title.slice(0,300), folder: folder.slice(0,200), modified: n.modificationDate().toISOString(), snippet: text.slice(at, at + 400) });
  }
  return JSON.stringify({ notes: out, scanned: scanned, total: notes.length });
}`;

export const NOTE_READ_SCRIPT = `
function run(argv) {
  var input = JSON.parse(argv[0]), app = Application("Notes"), n = app.notes.byId(input.id);
  try { n.name(); } catch (e) { return JSON.stringify({ error: "not_found" }); }
  var text = String(n.plaintext() || "");
  return JSON.stringify({ id: String(n.id()), title: String(n.name()).slice(0,300), modified: n.modificationDate().toISOString(), text: text.slice(0,20000), truncated: text.length > 20000 });
}`;

export const NOTE_CREATE_SCRIPT = `
function run(argv) {
  var input = JSON.parse(argv[0]), app = Application("Notes"), folder = null, folders = app.folders();
  for (var f = 0; f < folders.length; f++) if (input.folder && String(folders[f].name()).toLowerCase() === input.folder.toLowerCase()) folder = folders[f];
  if (input.folder && !folder) return JSON.stringify({ error: "no_folder" });
  if (!folder) folder = app.defaultAccount().defaultFolder();
  function esc(s) { return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
  var html = "<h1>" + esc(input.title) + "</h1>" + input.body.split("\\n").map(function(p){ return "<div>" + (esc(p) || "<br>") + "</div>"; }).join("");
  var note = app.Note({ body: html });
  folder.notes.push(note);
  return JSON.stringify({ id: String(note.id()), title: String(note.name()), folder: String(folder.name()) });
}`;

export const CONTACTS_FIND_SCRIPT = `
function run(argv) {
  var input = JSON.parse(argv[0]), app = Application("Contacts"), people = app.people.whose({ name: { _contains: input.query } })(), out = [];
  for (var i = 0; i < Math.min(people.length, 10); i++) {
    var p = people[i], emails = [], phones = [];
    try { emails = p.emails().map(function(e){ return String(e.value()); }).slice(0,10); } catch (e) {}
    try { phones = p.phones().map(function(e){ return String(e.value()); }).slice(0,10); } catch (e) {}
    out.push({ name: String(p.name() || "").slice(0,300), organization: String(p.organization() || "").slice(0,300), emails: emails, phones: phones });
  }
  return JSON.stringify({ contacts: out });
}`;

export const EVENT_CREATE_SCRIPT = `
function run(argv) {
  var input = JSON.parse(argv[0]), app = Application("Calendar"), calendars = app.calendars(), target = null, bestRank = -1;
  for (var c = 0; c < calendars.length; c++) {
    var writable = true; try { writable = calendars[c].writable(); } catch (e) {}
    if (!writable) continue;
    var name = String(calendars[c].name()).toLowerCase();
    if (input.calendar) { if (name === input.calendar.toLowerCase()) target = calendars[c]; continue; }
    // No calendar named: prefer a personal one over shared ones like Family.
    var rank = ["calendar","home","personal","private","work"].indexOf(name);
    if (!target || (rank >= 0 && (bestRank < 0 || rank < bestRank))) { target = calendars[c]; bestRank = rank; }
  }
  if (!target) return JSON.stringify({ error: input.calendar ? "no_calendar" : "no_writable_calendar" });
  var props = { summary: input.title, startDate: new Date(input.start), endDate: new Date(input.end), alldayEvent: Boolean(input.allDay) };
  if (input.location) props.location = input.location;
  if (input.notes) props.description = input.notes;
  var event = app.Event(props);
  target.events.push(event);
  return JSON.stringify({ id: String(event.uid()), calendar: String(target.name()), title: String(event.summary()), start: event.startDate().toISOString(), end: event.endDate().toISOString() });
}`;

export const CALENDARS_LIST_SCRIPT = `
function run() {
  var app = Application("Calendar"), calendars = app.calendars(), out = [];
  for (var c = 0; c < calendars.length && out.length < 50; c++) {
    var writable = true; try { writable = calendars[c].writable(); } catch (e) {}
    out.push({ name: String(calendars[c].name()).slice(0,120), writable: Boolean(writable) });
  }
  return JSON.stringify({ calendars: out });
}`;

export const MAIL_DRAFT_SCRIPT = `
function run(argv) {
  var input = JSON.parse(argv[0]), mail = Application("com.apple.mail");
  var message = mail.OutgoingMessage({ subject: input.subject, content: input.body, visible: true });
  mail.outgoingMessages.push(message);
  input.to.forEach(function(address){ message.toRecipients.push(mail.Recipient({ address: address })); });
  input.cc.forEach(function(address){ message.ccRecipients.push(mail.CcRecipient({ address: address })); });
  mail.activate();
  return JSON.stringify({ opened: true });
}`;

export type Execute = (command: string, args: string[], timeoutMs: number) => Promise<string>;
const defaultExecute: Execute = async (command, args, timeoutMs) => (await exec(command, args, { timeout: timeoutMs, maxBuffer: 1024 * 1024 })).stdout;

export class AppleApps {
  readonly available: boolean;
  constructor(private readonly execute: Execute = defaultExecute, platform: NodeJS.Platform = process.platform, private readonly mail = new MacMail()) { this.available = platform === "darwin"; }

  private async script(app: string, script: string, input: object): Promise<Record<string, unknown>> {
    if (!this.available) throw new Error("Apple apps are only available when OpenBot runs on a Mac.");
    let raw: string;
    try { raw = await this.execute("/usr/bin/osascript", ["-l", "JavaScript", "-e", script, JSON.stringify(input)], 30_000); }
    catch (error) {
      if (/-1743|not authori[sz]ed|not permitted/i.test(String(error))) throw new Error(`Allow OpenBot to use ${app} in System Settings → Privacy & Security → Automation, then try again. Nothing was changed.`);
      if ((error as { killed?: boolean })?.killed || /-600|-1712|isn.t running|timed out|ETIMEDOUT/i.test(String(error))) throw new Error(`${app} took too long to answer — it may be busy syncing. Try again in a minute, or narrow the request. Nothing was changed.`);
      throw new Error(`${app} couldn't be reached on this Mac. Nothing was changed.`);
    }
    return JSON.parse(raw) as Record<string, unknown>;
  }

  async reminders(input: z.input<typeof remindersInput>) {
    const args = remindersInput.parse(input);
    const result = await this.script("Reminders", REMINDERS_READ_SCRIPT, args);
    if (result.error === "no_list") throw new Error(`There's no Reminders list called “${args.list}”. Lists on this Mac: ${(result.lists as string[]).join(", ")}.`);
    return { reminders: z.array(reminderSchema).parse(result.reminders), lists: z.array(z.string()).parse(result.lists) };
  }
  async createReminder(input: z.input<typeof reminderCreateInput>) {
    const args = reminderCreateInput.parse(input);
    const result = await this.script("Reminders", REMINDER_CREATE_SCRIPT, args);
    if (result.error) throw new Error(`There's no Reminders list called “${args.list}”. Nothing was added.`);
    return z.object({ id: z.string(), list: z.string(), title: z.string(), due: z.string().nullable().default(null) }).parse(result);
  }
  async searchNotes(input: z.input<typeof notesSearchInput>) {
    const args = notesSearchInput.parse(input);
    const result = await this.script("Notes", NOTES_SEARCH_SCRIPT, args);
    return { notes: z.array(noteSummarySchema).parse(result.notes), scanned: Number(result.scanned), total: Number(result.total) };
  }
  async readNote(input: z.input<typeof noteReadInput>) {
    const args = noteReadInput.parse(input);
    const result = await this.script("Notes", NOTE_READ_SCRIPT, args);
    if (result.error) throw new Error("That note isn't there anymore. Search again.");
    return z.object({ id: z.string(), title: z.string(), modified: z.string(), text: z.string(), truncated: z.boolean() }).parse(result);
  }
  async createNote(input: z.input<typeof noteCreateInput>) {
    const args = noteCreateInput.parse(input);
    const result = await this.script("Notes", NOTE_CREATE_SCRIPT, args);
    if (result.error) throw new Error(`There's no Notes folder called “${args.folder}”. Nothing was added.`);
    return z.object({ id: z.string(), title: z.string(), folder: z.string() }).parse(result);
  }
  async findContacts(input: z.input<typeof contactsFindInput>) {
    const args = contactsFindInput.parse(input);
    const result = await this.script("Contacts", CONTACTS_FIND_SCRIPT, args);
    return { contacts: z.array(contactSchema).parse(result.contacts) };
  }
  async listCalendars() {
    const result = await this.script("Calendar", CALENDARS_LIST_SCRIPT, {});
    return { calendars: z.array(z.object({ name: z.string(), writable: z.boolean() })).parse(result.calendars) };
  }
  async createEvent(input: z.input<typeof eventCreateInput>) {
    const args = eventCreateInput.parse(input);
    const result = await this.script("Calendar", EVENT_CREATE_SCRIPT, args);
    if (result.error === "no_calendar") throw new Error(`There's no calendar you can edit called “${args.calendar}”. Nothing was added.`);
    if (result.error) throw new Error("This Mac has no calendar that can be edited. Nothing was added.");
    return z.object({ id: z.string(), calendar: z.string(), title: z.string(), start: z.string().optional(), end: z.string().optional() }).parse(result);
  }
  async draftMail(input: z.input<typeof mailDraftInput>) {
    const args = mailDraftInput.parse(input);
    await this.script("Mail", MAIL_DRAFT_SCRIPT, args);
    return { opened: true };
  }
  async searchMail(input: z.input<typeof mailSearchInput>) {
    const args = mailSearchInput.parse(input);
    return this.mail.search(args.query, args.days, args.limit);
  }
  async readMail(input: z.input<typeof mailReadInput>) {
    return this.mail.read(mailReadInput.parse(input).id);
  }
  /** Saves into a folder inside the owner's home, creating it if needed, and
   * never overwrites: an existing name gets " 2", " 3"… */
  async saveMailAttachment(input: z.input<typeof mailSaveAttachmentInput>, home = homedir()) {
    const args = mailSaveAttachmentInput.parse(input);
    const folder = path.resolve(home, args.folder);
    if (!folder.startsWith(home + path.sep)) throw new Error("Choose a folder inside your home folder.");
    const bytes = this.mail.attachment(args.id, args.attachment);
    if (!bytes.length) throw new Error("That attachment is empty on this Mac — open the email in Mail once so it downloads, then try again. Nothing was saved.");
    const safeName = path.basename(args.attachment).replace(/[\0/:]/g, "-") || "attachment";
    mkdirSync(folder, { recursive: true });
    const ext = path.extname(safeName), stem = safeName.slice(0, safeName.length - ext.length);
    let target = path.join(folder, safeName);
    for (let n = 2; existsSync(target) && n < 1000; n++) target = path.join(folder, `${stem} ${n}${ext}`);
    writeFileSync(target, bytes, { flag: "wx" });
    return { saved: target, bytes: bytes.length };
  }
  async listShortcuts(): Promise<string[]> {
    if (!this.available) throw new Error("Shortcuts are only available when OpenBot runs on a Mac.");
    const out = await this.execute("/usr/bin/shortcuts", ["list"], 20_000);
    return out.split("\n").map((name) => name.trim()).filter(Boolean).slice(0, 300);
  }
  async runShortcut(input: z.input<typeof shortcutRunInput>): Promise<string> {
    const args = shortcutRunInput.parse(input);
    if (!(await this.listShortcuts()).includes(args.name)) throw new Error(`There's no shortcut called “${args.name}” on this Mac. Nothing was run.`);
    const extra: string[] = [];
    if (args.input !== undefined) {
      const { mkdtempSync, writeFileSync } = await import("node:fs");
      const { tmpdir } = await import("node:os");
      const path = await import("node:path");
      const file = path.join(mkdtempSync(path.join(tmpdir(), "openbot-shortcut-")), "input.txt");
      writeFileSync(file, args.input, { mode: 0o600 });
      extra.push("--input-path", file);
    }
    try { return (await this.execute("/usr/bin/shortcuts", ["run", args.name, ...extra, "--output-path", "/dev/stdout"], 120_000)).slice(0, 12_000); }
    catch { throw new Error(`The shortcut “${args.name}” didn't finish. Check it in the Shortcuts app.`); }
  }
}

/** One plain sentence per change, shown in the approval. */
export function describeAppleChange(action: string, args: Record<string, unknown>): { reason: string; label: string } | null {
  const when = (value: unknown) => typeof value === "string" ? new Date(value).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
  if (action === "mac_reminder_create") {
    const a = reminderCreateInput.parse(args);
    return { label: `Add reminder: ${a.title}`, reason: `Add “${a.title}” to Reminders${a.list ? ` (${a.list})` : ""}${a.due ? `, due ${when(a.due)}` : ""}.` };
  }
  if (action === "mac_note_create") {
    const a = noteCreateInput.parse(args);
    return { label: `Add note: ${a.title}`, reason: `Create a note “${a.title}” in Notes${a.folder ? ` (${a.folder})` : ""}: “${a.body.replace(/\s+/g, " ").slice(0, 200)}${a.body.length > 200 ? "…" : ""}”` };
  }
  if (action === "mac_event_create") {
    const a = eventCreateInput.parse(args);
    return { label: `Add event: ${a.title}`, reason: `Add “${a.title}” to ${a.calendar ? `your “${a.calendar}” calendar` : "your main calendar"}: ${when(a.start)} – ${when(a.end)}${a.location ? ` at ${a.location}` : ""}.` };
  }
  if (action === "mac_mail_save_attachment") {
    const a = mailSaveAttachmentInput.parse(args);
    return { label: `Save attachment: ${a.attachment}`, reason: `Save “${a.attachment}” from that email into ~/${a.folder.replace(/\/+$/, "")}. Nothing is overwritten or deleted.` };
  }
  if (action === "mac_shortcut_run") {
    const a = shortcutRunInput.parse(args);
    return { label: `Run shortcut: ${a.name}`, reason: `Run your shortcut “${a.name}”${a.input ? ` with: “${a.input.replace(/\s+/g, " ").slice(0, 160)}”` : ""}. A shortcut can do anything it's built to do — check what it does if you're unsure.` };
  }
  return null;
}

/** The saved time, read back from the app, in the owner's words. */
export function spokenTime(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}

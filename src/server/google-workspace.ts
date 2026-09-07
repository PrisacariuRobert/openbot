import { createHash, randomBytes } from "node:crypto";
import { calendarDeliveryBody, calendarDeliveryMatches, type CalendarDeliveryEvent } from "./calendar-delivery.js";
import { ApprovalReviewChangedError, ApprovedConnectorOutcomeUncertainError } from "./approval-review-binding.js";
import type { CalendarEventSummary, ConnectorCatalogEntry, DriveFileDetail, DriveFileSummary, GmailMessageDetail, GmailMessageSummary, GoogleConnectorService } from "../shared/types.js";
import type { OpenBotDatabase } from "./database.js";

type FetchLike = typeof fetch;
type GoogleTokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string };
type GmailHeader = { name?: string; value?: string };
type GmailPart = { mimeType?: string; body?: { data?: string; attachmentId?: string }; parts?: GmailPart[]; headers?: GmailHeader[] };
type GmailMessage = { id?: string; threadId?: string; labelIds?: string[]; snippet?: string; internalDate?: string; payload?: GmailPart };
export interface WorkMailThread {
  id: string;
  subject: string;
  from: string;
  date: string;
  text: string;
  truncated: boolean;
  replyState: "received_last" | "sent_last" | "unknown";
  replyTo: string | null;
}

function singleReplyAddress(value: string): string | null {
  // Ambiguous/group addresses require manual review; never invent a recipient.
  const match = value.trim().match(/^(?:[^<>\r\n]*<([^<>\s,;]+)>|([^<>\s,;]+))$/);
  const address = match?.[1] || match?.[2] || "";
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address) ? address : null;
}

export function decodeWorkThread(id: string, messages: GmailMessage[]): WorkMailThread {
  const visible = messages.filter((message) => !message.labelIds?.includes("DRAFT"));
  const knownOrder = visible.length > 0 && visible.every((message) => Number(message.internalDate) > 0);
  const sorted = [...visible].sort((a, b) => Number(a.internalDate || 0) - Number(b.internalDate || 0));
  const last = sorted.at(-1);
  const detail = decodeGmailMessage(last || {});
  const excerpts = sorted.slice(-4).map((message) => {
    const decoded = decodeGmailMessage(message);
    return `${decoded.from.slice(0, 160)} · ${decoded.date.slice(0, 100)}\n${(decoded.body || decoded.snippet).slice(0, 700)}`;
  }).join("\n\n---\n\n");
  return {
    id, subject: detail.subject, from: detail.from, date: detail.date,
    text: excerpts.slice(0, 4_000),
    truncated: sorted.length > 4 || excerpts.length > 4_000 || sorted.slice(-4).some((message) => !plainText(message.payload) || plainText(message.payload).length > 700),
    replyState: !knownOrder || !last?.labelIds ? "unknown" : last.labelIds.includes("SENT") ? "sent_last" : "received_last",
    replyTo: singleReplyAddress(header(last?.payload, "Reply-To") || detail.from),
  };
}

const CONNECTOR_ID = "google-workspace";
function serviceForGoogleUrl(url: string): GoogleConnectorService {
  if (url.includes("/drive/")) return "google-drive";
  if (url.includes("/calendar/")) return "google-calendar";
  return "gmail";
}
export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events.owned",
];

export function googleServiceCapabilities(connected: boolean, scopes: string[]) {
  const hasScope = (suffix: string) => connected && scopes.some((scope) => scope === suffix || scope.endsWith(`/${suffix}`));
  return {
    gmail: { read: hasScope("gmail.readonly"), write: hasScope("gmail.send") },
    "google-drive": { read: hasScope("drive.readonly"), write: hasScope("drive.file") || hasScope("drive") },
    "google-calendar": { read: hasScope("calendar.readonly") || hasScope("calendar.events.owned"), write: hasScope("calendar.events.owned") || hasScope("calendar.events") || hasScope("calendar") },
  } satisfies Record<GoogleConnectorService, { read: boolean; write: boolean }>;
}

export function connectorCatalog(connected: boolean, scopes: string[] = []): ConnectorCatalogEntry[] {
  const capability = googleServiceCapabilities(connected, scopes);
  return [
    { id: "gmail", name: "Gmail", description: "Search and read mail, then send only after your approval.", badge: connected && !capability.gmail.write ? "Read ready · reconnect to send" : "Available now", availability: "live", connected: capability.gmail.read, writeConnected: capability.gmail.write, capabilities: ["Search inbox", "Read messages", "Approval-safe sending"] },
    { id: "google-drive", name: "Google Drive", description: "Find documents, read current context, and create reviewed text files.", badge: connected && !capability["google-drive"].write ? "Read ready · reconnect to create" : "Available now", availability: "live", connected: capability["google-drive"].read, writeConnected: capability["google-drive"].write, capabilities: ["Search files", "Read documents", "Approval-safe file creation"] },
    { id: "google-calendar", name: "Google Calendar", description: "Check your schedule and add a reviewed event or invitation.", badge: connected && !capability["google-calendar"].write ? "Read ready · reconnect to create" : "Available now", availability: "live", connected: capability["google-calendar"].read, writeConnected: capability["google-calendar"].write, capabilities: ["Read schedule", "See event details", "Approval-safe event creation"] },
    { id: "slack", name: "Slack", description: "Summarize channels and prepare carefully reviewed replies.", badge: "Planned", availability: "next", connected: false, capabilities: ["Search", "Read", "Approval-safe replies"] },
    { id: "notion", name: "Notion", description: "Search team knowledge and update pages with a clear review step.", badge: "Planned", availability: "next", connected: false, capabilities: ["Search pages", "Read content"] },
    { id: "github", name: "GitHub", description: "Track issues, review pull requests, and follow repository activity.", badge: "Planned", availability: "next", connected: false, capabilities: ["Issues", "Pull requests", "Notifications"] },
  ];
}

function expiresAt(seconds = 3600) {
  return new Date(Date.now() + Math.max(60, seconds) * 1000).toISOString();
}

function header(part: GmailPart | undefined, name: string) {
  return part?.headers?.find((item) => item.name?.toLowerCase() === name.toLowerCase())?.value || "";
}

function decodeBase64Url(value = "") {
  try { return Buffer.from(value, "base64url").toString("utf8"); } catch { return ""; }
}

async function boundedGoogleJson<T>(response: Response): Promise<T> {
  return JSON.parse(await boundedGoogleText(response)) as T;
}

async function boundedGoogleText(response: Response): Promise<string> {
  const maximum = 2 * 1024 * 1024;
  if (Number(response.headers.get("content-length")) > maximum) {
    await response.body?.cancel();
    throw new Error("This Google response is too large for one check. Narrow the request.");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Google returned an empty response.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) {
        await reader.cancel();
        throw new Error("This Google response is too large for one check. Narrow the request.");
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally { reader.releaseLock(); }
}

function htmlText(value: string) {
  return value.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function plainText(part: GmailPart | undefined): string {
  if (!part) return "";
  if (part.mimeType?.toLowerCase() === "text/plain" && part.body?.data) return decodeBase64Url(part.body.data);
  for (const child of part.parts || []) {
    const text = plainText(child);
    if (text) return text;
  }
  if (part.mimeType?.toLowerCase() === "text/html" && part.body?.data) {
    return htmlText(decodeBase64Url(part.body.data));
  }
  return part.body?.data ? decodeBase64Url(part.body.data) : "";
}

function bodyAttachment(part: GmailPart | undefined, mimeType: "text/plain" | "text/html"): { id: string; html: boolean } | null {
  if (!part) return null;
  if (part.mimeType?.toLowerCase() === mimeType && part.body?.attachmentId) return { id: part.body.attachmentId, html: mimeType === "text/html" };
  for (const child of part.parts || []) {
    const found = bodyAttachment(child, mimeType);
    if (found) return found;
  }
  return null;
}

export function decodeGmailMessage(message: GmailMessage): GmailMessageDetail {
  const timestamp = Number(message.internalDate), fallbackDate = Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp).toISOString() : "";
  return {
    id: message.id || "", threadId: message.threadId || "", from: header(message.payload, "From"), to: header(message.payload, "To"),
    subject: header(message.payload, "Subject") || "(No subject)", date: header(message.payload, "Date") || fallbackDate,
    snippet: message.snippet || "", unread: message.labelIds?.includes("UNREAD") || false, body: plainText(message.payload).slice(0, 40_000),
  };
}

function cleanHeader(value: string, maximum: number) {
  const clean = value.replace(/[\x00-\x1f\x7f]+/g, " ").trim();
  if (!clean || clean.length > maximum) throw new Error("Email details are missing or too long.");
  return clean;
}

function addresses(value: string) {
  const items = value.split(",").map((item) => item.trim()).filter(Boolean);
  if (!items.length || items.length > 10 || items.some((item) => !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(item))) throw new Error("Use one to ten valid email addresses.");
  return items;
}

export function buildRawEmail(input: { to: string; cc?: string; subject: string; body: string }) {
  const to = addresses(input.to), cc = input.cc?.trim() ? addresses(input.cc) : [], subject = cleanHeader(input.subject, 200);
  const body = input.body.trim();
  if (!body || body.length > 50_000) throw new Error("Email text must be between 1 and 50,000 characters.");
  const encodedSubject = /[^\x20-\x7e]/.test(subject) ? `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=` : subject;
  const lines = [`To: ${to.join(", ")}`, ...(cc.length ? [`Cc: ${cc.join(", ")}`] : []), `Subject: ${encodedSubject}`, "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: 8bit", "", body];
  return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");
}

export class GoogleWorkspaceConnector {
  private readonly attempts = new Map<string, { verifier: string; createdAt: number }>();

  constructor(private readonly db: OpenBotDatabase, readonly redirectUri: string, private readonly fetcher: FetchLike = fetch) {}

  oauthInProgress() {
    this.pruneAttempts();
    return this.attempts.size > 0;
  }

  beginOAuth() {
    const credentials = this.db.googleConnectorCredentials();
    if (!credentials) throw new Error("Add your Google OAuth client first.");
    this.pruneAttempts();
    const state = randomBytes(24).toString("base64url"), verifier = randomBytes(48).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    this.attempts.set(state, { verifier, createdAt: Date.now() });
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: credentials.clientId, redirect_uri: this.redirectUri, response_type: "code", scope: GOOGLE_SCOPES.join(" "),
      access_type: "offline", include_granted_scopes: "true", prompt: "consent", state, code_challenge: challenge, code_challenge_method: "S256",
    }).toString();
    return { url: url.toString(), state };
  }

  async completeOAuth(state: string, code: string) {
    const attempt = this.attempts.get(state), credentials = this.db.googleConnectorCredentials();
    if (!attempt) {
      const existing = this.db.restoreGoogleConnectorAfterStaleCallback();
      if (existing?.connected && existing.accountEmail) return existing;
      throw new Error("That Google sign-in expired. Start it again from OpenBot.");
    }
    this.attempts.delete(state);
    if (Date.now() - attempt.createdAt > 10 * 60_000) throw new Error("That Google sign-in expired. Start it again from OpenBot.");
    if (!credentials) throw new Error("Google Workspace is no longer configured.");
    const params: Record<string, string> = {
      client_id: credentials.clientId, code, code_verifier: attempt.verifier, grant_type: "authorization_code", redirect_uri: this.redirectUri,
    };
    if (credentials.clientSecret) params.client_secret = credentials.clientSecret;
    const token = await this.tokenRequest(params);
    if (!token.access_token) throw new Error(token.error_description || token.error || "Google did not return an access token.");
    const profileResponse = await this.fetcher("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers: { authorization: `Bearer ${token.access_token}` } });
    const profile = await profileResponse.json().catch(() => ({})) as { emailAddress?: string; error?: { message?: string } };
    if (!profileResponse.ok || !profile.emailAddress) throw new Error(profile.error?.message || "OpenBot could not read the connected Gmail profile.");
    const connection = this.db.completeGoogleConnector({
      accessToken: token.access_token, refreshToken: token.refresh_token, expiresAt: expiresAt(token.expires_in),
      scopes: token.scope?.split(/\s+/).filter(Boolean) || GOOGLE_SCOPES, accountEmail: profile.emailAddress,
    });
    this.db.addConnectorEvent({ action: "connected", status: "completed", summary: `Connected ${profile.emailAddress}` });
    return connection;
  }

  async disconnect() {
    const credentials = this.db.googleConnectorCredentials(), token = credentials?.refreshToken || credentials?.accessToken;
    const connection = this.db.disconnectGoogleConnector();
    if (token) await this.fetcher("https://oauth2.googleapis.com/revoke", { method: "POST", signal: AbortSignal.timeout(20_000), headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }) }).catch(() => undefined);
    this.db.addConnectorEvent({ action: "disconnected", status: "completed", summary: "Google Workspace disconnected" });
    return connection;
  }

  async search(query: string, maxResults = 8): Promise<GmailMessageSummary[]> {
    const cleanQuery = query.trim().slice(0, 500), limit = Math.max(1, Math.min(Math.round(maxResults), 10));
    const result = await this.request<{ messages?: Array<{ id: string }> }>(`/gmail/v1/users/me/messages?${new URLSearchParams({ q: cleanQuery, maxResults: String(limit) })}`);
    const messages = await Promise.all((result.messages || []).slice(0, limit).map((item) => this.request<GmailMessage>(`/gmail/v1/users/me/messages/${encodeURIComponent(item.id)}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`)));
    return messages.map((message) => { const detail = decodeGmailMessage(message); const { body: _body, ...summary } = detail; return summary; });
  }

  async read(messageId: string): Promise<GmailMessageDetail> {
    if (!/^[A-Za-z0-9_-]{4,200}$/.test(messageId)) throw new Error("Choose a valid Gmail message.");
    const message = await this.request<GmailMessage>(`/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=full`), decoded = decodeGmailMessage(message);
    if (!decoded.body && message.id) {
      const attachment = bodyAttachment(message.payload, "text/plain") || bodyAttachment(message.payload, "text/html");
      if (attachment) {
        const result = await this.request<{ data?: string }>(`/gmail/v1/users/me/messages/${encodeURIComponent(message.id)}/attachments/${encodeURIComponent(attachment.id)}`);
        const text = decodeBase64Url(result.data || "");
        decoded.body = (attachment.html ? htmlText(text) : text).slice(0, 40_000);
      }
    }
    return decoded;
  }

  async workInbox(query: string, signal: AbortSignal): Promise<{ ids: string[]; hasMore: boolean }> {
    const result = await this.request<{ threads?: { id: string }[]; nextPageToken?: string }>(`/gmail/v1/users/me/threads?${new URLSearchParams({ q: query, maxResults: "8" })}`, { signal });
    return { ids: [...new Set((result.threads || []).map((thread) => thread.id))].slice(0, 8), hasMore: Boolean(result.nextPageToken) };
  }

  async workThread(id: string, signal: AbortSignal): Promise<WorkMailThread> {
    if (!/^[A-Za-z0-9_-]{4,200}$/.test(id)) throw new Error("Choose a valid Gmail conversation.");
    const thread = await this.request<{ id?: string; messages?: GmailMessage[] }>(`/gmail/v1/users/me/threads/${encodeURIComponent(id)}?format=full`, { signal });
    if (thread.id !== id || !thread.messages?.length) throw new Error("That conversation could not be read.");
    return decodeWorkThread(id, thread.messages);
  }

  async workCalendar(from: string, until: string, timeZone: string, signal: AbortSignal) {
    const params = new URLSearchParams({ timeMin: from, timeMax: until, timeZone, singleEvents: "true", orderBy: "startTime", maxResults: "20" });
    const result = await this.request<{ nextPageToken?: string; items?: Array<{ id?: string; status?: string; summary?: string; start?: { date?: string; dateTime?: string }; end?: { date?: string; dateTime?: string }; description?: string; htmlLink?: string; location?: string }> }>(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, { signal });
    return {
      hasMore: Boolean(result.nextPageToken),
      events: (result.items || []).filter((event) => event.id && event.status !== "cancelled").slice(0, 20).map((event) => ({
        id: event.id!, title: (event.summary || "Busy").slice(0, 300), start: event.start?.dateTime || event.start?.date || "", end: event.end?.dateTime || event.end?.date || "",
        allDay: Boolean(event.start?.date && !event.start.dateTime), description: (event.description || "").slice(0, 1500), truncated: (event.description || "").length > 1500,
        location: (event.location || "").slice(0, 300), webLink: event.htmlLink || "",
      })),
    };
  }

  async send(input: { to: string; cc?: string; subject: string; body: string }): Promise<{ id: string; threadId: string }> {
    const result = await this.request<{ id?: string; threadId?: string }>("/gmail/v1/users/me/messages/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ raw: buildRawEmail(input) }) });
    if (!result.id) throw new Error("Gmail did not confirm that the message was sent.");
    return { id: result.id, threadId: result.threadId || "" };
  }

  async searchDrive(query: string, maxResults = 8, signal?: AbortSignal): Promise<DriveFileSummary[]> {
    const term = query.trim().slice(0, 200).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const q = term ? `trashed = false and (name contains '${term}' or fullText contains '${term}')` : "trashed = false";
    const params = new URLSearchParams({ q, pageSize: String(Math.max(1, Math.min(Math.round(maxResults), 12))), orderBy: "modifiedTime desc", fields: "files(id,name,mimeType,modifiedTime,webViewLink,size)" });
    const result = await this.request<{ files?: Array<{ id?: string; name?: string; mimeType?: string; modifiedTime?: string; webViewLink?: string; size?: string }> }>(`https://www.googleapis.com/drive/v3/files?${params}`, { signal });
    return (result.files || []).filter((file) => file.id).map((file) => ({ id: file.id!, name: file.name || "Untitled", mimeType: file.mimeType || "application/octet-stream", modifiedTime: file.modifiedTime || "", webViewLink: file.webViewLink || "", size: file.size ? Number(file.size) : null }));
  }

  async readDriveFile(fileId: string, signal?: AbortSignal): Promise<DriveFileDetail> {
    if (!/^[A-Za-z0-9_-]{4,200}$/.test(fileId)) throw new Error("Choose a valid Google Drive file.");
    const fields = "id,name,mimeType,modifiedTime,webViewLink,size";
    const file = await this.request<{ id: string; name?: string; mimeType?: string; modifiedTime?: string; webViewLink?: string; size?: string }>(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?${new URLSearchParams({ fields })}`, { signal });
    const mimeType = file.mimeType || "application/octet-stream";
    if (file.size && Number(file.size) > 2_000_000) throw new Error("That Drive file is too large to read safely in one conversation. Open its link or narrow the request.");
    let url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;
    if (mimeType === "application/vnd.google-apps.document") url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent("text/plain")}`;
    else if (mimeType === "application/vnd.google-apps.spreadsheet") url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent("text/csv")}`;
    else if (!mimeType.startsWith("text/") && !["application/json", "application/xml"].includes(mimeType)) throw new Error("OpenBot can find this file, but this format needs a dedicated viewer. Use its Google Drive link instead.");
    const content = (await this.requestText(url, false, signal)).slice(0, 100_000);
    return { id: file.id, name: file.name || "Untitled", mimeType, modifiedTime: file.modifiedTime || "", webViewLink: file.webViewLink || "", size: file.size ? Number(file.size) : null, content };
  }

  async createDriveTextFile(input: { name: string; content: string; mimeType?: "text/plain" | "text/markdown" }) {
    const name = input.name.trim(), content = input.content, mimeType = input.mimeType || "text/plain";
    if (!name || name.length > 240 || /[\u0000-\u001f\u007f]/.test(name)) throw new Error("Give the Drive file a short name without control characters.");
    if (!content.trim() || content.length > 100_000) throw new Error("Drive text files must contain between 1 and 100,000 characters.");
    const boundary = `openbot_${randomBytes(12).toString("hex")}`;
    const body = [
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, mimeType })}\r\n`,
      `--${boundary}\r\nContent-Type: ${mimeType}; charset=UTF-8\r\n\r\n${content}\r\n`,
      `--${boundary}--`,
    ].join("");
    const fields = "id,name,mimeType,webViewLink";
    const result = await this.request<{ id?: string; name?: string; mimeType?: string; webViewLink?: string }>(`https://www.googleapis.com/upload/drive/v3/files?${new URLSearchParams({ uploadType: "multipart", fields })}`, {
      method: "POST", headers: { "content-type": `multipart/related; boundary=${boundary}` }, body,
    });
    if (!result.id) throw new Error("Google Drive did not confirm that the file was created.");
    return { id: result.id, name: result.name || name, mimeType: result.mimeType || mimeType, webViewLink: result.webViewLink || `https://drive.google.com/open?id=${encodeURIComponent(result.id)}` };
  }

  async calendarAgenda(days = 7, maxResults = 20): Promise<CalendarEventSummary[]> {
    const duration = Math.max(1, Math.min(Math.round(days), 31)), now = new Date(), until = new Date(now.getTime() + duration * 86_400_000);
    const params = new URLSearchParams({ timeMin: now.toISOString(), timeMax: until.toISOString(), singleEvents: "true", orderBy: "startTime", maxResults: String(Math.max(1, Math.min(Math.round(maxResults), 40))) });
    const result = await this.request<{ items?: Array<{ id?: string; summary?: string; start?: { date?: string; dateTime?: string }; end?: { date?: string; dateTime?: string }; location?: string; description?: string; htmlLink?: string; attendees?: unknown[] }> }>(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`);
    return (result.items || []).filter((event) => event.id).map((event) => ({
      id: event.id!, title: event.summary || "Busy", start: event.start?.dateTime || event.start?.date || "", end: event.end?.dateTime || event.end?.date || "",
      allDay: Boolean(event.start?.date && !event.start.dateTime), location: event.location || "", description: (event.description || "").slice(0, 2_000), webLink: event.htmlLink || "", attendeeCount: event.attendees?.length || 0,
    }));
  }

  async createCalendarEvent(input: { title: string; start: string; end: string; description?: string; location?: string; attendees?: string[]; addGoogleMeet?: boolean }, approvalID?: string) {
    const title = input.title.trim(), start = new Date(input.start), end = new Date(input.end);
    const attendees = [...new Set((input.attendees || []).map((value) => value.trim().toLowerCase()).filter(Boolean))];
    if (!title || title.length > 300) throw new Error("Give the calendar event a short title.");
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start || end.getTime() - start.getTime() > 7 * 86_400_000) throw new Error("Choose a valid event start and end, no more than seven days apart.");
    if (attendees.length > 20 || attendees.some((email) => !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email))) throw new Error("Use at most 20 valid attendee email addresses.");
    if ((input.description || "").length > 8_000 || (input.location || "").length > 500) throw new Error("Shorten the event description or location.");
    const params = new URLSearchParams({ sendUpdates: attendees.length ? "all" : "none" });
    const conferenceData = input.addGoogleMeet ? { createRequest: { requestId: randomBytes(16).toString("hex"), conferenceSolutionKey: { type: "hangoutsMeet" } } } : undefined;
    if (conferenceData) params.set("conferenceDataVersion", "1");
    const body = {
        summary: title, description: input.description?.trim() || undefined, location: input.location?.trim() || undefined,
        start: { dateTime: start.toISOString() }, end: { dateTime: end.toISOString() },
        attendees: attendees.length ? attendees.map((email) => ({ email })) : undefined, conferenceData,
    };
    const delivery = approvalID ? calendarDeliveryBody(body, approvalID) : undefined;
    const authorizationVersion = this.db.connectorAuthorizationVersion(CONNECTOR_ID);
    const assertSameAccount = () => {
      if (this.db.connectorAuthorizationVersion(CONNECTOR_ID) !== authorizationVersion) throw new ApprovalReviewChangedError(true);
    };
    let result: CalendarDeliveryEvent, recovered = false;
    try {
      result = await this.request<CalendarDeliveryEvent>(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(delivery || body),
      });
      assertSameAccount();
      if (delivery && !calendarDeliveryMatches(delivery, result)) throw new ApprovedConnectorOutcomeUncertainError();
    } catch (error) {
      if (!delivery || error instanceof ApprovalReviewChangedError) throw error;
      assertSameAccount();
      // Exactly one readback operation, no sleep loop and no second insert.
      // Not found is NOT evidence that the original request was not applied.
      try {
        result = await this.request<CalendarDeliveryEvent>(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${delivery.id}`);
        assertSameAccount();
      } catch (readError) {
        if (readError instanceof ApprovalReviewChangedError) throw readError;
        throw new ApprovedConnectorOutcomeUncertainError();
      }
      if (!calendarDeliveryMatches(delivery, result)) throw new ApprovedConnectorOutcomeUncertainError();
      recovered = true;
    }
    if (!result.id) throw new Error("Google Calendar did not confirm that the event was created.");
    return { id: result.id, title: result.summary || title, webLink: result.htmlLink || "", meetingLink: result.hangoutLink || "", recovered, meetingPending: input.addGoogleMeet === true && !result.hangoutLink };
  }

  private pruneAttempts() {
    for (const [state, attempt] of this.attempts) if (Date.now() - attempt.createdAt > 10 * 60_000) this.attempts.delete(state);
  }

  private async tokenRequest(parameters: Record<string, string>) {
    const response = await this.fetcher("https://oauth2.googleapis.com/token", { method: "POST", signal: AbortSignal.timeout(15_000), headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(parameters) });
    const result = await response.json().catch(() => ({})) as GoogleTokenResponse;
    if (!response.ok) throw new Error(result.error_description || result.error || "Google sign-in could not be completed.");
    return result;
  }

  private async accessToken(force = false) {
    const version = this.db.connectorAuthorizationVersion("google-workspace");
    const credentials = this.db.googleConnectorCredentials();
    if (!credentials?.accessToken && !credentials?.refreshToken) throw new Error("Connect Gmail before asking a teammate to use it.");
    const stillFresh = credentials.accessToken && credentials.expiresAt && new Date(credentials.expiresAt).getTime() > Date.now() + 60_000;
    if (!force && stillFresh) return credentials.accessToken!;
    if (!credentials.refreshToken) {
      if (credentials.accessToken && !force) return credentials.accessToken;
      throw new Error("Gmail needs to be reconnected.");
    }
    const params: Record<string, string> = { client_id: credentials.clientId, refresh_token: credentials.refreshToken, grant_type: "refresh_token" };
    if (credentials.clientSecret) params.client_secret = credentials.clientSecret;
    const token = await this.tokenRequest(params);
    if (!token.access_token) throw new Error("Google did not refresh the Gmail connection.");
    this.db.updateGoogleAccessToken(token.access_token, expiresAt(token.expires_in), token.refresh_token, version);
    return token.access_token;
  }

  private async request<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
    const token = await this.accessToken(retried);
    const url = /^https:\/\//.test(path) ? path : `https://gmail.googleapis.com${path}`;
    const response = await this.fetcher(url, { ...init, signal: init.signal || AbortSignal.timeout(20_000), headers: { authorization: `Bearer ${token}`, ...init.headers } });
    if (response.status === 401 && !retried) return this.request<T>(path, init, true);
    const body = await boundedGoogleJson<T & { error?: { message?: string } }>(response);
    const service = serviceForGoogleUrl(url);
    if (!response.ok) {
      const message = body.error?.message || `Gmail returned ${response.status}.`;
      if (response.status === 401) this.db.markConnectorError(CONNECTOR_ID, message);
      else if (response.status === 403) this.db.markConnectorServiceError(service, message);
      throw new Error(message);
    }
    this.db.clearConnectorServiceError(service);
    this.db.markConnectorUsed(CONNECTOR_ID);
    return body;
  }

  private async requestText(url: string, retried = false, signal = AbortSignal.timeout(20_000)): Promise<string> {
    const token = await this.accessToken(retried), response = await this.fetcher(url, { signal, headers: { authorization: `Bearer ${token}` } });
    if (response.status === 401 && !retried) return this.requestText(url, true, signal);
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
      const message = body.error?.message || `Google Drive returned ${response.status}.`;
      if (response.status === 401) this.db.markConnectorError(CONNECTOR_ID, message);
      else if (response.status === 403) this.db.markConnectorServiceError("google-drive", message);
      throw new Error(message);
    }
    this.db.clearConnectorServiceError("google-drive");
    this.db.markConnectorUsed(CONNECTOR_ID);
    return boundedGoogleText(response);
  }
}

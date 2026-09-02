import { createHash, randomBytes } from "node:crypto";
import type { CalendarEventSummary, ConnectorCatalogEntry, DriveFileDetail, DriveFileSummary, GmailMessageDetail, GmailMessageSummary, GoogleConnectorService } from "../shared/types.js";
import type { OpenBotDatabase } from "./database.js";

type FetchLike = typeof fetch;
type GoogleTokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string };
type GmailHeader = { name?: string; value?: string };
type GmailPart = { mimeType?: string; body?: { data?: string; attachmentId?: string }; parts?: GmailPart[]; headers?: GmailHeader[] };
type GmailMessage = { id?: string; threadId?: string; labelIds?: string[]; snippet?: string; internalDate?: string; payload?: GmailPart };

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
  "https://www.googleapis.com/auth/calendar.readonly",
];

export function connectorCatalog(connected: boolean, scopes: string[] = []): ConnectorCatalogEntry[] {
  const hasScope = (suffix: string) => connected && scopes.some((scope) => scope === suffix || scope.endsWith(`/${suffix}`));
  const gmailConnected = hasScope("gmail.readonly") && hasScope("gmail.send");
  const driveConnected = hasScope("drive.readonly"), calendarConnected = hasScope("calendar.readonly");
  return [
    { id: "gmail", name: "Gmail", description: "Search and read mail, then send only after your approval.", badge: connected && !gmailConnected ? "Reconnect to add" : "Available now", availability: "live", connected: gmailConnected, capabilities: ["Search inbox", "Read messages", "Approval-safe sending"] },
    { id: "google-drive", name: "Google Drive", description: "Find documents and bring current project context into a conversation.", badge: connected && !driveConnected ? "Reconnect to add" : "Available now", availability: "live", connected: driveConnected, capabilities: ["Search files", "Read documents"] },
    { id: "google-calendar", name: "Google Calendar", description: "Check upcoming events and find the context around your day.", badge: connected && !calendarConnected ? "Reconnect to add" : "Available now", availability: "live", connected: calendarConnected, capabilities: ["Read schedule", "See event details"] },
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
    if (token) await this.fetcher("https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }) }).catch(() => undefined);
    const connection = this.db.disconnectGoogleConnector();
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

  async send(input: { to: string; cc?: string; subject: string; body: string }): Promise<{ id: string; threadId: string }> {
    const result = await this.request<{ id?: string; threadId?: string }>("/gmail/v1/users/me/messages/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ raw: buildRawEmail(input) }) });
    if (!result.id) throw new Error("Gmail did not confirm that the message was sent.");
    return { id: result.id, threadId: result.threadId || "" };
  }

  async searchDrive(query: string, maxResults = 8): Promise<DriveFileSummary[]> {
    const term = query.trim().slice(0, 200).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const q = term ? `trashed = false and (name contains '${term}' or fullText contains '${term}')` : "trashed = false";
    const params = new URLSearchParams({ q, pageSize: String(Math.max(1, Math.min(Math.round(maxResults), 12))), orderBy: "modifiedTime desc", fields: "files(id,name,mimeType,modifiedTime,webViewLink,size)" });
    const result = await this.request<{ files?: Array<{ id?: string; name?: string; mimeType?: string; modifiedTime?: string; webViewLink?: string; size?: string }> }>(`https://www.googleapis.com/drive/v3/files?${params}`);
    return (result.files || []).filter((file) => file.id).map((file) => ({ id: file.id!, name: file.name || "Untitled", mimeType: file.mimeType || "application/octet-stream", modifiedTime: file.modifiedTime || "", webViewLink: file.webViewLink || "", size: file.size ? Number(file.size) : null }));
  }

  async readDriveFile(fileId: string): Promise<DriveFileDetail> {
    if (!/^[A-Za-z0-9_-]{4,200}$/.test(fileId)) throw new Error("Choose a valid Google Drive file.");
    const fields = "id,name,mimeType,modifiedTime,webViewLink,size";
    const file = await this.request<{ id: string; name?: string; mimeType?: string; modifiedTime?: string; webViewLink?: string; size?: string }>(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?${new URLSearchParams({ fields })}`);
    const mimeType = file.mimeType || "application/octet-stream";
    if (file.size && Number(file.size) > 2_000_000) throw new Error("That Drive file is too large to read safely in one conversation. Open its link or narrow the request.");
    let url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;
    if (mimeType === "application/vnd.google-apps.document") url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent("text/plain")}`;
    else if (mimeType === "application/vnd.google-apps.spreadsheet") url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent("text/csv")}`;
    else if (!mimeType.startsWith("text/") && !["application/json", "application/xml"].includes(mimeType)) throw new Error("OpenBot can find this file, but this format needs a dedicated viewer. Use its Google Drive link instead.");
    const content = (await this.requestText(url)).slice(0, 100_000);
    return { id: file.id, name: file.name || "Untitled", mimeType, modifiedTime: file.modifiedTime || "", webViewLink: file.webViewLink || "", size: file.size ? Number(file.size) : null, content };
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

  private pruneAttempts() {
    for (const [state, attempt] of this.attempts) if (Date.now() - attempt.createdAt > 10 * 60_000) this.attempts.delete(state);
  }

  private async tokenRequest(parameters: Record<string, string>) {
    const response = await this.fetcher("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(parameters) });
    const result = await response.json().catch(() => ({})) as GoogleTokenResponse;
    if (!response.ok) throw new Error(result.error_description || result.error || "Google sign-in could not be completed.");
    return result;
  }

  private async accessToken(force = false) {
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
    this.db.updateGoogleAccessToken(token.access_token, expiresAt(token.expires_in), token.refresh_token);
    return token.access_token;
  }

  private async request<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
    const token = await this.accessToken(retried);
    const url = /^https:\/\//.test(path) ? path : `https://gmail.googleapis.com${path}`;
    const response = await this.fetcher(url, { ...init, headers: { authorization: `Bearer ${token}`, ...init.headers } });
    if (response.status === 401 && !retried) return this.request<T>(path, init, true);
    const body = await response.json().catch(() => ({})) as T & { error?: { message?: string } };
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

  private async requestText(url: string, retried = false): Promise<string> {
    const token = await this.accessToken(retried), response = await this.fetcher(url, { headers: { authorization: `Bearer ${token}` } });
    if (response.status === 401 && !retried) return this.requestText(url, true);
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
      const message = body.error?.message || `Google Drive returned ${response.status}.`;
      if (response.status === 401) this.db.markConnectorError(CONNECTOR_ID, message);
      else if (response.status === 403) this.db.markConnectorServiceError("google-drive", message);
      throw new Error(message);
    }
    this.db.clearConnectorServiceError("google-drive");
    this.db.markConnectorUsed(CONNECTOR_ID);
    return response.text();
  }
}

import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import type { DropboxFileDetail, DropboxFileSummary } from "../shared/types.js";
import type { OpenBotDatabase } from "./database.js";

type FetchLike = typeof fetch;
type Json = Record<string, unknown>;
type DropboxCredentials = { accessToken: string; refreshToken?: string; expiresAt?: string; accountId?: string };
type OAuthAttempt = { createdAt: number; codeVerifier: string };

export type DropboxChangeSummary = {
  id: string;
  name: string;
  path: string;
  changeType: "changed" | "deleted";
  modifiedAt: string;
  size: number;
};

const SCOPES = ["account_info.read", "files.metadata.read", "files.content.read"];
const TEXT_EXTENSIONS = new Set([".txt", ".md", ".markdown", ".csv", ".json", ".yaml", ".yml", ".xml", ".html", ".css", ".js", ".jsx", ".ts", ".tsx", ".py", ".rb", ".go", ".rs", ".java", ".swift", ".kt", ".log"]);

function cleanText(value: unknown, limit = 2_000) {
  return typeof value === "string" ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, limit) : "";
}

function expiresAt(seconds: unknown) {
  const amount = Number(seconds);
  return Number.isFinite(amount) && amount > 0 ? new Date(Date.now() + amount * 1_000).toISOString() : undefined;
}

export class DropboxConnector {
  private attempts = new Map<string, OAuthAttempt>();

  constructor(private db: OpenBotDatabase, readonly redirectUri: string, private fetcher: FetchLike = fetch) {}

  oauthInProgress() { this.pruneAttempts(); return this.attempts.size > 0; }

  beginOAuth() {
    const configured = this.db.oauthConnectorCredentials<DropboxCredentials>("dropbox");
    if (!configured) throw new Error("Add the Dropbox app key first.");
    const state = randomBytes(24).toString("base64url");
    const codeVerifier = randomBytes(48).toString("base64url");
    const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
    this.attempts.set(state, { createdAt: Date.now(), codeVerifier });
    const params = new URLSearchParams({
      client_id: configured.clientId, redirect_uri: this.redirectUri, response_type: "code", state,
      token_access_type: "offline", scope: SCOPES.join(" "), code_challenge_method: "S256", code_challenge: codeChallenge,
    });
    return { url: `https://www.dropbox.com/oauth2/authorize?${params}`, state };
  }

  async completeOAuth(state: string, code: string) {
    this.pruneAttempts();
    const attempt = this.attempts.get(state);
    if (!attempt) throw new Error("That Dropbox sign-in expired. Start it again from OpenBot.");
    this.attempts.delete(state);
    const configured = this.db.oauthConnectorCredentials<DropboxCredentials>("dropbox");
    if (!configured) throw new Error("The Dropbox connection is missing.");
    const result = await this.tokenRequest(configured.clientId, configured.clientSecret, { code, grant_type: "authorization_code", redirect_uri: this.redirectUri, code_verifier: attempt.codeVerifier });
    const accessToken = cleanText(result.access_token, 4_000);
    if (!accessToken) throw new Error("Dropbox did not return a usable access token.");
    const credentials: DropboxCredentials = {
      accessToken, ...(cleanText(result.refresh_token, 4_000) ? { refreshToken: cleanText(result.refresh_token, 4_000) } : {}),
      ...(expiresAt(result.expires_in) ? { expiresAt: expiresAt(result.expires_in) } : {}), accountId: cleanText(result.account_id, 300) || undefined,
    };
    this.db.completeOAuthConnector("dropbox", credentials, "Dropbox account", SCOPES);
    const account = await this.account().catch(() => null);
    const label = account ? cleanText((account.name as Json | undefined)?.display_name || account.email, 200) : "Dropbox account";
    this.db.completeOAuthConnector("dropbox", credentials, label || "Dropbox account", SCOPES);
    return this.db.getConnector("dropbox")!;
  }

  async health() {
    const account = await this.account();
    const name = account.name && typeof account.name === "object" ? account.name as Json : {};
    return { name: cleanText(name.display_name, 200), email: cleanText(account.email, 200), accountId: cleanText(account.account_id, 300) };
  }

  async search(query = "", maxResults = 20): Promise<DropboxFileSummary[]> {
    const count = Math.max(1, Math.min(Math.round(maxResults), 20)), needle = cleanText(query, 500);
    const result = needle
      ? await this.api("/2/files/search_v2", { query: needle, options: { max_results: count, file_status: "active", filename_only: false } })
      : await this.api("/2/files/list_folder", { path: "", recursive: false, include_deleted: false, include_non_downloadable_files: true, limit: count });
    const values = needle ? (Array.isArray(result.matches) ? result.matches : []).map((item) => {
      const match = item && typeof item === "object" ? item as Json : {};
      const metadata = match.metadata && typeof match.metadata === "object" ? match.metadata as Json : {};
      return metadata.metadata || metadata;
    }) : Array.isArray(result.entries) ? result.entries : [];
    return values.map((item) => this.fileSummary(item)).filter((item): item is DropboxFileSummary => Boolean(item)).slice(0, count);
  }

  async read(fileIdOrPath: string): Promise<DropboxFileDetail> {
    const identifier = cleanText(fileIdOrPath, 2_000);
    if (!(identifier.startsWith("id:") || identifier.startsWith("/"))) throw new Error("Choose a Dropbox file returned by search.");
    const metadata = await this.api("/2/files/get_metadata", { path: identifier, include_deleted: false });
    const summary = this.fileSummary(metadata);
    if (!summary || !summary.isDownloadable || !TEXT_EXTENSIONS.has(path.extname(summary.name).toLowerCase())) throw new Error("Choose a supported text or code file from Dropbox.");
    if (summary.size > 1_000_000) throw new Error("That Dropbox file is too large to read safely. Choose a file smaller than 1 MB.");
    const token = await this.accessToken();
    const response = await this.fetcher("https://content.dropboxapi.com/2/files/download", {
      method: "POST", headers: { authorization: `Bearer ${token}`, "dropbox-api-arg": JSON.stringify({ path: identifier }) },
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Dropbox could not read that file (${cleanText(detail, 300) || response.status}).`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 1_000_000) throw new Error("That Dropbox file is too large to read safely.");
    this.db.markConnectorUsed("dropbox");
    const raw = bytes.toString("utf8").replace(/\u0000/g, ""), content = raw.slice(0, 24_000);
    return { ...summary, content, truncated: raw.length > content.length };
  }

  async latestCursor(folderPath = ""): Promise<string> {
    const result = await this.api("/2/files/list_folder/get_latest_cursor", {
      path: this.folderPath(folderPath), recursive: true, include_deleted: true, include_non_downloadable_files: true,
    });
    const cursor = cleanText(result.cursor, 4_000);
    if (!cursor) throw new Error("Dropbox did not return a change cursor.");
    return cursor;
  }

  async changes(cursor: string): Promise<{ cursor: string; hasMore: boolean; entries: DropboxChangeSummary[] }> {
    const safeCursor = cleanText(cursor, 4_000);
    if (!safeCursor) throw new Error("Dropbox change tracking needs a valid cursor.");
    const result = await this.api("/2/files/list_folder/continue", { cursor: safeCursor });
    const entries = (Array.isArray(result.entries) ? result.entries : []).map((value) => {
      if (!value || typeof value !== "object") return null;
      const row = value as Json, tag = cleanText(row[".tag"], 40), filePath = cleanText(row.path_display || row.path_lower, 2_000), name = cleanText(row.name, 500);
      if (!filePath || !name || !["file", "deleted"].includes(tag)) return null;
      const modifiedAt = cleanText(row.server_modified || row.client_modified, 100);
      return {
        id: cleanText(row.id, 300) || `path:${filePath.toLowerCase()}`,
        name, path: filePath, changeType: tag === "deleted" ? "deleted" : "changed", modifiedAt,
        size: Math.max(0, Number(row.size) || 0),
      } satisfies DropboxChangeSummary;
    }).filter((value): value is DropboxChangeSummary => Boolean(value));
    return { cursor: cleanText(result.cursor, 4_000) || safeCursor, hasMore: result.has_more === true, entries };
  }

  async disconnect() { this.attempts.clear(); return this.db.disconnectOAuthConnector("dropbox"); }

  private fileSummary(value: unknown): DropboxFileSummary | null {
    if (!value || typeof value !== "object") return null;
    const row = value as Json;
    if (row[".tag"] !== "file") return null;
    const id = cleanText(row.id, 300), filePath = cleanText(row.path_display || row.path_lower, 2_000), name = cleanText(row.name, 500);
    if (!id || !filePath || !name) return null;
    return { id, path: filePath, name, modifiedAt: cleanText(row.server_modified, 100), size: Math.max(0, Number(row.size) || 0), isDownloadable: row.is_downloadable !== false, webUrl: null };
  }

  private async account() { return this.api("/2/users/get_current_account", null); }

  private async api(endpoint: string, body: Json | null, retry = true): Promise<Json> {
    const token = await this.accessToken();
    const response = await this.fetcher(`https://api.dropboxapi.com${endpoint}`, {
      method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: body === null ? "null" : JSON.stringify(body),
    });
    if (response.status === 401 && retry) { await this.refresh(); return this.api(endpoint, body, false); }
    const result = await response.json().catch(() => ({})) as Json;
    if (!response.ok) throw new Error(`Dropbox could not complete that request (${cleanText(result.error_summary || result.error, 400) || response.status}).`);
    this.db.markConnectorUsed("dropbox");
    return result;
  }

  private async accessToken() {
    const configured = this.db.oauthConnectorCredentials<DropboxCredentials>("dropbox"), credentials = configured?.credentials;
    if (!configured || !credentials?.accessToken) throw new Error("Connect Dropbox in Apps & Tools first.");
    if (credentials.expiresAt && new Date(credentials.expiresAt).getTime() <= Date.now() + 60_000) return this.refresh();
    return credentials.accessToken;
  }

  private async refresh() {
    const configured = this.db.oauthConnectorCredentials<DropboxCredentials>("dropbox"), credentials = configured?.credentials;
    if (!configured || !credentials?.refreshToken) throw new Error("Dropbox sign-in expired. Reconnect it in Apps & Tools.");
    const result = await this.tokenRequest(configured.clientId, configured.clientSecret, { refresh_token: credentials.refreshToken, grant_type: "refresh_token" });
    const accessToken = cleanText(result.access_token, 4_000);
    if (!accessToken) throw new Error("Dropbox could not refresh its sign-in. Reconnect it in Apps & Tools.");
    this.db.updateOAuthConnectorCredentials("dropbox", { ...credentials, accessToken, ...(expiresAt(result.expires_in) ? { expiresAt: expiresAt(result.expires_in) } : {}) });
    return accessToken;
  }

  private async tokenRequest(clientId: string, clientSecret: string, values: Record<string, string>) {
    const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
    const body = new URLSearchParams(values);
    if (clientSecret) headers.authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
    else body.set("client_id", clientId);
    const response = await this.fetcher("https://api.dropboxapi.com/oauth2/token", {
      method: "POST", headers, body,
    });
    const result = await response.json().catch(() => ({})) as Json;
    if (!response.ok) throw new Error(`Dropbox sign-in failed (${cleanText(result.error_description || result.error, 300) || response.status}).`);
    return result;
  }

  private folderPath(value: string) {
    const normalized = cleanText(value, 1_000).replace(/\\/g, "/");
    return normalized && normalized !== "/" ? `/${normalized.replace(/^\/+|\/+$/g, "")}` : "";
  }

  private pruneAttempts() { for (const [state, attempt] of this.attempts) if (Date.now() - attempt.createdAt > 10 * 60_000) this.attempts.delete(state); }
}

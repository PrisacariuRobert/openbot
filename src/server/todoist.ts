import { randomBytes } from "node:crypto";
import type { TodoistTaskSummary } from "../shared/types.js";
import type { OpenBotDatabase } from "./database.js";

type FetchLike = typeof fetch;
type Json = Record<string, unknown>;
type TodoistCredentials = { accessToken: string; refreshToken?: string; expiresAt?: string };

const SCOPE = "data:read_write";

function cleanText(value: unknown, limit = 2_000) {
  return typeof value === "string" ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, limit) : "";
}

function expiresAt(seconds: unknown) {
  const amount = Number(seconds);
  return Number.isFinite(amount) && amount > 0 ? new Date(Date.now() + amount * 1_000).toISOString() : undefined;
}

export class TodoistConnector {
  private attempts = new Map<string, number>();

  constructor(private db: OpenBotDatabase, readonly redirectUri: string, private fetcher: FetchLike = fetch) {}

  oauthInProgress() {
    this.pruneAttempts();
    return this.attempts.size > 0;
  }

  async beginOAuth() {
    let configured = this.db.oauthConnectorCredentials<TodoistCredentials>("todoist");
    if (!configured) {
      const response = await this.fetcher("https://api.todoist.com/oauth/register", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          client_name: "OpenBot", redirect_uris: [this.redirectUri], scope: SCOPE,
          grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "client_secret_post",
        }),
      });
      const result = await response.json().catch(() => ({})) as Json;
      const clientId = cleanText(result.client_id, 500), clientSecret = cleanText(result.client_secret, 2_000);
      if (!response.ok || !clientId || !clientSecret) {
        throw new Error(`Todoist could not prepare one-click sign-in (${cleanText(result.error_description || result.error, 300) || response.status}). Try again shortly.`);
      }
      this.db.configureOAuthConnector({ id: "todoist", kind: "todoist_oauth", name: "Todoist", clientId, clientSecret });
      configured = this.db.oauthConnectorCredentials<TodoistCredentials>("todoist");
    }
    if (!configured) throw new Error("Todoist could not prepare sign-in.");
    const state = randomBytes(24).toString("base64url");
    this.attempts.set(state, Date.now());
    const params = new URLSearchParams({ client_id: configured.clientId, redirect_uri: this.redirectUri, scope: SCOPE, state, response_type: "code" });
    return { url: `https://app.todoist.com/oauth/authorize?${params}`, state };
  }

  async completeOAuth(state: string, code: string) {
    this.pruneAttempts();
    if (!this.attempts.delete(state)) throw new Error("That Todoist sign-in expired. Start it again from OpenBot.");
    const configured = this.db.oauthConnectorCredentials<TodoistCredentials>("todoist");
    if (!configured) throw new Error("The Todoist connection is missing.");
    const result = await this.tokenRequest(configured.clientId, configured.clientSecret, { grant_type: "authorization_code", code, redirect_uri: this.redirectUri });
    const accessToken = cleanText(result.access_token, 4_000);
    if (!accessToken) throw new Error("Todoist did not return a usable access token.");
    const credentials: TodoistCredentials = {
      accessToken,
      ...(cleanText(result.refresh_token, 4_000) ? { refreshToken: cleanText(result.refresh_token, 4_000) } : {}),
      ...(expiresAt(result.expires_in) ? { expiresAt: expiresAt(result.expires_in) } : {}),
    };
    this.db.completeOAuthConnector("todoist", credentials, "Todoist account", [SCOPE]);
    try {
      const user = await this.request("/api/v1/user");
      const account = cleanText(user.full_name || user.name || user.email, 200);
      if (account) this.db.completeOAuthConnector("todoist", credentials, account, [SCOPE]);
    } catch { /* the task connection is still valid even if profile lookup is unavailable */ }
    return this.db.getConnector("todoist")!;
  }

  async health() {
    const user = await this.request("/api/v1/user");
    return { name: cleanText(user.full_name || user.name, 200), email: cleanText(user.email, 200) };
  }

  async tasks(query = "", maxResults = 20): Promise<TodoistTaskSummary[]> {
    const params = new URLSearchParams({ limit: String(Math.max(1, Math.min(Math.round(maxResults), 50))) });
    const result = await this.request(`/api/v1/tasks?${params}`);
    const rows = Array.isArray(result.results) ? result.results : Array.isArray(result) ? result : [];
    const needle = cleanText(query, 500).toLocaleLowerCase();
    return rows.map((row) => this.taskSummary(row)).filter((row): row is TodoistTaskSummary => Boolean(row))
      .filter((row) => !needle || `${row.content}\n${row.description}`.toLocaleLowerCase().includes(needle)).slice(0, 20);
  }

  async create(input: { content: string; description?: string; dueString?: string; projectId?: string; priority?: number }) {
    const content = cleanText(input.content, 500), description = cleanText(input.description, 4_000), dueString = cleanText(input.dueString, 200), projectId = cleanText(input.projectId, 200);
    if (!content) throw new Error("Give the Todoist task a title first.");
    const result = await this.request("/api/v1/tasks", { method: "POST", body: {
      content, ...(description ? { description } : {}), ...(dueString ? { due_string: dueString } : {}), ...(projectId ? { project_id: projectId } : {}),
      ...(input.priority ? { priority: Math.max(1, Math.min(Math.round(input.priority), 4)) } : {}),
    } });
    const task = this.taskSummary(result);
    if (!task) throw new Error("Todoist created the task but did not return its details.");
    return task;
  }

  async disconnect() {
    this.attempts.clear();
    return this.db.disconnectOAuthConnector("todoist");
  }

  private taskSummary(value: unknown): TodoistTaskSummary | null {
    if (!value || typeof value !== "object") return null;
    const row = value as Json, id = cleanText(row.id, 200), content = cleanText(row.content, 500);
    if (!id || !content) return null;
    const due = row.due && typeof row.due === "object" ? row.due as Json : {};
    return {
      id, content, description: cleanText(row.description, 2_000), projectId: cleanText(row.project_id, 200),
      priority: Math.max(1, Math.min(Number(row.priority) || 1, 4)), due: cleanText(due.datetime || due.date || due.string, 200) || null,
      completed: row.is_completed === true || row.completed === true,
      url: cleanText(row.url, 2_000) || `https://app.todoist.com/app/task/${encodeURIComponent(id)}`,
    };
  }

  private async request(path: string, options: { method?: "GET" | "POST"; body?: Json } = {}, retry = true): Promise<Json> {
    const configured = this.db.oauthConnectorCredentials<TodoistCredentials>("todoist"), credentials = configured?.credentials;
    if (!configured || !credentials?.accessToken) throw new Error("Connect Todoist in Apps & Tools first.");
    if (retry && credentials.expiresAt && new Date(credentials.expiresAt).getTime() <= Date.now() + 60_000 && credentials.refreshToken) await this.refresh(configured.clientId, configured.clientSecret, credentials);
    const current = this.db.oauthConnectorCredentials<TodoistCredentials>("todoist")?.credentials || credentials;
    const response = await this.fetcher(`https://api.todoist.com${path}`, {
      method: options.method || "GET", headers: { authorization: `Bearer ${current.accessToken}`, "content-type": "application/json" },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    });
    if (response.status === 401 && retry && current.refreshToken) { await this.refresh(configured.clientId, configured.clientSecret, current); return this.request(path, options, false); }
    const result = await response.json().catch(() => ({})) as Json;
    if (!response.ok) throw new Error(`Todoist could not complete that request (${cleanText(result.error_description || result.error || result.message, 400) || response.status}).`);
    this.db.markConnectorUsed("todoist");
    return result;
  }

  private async refresh(clientId: string, clientSecret: string, credentials: TodoistCredentials) {
    if (!credentials.refreshToken) throw new Error("Todoist sign-in expired. Reconnect it in Apps & Tools.");
    const result = await this.tokenRequest(clientId, clientSecret, { grant_type: "refresh_token", refresh_token: credentials.refreshToken });
    const accessToken = cleanText(result.access_token, 4_000);
    if (!accessToken) throw new Error("Todoist could not refresh its sign-in. Reconnect it in Apps & Tools.");
    this.db.updateOAuthConnectorCredentials("todoist", { accessToken, refreshToken: cleanText(result.refresh_token, 4_000) || credentials.refreshToken, ...(expiresAt(result.expires_in) ? { expiresAt: expiresAt(result.expires_in) } : {}) });
  }

  private async tokenRequest(clientId: string, clientSecret: string, values: Record<string, string>) {
    const response = await this.fetcher("https://api.todoist.com/oauth/access_token", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...values }),
    });
    const result = await response.json().catch(() => ({})) as Json;
    if (!response.ok) throw new Error(`Todoist sign-in failed (${cleanText(result.error_description || result.error, 300) || response.status}).`);
    return result;
  }

  private pruneAttempts() {
    for (const [state, createdAt] of this.attempts) if (Date.now() - createdAt > 10 * 60_000) this.attempts.delete(state);
  }
}

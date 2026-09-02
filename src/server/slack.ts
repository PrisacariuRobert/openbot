import { randomBytes } from "node:crypto";
import type { SlackConversationResult, SlackMessageSummary } from "../shared/types.js";
import type { OpenBotDatabase } from "./database.js";

type FetchLike = typeof fetch;
type SlackToken = { accessToken: string; refreshToken?: string; expiresAt?: string };
type SlackCredentials = { bot: SlackToken; user: SlackToken; teamId: string; teamName: string; botUserId?: string };
type SlackResponse = { ok?: boolean; error?: string; needed?: string; provided?: string; [key: string]: unknown };

const BOT_SCOPES = ["chat:write"];
const USER_SCOPES = ["search:read", "channels:read", "groups:read", "im:read", "mpim:read", "channels:history", "groups:history", "im:history", "mpim:history"];

function cleanText(value: unknown, limit = 2_000) {
  return typeof value === "string" ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, limit) : "";
}

function expiresAt(seconds: unknown): string | undefined {
  const amount = Number(seconds);
  return Number.isFinite(amount) && amount > 0 ? new Date(Date.now() + amount * 1_000).toISOString() : undefined;
}

export class SlackConnector {
  private attempts = new Map<string, number>();

  constructor(private db: OpenBotDatabase, readonly redirectUri: string, private fetcher: FetchLike = fetch) {}

  oauthInProgress() {
    this.pruneAttempts();
    return this.attempts.size > 0;
  }

  beginOAuth() {
    const configured = this.db.oauthConnectorCredentials<SlackCredentials>("slack");
    if (!configured) throw new Error("Add the Slack app client ID and secret first.");
    const state = randomBytes(24).toString("base64url");
    this.attempts.set(state, Date.now());
    const params = new URLSearchParams({
      client_id: configured.clientId, redirect_uri: this.redirectUri, state,
      scope: BOT_SCOPES.join(","), user_scope: USER_SCOPES.join(","),
    });
    return { url: `https://slack.com/oauth/v2/authorize?${params}`, state };
  }

  async completeOAuth(state: string, code: string) {
    this.pruneAttempts();
    if (!this.attempts.delete(state)) throw new Error("That Slack sign-in expired. Start it again from OpenBot.");
    const configured = this.db.oauthConnectorCredentials<SlackCredentials>("slack");
    if (!configured) throw new Error("The Slack app configuration is missing.");
    const result = await this.oauthRequest(configured.clientId, configured.clientSecret, {
      grant_type: "authorization_code", code, redirect_uri: this.redirectUri,
    });
    const authedUser = (result.authed_user || {}) as Record<string, unknown>;
    const team = (result.team || {}) as Record<string, unknown>;
    const botToken = cleanText(result.access_token, 4_000), userToken = cleanText(authedUser.access_token, 4_000);
    if (!botToken || !userToken) throw new Error("Slack did not grant both conversation reading and approved posting. Reconnect and accept the requested permissions.");
    const credentials: SlackCredentials = {
      bot: { accessToken: botToken, ...(cleanText(result.refresh_token, 4_000) ? { refreshToken: cleanText(result.refresh_token, 4_000) } : {}), ...(expiresAt(result.expires_in) ? { expiresAt: expiresAt(result.expires_in) } : {}) },
      user: { accessToken: userToken, ...(cleanText(authedUser.refresh_token, 4_000) ? { refreshToken: cleanText(authedUser.refresh_token, 4_000) } : {}), ...(expiresAt(authedUser.expires_in) ? { expiresAt: expiresAt(authedUser.expires_in) } : {}) },
      teamId: cleanText(team.id, 200), teamName: cleanText(team.name, 200) || "Slack workspace", botUserId: cleanText(result.bot_user_id, 200) || undefined,
    };
    this.db.completeOAuthConnector("slack", credentials, credentials.teamName, [...BOT_SCOPES, ...USER_SCOPES]);
    return this.db.getConnector("slack")!;
  }

  async health() {
    const result = await this.call("auth.test", {}, "bot");
    return { team: cleanText(result.team, 200), user: cleanText(result.user, 200), teamId: cleanText(result.team_id, 200), userId: cleanText(result.user_id, 200) };
  }

  async search(query: string, maxResults = 12): Promise<SlackMessageSummary[]> {
    const result = await this.call("search.messages", { query: cleanText(query, 500), count: String(Math.max(1, Math.min(Math.round(maxResults), 20))), sort: "timestamp", sort_dir: "desc" }, "user");
    const messages = result.messages && typeof result.messages === "object" ? result.messages as Record<string, unknown> : {};
    const matches = Array.isArray(messages.matches) ? messages.matches : [];
    return matches.slice(0, 20).map((item) => this.messageSummary(item)).filter((item): item is SlackMessageSummary => Boolean(item));
  }

  async read(channelId: string, timestamp: string, threadTimestamp?: string | null, maxResults = 20): Promise<SlackConversationResult> {
    const channel = cleanText(channelId, 200), ts = cleanText(timestamp, 80), thread = cleanText(threadTimestamp, 80);
    if (!channel || !ts) throw new Error("Choose a Slack message returned by search.");
    const result = thread
      ? await this.call("conversations.replies", { channel, ts: thread, limit: String(Math.max(1, Math.min(Math.round(maxResults), 50))) }, "user")
      : await this.call("conversations.history", { channel, latest: ts, inclusive: "true", limit: String(Math.max(1, Math.min(Math.round(maxResults), 20))) }, "user");
    const messages = Array.isArray(result.messages) ? result.messages : [];
    return { channelId: channel, messages: messages.map((item) => this.messageSummary(item, channel)).filter((item): item is SlackMessageSummary => Boolean(item)) };
  }

  async post(channelId: string, text: string, threadTimestamp?: string | null) {
    const channel = cleanText(channelId, 200), body = cleanText(text, 4_000), thread = cleanText(threadTimestamp, 80);
    if (!channel || !body) throw new Error("Choose a Slack destination and write a message.");
    const result = await this.call("chat.postMessage", { channel, text: body, ...(thread ? { thread_ts: thread } : {}) }, "bot");
    return { channel: cleanText(result.channel, 200) || channel, timestamp: cleanText(result.ts, 80) };
  }

  async disconnect() {
    this.attempts.clear();
    return this.db.disconnectOAuthConnector("slack");
  }

  private messageSummary(value: unknown, fallbackChannel = ""): SlackMessageSummary | null {
    if (!value || typeof value !== "object") return null;
    const row = value as Record<string, unknown>, channel = row.channel && typeof row.channel === "object" ? row.channel as Record<string, unknown> : {};
    const channelId = cleanText(channel.id || row.channel_id, 200) || fallbackChannel, timestamp = cleanText(row.ts, 80);
    if (!channelId || !timestamp) return null;
    return {
      channelId, channelName: cleanText(channel.name || row.channel_name, 200) || channelId, timestamp,
      threadTimestamp: cleanText(row.thread_ts, 80) || null, author: cleanText(row.username || row.user_name || row.user_id || row.user, 200) || "Slack member",
      text: cleanText(row.text), permalink: cleanText(row.permalink, 2_000) || null,
    };
  }

  private async call(method: string, parameters: Record<string, string>, tokenKind: "bot" | "user"): Promise<SlackResponse> {
    const token = await this.accessToken(tokenKind);
    const response = await this.fetcher(`https://slack.com/api/${method}`, {
      method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(parameters),
    });
    const result = await response.json().catch(() => ({})) as SlackResponse;
    if (!response.ok || !result.ok) {
      const detail = result.error === "missing_scope" && result.needed ? ` Slack needs the ${result.needed} permission.` : "";
      throw new Error(`Slack could not complete that request (${cleanText(result.error, 120) || response.status}).${detail}`);
    }
    this.db.markConnectorUsed("slack");
    return result;
  }

  private async accessToken(kind: "bot" | "user") {
    const configured = this.db.oauthConnectorCredentials<SlackCredentials>("slack"), credentials = configured?.credentials;
    if (!configured || !credentials?.[kind]?.accessToken) throw new Error("Connect Slack in Apps & Tools first.");
    const token = credentials[kind];
    if (!token.expiresAt || new Date(token.expiresAt).getTime() > Date.now() + 60_000) return token.accessToken;
    if (!token.refreshToken) throw new Error("Slack sign-in expired. Reconnect it in Apps & Tools.");
    const refreshed = await this.oauthRequest(configured.clientId, configured.clientSecret, { grant_type: "refresh_token", refresh_token: token.refreshToken });
    const nested = refreshed.authed_user && typeof refreshed.authed_user === "object" ? refreshed.authed_user as Record<string, unknown> : {};
    const accessToken = cleanText(kind === "user" ? nested.access_token || refreshed.access_token : refreshed.access_token, 4_000);
    if (!accessToken) throw new Error("Slack could not refresh its sign-in. Reconnect it in Apps & Tools.");
    credentials[kind] = {
      accessToken, refreshToken: cleanText(kind === "user" ? nested.refresh_token || refreshed.refresh_token : refreshed.refresh_token, 4_000) || token.refreshToken,
      expiresAt: expiresAt(kind === "user" ? nested.expires_in || refreshed.expires_in : refreshed.expires_in),
    };
    this.db.updateOAuthConnectorCredentials("slack", credentials);
    return accessToken;
  }

  private async oauthRequest(clientId: string, clientSecret: string, parameters: Record<string, string>): Promise<SlackResponse> {
    const response = await this.fetcher("https://slack.com/api/oauth.v2.access", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...parameters }),
    });
    const result = await response.json().catch(() => ({})) as SlackResponse;
    if (!response.ok || !result.ok) throw new Error(`Slack sign-in failed (${cleanText(result.error, 160) || response.status}).`);
    return result;
  }

  private pruneAttempts() {
    for (const [state, createdAt] of this.attempts) if (Date.now() - createdAt > 10 * 60_000) this.attempts.delete(state);
  }
}

import { randomBytes } from "node:crypto";
import type { NotionPageDetail, NotionPageSummary } from "../shared/types.js";
import type { OpenBotDatabase } from "./database.js";

type FetchLike = typeof fetch;
type NotionCredentials = { accessToken: string; refreshToken?: string; botId: string; workspaceId: string; workspaceName: string; ownerName?: string };
type Json = Record<string, unknown>;

const NOTION_VERSION = "2026-03-11";

function cleanText(value: unknown, limit = 2_000) {
  return typeof value === "string" ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, limit) : "";
}

function richText(value: unknown) {
  if (!Array.isArray(value)) return "";
  return value.map((part) => part && typeof part === "object" ? cleanText((part as Json).plain_text, 2_000) : "").filter(Boolean).join("");
}

function pageTitle(page: Json) {
  const properties = page.properties && typeof page.properties === "object" ? page.properties as Json : {};
  for (const property of Object.values(properties)) {
    if (property && typeof property === "object" && (property as Json).type === "title") {
      const title = richText((property as Json).title);
      if (title) return title.slice(0, 240);
    }
  }
  return richText(page.title).slice(0, 240) || "Untitled page";
}

function blockText(block: Json) {
  const type = cleanText(block.type, 80), data = type && block[type] && typeof block[type] === "object" ? block[type] as Json : {};
  const text = richText(data.rich_text || data.caption);
  if (!text) return "";
  if (/^heading_/.test(type)) return `${"#".repeat(Math.max(1, Math.min(4, Number(type.split("_")[1]) || 2)))} ${text}`;
  if (type === "bulleted_list_item") return `- ${text}`;
  if (type === "numbered_list_item") return `1. ${text}`;
  if (type === "to_do") return `- [${data.checked ? "x" : " "}] ${text}`;
  if (type === "quote") return `> ${text}`;
  return text;
}

export class NotionConnector {
  private attempts = new Map<string, number>();

  constructor(private db: OpenBotDatabase, readonly redirectUri: string, private fetcher: FetchLike = fetch) {}

  oauthInProgress() {
    this.pruneAttempts();
    return this.attempts.size > 0;
  }

  beginOAuth() {
    const configured = this.db.oauthConnectorCredentials<NotionCredentials>("notion");
    if (!configured) throw new Error("Add the Notion OAuth client ID and secret first.");
    const state = randomBytes(24).toString("base64url");
    this.attempts.set(state, Date.now());
    const params = new URLSearchParams({ owner: "user", client_id: configured.clientId, redirect_uri: this.redirectUri, response_type: "code", state });
    return { url: `https://api.notion.com/v1/oauth/authorize?${params}`, state };
  }

  async completeOAuth(state: string, code: string) {
    this.pruneAttempts();
    if (!this.attempts.delete(state)) throw new Error("That Notion sign-in expired. Start it again from OpenBot.");
    const configured = this.db.oauthConnectorCredentials<NotionCredentials>("notion");
    if (!configured) throw new Error("The Notion connection configuration is missing.");
    const result = await this.oauthRequest(configured.clientId, configured.clientSecret, { grant_type: "authorization_code", code, redirect_uri: this.redirectUri });
    const accessToken = cleanText(result.access_token, 4_000);
    if (!accessToken) throw new Error("Notion did not return a usable access token.");
    const owner = result.owner && typeof result.owner === "object" ? result.owner as Json : {}, user = owner.user && typeof owner.user === "object" ? owner.user as Json : {};
    const credentials: NotionCredentials = {
      accessToken, ...(cleanText(result.refresh_token, 4_000) ? { refreshToken: cleanText(result.refresh_token, 4_000) } : {}),
      botId: cleanText(result.bot_id, 200), workspaceId: cleanText(result.workspace_id, 200), workspaceName: cleanText(result.workspace_name, 200) || "Notion workspace",
      ownerName: cleanText(user.name, 200) || undefined,
    };
    this.db.completeOAuthConnector("notion", credentials, credentials.workspaceName, ["read_content", "insert_content"]);
    return this.db.getConnector("notion")!;
  }

  async health() {
    const me = await this.request("/v1/users/me");
    return { id: cleanText(me.id, 200), name: cleanText(me.name, 200), type: cleanText(me.type, 80) };
  }

  async search(query: string, maxResults = 12): Promise<NotionPageSummary[]> {
    const result = await this.request("/v1/search", {
      method: "POST", body: {
        query: cleanText(query, 500), filter: { property: "object", value: "page" },
        sort: { direction: "descending", timestamp: "last_edited_time" }, page_size: Math.max(1, Math.min(Math.round(maxResults), 20)),
      },
    });
    const rows = Array.isArray(result.results) ? result.results : [];
    return rows.slice(0, 20).map((row) => this.pageSummary(row)).filter((row): row is NotionPageSummary => Boolean(row));
  }

  async read(pageId: string): Promise<NotionPageDetail> {
    const id = this.pageId(pageId), page = await this.request(`/v1/pages/${encodeURIComponent(id)}`), summary = this.pageSummary(page);
    if (!summary) throw new Error("Notion could not open that shared page.");
    const lines: string[] = [], seen = new Set<string>();
    await this.readChildren(id, lines, seen, 0);
    const content = lines.join("\n").trim();
    return { ...summary, content: content.slice(0, 18_000), truncated: content.length > 18_000 || seen.size >= 120 };
  }

  async append(pageId: string, content: string, heading?: string | null) {
    const id = this.pageId(pageId), body = cleanText(content, 8_000), title = cleanText(heading, 200);
    if (!body) throw new Error("Write the Notion content to add first.");
    const children: Json[] = [];
    if (title) children.push({ object: "block", type: "heading_2", heading_2: { rich_text: [{ type: "text", text: { content: title } }] } });
    for (const paragraph of body.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean)) {
      for (let offset = 0; offset < paragraph.length; offset += 1_900) {
        children.push({ object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: paragraph.slice(offset, offset + 1_900) } }] } });
      }
    }
    if (!children.length) throw new Error("Write the Notion content to add first.");
    await this.request(`/v1/blocks/${encodeURIComponent(id)}/children`, { method: "PATCH", body: { children } });
    const page = await this.request(`/v1/pages/${encodeURIComponent(id)}`), summary = this.pageSummary(page);
    return { pageId: id, title: summary?.title || "Notion page", url: summary?.url || "", blocksAdded: children.length };
  }

  async disconnect() {
    this.attempts.clear();
    return this.db.disconnectOAuthConnector("notion");
  }

  private async readChildren(blockId: string, lines: string[], seen: Set<string>, depth: number): Promise<void> {
    if (depth > 2 || seen.size >= 120 || lines.join("\n").length >= 20_000) return;
    let cursor = "";
    do {
      const suffix = cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : "";
      const result = await this.request(`/v1/blocks/${encodeURIComponent(blockId)}/children?page_size=100${suffix}`);
      const blocks = Array.isArray(result.results) ? result.results : [];
      for (const value of blocks) {
        if (!value || typeof value !== "object" || seen.size >= 120) break;
        const block = value as Json, id = cleanText(block.id, 200);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const text = blockText(block);
        if (text) lines.push(text.slice(0, 2_000));
        if (block.has_children === true) await this.readChildren(id, lines, seen, depth + 1);
        if (lines.join("\n").length >= 20_000) break;
      }
      cursor = result.has_more === true ? cleanText(result.next_cursor, 500) : "";
    } while (cursor && seen.size < 120 && lines.join("\n").length < 20_000);
  }

  private pageSummary(value: unknown): NotionPageSummary | null {
    if (!value || typeof value !== "object") return null;
    const page = value as Json, id = cleanText(page.id, 200);
    if (!id) return null;
    return { id, title: pageTitle(page), url: cleanText(page.url, 2_000), lastEditedAt: cleanText(page.last_edited_time, 80) };
  }

  private pageId(value: string) {
    const id = cleanText(value, 200).replace(/[^a-f0-9-]/gi, "");
    if (!/^[a-f0-9-]{32,36}$/i.test(id)) throw new Error("Choose a Notion page returned by search.");
    return id;
  }

  private async request(path: string, options: { method?: "GET" | "POST" | "PATCH"; body?: Json } = {}, retry = true): Promise<Json> {
    const configured = this.db.oauthConnectorCredentials<NotionCredentials>("notion"), credentials = configured?.credentials;
    if (!configured || !credentials?.accessToken) throw new Error("Connect Notion in Apps & Tools first.");
    const response = await this.fetcher(`https://api.notion.com${path}`, {
      method: options.method || "GET", headers: { authorization: `Bearer ${credentials.accessToken}`, "notion-version": NOTION_VERSION, "content-type": "application/json" },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    });
    if (response.status === 401 && retry && credentials.refreshToken) {
      await this.refresh(configured.clientId, configured.clientSecret, credentials);
      return this.request(path, options, false);
    }
    const result = await response.json().catch(() => ({})) as Json;
    if (!response.ok) {
      const retryAfter = response.headers.get("retry-after"), suffix = retryAfter ? ` Try again in ${retryAfter} seconds.` : "";
      throw new Error(`Notion could not complete that request: ${cleanText(result.message || result.code, 400) || response.status}.${suffix}`);
    }
    this.db.markConnectorUsed("notion");
    return result;
  }

  private async refresh(clientId: string, clientSecret: string, credentials: NotionCredentials) {
    if (!credentials.refreshToken) throw new Error("Notion sign-in expired. Reconnect it in Apps & Tools.");
    const result = await this.oauthRequest(clientId, clientSecret, { grant_type: "refresh_token", refresh_token: credentials.refreshToken });
    const accessToken = cleanText(result.access_token, 4_000);
    if (!accessToken) throw new Error("Notion could not refresh its sign-in. Reconnect it in Apps & Tools.");
    credentials.accessToken = accessToken;
    credentials.refreshToken = cleanText(result.refresh_token, 4_000) || credentials.refreshToken;
    this.db.updateOAuthConnectorCredentials("notion", credentials);
  }

  private async oauthRequest(clientId: string, clientSecret: string, body: Json): Promise<Json> {
    const response = await this.fetcher("https://api.notion.com/v1/oauth/token", {
      method: "POST", headers: { authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`, "notion-version": NOTION_VERSION, "content-type": "application/json" }, body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({})) as Json;
    if (!response.ok) throw new Error(`Notion sign-in failed: ${cleanText(result.error_description || result.error || result.message, 400) || response.status}.`);
    return result;
  }

  private pruneAttempts() {
    for (const [state, createdAt] of this.attempts) if (Date.now() - createdAt > 10 * 60_000) this.attempts.delete(state);
  }
}

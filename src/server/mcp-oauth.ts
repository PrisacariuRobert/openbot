import { createHash, randomBytes, randomUUID } from "node:crypto";
import { auth, type OAuthClientProvider, type OAuthDiscoveryState } from "@modelcontextprotocol/client";
import type { OpenBotDatabase } from "./database.js";
import type { McpConnection } from "../shared/extensions.js";
import { extensionFetch, extensionURL } from "./extension-network.js";

type Tokens = NonNullable<Awaited<ReturnType<OAuthClientProvider["tokens"]>>>;
type ClientInformation = NonNullable<Awaited<ReturnType<OAuthClientProvider["clientInformation"]>>>;
type State = {
  connectionId: string; revision: string; state: string | null; expiresAt: number;
  verifier?: string; discovery?: OAuthDiscoveryState; client?: ClientInformation;
  tokens?: Tokens; tokenExpiresAt?: number;
};
type StoredConnection = McpConnection & { token: string; authRevision?: string };
const KIND = "mcp-oauth";
const stateKey = (value: string) => createHash("sha256").update(value).digest("hex");

// Every discovery/registration/token URL is DNS-checked and pinned. OAuth never
// uses a connector's bearer token for discovery or follows a redirect with it.
export function mcpOAuthFetch(resource: string, allowLoopback: boolean, signal: AbortSignal): typeof fetch {
  const origin = new URL(resource).origin;
  return (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const local = allowLoopback && url.origin === origin;
    extensionURL(url.href, local);
    const body = init.body instanceof URLSearchParams ? init.body.toString() : init.body;
    return extensionFetch(url.href, local, signal)(url, { ...init, body });
  }) as typeof fetch;
}

export class McpOAuth {
  private readonly refreshes = new Map<string, Promise<string>>();
  constructor(private readonly db: OpenBotDatabase, readonly redirectUrl: string, private readonly fetcher = mcpOAuthFetch) {}

  private connection(id: string): StoredConnection {
    const value = this.db.extensionRecord<StoredConnection>("mcp", id);
    if (!value?.enabled) throw new Error("This connector was removed or disabled.");
    return value;
  }
  private guard(value: State) {
    if (this.connection(value.connectionId).authRevision !== value.revision) throw new Error("Connector sign-in changed. Start again from its connection settings.");
  }
  private save(value: State) { this.guard(value); this.db.saveExtensionRecord(KIND, value.connectionId, value); }

  private provider(value: State, redirect: (url: URL) => void): OAuthClientProvider {
    const bound = <T extends { issuer?: string }>(stored: T | undefined, issuer?: string): T | undefined => !issuer || !stored?.issuer || stored.issuer === issuer ? stored : undefined;
    return {
      redirectUrl: this.redirectUrl,
      clientMetadata: { client_name: "OpenBot", redirect_uris: [this.redirectUrl], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none" },
      state: () => { if (!value.state) throw new Error("This sign-in attempt has expired."); return value.state; },
      clientInformation: (ctx) => bound(value.client, ctx?.issuer),
      saveClientInformation: (client, ctx) => { value.client = { ...client, ...(ctx ? { issuer: ctx.issuer } : {}) }; this.save(value); },
      tokens: (ctx) => bound(value.tokens, ctx?.issuer),
      saveTokens: (tokens, ctx) => {
        if (!tokens.access_token || !/^Bearer$/i.test(tokens.token_type)) throw new Error("This connector did not return a supported access token.");
        value.tokens = { ...tokens, ...(ctx ? { issuer: ctx.issuer } : {}) };
        value.tokenExpiresAt = typeof tokens.expires_in === "number" && Number.isFinite(tokens.expires_in) ? Date.now() + Math.max(0, tokens.expires_in) * 1000 : undefined;
        this.save(value);
      },
      redirectToAuthorization: (url) => {
        const clean = new URL(url); clean.search = "";
        extensionURL(clean.href, this.connection(value.connectionId).allowLoopback && clean.origin === new URL(this.connection(value.connectionId).url).origin);
        redirect(url);
      },
      saveCodeVerifier: (verifier) => { value.verifier = verifier; this.save(value); },
      codeVerifier: () => { if (!value.verifier) throw new Error("The sign-in verifier is no longer available."); return value.verifier; },
      saveDiscoveryState: (discovery) => { value.discovery = discovery; this.save(value); },
      discoveryState: () => value.discovery,
      invalidateCredentials: (scope) => {
        if (scope === "all" || scope === "tokens") { delete value.tokens; delete value.tokenExpiresAt; }
        if (scope === "all" || scope === "client") delete value.client;
        if (scope === "all" || scope === "verifier") delete value.verifier;
        if (scope === "all" || scope === "discovery") delete value.discovery;
        this.save(value);
      },
    };
  }

  async begin(id: string) {
    const connection = this.connection(id);
    this.pruneAttempts(id);
    // Re-authentication revokes all grants immediately, not after the owner
    // unknowingly signs into a different account with the same display name.
    connection.revision = randomUUID(); connection.authRevision = randomUUID(); connection.token = ""; connection.authMode = "oauth"; connection.tools = []; connection.grants = {}; connection.checkedAt = null;
    this.db.saveExtensionRecord("mcp", id, connection);
    const state = randomBytes(32).toString("base64url");
    const value: State = { connectionId: id, revision: connection.authRevision, state, expiresAt: Date.now() + 10 * 60_000 };
    this.save(value);
    this.db.saveExtensionRecord("mcp-oauth-attempt", stateKey(state), { id, revision: value.revision, expiresAt: value.expiresAt });
    let redirectUrl = "";
    try {
      await auth(this.provider(value, (url) => { redirectUrl = url.href; }), { serverUrl: connection.url, fetchFn: this.fetcher(connection.url, connection.allowLoopback, AbortSignal.timeout(25_000)), forceReauthorization: true });
      this.guard(value);
      if (!redirectUrl) throw new Error("No interactive sign-in was offered.");
      return { url: redirectUrl, expiresAt: new Date(value.expiresAt).toISOString(), callbackUrl: this.redirectUrl };
    } catch {
      this.db.deleteExtensionRecord("mcp-oauth-attempt", stateKey(state));
      throw new Error("This service could not start sign-in. It must support standard MCP OAuth discovery, PKCE and public-client registration. Services requiring a pre-registered client need their own integration or access token.");
    }
  }

  async complete(state: string, code: string, iss?: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(state) || !code || code.length > 4096) throw new Error("This sign-in link is invalid. Start again from OpenBot.");
    const attempt = this.db.extensionRecord<{ id: string; revision: string; expiresAt: number }>("mcp-oauth-attempt", stateKey(state));
    if (!attempt || attempt.expiresAt < Date.now() || !this.db.claimDedupe(`mcp-oauth:${stateKey(state)}`)) throw new Error("This sign-in link expired or was already used. Return to OpenBot.");
    this.db.deleteExtensionRecord("mcp-oauth-attempt", stateKey(state));
    const value = this.db.extensionRecord<State>(KIND, attempt.id);
    if (!value || value.state !== state || value.revision !== attempt.revision) throw new Error("This sign-in was replaced. Start again from OpenBot.");
    this.guard(value);
    const connection = this.connection(value.connectionId);
    try {
      const result = await auth(this.provider(value, () => { throw new Error("Unexpected sign-in redirect."); }), { serverUrl: connection.url, authorizationCode: code, ...(iss ? { iss } : {}), fetchFn: this.fetcher(connection.url, connection.allowLoopback, AbortSignal.timeout(25_000)) });
      if (result !== "AUTHORIZED" || !value.tokens) throw new Error("Sign-in did not finish.");
      this.guard(value); value.state = null; delete value.verifier; this.save(value);
      return connection.id;
    } catch {
      if (this.db.extensionRecord<StoredConnection>("mcp", attempt.id)?.authRevision === value.revision) { value.state = null; delete value.verifier; delete value.tokens; this.save(value); }
      throw new Error("Sign-in could not be verified. Return to OpenBot and try again; no tools were authorized.");
    }
  }

  async token(id: string): Promise<string> {
    const value = this.db.extensionRecord<State>(KIND, id); const connection = this.connection(id);
    if (!value?.tokens || value.state !== null) throw new Error("Sign in to this connector from Apps & Tools first.");
    this.guard(value);
    if (value.tokenExpiresAt === undefined || value.tokenExpiresAt > Date.now() + 60_000) return value.tokens.access_token;
    const refreshKey = `${id}:${value.revision}`;
    const existing = this.refreshes.get(refreshKey); if (existing) return existing;
    const refresh = (async () => {
      if (!value.tokens?.refresh_token) throw new Error("This sign-in expired. Reconnect from Apps & Tools.");
      try {
        await auth(this.provider(value, () => { throw new Error("Owner sign-in needed."); }), { serverUrl: connection.url, fetchFn: this.fetcher(connection.url, connection.allowLoopback, AbortSignal.timeout(25_000)) });
        this.guard(value); if (!value.tokens) throw new Error("No token was saved."); return value.tokens.access_token;
      } catch { throw new Error("This connector needs a fresh sign-in from Apps & Tools. No tool call was retried."); }
    })().finally(() => this.refreshes.delete(refreshKey));
    this.refreshes.set(refreshKey, refresh); return refresh;
  }
  private pruneAttempts(id: string) {
    for (const record of this.db.extensionRecords<{ id: string; expiresAt: number }>("mcp-oauth-attempt")) {
      if (record.value.id === id || record.value.expiresAt < Date.now()) this.db.deleteExtensionRecord("mcp-oauth-attempt", record.id);
    }
  }
  disconnect(id: string) {
    const connection = this.connection(id); connection.revision = randomUUID(); connection.authRevision = randomUUID(); connection.token = ""; connection.tools = []; connection.grants = {}; connection.checkedAt = null;
    this.db.saveExtensionRecord("mcp", id, connection); this.db.deleteExtensionRecord(KIND, id);
    this.pruneAttempts(id);
  }
}

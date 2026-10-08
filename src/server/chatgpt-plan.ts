import { createHash, createPublicKey, randomBytes, randomUUID, timingSafeEqual, verify as verifySignature, type JsonWebKeyInput } from "node:crypto";

type JsonWebKey = JsonWebKeyInput["key"];
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { OpenBotDatabase } from "./database.js";
import { MODEL_KEY_ENV } from "../shared/provider-config.js";

/** Sign in with ChatGPT: a ChatGPT Plus or Pro subscriber lets Sidemates use
 * their plan, through OpenAI's flow for open-source apps
 * (developers.openai.com/siwc/token-sharing-open-source). Nothing to register
 * in advance: the first sign-in registers Sidemates for that account. Tokens
 * stay encrypted in this studio; teammates reach the plan through a local
 * endpoint that shapes each request to the plan's rules. */

export const CHATGPT_PLAN_ID = "chatgpt-plan";
const APP_NAME = "Sidemates";
const SCOPES = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
const PLAN_SCOPE = "chatgpt.tokens.use.direct";
const RECORD = "chatgpt-plan";
/** Fields the plan route rejects (preview limitations, 8 Oct 2026), plus stored state and tier overrides. */
const DROPPED_FIELDS = ["background", "conversation", "max_output_tokens", "max_tool_calls", "metadata", "moderation", "multi_agent", "prompt", "prompt_cache_retention", "safety_identifier", "temperature", "top_logprobs", "top_p", "truncation", "user", "previous_response_id", "service_tier"];

export interface PlanCredentials { clientId: string; accessToken: string; refreshToken: string; idToken: string; expiresAt: number; email: string | null; scope: string }
type Stored = { ciphertext: string };
type Json = Record<string, unknown>;

export function pkcePair() {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

export function authorizeUrl(input: { authBase: string; clientId?: string | null; hostId: string; redirectUri: string; state: string; nonce: string; challenge: string; idTokenHint?: string | null }): string {
  const url = new URL("/api/accounts/authorize", input.authBase);
  const params: Record<string, string> = {
    // A first sign-in registers this app for the account; later ones reuse the issued client.
    client_id: input.clientId || "dynamic_agent_client",
    ...(input.clientId ? {} : { agent_name_hint: APP_NAME }),
    ext_agent_host_id: input.hostId,
    ...(input.idTokenHint ? { id_token_hint: input.idTokenHint } : {}),
    response_type: "code", redirect_uri: input.redirectUri, scope: SCOPES, resource: "https://api.openai.com/v1",
    state: input.state, nonce: input.nonce, code_challenge_method: "S256", code_challenge: input.challenge,
  };
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

/** Shape a Responses request to the plan's rules: storage off, streaming on,
 * system messages as developer messages, only function and custom tools, and
 * none of the fields the route rejects. */
export function planRequest(original: Json): { body: Json; streamed: boolean } {
  const body: Json = { ...original };
  for (const field of DROPPED_FIELDS) delete body[field];
  body.store = false;
  body.stream = true;
  if (typeof body.input === "string") body.input = [{ role: "user", content: body.input }];
  if (Array.isArray(body.input)) body.input = body.input.map((item) => item && typeof item === "object" && (item as Json).role === "system" ? { ...(item as Json), role: "developer" } : item);
  if (Array.isArray(body.tools)) {
    body.tools = body.tools.filter((tool) => tool && typeof tool === "object" && ["function", "custom", "namespace"].includes(String((tool as Json).type)));
    if (!(body.tools as unknown[]).length) delete body.tools;
  }
  return { body, streamed: original.stream === true };
}

/** For callers that didn't ask for a stream: read the plan's stream to its end
 * and return the finished response, or its error. */
export async function finishedResponse(stream: AsyncIterable<Uint8Array>): Promise<{ response: Json | null; error: Json | null }> {
  const decoder = new TextDecoder();
  let buffer = "", response: Json | null = null, error: Json | null = null;
  const take = (line: string) => {
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") return;
    try {
      const event = JSON.parse(data) as Json;
      if (event.type === "response.completed" || event.type === "response.incomplete") response = event.response as Json;
      if (event.type === "response.failed") error = ((event.response as Json | undefined)?.error as Json) || { message: "The response failed." };
      if (event.type === "error") error = (event.error as Json) || { message: String(event.message || "The response failed.") };
    } catch { /* A partial line waits for the next chunk. */ }
  };
  for await (const chunk of stream) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split("\n"); buffer = lines.pop() || "";
    for (const line of lines) take(line.trim());
  }
  take(buffer.trim());
  return { response, error };
}

const decodePart = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Json;

/** Check an ID token's signature against the issuer's keys and its claims. */
export function verifyIdToken(token: string, input: { keys: JsonWebKey[]; issuer: string; audience: string; nonce: string; now?: number }): Json {
  const [head, body, signature] = token.split(".");
  if (!head || !body || !signature) throw new Error("The ChatGPT sign-in returned an unreadable ID token.");
  const header = decodePart(head), claims = decodePart(body);
  const key = input.keys.find((candidate) => (candidate as Json).kid === header.kid) || (input.keys.length === 1 ? input.keys[0] : undefined);
  if (!key) throw new Error("The ChatGPT sign-in was signed with an unknown key.");
  const algorithm = header.alg === "RS256" ? "RSA-SHA256" : header.alg === "ES256" ? "SHA256" : null;
  if (!algorithm) throw new Error("The ChatGPT sign-in used an unsupported signature.");
  const valid = verifySignature(algorithm, Buffer.from(`${head}.${body}`), { key: createPublicKey({ key, format: "jwk" }), ...(header.alg === "ES256" ? { dsaEncoding: "ieee-p1363" as const } : {}) }, Buffer.from(signature, "base64url"));
  if (!valid) throw new Error("The ChatGPT sign-in signature didn't check out.");
  const now = Math.floor((input.now ?? Date.now()) / 1000);
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.iss !== input.issuer) throw new Error("The ChatGPT sign-in came from an unexpected issuer.");
  if (!audiences.includes(input.audience)) throw new Error("The ChatGPT sign-in was meant for another app.");
  if (typeof claims.exp !== "number" || claims.exp < now - 60) throw new Error("The ChatGPT sign-in had already expired.");
  if (claims.nonce !== input.nonce) throw new Error("The ChatGPT sign-in didn't match this attempt.");
  return claims;
}

/** What the plan's documented errors mean, in plain words. */
export function planErrorMessage(status: number, code: string | null): string {
  switch (code) {
    case "subscription_sharing_usage_limit_exceeded": return "Your ChatGPT plan's usage limit for Sidemates is reached (usage limit exceeded). Check it in ChatGPT settings → Usage, or let Sidemates pick another AI.";
    case "subscription_sharing_user_not_eligible": return "ChatGPT plan usage isn't available for this account or workspace. It needs ChatGPT Plus or Pro, and may not be offered in every country.";
    case "subscription_sharing_usage_unavailable": return "ChatGPT couldn't check your plan's usage right now. Try again in a little while.";
    case "subscription_sharing_unsupported_capability": return "This request used something ChatGPT plan usage doesn't support.";
    case "subscription_sharing_invalid_user": return "Your ChatGPT sign-in needs to be renewed. Sign in with ChatGPT again.";
    case "subscription_sharing_user_unavailable": return "Your ChatGPT account information is temporarily unavailable. Try again shortly.";
    default:
      if (status === 401) return "ChatGPT couldn't verify your sign-in. Sign in with ChatGPT again.";
      if (status === 403) return "ChatGPT plan usage isn't available here because of an access restriction, possibly your country.";
      if (status === 503) return "ChatGPT plan service is temporarily unavailable. Try again shortly.";
      return `ChatGPT returned an error (${status}).`;
  }
}

type Attempt = { state: string; nonce: string; verifier: string; redirectUri: string; clientId: string | null; server: Server; status: "waiting" | "connected" | "failed"; error: string | null; timer: NodeJS.Timeout };

export class ChatGptPlan {
  private attempt: Attempt | null = null;
  private lastResult: { status: "connected" | "failed"; error: string | null } | null = null;
  private refreshing: Promise<PlanCredentials> | null = null;
  private readonly fetch: typeof fetch;
  private readonly authBase: string;
  private readonly apiBase: string;

  constructor(private readonly options: { db: OpenBotDatabase; internalUrl: string; onChange?: () => void; fetch?: typeof fetch; authBase?: string; apiBase?: string }) {
    this.fetch = options.fetch || fetch;
    this.authBase = (options.authBase || process.env.OPENBOT_CHATGPT_AUTH_URL || "https://auth.openai.com").replace(/\/+$/, "");
    this.apiBase = (options.apiBase || process.env.OPENBOT_CHATGPT_API_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  }

  credentials(): PlanCredentials | null {
    const stored = this.options.db.extensionRecord<Stored>(RECORD, "account");
    if (!stored?.ciphertext) return null;
    try { return JSON.parse(this.options.db.vault.decrypt(stored.ciphertext)) as PlanCredentials; } catch { return null; }
  }

  private save(credentials: PlanCredentials | null) {
    this.options.db.saveExtensionRecord(RECORD, "account", credentials ? { ciphertext: this.options.db.vault.encrypt(JSON.stringify(credentials)) } : {});
    // The issued client and account stay mapped to this host for the next sign-in.
    if (credentials) this.options.db.saveExtensionRecord(RECORD, "client", { clientId: credentials.clientId, email: credentials.email });
  }

  /** An opaque identifier for this studio, chosen once (never an email or user ID). */
  hostId(): string {
    const saved = this.options.db.extensionRecord<{ hostId: string }>(RECORD, "host");
    if (saved?.hostId) return saved.hostId;
    const hostId = `urn:uuid:${randomUUID()}`;
    this.options.db.saveExtensionRecord(RECORD, "host", { hostId });
    return hostId;
  }

  status() {
    const credentials = this.credentials();
    return {
      signedIn: Boolean(credentials),
      email: credentials?.email ?? null,
      planUsage: Boolean(credentials?.scope.split(/\s+/).includes(PLAN_SCOPE)),
      attempt: this.attempt ? { status: this.attempt.status, error: this.attempt.error } : this.lastResult,
    };
  }

  private async discovery() {
    const response = await this.fetch(`${this.authBase}/.well-known/openid-configuration`);
    if (!response.ok) throw new Error("ChatGPT sign-in is unavailable right now. Try again shortly.");
    return await response.json() as { issuer: string; jwks_uri: string; revocation_endpoint?: string };
  }

  /** Start a sign-in: a one-time listener on this Mac receives OpenAI's answer. */
  async start(): Promise<{ url: string }> {
    this.closeAttempt();
    this.lastResult = null;
    const { verifier, challenge } = pkcePair();
    const state = randomBytes(24).toString("base64url"), nonce = randomBytes(24).toString("base64url");
    const saved = this.options.db.extensionRecord<{ clientId?: string }>(RECORD, "client");
    const server = createServer((request, response) => void this.callback(request, response));
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const port = (server.address() as { port: number }).port;
    const redirectUri = `http://127.0.0.1:${port}/auth/callback`;
    const timer = setTimeout(() => this.finish("failed", "The sign-in took too long. Try again."), 10 * 60_000);
    timer.unref();
    this.attempt = { state, nonce, verifier, redirectUri, clientId: saved?.clientId || null, server, status: "waiting", error: null, timer };
    return { url: authorizeUrl({ authBase: this.authBase, clientId: saved?.clientId, hostId: this.hostId(), redirectUri, state, nonce, challenge, idTokenHint: this.credentials()?.idToken }) };
  }

  private closeAttempt() {
    if (!this.attempt) return;
    clearTimeout(this.attempt.timer);
    this.attempt.server.close();
    this.attempt = null;
  }

  private finish(status: "connected" | "failed", error: string | null) {
    this.lastResult = { status, error };
    this.closeAttempt();
    this.options.onChange?.();
  }

  private page(response: ServerResponse, ok: boolean, text: string) {
    response.writeHead(ok ? 200 : 400, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    response.end(`<!doctype html><meta charset="utf-8"><title>Sidemates</title><body style="font:16px -apple-system,system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;color:#1b1b1f"><div style="max-width:28rem;text-align:center"><h1 style="font-size:22px">${ok ? "You're signed in." : "That didn't work."}</h1><p>${text.replace(/[<>&]/g, "")}</p></div></body>`);
  }

  private async callback(request: IncomingMessage, response: ServerResponse) {
    const attempt = this.attempt;
    const url = new URL(request.url || "/", "http://127.0.0.1");
    if (!attempt || url.pathname !== "/auth/callback") { response.writeHead(404); response.end(); return; }
    if (url.searchParams.get("state") !== attempt.state) { this.page(response, false, "This sign-in link doesn't match. Start again from Sidemates."); return; }
    if (url.searchParams.get("error")) {
      const declined = url.searchParams.get("error") === "access_denied";
      this.page(response, false, declined ? "You declined, so nothing was connected. You can close this tab." : "ChatGPT didn't finish the sign-in. Try again from Sidemates.");
      this.finish("failed", declined ? "You declined the ChatGPT sign-in, so nothing was connected." : "ChatGPT didn't finish the sign-in. Try again.");
      return;
    }
    try {
      const issued = url.searchParams.get("client_id");
      if (attempt.clientId && issued && issued !== attempt.clientId) throw new Error("ChatGPT answered for a different app registration.");
      const clientId = attempt.clientId || issued;
      if (!clientId || clientId === "dynamic_agent_client") throw new Error("ChatGPT didn't finish registering Sidemates. Try again.");
      const credentials = await this.exchange({ clientId, code: url.searchParams.get("code") || "", verifier: attempt.verifier, redirectUri: attempt.redirectUri, nonce: attempt.nonce });
      const models = await this.models(credentials.accessToken);
      this.save(credentials);
      this.connect(models);
      this.page(response, true, credentials.scope.split(/\s+/).includes(PLAN_SCOPE) ? "Your team can now use your ChatGPT plan. You can close this tab and go back to Sidemates." : "You're signed in, but ChatGPT plan usage wasn't enabled. Go back to Sidemates to enable it or use another AI.");
      this.finish("connected", null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The ChatGPT sign-in didn't finish.";
      this.page(response, false, message);
      this.finish("failed", message);
    }
  }

  private async exchange(input: { clientId: string; code: string; verifier: string; redirectUri: string; nonce: string }): Promise<PlanCredentials> {
    const tokens = await this.tokenRequest({ grant_type: "authorization_code", client_id: input.clientId, code: input.code, code_verifier: input.verifier, redirect_uri: input.redirectUri, resource: "https://api.openai.com/v1" });
    const config = await this.discovery();
    const keys = ((await (await this.fetch(config.jwks_uri)).json()) as { keys: JsonWebKey[] }).keys;
    const claims = verifyIdToken(String(tokens.id_token || ""), { keys, issuer: config.issuer, audience: input.clientId, nonce: input.nonce });
    return {
      clientId: input.clientId, accessToken: String(tokens.access_token), refreshToken: String(tokens.refresh_token || ""), idToken: String(tokens.id_token),
      expiresAt: Date.now() + Number(tokens.expires_in || 3600) * 1000, email: typeof claims.email === "string" ? claims.email : null, scope: String(tokens.scope || ""),
    };
  }

  private async tokenRequest(form: Record<string, string>): Promise<Json> {
    const response = await this.fetch(`${this.authBase}/api/accounts/oauth/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(form) });
    const body = await response.json().catch(() => ({})) as Json;
    if (!response.ok) {
      const code = String(body.error || "");
      const error = new Error(/invalid_grant|refresh_token|token_expired|invalid_refresh/.test(code) ? "Your ChatGPT session has expired. Sign in with ChatGPT again." : `ChatGPT didn't accept the sign-in (${code || response.status}).`);
      (error as Error & { code?: string }).code = code;
      throw error;
    }
    return body;
  }

  /** The models this account may use, in the order ChatGPT lists them. */
  async models(accessToken: string): Promise<string[]> {
    const response = await this.fetch(`${this.apiBase}/models`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) throw new Error(planErrorMessage(response.status, null));
    const body = await response.json() as { models?: Array<{ slug?: string; visibility?: string }>; data?: Array<{ id?: string }> };
    const listed = (body.models || []).filter((model) => model.visibility === "list" && model.slug).map((model) => model.slug!);
    const ids = listed.length ? listed : (body.data || []).map((model) => model.id || "").filter(Boolean);
    const valid = ids.filter((id) => /^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/.test(id)).slice(0, 50);
    if (!valid.length) throw new Error("Your ChatGPT account doesn't list any models Sidemates can use.");
    return valid;
  }

  /** Teammates reach the plan as an ordinary connection whose address is this studio. */
  private connect(models: string[]) {
    const existing = this.options.db.getProvider(CHATGPT_PLAN_ID);
    const key = existing?.hasSecret ? undefined : randomBytes(32).toString("base64url");
    this.options.db.upsertProvider({
      id: CHATGPT_PLAN_ID, name: "ChatGPT", provider: "openai", authMode: "api_key", runtime: "opencode",
      apiConfig: { baseUrl: `${this.options.internalUrl}/api/chatgpt/v1`, protocol: "openai", modelIds: models },
      ...(key ? { secret: key } : {}),
    });
  }

  /** A fresh access token, renewed shortly before it expires; one renewal at a time. */
  async accessToken(): Promise<string> {
    const credentials = this.credentials();
    if (!credentials) throw new Error("Sign in with ChatGPT first.");
    if (credentials.expiresAt - Date.now() > 120_000) return credentials.accessToken;
    this.refreshing ??= (async () => {
      try {
        const tokens = await this.tokenRequest({ grant_type: "refresh_token", client_id: credentials.clientId, refresh_token: credentials.refreshToken, resource: "https://api.openai.com/v1" });
        const next = { ...credentials, accessToken: String(tokens.access_token), refreshToken: String(tokens.refresh_token || credentials.refreshToken), expiresAt: Date.now() + Number(tokens.expires_in || 3600) * 1000, ...(tokens.id_token ? { idToken: String(tokens.id_token) } : {}) };
        this.save(next);
        return next;
      } catch (error) {
        if (/expired|invalid/.test(String((error as Error & { code?: string }).code || ""))) { this.save(null); this.options.onChange?.(); }
        throw error;
      } finally { this.refreshing = null; }
    })();
    return (await this.refreshing).accessToken;
  }

  /** Sign out: revoke at OpenAI, then forget the tokens (the app registration stays). */
  async signOut(): Promise<{ revoked: boolean }> {
    const credentials = this.credentials();
    let revoked = false;
    if (credentials?.refreshToken) {
      try {
        const config = await this.discovery();
        if (config.revocation_endpoint) revoked = (await this.fetch(config.revocation_endpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: credentials.refreshToken, token_type_hint: "refresh_token", client_id: credentials.clientId }) })).ok;
      } catch { revoked = false; }
    }
    this.save(null);
    this.options.onChange?.();
    return { revoked };
  }

  /** Only teammate runs carrying this connection's own key may use the plan. */
  allowed(authorization: string | undefined): boolean {
    const given = Buffer.from(authorization?.replace(/^Bearer\s+/i, "") || "");
    const key = Buffer.from(this.options.db.providerEnvironmentById(CHATGPT_PLAN_ID)[MODEL_KEY_ENV] || "");
    return key.length > 0 && given.length === key.length && timingSafeEqual(given, key);
  }

  /** Forward one Responses request to the plan, shaped to its rules. */
  async respond(original: Json, signal: AbortSignal): Promise<{ status: number; stream?: AsyncIterable<Uint8Array>; json?: Json }> {
    const token = await this.accessToken();
    const { body, streamed } = planRequest(original);
    const upstream = await this.fetch(`${this.apiBase}/responses`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "text/event-stream" }, body: JSON.stringify(body), signal });
    if (!upstream.ok || !upstream.body) {
      const payload = await upstream.json().catch(() => ({})) as Json;
      const code = typeof (payload.error as Json | undefined)?.code === "string" ? String((payload.error as Json).code) : null;
      return { status: upstream.status || 502, json: { error: { message: planErrorMessage(upstream.status, code), code, type: "chatgpt_plan" } } };
    }
    if (streamed) return { status: 200, stream: upstream.body as unknown as AsyncIterable<Uint8Array> };
    const finished = await finishedResponse(upstream.body as unknown as AsyncIterable<Uint8Array>);
    if (finished.error || !finished.response) {
      const code = typeof finished.error?.code === "string" ? String(finished.error.code) : null;
      return { status: code === "subscription_sharing_usage_limit_exceeded" ? 429 : 502, json: { error: { message: planErrorMessage(code === "subscription_sharing_usage_limit_exceeded" ? 429 : 502, code), code, type: "chatgpt_plan" } } };
    }
    return { status: 200, json: finished.response };
  }
}

/** Without signing in, the plan connection is not usable, even if it exists. */
export function chatgptPlanSignedIn(db: OpenBotDatabase): boolean {
  return Boolean(db.extensionRecord<Stored>(RECORD, "account")?.ciphertext);
}

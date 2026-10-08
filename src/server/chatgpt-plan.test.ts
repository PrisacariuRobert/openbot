import assert from "node:assert/strict";
import { createSign, generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type IncomingMessage } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { OpenBotDatabase } from "./testing/database.js";
import { ChatGptPlan, finishedResponse, planErrorMessage, planRequest, verifyIdToken } from "./chatgpt-plan.js";
import { MODEL_KEY_ENV } from "../shared/provider-config.js";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "test-key", alg: "RS256", use: "sig" };
const sign = (claims: Record<string, unknown>) => {
  const head = Buffer.from(JSON.stringify({ alg: "RS256", kid: "test-key", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createSign("RSA-SHA256").update(`${head}.${body}`).sign(privateKey).toString("base64url");
  return `${head}.${body}.${signature}`;
};
const stream = (lines: string[]) => (async function* () { for (const line of lines) yield new TextEncoder().encode(line); })();

test("requests are shaped to the plan's rules", () => {
  const { body, streamed } = planRequest({
    model: "gpt-6.1-sol", input: [{ role: "system", content: "Be brief." }, { role: "user", content: "Hi" }], stream: false, store: true,
    temperature: 0.2, max_output_tokens: 900, previous_response_id: "resp_1", metadata: { a: 1 }, service_tier: "priority", user: "x",
    tools: [{ type: "function", name: "workspace_read" }, { type: "web_search_preview" }, { type: "code_interpreter" }],
  });
  assert.equal(streamed, false);
  assert.equal(body.store, false);
  assert.equal(body.stream, true);
  for (const field of ["temperature", "max_output_tokens", "previous_response_id", "metadata", "service_tier", "user"]) assert.equal(field in body, false, field);
  assert.deepEqual((body.input as Array<{ role: string }>).map((item) => item.role), ["developer", "user"], "no system messages");
  assert.deepEqual(body.tools, [{ type: "function", name: "workspace_read" }], "only our own tools");
  assert.deepEqual(planRequest({ input: "Hi", stream: true }).body.input, [{ role: "user", content: "Hi" }]);
});

test("a stream is read to its finished response or its error", async () => {
  const done = await finishedResponse(stream(['data: {"type":"response.created"}\n', 'data: {"type":"response.completed","response":{"id":"r1","output":[]}}\n\n']));
  assert.deepEqual(done.response, { id: "r1", output: [] });
  const failed = await finishedResponse(stream(['data: {"type":"response.failed","response":{"error":{"code":"subscription_sharing_usage_limit_exceeded"}}}\n']));
  assert.equal(failed.error?.code, "subscription_sharing_usage_limit_exceeded");
});

test("ID tokens are checked: signature, issuer, app, expiry and this attempt", () => {
  const now = Date.now();
  const claims = { iss: "https://auth.test", aud: "oaiapp_1", exp: Math.floor(now / 1000) + 600, nonce: "n1", email: "robert@example.com" };
  assert.equal(verifyIdToken(sign(claims), { keys: [jwk], issuer: "https://auth.test", audience: "oaiapp_1", nonce: "n1", now }).email, "robert@example.com");
  assert.throws(() => verifyIdToken(sign({ ...claims, nonce: "other" }), { keys: [jwk], issuer: "https://auth.test", audience: "oaiapp_1", nonce: "n1", now }), /didn't match/);
  assert.throws(() => verifyIdToken(sign({ ...claims, aud: "oaiapp_2" }), { keys: [jwk], issuer: "https://auth.test", audience: "oaiapp_1", nonce: "n1", now }), /another app/);
  assert.throws(() => verifyIdToken(sign({ ...claims, iss: "https://evil.test" }), { keys: [jwk], issuer: "https://auth.test", audience: "oaiapp_1", nonce: "n1", now }), /unexpected issuer/);
  assert.throws(() => verifyIdToken(sign({ ...claims, exp: Math.floor(now / 1000) - 600 }), { keys: [jwk], issuer: "https://auth.test", audience: "oaiapp_1", nonce: "n1", now }), /expired/);
  const forged = sign(claims).split(".");
  forged[1] = Buffer.from(JSON.stringify({ ...claims, email: "attacker@example.com" })).toString("base64url");
  assert.throws(() => verifyIdToken(forged.join("."), { keys: [jwk], issuer: "https://auth.test", audience: "oaiapp_1", nonce: "n1", now }), /signature/);
});

test("the plan's errors become plain words", () => {
  assert.match(planErrorMessage(429, "subscription_sharing_usage_limit_exceeded"), /usage limit/);
  assert.match(planErrorMessage(403, "subscription_sharing_user_not_eligible"), /Plus or Pro/);
  assert.match(planErrorMessage(403, null), /country/);
});

async function readBody(request: IncomingMessage) {
  let text = "";
  for await (const chunk of request) text += chunk;
  return text;
}

test("signing in registers Sidemates, connects the plan, renews tokens and signs out", { timeout: 30_000 }, async () => {
  const root = mkdtempSync(path.join(tmpdir(), "sidemates-chatgpt-plan-"));
  const db = new OpenBotDatabase(root);
  let nonce = "", limited = false;
  const tokenRequests: URLSearchParams[] = [];
  const seen: { revoked: URLSearchParams | null; body: Record<string, unknown> | null } = { revoked: null, body: null };
  const mock = createServer(async (request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    const json = (body: unknown, status = 200) => { response.writeHead(status, { "Content-Type": "application/json" }); response.end(JSON.stringify(body)); };
    if (url.pathname === "/.well-known/openid-configuration") return json({ issuer: base, jwks_uri: `${base}/jwks`, revocation_endpoint: `${base}/revoke` });
    if (url.pathname === "/jwks") return json({ keys: [jwk] });
    if (url.pathname === "/api/accounts/oauth/token") {
      const form = new URLSearchParams(await readBody(request));
      tokenRequests.push(form);
      if (form.get("grant_type") === "refresh_token") return json({ access_token: "access-2", refresh_token: "refresh-2", expires_in: 3600 });
      return json({ access_token: "access-1", refresh_token: "refresh-1", expires_in: 3600, scope: "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct", id_token: sign({ iss: base, aud: "oaiapp_test", exp: Math.floor(Date.now() / 1000) + 600, nonce, email: "robert@example.com" }) });
    }
    if (url.pathname === "/revoke") { seen.revoked = new URLSearchParams(await readBody(request)); response.writeHead(200); return response.end(); }
    if (url.pathname === "/v1/models") return json({ models: [{ slug: "gpt-6.1-sol", visibility: "list" }, { slug: "internal-only", visibility: "hide" }, { slug: "gpt-5.6-mini", visibility: "list" }] });
    if (url.pathname === "/v1/responses") {
      seen.body = JSON.parse(await readBody(request)) as Record<string, unknown>;
      if (limited) return json({ error: { code: "subscription_sharing_usage_limit_exceeded", message: "limit" } }, 429);
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.write('data: {"type":"response.created"}\n\n');
      return response.end('data: {"type":"response.completed","response":{"id":"r1","output_text":"Hello"}}\n\n');
    }
    response.writeHead(404); response.end();
  });
  await new Promise<void>((resolve) => mock.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(mock.address() as { port: number }).port}`;
  const plan = new ChatGptPlan({ db, internalUrl: "http://127.0.0.1:4311", authBase: base, apiBase: `${base}/v1` });
  try {
    // First sign-in: Sidemates registers itself; nothing was set up in advance.
    const first = new URL((await plan.start()).url);
    assert.equal(first.pathname, "/api/accounts/authorize");
    assert.equal(first.searchParams.get("client_id"), "dynamic_agent_client");
    assert.equal(first.searchParams.get("agent_name_hint"), "Sidemates");
    assert.match(first.searchParams.get("ext_agent_host_id") || "", /^urn:uuid:/);
    assert.match(first.searchParams.get("redirect_uri") || "", /^http:\/\/127\.0\.0\.1:\d+\/auth\/callback$/);
    assert.equal(first.searchParams.get("code_challenge_method"), "S256");
    assert.match(first.searchParams.get("scope") || "", /chatgpt\.tokens\.use\.direct/);
    nonce = first.searchParams.get("nonce")!;
    const redirect = first.searchParams.get("redirect_uri")!;
    // A wrong state is refused and changes nothing.
    assert.equal((await fetch(`${redirect}?code=c&state=wrong`)).status, 400);
    assert.equal(plan.status().signedIn, false);
    const page = await fetch(`${redirect}?code=c1&state=${first.searchParams.get("state")}&client_id=oaiapp_test`);
    assert.equal(page.status, 200, await page.clone().text());
    const exchange = tokenRequests[0]!;
    assert.equal(exchange.get("grant_type"), "authorization_code");
    assert.equal(exchange.get("client_id"), "oaiapp_test");
    assert.equal(exchange.get("redirect_uri"), redirect);
    assert.ok(exchange.get("code_verifier"));
    assert.equal(exchange.has("client_secret"), false, "no secret: an open-source app");
    assert.deepEqual(plan.status(), { signedIn: true, email: "robert@example.com", planUsage: true, attempt: { status: "connected", error: null } });
    const connection = db.getProvider("chatgpt-plan")!;
    assert.equal(connection.apiConfig?.baseUrl, "http://127.0.0.1:4311/api/chatgpt/v1");
    assert.deepEqual(connection.apiConfig?.modelIds, ["gpt-6.1-sol", "gpt-5.6-mini"], "only listed models, in ChatGPT's order");
    const key = db.providerEnvironmentById("chatgpt-plan")[MODEL_KEY_ENV]!;
    assert.ok(plan.allowed(`Bearer ${key}`));
    assert.equal(plan.allowed("Bearer wrong"), false);
    assert.equal(plan.allowed(undefined), false);

    // Requests are shaped and streamed; a non-streaming caller gets the finished response.
    const streamed = await plan.respond({ model: "gpt-6.1-sol", input: [{ role: "system", content: "x" }], stream: true, temperature: 1 }, new AbortController().signal);
    assert.ok(streamed.stream);
    for await (const _chunk of streamed.stream!) { /* drained */ }
    assert.equal(seen.body?.store, false);
    assert.equal("temperature" in (seen.body || {}), false);
    const whole = await plan.respond({ model: "gpt-6.1-sol", input: "Hi" }, new AbortController().signal);
    assert.deepEqual(whole.json, { id: "r1", output_text: "Hello" });
    limited = true;
    const limit = await plan.respond({ model: "gpt-6.1-sol", input: "Hi", stream: true }, new AbortController().signal);
    assert.equal(limit.status, 429);
    assert.match(JSON.stringify(limit.json), /usage limit/, "an AI out of allowance reads as a limit, so Automatic switches");
    limited = false;

    // A token about to expire is renewed once, with the issued client.
    const creds = plan.credentials()!;
    db.saveExtensionRecord("chatgpt-plan", "account", { ciphertext: db.vault.encrypt(JSON.stringify({ ...creds, expiresAt: Date.now() + 1_000 })) });
    const [a, b] = await Promise.all([plan.accessToken(), plan.accessToken()]);
    assert.equal(a, "access-2"); assert.equal(b, "access-2");
    assert.equal(tokenRequests.filter((form) => form.get("grant_type") === "refresh_token").length, 1, "one renewal at a time");
    assert.equal(tokenRequests.at(-1)!.get("client_id"), "oaiapp_test");

    // Signing out revokes at OpenAI and forgets the tokens, but keeps the registration.
    assert.deepEqual(await plan.signOut(), { revoked: true });
    assert.equal(seen.revoked!.get("token"), "refresh-2");
    assert.equal(plan.status().signedIn, false);
    const again = new URL((await plan.start()).url);
    assert.equal(again.searchParams.get("client_id"), "oaiapp_test", "the next sign-in reuses the registration");
    assert.equal(again.searchParams.has("agent_name_hint"), false);
    assert.equal(again.searchParams.get("ext_agent_host_id"), first.searchParams.get("ext_agent_host_id"), "same host ID");
    // Declining is reported plainly and connects nothing.
    await fetch(`${again.searchParams.get("redirect_uri")}?error=access_denied&state=${again.searchParams.get("state")}`);
    assert.match(plan.status().attempt?.error || "", /declined/);
    assert.equal(plan.status().signedIn, false);
  } finally {
    await new Promise<void>((resolve) => mock.close(() => resolve()));
    db.close(); rmSync(root, { recursive: true, force: true });
  }
});

// Real OpenCode process against a disposable deterministic endpoint, plus dead-end
// and hang fixtures. No production accounts, conversations, or external writes.
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { apiRuntimeEnvironment } from "../shared/provider-config.js";
import { PROBE_TOKEN, probeAllowed, PROBE_COOLDOWN_MS, probeProviderModel } from "./provider-test.js";
import type { ProviderInstance } from "../shared/types.js";

function fixtureServer(reply: string) {
  const server = createServer(async (request, response) => {
    if (request.url !== "/v1/chat/completions" || request.method !== "POST") { response.writeHead(404).end(); return; }
    let input = "";
    for await (const chunk of request) input += String(chunk);
    const body = JSON.parse(input);
    const completion = { id: "probe", object: "chat.completion", created: 1, model: body.model, choices: [{ index: 0, message: { role: "assistant", content: reply }, finish_reason: "stop" }], usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 } };
    if (!body.stream) { response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(completion)); return; }
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.write(`data: ${JSON.stringify({ ...completion, object: "chat.completion.chunk", usage: undefined, choices: [{ index: 0, delta: { role: "assistant", content: reply }, finish_reason: null }] })}\n\n`);
    response.write(`data: ${JSON.stringify({ ...completion, object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`);
    response.end("data: [DONE]\n\n");
  });
  return server;
}

test("connection probe passes against a configured endpoint and reports the model", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-probe-test-"));
  const server = fixtureServer(PROBE_TOKEN);
  try {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;
    const connection: ProviderInstance = { id: "probe-test", ownerId: "fixture", provider: "custom", name: "Probe endpoint", authMode: "api_key", runtime: "opencode", envName: null, hasSecret: true, createdAt: "", updatedAt: "", apiConfig: { baseUrl: `http://127.0.0.1:${port}/v1`, protocol: "openai-compatible", modelIds: ["probe-model"] } };
    const home = path.join(root, "home");
    const result = await probeProviderModel("openbot-probe-test/probe-model", { ...apiRuntimeEnvironment(connection, "fixture-only-key"), HOME: home, XDG_CONFIG_HOME: path.join(home, "config"), XDG_DATA_HOME: path.join(home, "data"), XDG_CACHE_HOME: path.join(home, "cache") });
    assert.equal(result.ok, true, result.error || "probe failed without an error message");
    assert.equal(result.model, "openbot-probe-test/probe-model");
    assert.equal(result.error, null);
    assert.ok(result.latencyMs >= 0 && result.latencyMs < 60_000);
    // A fresh receipt must fall inside its own cooldown, even for slow probes:
    // testedAt marks completion, not start.
    assert.equal(probeAllowed(result.testedAt), false, "A just-completed test must be inside its cooldown");
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(root, { recursive: true, force: true });
  }
});

test("connection probe fails closed against a dead endpoint without leaking it", async () => {
  const result = await probeProviderModel("openbot-probe-test/probe-model", { OPENCODE_CONFIG_CONTENT: JSON.stringify({ enabled_providers: ["openbot-probe-test"], provider: { "openbot-probe-test": { npm: "@ai-sdk/openai-compatible", options: { baseURL: "http://127.0.0.1:1/v1", apiKey: "fixture" }, models: { "probe-model": { tool_call: true } } } } }) }, spawn, 30_000);
  assert.equal(result.ok, false);
  assert.ok(result.error, "A failed probe must explain itself");
  assert.ok(!result.error!.includes("127.0.0.1"), "Probe errors must not echo endpoint addresses");
});

test("connection probe times out instead of hanging forever", async () => {
  const hang = (_command: string, _args: string[], options: { cwd?: string | URL; env?: NodeJS.ProcessEnv }) => spawn("sleep", ["60"], { cwd: options.cwd, env: options.env, stdio: ["ignore", "pipe", "pipe"] });
  const result = await probeProviderModel("any/model", {}, hang, 500);
  assert.equal(result.ok, false);
  assert.match(result.error || "", /timed out/i);
});

test("probe cooldown allows first tests and spaces repeats", () => {
  assert.equal(probeAllowed(null), true);
  const now = Date.now();
  assert.equal(probeAllowed(new Date(now - PROBE_COOLDOWN_MS - 1).toISOString(), now), true);
  assert.equal(probeAllowed(new Date(now - 1_000).toISOString(), now), false);
});

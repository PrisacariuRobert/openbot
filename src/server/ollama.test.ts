import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { detectOllama, ollamaUrl } from "./ollama.js";

/** A stand-in Ollama with the given models and capabilities. */
async function fakeOllama(handler: (path: string, body: string) => { status?: number; json?: unknown; hang?: boolean }): Promise<{ url: string; server: Server }> {
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      const reply = handler(request.url ?? "", body);
      if (reply.hang) return;
      response.writeHead(reply.status ?? 200, { "content-type": "application/json" }).end(JSON.stringify(reply.json ?? {}));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server };
}

const capabilities: Record<string, string[]> = {
  "qwen3:8b": ["completion", "tools"],
  "llama3.2:3b": ["completion", "tools"],
  "gemma3:4b": ["completion", "vision"],
  "nomic-embed-text:latest": ["embedding"],
};

test("lists only installed models that can use tools", async () => {
  const { url, server } = await fakeOllama((path, body) => path === "/api/tags"
    ? { json: { models: Object.keys(capabilities).map((name) => ({ name })) } }
    : { json: { capabilities: capabilities[JSON.parse(body).model as string] } });
  try {
    assert.deepEqual(await detectOllama({ url }), { running: true, models: ["qwen3:8b", "llama3.2:3b"], apiBaseUrl: `${url}/v1` });
  } finally { server.close(); }
});

test("running with no usable models, not running, too slow, or not Ollama at all", async () => {
  const empty = await fakeOllama(() => ({ json: { models: [] } }));
  const other = await fakeOllama(() => ({ json: { hello: "world" } }));
  const slow = await fakeOllama(() => ({ hang: true }));
  try {
    assert.deepEqual((await detectOllama({ url: empty.url })).models, []);
    assert.equal((await detectOllama({ url: empty.url })).running, true);
    assert.equal((await detectOllama({ url: other.url })).running, false, "something else on the port");
    const started = Date.now();
    assert.equal((await detectOllama({ url: slow.url, timeoutMs: 200 })).running, false);
    assert.ok(Date.now() - started < 2_000, "gives up quickly");
    assert.equal((await detectOllama({ url: "http://127.0.0.1:9" })).running, false, "nothing listening");
  } finally { empty.server.close(); other.server.close(); slow.server.closeAllConnections(); slow.server.close(); }
});

test("the address override must stay on this machine", async () => {
  assert.equal(ollamaUrl({}), "http://127.0.0.1:11434");
  assert.equal(ollamaUrl({ OPENBOT_OLLAMA_URL: "http://127.0.0.1:5555/" }), "http://127.0.0.1:5555");
  assert.equal(ollamaUrl({ OPENBOT_OLLAMA_URL: "http://ollama.example.com:11434" }), null);
  let requests = 0;
  const status = await detectOllama({ url: null, fetchImpl: (async () => { requests++; throw new Error("no"); }) as typeof fetch });
  assert.equal(status.running, false);
  assert.equal(requests, 0, "a remote override is never contacted");
});

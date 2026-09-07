import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenBotDatabase } from "./testing/database.js";
import { blendKeywordSemantic, cosineSimilarity, embedTexts, resolveEmbeddingsEndpoint, searchMemoriesWithMeaning, type EmbeddingsEndpoint } from "./embeddings.js";

function fixtureDatabase() {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-embeddings-test-"));
  return { root, db: new OpenBotDatabase(root) };
}

test("cosine similarity favors aligned vectors and stays bounded", () => {
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.equal(cosineSimilarity([1, 0], [-1, 0]), -1);
  assert.ok(cosineSimilarity([0.2, 0.9], [0.1, 1]) > cosineSimilarity([0.2, 0.9], [1, 0]));
});

test("blend keeps both methods visible and breaks ties deterministically", () => {
  const blended = blendKeywordSemantic(
    [{ key: "b-note", score: 2 }, { key: "a-note", score: 2 }],
    new Map([["b-note", 0.5], ["a-note", 0.5]]),
  );
  assert.deepEqual(blended.map((entry) => entry.key), ["a-note", "b-note"]);
  const keywordOnly = blendKeywordSemantic([{ key: "solo", score: 3 }], new Map());
  assert.equal(keywordOnly.length, 1);
  const semanticOnly = blendKeywordSemantic([], new Map([["found", 0.9]]));
  assert.equal(semanticOnly[0]!.key, "found");
  const both = blendKeywordSemantic([{ key: "x", score: 1 }], new Map([["x", 1], ["y", 1]]));
  assert.equal(both[0]!.key, "x");
});

test("embeddings connection resolution accepts only key-based or local endpoints", () => {
  const { root, db } = fixtureDatabase();
  try {
    assert.equal(resolveEmbeddingsEndpoint(db).ok, false);
    const local = db.upsertProvider({ name: "Fixture local", provider: "custom", authMode: "api_key", runtime: "opencode", apiConfig: { baseUrl: "http://127.0.0.1:11434/v1", protocol: "openai-compatible", modelIds: ["fixture-embed"] } });
    db.updateStudioSettings({ embeddingsProviderInstanceId: local.id, embeddingsModel: "fixture-embed" });
    const resolved = resolveEmbeddingsEndpoint(db);
    assert.equal(resolved.ok, true);
    if (resolved.ok) assert.equal(resolved.endpoint.baseUrl, "http://127.0.0.1:11434/v1");
    const hosted = db.upsertProvider({ name: "Fixture hosted", provider: "custom", authMode: "api_key", runtime: "opencode", secret: "fixture-secret", apiConfig: { baseUrl: "https://embeddings.example.test/v1", protocol: "openai-compatible", modelIds: ["fixture-embed"] } });
    db.updateStudioSettings({ embeddingsProviderInstanceId: hosted.id, embeddingsModel: "fixture-embed" });
    const hostedResolved = resolveEmbeddingsEndpoint(db);
    assert.equal(hostedResolved.ok, true);
    if (hostedResolved.ok) assert.equal(hostedResolved.endpoint.apiKey, "fixture-secret");
    const anthropic = db.upsertProvider({ name: "Fixture key", provider: "openai", authMode: "api_key", envName: "ANTHROPIC_API_KEY", secret: "fixture-secret" });
    db.updateStudioSettings({ embeddingsProviderInstanceId: anthropic.id, embeddingsModel: "fixture-embed" });
    assert.equal(resolveEmbeddingsEndpoint(db).ok, false);
    db.updateStudioSettings({ embeddingsProviderInstanceId: "local-opencode", embeddingsModel: "fixture-embed" });
    assert.equal(resolveEmbeddingsEndpoint(db).ok, false);
    db.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

interface FixtureState {
  server: Server;
  baseUrl: string;
  requests: Array<{ model: string; inputs: string[]; hadAuth: boolean }>;
}

async function startEmbeddingsFixture(vectors: Map<string, number[]>, model = "fixture-embed"): Promise<FixtureState> {
  const state: FixtureState = { server: null as unknown as Server, baseUrl: "", requests: [] };
  state.server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      const payload = JSON.parse(String(body)) as { model: string; input: string[] };
      state.requests.push({ model: payload.model, inputs: payload.input, hadAuth: Boolean(request.headers.authorization) });
      if (payload.model !== model) {
        response.writeHead(400, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "unknown model" }));
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        object: "list",
        data: payload.input.map((text, index) => ({ object: "embedding", embedding: vectors.get(text) || [1, 0], index })),
        model: payload.model,
      }));
    });
  });
  await new Promise<void>((resolve) => state.server.listen(0, "127.0.0.1", () => resolve()));
  state.baseUrl = `http://127.0.0.1:${(state.server.address() as AddressInfo).port}/v1`;
  return state;
}

test("embeddings client normalizes vectors and never leaks the key", async () => {
  const fixture = await startEmbeddingsFixture(new Map([["hello", [3, 4]]]));
  try {
    const endpoint: EmbeddingsEndpoint = { baseUrl: fixture.baseUrl, apiKey: "sk-secret-LEAKMARK", model: "fixture-embed", connectionName: "Fixture" };
    const [vector] = await embedTexts(endpoint, ["hello"]);
    const norm = Math.sqrt(vector!.reduce((sum, value) => sum + value * value, 0));
    assert.ok(Math.abs(norm - 1) < 1e-9);
    assert.equal(fixture.requests[0]!.hadAuth, true);
    await assert.rejects(embedTexts({ ...endpoint, model: "nope" }, ["hello"]), /unknown model/);
    try {
      await embedTexts({ ...endpoint, model: "nope" }, ["hello"]);
      assert.fail("expected rejection");
    } catch (error) {
      assert.doesNotMatch(String((error as Error).message), /LEAKMARK/);
    }
    await assert.rejects(
      embedTexts({ baseUrl: "http://127.0.0.1:1/v1", apiKey: null, model: "fixture-embed", connectionName: "Dead" }, ["hello"]),
      /could not be reached/,
    );
  } finally {
    fixture.server.close();
  }
});

test("meaning search recalls a paraphrase that shares no keyword, then caches", async () => {
  const fixture = await startEmbeddingsFixture(new Map([
    ["citrus\nMarta dislikes oranges", [1, 0]],
    ["standup\nDaily standup moved to nine", [0, 1]],
    ["morning sync time", [0.1, 0.995]],
  ]));
  const { root, db } = fixtureDatabase();
  try {
    const provider = db.upsertProvider({ name: "Fixture", provider: "custom", authMode: "api_key", runtime: "opencode", apiConfig: { baseUrl: fixture.baseUrl, protocol: "openai-compatible", modelIds: ["fixture-embed"] } });
    db.updateStudioSettings({ embeddingsProviderInstanceId: provider.id, embeddingsModel: "fixture-embed" });
    db.remember("nova", "citrus", "Marta dislikes oranges");
    db.remember("nova", "standup", "Daily standup moved to nine");
    const first = await searchMemoriesWithMeaning(db, "nova", "morning sync time");
    assert.equal(first.retrieval, "semantic");
    assert.equal(first.notes[0]!.key, "standup");
    assert.equal(fixture.requests.length, 2);
    const second = await searchMemoriesWithMeaning(db, "nova", "morning sync time");
    assert.equal(second.retrieval, "semantic");
    assert.equal(fixture.requests.length, 3, "cached note vectors are reused; only the query is embedded");
    db.remember("nova", "standup", "Daily standup moved to ten");
    assert.equal(db.getMemoryVectors("nova", "fixture-embed").has("standup"), false);
    db.forgetMemory("nova", "citrus");
    assert.equal(db.getMemoryVectors("nova", "fixture-embed").has("citrus"), false);
    db.close();
  } finally {
    fixture.server.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("meaning search falls back to keyword ranking when the endpoint is dead", async () => {
  const { root, db } = fixtureDatabase();
  try {
    const provider = db.upsertProvider({ name: "Dead", provider: "custom", authMode: "api_key", runtime: "opencode", apiConfig: { baseUrl: "http://127.0.0.1:1/v1", protocol: "openai-compatible", modelIds: ["fixture-embed"] } });
    db.updateStudioSettings({ embeddingsProviderInstanceId: provider.id, embeddingsModel: "fixture-embed" });
    db.remember("nova", "citrus", "Marta dislikes oranges");
    const result = await searchMemoriesWithMeaning(db, "nova", "oranges");
    assert.equal(result.retrieval, "keyword");
    assert.deepEqual(result.notes.map((note) => note.key), db.searchMemories("nova", "oranges").map((note) => note.key));
    db.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

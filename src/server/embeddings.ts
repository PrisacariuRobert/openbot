import { isLocalModelUrl, legacyApiProviderId } from "../shared/provider-config.js";
import type { OpenBotDatabase } from "./database.js";
import { rankMemories } from "./memory-retrieval.js";

export interface EmbeddingsEndpoint {
  baseUrl: string;
  apiKey: string | null;
  model: string;
  connectionName: string;
}

export type EmbeddingsResolution =
  | { ok: true; endpoint: EmbeddingsEndpoint }
  | { ok: false; reason: "not_configured" | "unsupported" | "missing_secret"; detail: string };

const MAX_DIMENSIONS = 4_096;
const REQUEST_TIMEOUT_MS = 20_000;

/** Resolve the owner-chosen embeddings connection. Subscription/CLI logins
 * stay inside their own runtimes, so only key-based or local connections can
 * serve vectors. Anything else keeps today's keyword ranking. */
export function resolveEmbeddingsEndpoint(db: OpenBotDatabase): EmbeddingsResolution {
  const settings = db.getStudioSettings();
  if (!settings.embeddingsProviderInstanceId || !settings.embeddingsModel) {
    return { ok: false, reason: "not_configured", detail: "No embeddings connection is chosen." };
  }
  const instance = db.getProvider(settings.embeddingsProviderInstanceId);
  if (!instance || instance.authMode !== "api_key") {
    return { ok: false, reason: "unsupported", detail: "Choose a key-based or local model connection for embeddings. Subscription logins cannot serve vectors." };
  }
  const model = settings.embeddingsModel;
  if (instance.apiConfig) {
    if (instance.apiConfig.protocol !== "openai" && instance.apiConfig.protocol !== "openai-compatible") {
      return { ok: false, reason: "unsupported", detail: "This connection's protocol does not offer an embeddings endpoint. Use an OpenAI-compatible address." };
    }
    const baseUrl = instance.apiConfig.baseUrl;
    const apiKey = db.providerApiSecret(instance.id);
    if (!apiKey && !isLocalModelUrl(baseUrl)) {
      return { ok: false, reason: "missing_secret", detail: "Add the API key for this embeddings connection." };
    }
    return { ok: true, endpoint: { baseUrl, apiKey, model, connectionName: instance.name } };
  }
  const preset = legacyApiProviderId(instance.envName);
  if (preset === "openai") {
    const apiKey = db.providerApiSecret(instance.id);
    if (!apiKey) return { ok: false, reason: "missing_secret", detail: "Add the API key for this embeddings connection." };
    return { ok: true, endpoint: { baseUrl: "https://api.openai.com/v1", apiKey, model, connectionName: instance.name } };
  }
  if (preset === "openrouter") {
    const apiKey = db.providerApiSecret(instance.id);
    if (!apiKey) return { ok: false, reason: "missing_secret", detail: "Add the API key for this embeddings connection." };
    return { ok: true, endpoint: { baseUrl: "https://openrouter.ai/api/v1", apiKey, model, connectionName: instance.name } };
  }
  return { ok: false, reason: "unsupported", detail: "This key cannot serve embeddings. Use an OpenAI key, an OpenRouter key, or an OpenAI-compatible address." };
}

function safeProviderMessage(status: number, body: string): string {
  const text = body.replace(/sk-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "[key hidden]").slice(0, 300).trim();
  return text ? `The embeddings service answered ${status}: ${text}` : `The embeddings service answered ${status} without details.`;
}

/** One batched OpenAI-compatible embeddings call. Throws on any transport,
 * shape, or content problem; callers fall back to keyword ranking. */
export async function embedTexts(endpoint: EmbeddingsEndpoint, inputs: string[]): Promise<number[][]> {
  if (!inputs.length) return [];
  const trimmed = inputs.map((input) => input.slice(0, 8_000));
  let response: Response;
  try {
    response = await fetch(`${endpoint.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(endpoint.apiKey ? { authorization: `Bearer ${endpoint.apiKey}` } : {}),
      },
      body: JSON.stringify({ model: endpoint.model, input: trimmed }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(error instanceof Error && error.name === "TimeoutError" ? "The embeddings request timed out after 20 seconds." : "The embeddings connection could not be reached.");
  }
  if (!response.ok) throw new Error(safeProviderMessage(response.status, await response.text().catch(() => "")));
  const payload = await response.json().catch(() => null) as { data?: Array<{ embedding?: unknown; index?: unknown }> } | null;
  const rows = payload?.data;
  if (!Array.isArray(rows) || rows.length !== trimmed.length) throw new Error("The embeddings service returned an unexpected shape.");
  return rows.map((row) => {
    const vector = row?.embedding;
    if (!Array.isArray(vector) || !vector.length || vector.length > MAX_DIMENSIONS || !vector.every((value) => typeof value === "number" && Number.isFinite(value))) {
      throw new Error("The embeddings service returned an unusable vector.");
    }
    const norm = Math.sqrt(vector.reduce((sum, value) => sum + (value as number) * (value as number), 0));
    if (!(norm > 0)) throw new Error("The embeddings service returned an empty vector.");
    return (vector as number[]).map((value) => value / norm);
  });
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  for (let index = 0; index < length; index += 1) dot += a[index]! * b[index]!;
  return Math.max(-1, Math.min(1, dot));
}

export type BlendedRank = { key: string; score: number };

/** Deterministic blend: meaning carries the ranking, exact wording still
 * counts. Items found by only one method keep a discounted score so neither
 * method can hide the other's matches. */
export function blendKeywordSemantic(
  keyword: Array<{ key: string; score: number }>,
  semantic: Map<string, number>,
): BlendedRank[] {
  const keywordMax = Math.max(0, ...keyword.map((entry) => entry.score));
  const semanticMax = Math.max(0, ...semantic.values());
  const keywordNorm = new Map(keyword.map((entry) => [entry.key, keywordMax > 0 ? entry.score / keywordMax : 0]));
  const keys = new Set([...keywordNorm.keys(), ...semantic.keys()]);
  return [...keys]
    .map((key) => {
      const keywordScore = keywordNorm.get(key) ?? 0, semanticScore = semanticMax > 0 ? (semantic.get(key) ?? 0) / semanticMax : 0;
      const score = keywordScore > 0 && semanticScore > 0
        ? 0.6 * semanticScore + 0.4 * keywordScore
        : 0.55 * Math.max(keywordScore, semanticScore);
      return { key, score: Math.round(score * 1_000) / 1_000 };
    })
    .sort((a, b) => b.score - a.score || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

export interface MeaningSearchResult {
  notes: Array<{ key: string; content: string; score: number }>;
  retrieval: "semantic" | "keyword";
}

function memoryText(key: string, content: string): string {
  return `${key}\n${content}`;
}

/** Rank a teammate's private memories. With a working embeddings connection
 * this blends meaning similarity with the existing keyword score; otherwise
 * it returns exactly today's keyword ranking. Never throws. */
export async function searchMemoriesWithMeaning(db: OpenBotDatabase, botId: string, query: string, limit = 18): Promise<MeaningSearchResult> {
  const notes = db.memoryEntries(botId);
  const keyword = rankMemories(query, notes, limit).map((note) => ({ key: note.key, content: note.content, score: note.score }));
  const trimmed = query.trim();
  if (!trimmed || !notes.length) return { notes: [], retrieval: "keyword" };
  const resolution = resolveEmbeddingsEndpoint(db);
  if (!resolution.ok) return { notes: keyword, retrieval: "keyword" };
  const { endpoint } = resolution;
  try {
    const cached = db.getMemoryVectors(botId, endpoint.model);
    const missing = notes.filter((note) => {
      const vector = cached.get(note.key);
      return !vector || vector.text !== memoryText(note.key, note.content);
    });
    if (missing.length) {
      const vectors = await embedTexts(endpoint, missing.map((note) => memoryText(note.key, note.content)));
      db.saveMemoryVectors(botId, endpoint.model, missing.map((note, index) => ({ key: note.key, text: memoryText(note.key, note.content), vector: vectors[index]! })));
      for (const [index, note] of missing.entries()) cached.set(note.key, { text: memoryText(note.key, note.content), vector: vectors[index]! });
    }
    const [queryVector] = await embedTexts(endpoint, [trimmed]);
    const semantic = new Map<string, number>();
    for (const note of notes) {
      const vector = cached.get(note.key)?.vector;
      if (vector) semantic.set(note.key, (cosineSimilarity(queryVector!, vector) + 1) / 2);
    }
    if (!semantic.size) return { notes: keyword, retrieval: "keyword" };
    const blended = blendKeywordSemantic(keyword.map((note) => ({ key: note.key, score: note.score })), semantic);
    const byKey = new Map(notes.map((note) => [note.key, note]));
    return {
      notes: blended.slice(0, limit).map((entry) => ({ key: entry.key, content: byKey.get(entry.key)!.content, score: entry.score })),
      retrieval: "semantic",
    };
  } catch (error) {
    console.warn(`Semantic memory fell back to keyword ranking: ${error instanceof Error ? error.message : String(error)}`);
    return { notes: keyword, retrieval: "keyword" };
  }
}

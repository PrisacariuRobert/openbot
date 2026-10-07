import type { Express } from "express";
import { isLocalModelUrl } from "../shared/provider-config.js";

/** Ollama on this Mac, for the first run's one-click "A model on this Mac". */
export interface OllamaStatus {
  running: boolean;
  /** Installed models that can use tools; teammates need tools to do anything. */
  models: string[];
  /** The OpenAI-compatible address a connection should use. */
  apiBaseUrl: string;
}

const DEFAULT_URL = "http://127.0.0.1:11434";
const MAX_MODELS = 20;

/** The Ollama address: the default, or a loopback override for tests. Null if the override isn't on this machine. */
export function ollamaUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const override = env.OPENBOT_OLLAMA_URL?.trim();
  if (!override) return DEFAULT_URL;
  return isLocalModelUrl(override) ? override.replace(/\/+$/, "") : null;
}

export async function detectOllama(options: { url?: string | null; fetchImpl?: typeof fetch; timeoutMs?: number } = {}): Promise<OllamaStatus> {
  const url = options.url === undefined ? ollamaUrl() : options.url;
  const fetchImpl = options.fetchImpl ?? fetch, timeoutMs = options.timeoutMs ?? 1_500;
  const none: OllamaStatus = { running: false, models: [], apiBaseUrl: `${url ?? DEFAULT_URL}/v1` };
  if (!url) return none;
  const json = async (path: string, body?: unknown) => {
    const response = await fetchImpl(url + path, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new Error(`Ollama answered ${response.status}`);
    return response.json() as Promise<unknown>;
  };
  let tags: unknown;
  try { tags = await json("/api/tags"); } catch { return none; }
  const listed = (tags as { models?: unknown }).models;
  if (!Array.isArray(listed)) return none; // Something else is listening on that port.
  const names = listed.map((entry) => (entry as { name?: unknown }).name).filter((name): name is string => typeof name === "string" && name.length > 0 && name.length < 200).slice(0, MAX_MODELS);
  const withTools = await Promise.all(names.map(async (name) => {
    try {
      const capabilities = ((await json("/api/show", { model: name })) as { capabilities?: unknown }).capabilities;
      return Array.isArray(capabilities) && capabilities.includes("tools") && !capabilities.includes("embedding") ? name : null;
    } catch { return null; }
  }));
  return { running: true, models: withTools.filter((name): name is string => name !== null), apiBaseUrl: `${url}/v1` };
}

export function registerOllamaRoutes(app: Express, detect: () => Promise<OllamaStatus> = () => detectOllama()) {
  app.get("/api/provider/ollama", async (_request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.json(await detect());
  });
}

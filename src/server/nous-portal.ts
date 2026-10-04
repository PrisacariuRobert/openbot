/** Nous Portal: a free plan (no card) with free models behind an
 * OpenAI-compatible API. The owner pastes a key; Sidemates checks it, finds the
 * free models that can call tools, and saves an ordinary API connection. */

export const NOUS_BASE_URL = "https://inference-api.nousresearch.com/v1";

type ModelEntry = { id?: unknown; pricing?: Record<string, unknown>; supported_parameters?: unknown; capabilities?: unknown };

/** Free models (price 0 in the catalog), tool-capable ones preferred.
 * Unattributed "stealth" models are skipped: nobody can say where the
 * requests go. General-purpose families lead; the list rotates over time. */
export function freeNousModels(payload: unknown): string[] {
  const data = (payload as { data?: ModelEntry[] })?.data;
  if (!Array.isArray(data)) return [];
  const priced = (entry: ModelEntry) => entry.pricing && Object.values(entry.pricing).some((value) => value !== undefined && value !== null && value !== "");
  const free = (entry: ModelEntry) => priced(entry) && Object.entries(entry.pricing!).filter(([key]) => /prompt|completion|input|output/i.test(key)).every(([, value]) => Number(value) === 0);
  const tools = (entry: ModelEntry) => JSON.stringify(entry.supported_parameters ?? entry.capabilities ?? "").includes("tool");
  const ids = (list: ModelEntry[]) => list.map((entry) => String(entry.id || "")).filter((id) => /^[\w./:-]{1,120}$/.test(id));
  const anyPricing = data.some(priced);
  let chosen = (anyPricing ? data.filter(free) : data.filter((entry) => /hermes/i.test(String(entry.id)))).filter((entry) => !/^stealth\//i.test(String(entry.id)));
  const withTools = chosen.filter(tools);
  if (withTools.length) chosen = withTools;
  const rank = (id: string) => { const at = [/hermes-?4/i, /step-?\d/i, /longcat/i, /solar/i, /laguna-s\b|laguna-s-/i].findIndex((pattern) => pattern.test(id)); return at < 0 ? 99 : at; };
  return ids(chosen).sort((a, b) => rank(a) - rank(b) || b.localeCompare(a, undefined, { numeric: true })).slice(0, 12);
}

export async function checkNousKey(key: string, fetcher: typeof fetch = fetch): Promise<string[]> {
  if (!/^[\w.-]{20,300}$/.test(key.trim())) throw new Error("That doesn't look like a Nous Portal key. Copy it again from portal.nousresearch.com.");
  let response: Response;
  try { response = await fetcher(`${NOUS_BASE_URL}/models`, { headers: { authorization: `Bearer ${key.trim()}`, accept: "application/json" }, signal: AbortSignal.timeout(15_000) }); }
  catch { throw new Error("Nous Portal couldn't be reached. Check your internet connection and try again."); }
  if (!response.ok) throw new Error(`Nous Portal answered with an error (${response.status}). Try again in a minute.`);
  const models = freeNousModels(await response.json().catch(() => null));
  if (!models.length) throw new Error("Nous Portal lists no free models right now. Try again later or choose another AI.");
  // The model list is public, so prove the key with one tiny free request.
  let check: Response;
  try {
    check = await fetcher(`${NOUS_BASE_URL}/chat/completions`, { method: "POST", headers: { authorization: `Bearer ${key.trim()}`, "content-type": "application/json" }, body: JSON.stringify({ model: models[0], messages: [{ role: "user", content: "Say OK." }], max_tokens: 3 }), signal: AbortSignal.timeout(30_000) });
  } catch { throw new Error("Nous Portal couldn't be reached. Check your internet connection and try again."); }
  if (check.status === 401 || check.status === 403) throw new Error("Nous Portal didn't accept that key. Copy it again from portal.nousresearch.com.");
  if (check.status === 402) throw new Error("Nous Portal asked for credits for this model. Try again later, when the free list changes, or choose another AI.");
  if (!check.ok && check.status !== 429) throw new Error(`Nous Portal answered with an error (${check.status}). Try again in a minute.`);
  return models;
}

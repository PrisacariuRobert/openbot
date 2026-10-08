/** A free Gemini key in a few clicks (task A5): the key's shape, the notices
 * from Google's terms, and the save-then-test-live flow both setup screens use. */

/** Google AI Studio keys today: "AIza" and 35 more characters. Only used to save
 * the owner a click; a key in another shape can still be connected by hand. */
export const GEMINI_KEY_PATTERN = /^AIza[0-9A-Za-z_-]{35}$/;
export const looksLikeGeminiKey = (value: string) => GEMINI_KEY_PATTERN.test(value.trim());

export const GEMINI_KEY_PAGE = "https://aistudio.google.com/apikey";

/** From the Gemini API Additional Terms of Service, last updated 28 April 2026 (checked 7 October 2026). */
export const GEMINI_TERMS = {
  url: "https://ai.google.dev/gemini-api/terms",
  updated: "28 April 2026",
  notices: [
    "Google’s terms say the Gemini API is for people 18 or older, for professional or business use.",
    "Outside the EEA, the UK and Switzerland, Google may use what you send on the free tier to improve its products, and people may read it. For private mail and messages, a model on this Mac keeps everything here.",
  ],
} as const;

export type GeminiConnectResult =
  | { connectionId: string; tested: true }
  | { connectionId: string; tested: false; error: string };

type Fetcher = (input: string, init?: RequestInit) => Promise<Pick<Response, "ok" | "json">>;

/** Saves the key, then runs one tiny live reply through it. A saved key that fails
 * the test is still saved: the caller shows why and lets the owner continue anyway. */
export async function connectGeminiKey(key: string, fetcher: Fetcher = fetch, onSaved?: () => void): Promise<GeminiConnectResult> {
  const saved = await fetcher("/api/provider/key", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ providerId: "google", key }) });
  const result = await saved.json().catch(() => ({})) as { error?: string; connectionId?: string };
  if (!saved.ok || !result.connectionId) throw new Error(result.error || "The key wasn't accepted.");
  const connectionId = result.connectionId;
  onSaved?.();
  try {
    const tested = await fetcher(`/api/provider/${encodeURIComponent(connectionId)}/test`, { method: "POST", credentials: "same-origin" });
    const outcome = await tested.json().catch(() => ({})) as { ok?: boolean; error?: string | null };
    if (tested.ok && outcome.ok) return { connectionId, tested: true };
    return { connectionId, tested: false, error: outcome.error || "Google didn’t answer the test." };
  } catch {
    return { connectionId, tested: false, error: "The key was saved, but the test couldn’t reach Google." };
  }
}

/** A free Gemini key in a minute: check a pasted key with Google before it is
 * saved, so a typo or a key without the API turned on is caught on the spot,
 * in plain words. The models list costs no quota. */

const MODELS_URL = "https://generativelanguage.googleapis.com/v1beta/models";

export async function checkGeminiKey(raw: string, fetcher: typeof fetch = fetch): Promise<void> {
  const key = raw.trim();
  if (!/^[\w-]{30,60}$/.test(key)) throw new Error("That doesn't look like a Gemini key. Copy it again from aistudio.google.com/apikey: it starts with \"AIza\".");
  let response: Response;
  try { response = await fetcher(`${MODELS_URL}?pageSize=1`, { headers: { "x-goog-api-key": key, accept: "application/json" }, signal: AbortSignal.timeout(15_000) }); }
  catch { throw new Error("Google couldn't be reached. Check your internet connection and try again."); }
  if (response.ok) return;
  const body = await response.json().catch(() => ({})) as { error?: { status?: string; message?: string; details?: Array<{ reason?: string }> } };
  const reason = body.error?.details?.find((detail) => detail.reason)?.reason || body.error?.status || "";
  if (/API_KEY_INVALID|INVALID_ARGUMENT/.test(reason) || response.status === 400) throw new Error("Google didn't accept that key. Copy it again from aistudio.google.com/apikey.");
  if (/SERVICE_DISABLED|ACCESS_TOKEN_SCOPE|PERMISSION_DENIED/.test(reason) || response.status === 403) throw new Error("That key can't use Gemini yet. Create the key in Google AI Studio (aistudio.google.com/apikey), which turns the Gemini API on for you.");
  if (response.status === 429) throw new Error("This key has used up its free requests for now. It works again after Google's daily reset, or connect another AI.");
  throw new Error(`Google answered with an error (${response.status}). Try again in a minute.`);
}

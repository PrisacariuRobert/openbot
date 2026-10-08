import assert from "node:assert/strict";
import test from "node:test";
import { connectGeminiKey, GEMINI_TERMS, looksLikeGeminiKey } from "./gemini.js";

// Synthetic, never a real key.
const KEY = "AIza" + "x".repeat(30) + "_-9Zq";

test("a pasted Gemini key is recognised; anything else waits for Connect", () => {
  assert.equal(looksLikeGeminiKey(KEY), true);
  assert.equal(looksLikeGeminiKey(`  ${KEY}\n`), true, "Pasted with whitespace");
  assert.equal(looksLikeGeminiKey(KEY.slice(0, -1)), false, "Too short");
  assert.equal(looksLikeGeminiKey(KEY + "a"), false, "Too long");
  assert.equal(looksLikeGeminiKey("sk-" + "x".repeat(36)), false, "Another provider's key");
  assert.equal(looksLikeGeminiKey("AIza" + "x".repeat(34) + "!"), false);
});

test("the notices come from Google's terms, dated, and name where the free tier isn't used for training", () => {
  assert.equal(GEMINI_TERMS.url, "https://ai.google.dev/gemini-api/terms");
  assert.match(GEMINI_TERMS.updated, /^\d{1,2} \w+ \d{4}$/);
  assert.equal(GEMINI_TERMS.notices.length, 2);
  assert.match(GEMINI_TERMS.notices[0], /18 or older/);
  assert.match(GEMINI_TERMS.notices[0], /professional or business use/);
  assert.match(GEMINI_TERMS.notices[1], /EEA, the UK and Switzerland/);
  assert.match(GEMINI_TERMS.notices[1], /model on this Mac/);
});

function fakeFetch(responses: Record<string, { ok: boolean; body: unknown } | Error>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const answer = responses[url];
    if (!answer) throw new Error("Unexpected " + url);
    if (answer instanceof Error) throw answer;
    return { ok: answer.ok, json: async () => answer.body };
  };
  return { calls, fetcher };
}

test("connecting saves the key, then tests it live once", async () => {
  const { calls, fetcher } = fakeFetch({
    "/api/provider/key": { ok: true, body: { connectionId: "local-google", models: ["google/gemini-2.5-flash"] } },
    "/api/provider/local-google/test": { ok: true, body: { tested: true, ok: true, model: "google/gemini-2.5-flash", latencyMs: 900, error: null } },
  });
  let savedAt = -1;
  assert.deepEqual(await connectGeminiKey(KEY, fetcher, () => { savedAt = calls.length; }), { connectionId: "local-google", tested: true });
  assert.equal(savedAt, 1, "The screen hears the key was saved before the test runs");
  assert.deepEqual(calls.map((call) => `${call.init?.method} ${call.url}`), ["POST /api/provider/key", "POST /api/provider/local-google/test"]);
  assert.deepEqual(JSON.parse(String(calls[0]!.init?.body)), { providerId: "google", key: KEY });
});

test("a failed test keeps the saved key and says why", async () => {
  const rejected = fakeFetch({
    "/api/provider/key": { ok: true, body: { connectionId: "local-google" } },
    "/api/provider/local-google/test": { ok: true, body: { tested: true, ok: false, error: "The provider rejected its sign-in or key. Reconnect it, then test again." } },
  });
  assert.deepEqual(await connectGeminiKey(KEY, rejected.fetcher), { connectionId: "local-google", tested: false, error: "The provider rejected its sign-in or key. Reconnect it, then test again." });
  const busy = fakeFetch({
    "/api/provider/key": { ok: true, body: { connectionId: "local-google" } },
    "/api/provider/local-google/test": { ok: false, body: { error: "A test just ran for this connection." } },
  });
  assert.equal((await connectGeminiKey(KEY, busy.fetcher) as { error: string }).error, "A test just ran for this connection.");
  const offline = fakeFetch({ "/api/provider/key": { ok: true, body: { connectionId: "local-google" } }, "/api/provider/local-google/test": new Error("Failed to fetch") });
  assert.match((await connectGeminiKey(KEY, offline.fetcher) as { error: string }).error, /saved, but the test couldn’t reach Google/);
});

test("a key that isn't saved is never tested", async () => {
  const { calls, fetcher } = fakeFetch({ "/api/provider/key": { ok: false, body: { error: "OpenCode saved the key but didn't list Gemini. Paste the key again." } } });
  await assert.rejects(connectGeminiKey(KEY, fetcher), /didn't list Gemini/);
  assert.equal(calls.length, 1);
  const empty = fakeFetch({ "/api/provider/key": { ok: true, body: {} } });
  await assert.rejects(connectGeminiKey(KEY, empty.fetcher), /wasn't accepted/);
});

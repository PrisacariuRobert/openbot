import assert from "node:assert/strict";
import test from "node:test";
import { checkGeminiKey } from "./gemini-key.js";

const KEY = "AIzaSyD" + "x".repeat(32);
const answer = (status: number, body: unknown = {}) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

test("a pasted Gemini key is checked with Google before it is saved", async () => {
  let asked = "";
  await checkGeminiKey(` ${KEY} `, (async (url: string, init: RequestInit) => { asked = `${url} ${(init.headers as Record<string, string>)["x-goog-api-key"]}`; return new Response("{}", { status: 200 }); }) as unknown as typeof fetch);
  assert.match(asked, /generativelanguage\.googleapis\.com\/v1beta\/models/);
  assert.match(asked, new RegExp(`${KEY}$`), "the key goes in a header, never the address");
  assert.doesNotMatch(asked.split(" ")[0]!, /AIza/);
});

test("each way a key can be wrong is said plainly", async () => {
  await assert.rejects(checkGeminiKey("not-a-key"), /doesn't look like a Gemini key/);
  await assert.rejects(checkGeminiKey(KEY, answer(400, { error: { status: "INVALID_ARGUMENT", details: [{ reason: "API_KEY_INVALID" }] } })), /didn't accept that key/);
  await assert.rejects(checkGeminiKey(KEY, answer(403, { error: { status: "PERMISSION_DENIED", details: [{ reason: "SERVICE_DISABLED" }] } })), /Google AI Studio/);
  await assert.rejects(checkGeminiKey(KEY, answer(429)), /free requests/);
  await assert.rejects(checkGeminiKey(KEY, (async () => { throw new Error("offline"); }) as unknown as typeof fetch), /couldn't be reached/);
});

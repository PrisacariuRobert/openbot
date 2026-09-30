import assert from "node:assert/strict";
import test from "node:test";
import { checkNousKey, freeNousModels, NOUS_BASE_URL } from "./nous-portal.js";

test("free, tool-capable models are chosen; stealth models skipped", () => {
  const catalog = { data: [
    { id: "openai/gpt-5.5", pricing: { prompt: "0.000002", completion: "0.00001" }, supported_parameters: ["tools"] },
    { id: "nousresearch/hermes-3-llama-3.1-70b", pricing: { prompt: "0", completion: "0" }, supported_parameters: ["tools"] },
    { id: "nousresearch/hermes-4-70b", pricing: { prompt: "0", completion: "0" }, supported_parameters: ["tools", "temperature"] },
    { id: "some/free-no-tools", pricing: { prompt: "0", completion: "0" }, supported_parameters: ["temperature"] },
    { id: "stealth/mystery", pricing: { prompt: "0", completion: "0" }, supported_parameters: ["tools"] },
  ] };
  assert.deepEqual(freeNousModels(catalog), ["nousresearch/hermes-4-70b", "nousresearch/hermes-3-llama-3.1-70b"]);
});

test("without prices in the catalog, Hermes models are used", () => {
  assert.deepEqual(freeNousModels({ data: [{ id: "Hermes-4-70B" }, { id: "gpt-x" }] }), ["Hermes-4-70B"]);
  assert.deepEqual(freeNousModels(null), []);
});

test("the key goes only in the Authorization header and is proven with one tiny request", async () => {
  const seen: { url: string; auth: string | null }[] = [];
  const ok: typeof fetch = async (url, init) => { seen.push({ url: String(url), auth: new Headers(init?.headers).get("authorization") }); return new Response(JSON.stringify(String(url).endsWith("/models") ? { data: [{ id: "Hermes-4-70B" }] } : { choices: [] }), { status: 200 }); };
  const key = "sk-" + "x".repeat(30);
  assert.deepEqual(await checkNousKey(key, ok), ["Hermes-4-70B"]);
  assert.deepEqual(seen.map((item) => item.url), [`${NOUS_BASE_URL}/models`, `${NOUS_BASE_URL}/chat/completions`]);
  assert.ok(seen.every((item) => item.auth === `Bearer ${key}`));
  const badKey: typeof fetch = async (url) => new Response(String(url).endsWith("/models") ? JSON.stringify({ data: [{ id: "Hermes-4-70B" }] }) : "", { status: String(url).endsWith("/models") ? 200 : 401 });
  await assert.rejects(() => checkNousKey(key, badKey), /didn't accept that key/);
  await assert.rejects(() => checkNousKey("short"), /doesn't look like a Nous Portal key/);
});

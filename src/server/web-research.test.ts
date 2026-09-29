import test from "node:test";
import assert from "node:assert/strict";
import { webRead, webResearchEnabled, webSearch } from "./web-research.js";

const sse = (text: string, extra: Record<string, unknown> = {}) => new Response(`event: message\ndata: ${JSON.stringify({ result: { content: [{ type: "text", text }], ...extra } })}\n\n`, { status: 200 });

test("web_search returns ranked results with their sources and sends the query to the search service", async () => {
  let body: { params: { name: string; arguments: Record<string, unknown> } } | null = null;
  const fetcher = (async (_url: string, init: RequestInit) => { body = JSON.parse(String(init.body)); return sse("Title: Danieli\nURL: https://www.danieli.at/\nHighlights: open daily 11:30–24:00\n\n---\n\nTitle: Da Capo\nURL: https://www.dacapo.co.at/en/\nHighlights: MO – SO 11.30 – 22.00"); }) as typeof fetch;
  const result = await webSearch({ query: "Italian restaurant near Stephansplatz open Sunday" }, fetcher);
  assert.deepEqual(result.sources, ["https://www.danieli.at/", "https://www.dacapo.co.at/en/"]);
  assert.match(result.results, /11:30–24:00/);
  assert.match(result.instructions, /untrusted/);
  assert.equal(body!.params.name, "web_search_exa");
  assert.equal(body!.params.arguments.objective, "Italian restaurant near Stephansplatz open Sunday", "objective defaults to the query");
});

test("web_read reads several pages in one call and rejects non-web addresses", async () => {
  const fetcher = (async () => sse("# Danieli\nURL: https://www.danieli.at/\nSeit 1996")) as typeof fetch;
  const result = await webRead({ urls: ["https://www.danieli.at/", "https://www.dacapo.co.at/"] }, fetcher);
  assert.match(result.content, /Seit 1996/);
  await assert.rejects(webRead({ urls: ["file:///etc/passwd"] }, fetcher));
  await assert.rejects(webRead({ urls: [] }, fetcher));
  await assert.rejects(webSearch({ query: "x" }, fetcher), "a one-letter query is refused");
});

test("rate limits and service errors become plain advice to use the browser", async () => {
  await assert.rejects(webSearch({ query: "vienna" }, (async () => new Response("", { status: 429 })) as typeof fetch), /busy/);
  await assert.rejects(webSearch({ query: "vienna" }, (async () => sse("quota exceeded", { isError: true })) as typeof fetch), /browser/);
  await assert.rejects(webSearch({ query: "vienna" }, (async () => new Response("not json", { status: 200 })) as typeof fetch), /unreadable/);
});

test("very long results are shortened, and the owner can turn web search off", async () => {
  const result = await webSearch({ query: "vienna" }, (async () => sse("x".repeat(40_000))) as typeof fetch);
  assert.ok(result.results.length < 15_000);
  assert.match(result.results, /Shortened/);
  assert.equal(webResearchEnabled({ OPENBOT_WEB_SEARCH: "off" }), false);
  assert.equal(webResearchEnabled({}), true);
});

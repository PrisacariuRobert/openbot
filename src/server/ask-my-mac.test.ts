import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { PersonalIndex, type IndexItem } from "./personal-index.js";
import { askMyMac } from "./ask-my-mac.js";
import { openSource } from "./ask-routes.js";

// Synthetic mail, notes, files and messages. Each question below has one right source.
const ITEMS: IndexItem[] = [
  { source: "mail", key: "4101", title: "Your Berlin trip: booking confirmed", author: "trains@rail.example", at: "2026-09-28T09:00:00Z", body: "Your train to Berlin leaves Vienna Hbf on Friday 16 October at 07:12 from platform 9. Seat 41, coach 7." },
  { source: "mail", key: "4102", title: "Invoice 2026-118", author: "billing@acme.example", at: "2026-10-01T08:00:00Z", body: "Invoice 2026-118 for €1,240 is due on 30 October. Pay by bank transfer." },
  { source: "mail", key: "4103", title: "Dentist reminder", author: "praxis@weber-dental.example", at: "2026-10-02T10:00:00Z", body: "A reminder of your check-up with Dr Weber on Tuesday 20 October at 14:30." },
  { source: "mail", key: "4104", title: "Weekly newsletter", author: "news@shop.example", at: "2026-10-03T10:00:00Z", body: "Ten autumn jackets on sale this week, plus free shipping on trains sets for children." },
  { source: "notes", key: "x-coredata://note/p12", title: "Wi-Fi at the cabin", author: "Notes", at: "2026-08-12T10:00:00Z", body: "Network: Fjord-Cabin. Password is on the fridge, not here. Router reset button behind the TV." },
  { source: "notes", key: "x-coredata://note/p13", title: "Gift ideas for Mira", author: "Notes", at: "2026-09-02T10:00:00Z", body: "Mira's birthday 3 November: a ceramics class, the blue Moleskine, tickets for the Klimt exhibition." },
  { source: "notes", key: "x-coredata://note/p14", title: "Book club", author: "Notes", at: "2026-09-20T10:00:00Z", body: "Next book: The Dispossessed. We meet at Anna's on the 25th." },
  { source: "files", key: "/Users/fixture/Documents/Lease 2026.pdf", title: "Lease 2026.pdf", author: "/Users/fixture/Documents", at: "2026-01-10T10:00:00Z", body: "The tenancy ends on 31 March 2027. Three months notice in writing. Monthly rent €1,150 including heating." },
  { source: "files", key: "/Users/fixture/Documents/Car insurance.pdf", title: "Car insurance.pdf", author: "/Users/fixture/Documents", at: "2026-02-01T10:00:00Z", body: "Policy number CI-55102. Renewal on 1 February every year. Breakdown cover included." },
  { source: "messages", key: "chat-77:2026-10-04", title: "Tom", author: "Tom", at: "2026-10-04T18:00:00Z", body: "Can you bring the projector to Saturday's meetup? Starts at 7 at the library." },
];
const QUESTIONS: Array<[string, string]> = [
  ["When does my train to Berlin leave?", "4101"],
  ["How much is the Acme invoice and when is it due?", "4102"],
  ["When is my dentist appointment?", "4103"],
  ["What could I give Mira for her birthday?", "x-coredata://note/p13"],
  ["How much notice do I need to give on my lease?", "/Users/fixture/Documents/Lease 2026.pdf"],
  ["What's my car insurance policy number?", "/Users/fixture/Documents/Car insurance.pdf"],
  ["What did Tom ask me to bring?", "chat-77:2026-10-04"],
  ["Which book is the book club reading?", "x-coredata://note/p14"],
];

function indexWithItems() {
  const index = new PersonalIndex(":memory:");
  index.upsert(ITEMS);
  return index;
}

test("on synthetic data, every question in the fixed set finds the right source first", async () => {
  const index = indexWithItems();
  try {
    for (const [question, key] of QUESTIONS) {
      const result = await askMyMac({ question, index, embeddings: null, chat: null });
      assert.equal(result.sources[0]?.key, key, question);
      assert.equal(result.answer, null, "no local model: sources only");
      assert.match(result.note || "", /add a model in Ollama/);
    }
    const nothing = await askMyMac({ question: "What is the capital of Peru?", index, embeddings: null, chat: null });
    assert.deepEqual(nothing.sources, []);
    assert.match(nothing.note || "", /Nothing on this Mac matches/);
  } finally { index.close(); }
});

test("with models in Ollama on this Mac, the answer is written locally and cites the right source", async () => {
  const index = indexWithItems();
  const calls: Array<{ url: string; body: { model?: string; messages?: Array<{ content: string }> } }> = [];
  let reply = "Your train leaves Vienna Hbf on Friday 16 October at 07:12 [1].";
  const ollama = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      calls.push({ url: request.url || "", body: body ? JSON.parse(body) : {} });
      response.setHeader("content-type", "application/json");
      if (request.url === "/api/chat") return response.end(JSON.stringify({ message: { role: "assistant", content: reply } }));
      if (request.url === "/v1/embeddings") return response.end(JSON.stringify({ data: (JSON.parse(body).input as string[]).map((text, index) => ({ index, embedding: /train|berlin/i.test(text) ? [1, 0] : [0, 1] })) }));
      response.statusCode = 404; response.end("{}");
    });
  });
  await new Promise<void>((resolve) => ollama.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(ollama.address() as { port: number }).port}`;
  try {
    const embeddings = { baseUrl: `${url}/v1`, apiKey: null, model: "embeddinggemma", connectionName: "Ollama on this Mac" };
    const chat = { baseUrl: `${url}/v1`, model: "qwen3:8b" };
    const result = await askMyMac({ question: "When does my train to Berlin leave?", index, embeddings, chat });
    assert.equal(result.searchedBy, "meaning");
    assert.equal(result.sources[0]!.key, "4101");
    assert.equal(result.answer, reply);
    assert.equal(result.answeredWith, "qwen3:8b");
    assert.deepEqual(result.cited, [1]);
    const prompt = calls.find((call) => call.url === "/api/chat")!.body.messages!.at(-1)!.content;
    assert.match(prompt, /\[1\] mail: Your Berlin trip: booking confirmed/);

    reply = "Probably Friday.";
    const uncited = await askMyMac({ question: "When does my train to Berlin leave?", index, embeddings, chat });
    assert.equal(uncited.answer, null, "an answer that cites nothing isn't shown as if checked");
    reply = "It leaves at 07:12 [9].";
    assert.equal((await askMyMac({ question: "When does my train to Berlin leave?", index, embeddings, chat })).answer, null, "a citation of a source that doesn't exist doesn't count");
    const timedOut = await askMyMac({ question: "When does my train to Berlin leave?", index, embeddings, chat: { baseUrl: "http://127.0.0.1:9/v1", model: "qwen3:8b" }, timeoutMs: 500 });
    assert.equal(timedOut.answer, null);
    assert.equal(timedOut.sources[0]!.key, "4101");
  } finally {
    ollama.closeAllConnections(); await new Promise<void>((resolve) => ollama.close(() => resolve()));
    index.close();
  }
});

test("sources open in the app they came from, only on a Mac, and a missing message says so", async () => {
  const runs: Array<[string, string[]]> = [];
  const runner = async (command: string, args: string[]) => { runs.push([command, args]); };
  const mailFile = (id: string) => (id === "4101" ? "/Users/fixture/Library/Mail/V10/INBOX.mbox/Messages/4101.emlx" : null);
  assert.deepEqual(await openSource({ source: "files", key: "/Users/fixture/Documents/Lease 2026.pdf" }, { platform: "darwin", runner, mailFile }), { opened: true });
  assert.deepEqual(await openSource({ source: "mail", key: "4101" }, { platform: "darwin", runner, mailFile }), { opened: true });
  assert.deepEqual(await openSource({ source: "notes", key: "x-coredata://note/p13" }, { platform: "darwin", runner, mailFile }), { opened: true });
  assert.deepEqual(runs, [
    ["/usr/bin/open", ["-R", "/Users/fixture/Documents/Lease 2026.pdf"]],
    ["/usr/bin/open", ["/Users/fixture/Library/Mail/V10/INBOX.mbox/Messages/4101.emlx"]],
    ["/usr/bin/osascript", ["-e", 'tell application "Notes" to show note id "x-coredata://note/p13"', "-e", 'tell application "Notes" to activate']],
  ]);
  assert.deepEqual(await openSource({ source: "mail", key: "9999" }, { platform: "darwin", runner, mailFile }), { opened: false, reason: "Mail no longer has that message." });
  assert.equal((await openSource({ source: "files", key: "/x" }, { platform: "linux", runner, mailFile })).opened, false);
  assert.equal((await openSource({ source: "files", key: "/x" }, { platform: "darwin", runner: async () => { throw new Error("no"); }, mailFile })).opened, false);
});

import assert from "node:assert/strict";
import test from "node:test";
import { renderResultPage } from "./share-result.js";

const teammate = { name: "Nova", role: "Research and planning", color: "#6757d9", mascot: "nova" };
const at = new Date("2026-09-29T10:00:00Z");

test("a result becomes one self-contained page with the teammate's face", () => {
  const page = renderResultPage({ question: "What did Anna say about the Berlin trip?", answer: "She booked the tickets and asked to move dinner to **8**.\n\n- Hotel: near the station\n- Source: [Messages](https://example.com/m)", files: ["trip.docx"], teammate, at });
  assert.match(page.html, /<svg[^>]*class="[^"]*character/);
  assert.match(page.html, /<strong>Nova<\/strong>/);
  assert.match(page.html, /29 September 2026/);
  assert.match(page.html, /<strong>8<\/strong>/);
  assert.match(page.html, /<li>Hotel: near the station<\/li>/);
  assert.match(page.html, /Files delivered: trip\.docx/);
  assert.match(page.html, /Made with <a href="https:\/\/sidemates\.app\/\?ref=result"/);
  assert.equal(page.filename, "what-did-anna-say-about-the-berlin-trip.html");
  assert.equal(page.total, 0);
});

test("personal details are hidden everywhere on the page, and counted", () => {
  const page = renderResultPage({ question: "Mail anna@example.com or call +32 456 39 17 65", answer: "Saved to /Users/robert/Documents/Receipts/a.pdf. Reach her at anna@example.com. See https://shop.example/x?token=SECRET123", files: ["/Users/robert/Desktop/anna@example.com.txt"], teammate, at });
  assert.doesNotMatch(page.html, /anna@example|456 39|robert|SECRET123/);
  assert.match(page.html, /\[email hidden\]/);
  assert.match(page.html, /~\/Documents\/Receipts\/a\.pdf/);
  assert.ok(page.total >= 6, `hid ${page.total}`);
  assert.match(page.summary, /email addresses/);
  assert.match(page.text, /\[email hidden\]/);
  assert.doesNotMatch(page.text, /anna@example|robert/);
});

test("the page cannot run code, load remote files, or carry hostile markup", () => {
  const page = renderResultPage({ question: "<img src=x onerror=alert(1)>", answer: "<script>alert(1)</script> <b onclick=x>hi</b>\n\n![track](https://evil.example/pixel.gif)\n\n[click](javascript:alert(1)) [fine](https://ok.example/a) [mail](mailto:x@y.zz)", files: [], teammate: { ...teammate, name: "<Nova>", color: "red", mascot: "x" }, at });
  // Hostile text may appear, but only escaped: no live tag, handler, script URL or remote file.
  assert.doesNotMatch(page.html, /<script|<img|<b[ >]|<[a-z][^>]*\son\w+=|href="javascript:|evil\.example/i);
  assert.doesNotMatch(page.html, /<p><\/p>/, "a removed image leaves no empty paragraph");
  assert.match(page.html, /&lt;script&gt;/);
  assert.match(page.html, /<a href="https:\/\/ok\.example\/a" target="_blank" rel="noopener noreferrer nofollow">fine<\/a>/);
  assert.match(page.html, /Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"/);
  assert.match(page.html, /&lt;Nova&gt;/);
  assert.match(page.html, /--character-color:#6757d9/);
});

test("without the question, only the answer is shared", () => {
  const page = renderResultPage({ question: null, answer: "Three restaurants are open.", files: [], teammate, at });
  assert.doesNotMatch(page.html, /class="q"/);
  assert.equal(page.title, "Three restaurants are open.");
});

test("the title is one line: the question, or the answer's first line without formatting", () => {
  const withAnswerOnly = renderResultPage({ question: null, answer: "## Your latest receipt\n\n* **Shop:** Anthropic\n* **Amount:** $21.27", files: [], teammate, at });
  assert.equal(withAnswerOnly.title, "Your latest receipt");
  const long = renderResultPage({ question: `${"word ".repeat(30)}end`, answer: "x", files: [], teammate, at });
  assert.ok(long.title.endsWith("…") && long.title.length <= 71);
});

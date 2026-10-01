import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

// openbots.foundation should be easy for people and for AI assistants to find and cite.
// These checks keep the crawler files honest and in step with the pages they describe.

const site = fileURLToPath(new URL("../../site/", import.meta.url));
const ORIGIN = "https://openbots.foundation";
const read = (relative: string) => readFileSync(path.join(site, relative), "utf8");

/** Maps an openbots.foundation URL to the file the site would serve for it. */
function fileFor(url: string) {
  const pathname = new URL(url).pathname;
  return path.join(site, pathname.endsWith("/") ? `${pathname}index.html` : pathname);
}

function jsonLd(html: string) {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.ok(blocks.length > 0, "page has structured data");
  return blocks.map(block => JSON.parse(block[1]));
}

function graph(html: string): Array<Record<string, unknown>> {
  return jsonLd(html).flatMap(block => (block["@graph"] as Array<Record<string, unknown>>) ?? [block]);
}

const entities: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&rsquo;": "’", "&mdash;": "—" };
const plain = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&[#\w]+;/g, entity => entities[entity] ?? entity).replace(/\s+/g, " ").trim();

function visibleFaq(html: string) {
  return [...html.matchAll(/<details[^>]*><summary>([\s\S]*?)<\/summary>\s*<p>([\s\S]*?)<\/p>\s*<\/details>/g)].map(match => ({ question: plain(match[1]), answer: plain(match[2]) }));
}

function faqJsonLd(html: string) {
  const page = graph(html).find(node => node["@type"] === "FAQPage");
  assert.ok(page, "page has FAQPage structured data");
  return (page.mainEntity as Array<{ name: string; acceptedAnswer: { text: string } }>).map(item => ({ question: item.name, answer: item.acceptedAnswer.text }));
}

test("robots.txt welcomes crawlers, including the ones behind AI assistants, and points at the sitemap", () => {
  const robots = read("robots.txt");
  assert.match(robots, /^Sitemap: https:\/\/openbots\.foundation\/sitemap\.xml$/m);
  for (const agent of ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "PerplexityBot", "Google-Extended"]) {
    assert.match(robots, new RegExp(`User-agent: ${agent}\\nAllow: /`), `${agent} is allowed`);
  }
  assert.doesNotMatch(robots, /^Disallow:\s*\/\s*$/m, "nothing is blocked wholesale");
});

test("every sitemap address is a real page on the site", () => {
  const urls = [...read("sitemap.xml").matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]);
  assert.ok(urls.length >= 3);
  for (const url of urls) {
    assert.ok(url.startsWith(`${ORIGIN}/`), `${url} is on our domain`);
    assert.ok(existsSync(fileFor(url)), `${url} has a file behind it`);
  }
  assert.ok(urls.includes(`${ORIGIN}/alternatives/`), "the comparison page is listed");
});

test("llms.txt and llms-full.txt follow the format and only link to things that exist", () => {
  const short = read("llms.txt");
  assert.match(short, /^# OpenBot\n\n> /, "title then a one-paragraph summary");
  assert.match(short, /free, open-source/i);
  assert.match(short, /not the right answer/i, "says when OpenBot is the wrong choice");
  for (const file of ["llms.txt", "llms-full.txt"]) {
    for (const match of read(file).matchAll(/https:\/\/openbots\.foundation\/[^\s)>`]*/g)) {
      const url = match[0].replace(/[.,]+$/, "");
      if (url.endsWith("/install.sh") || url.includes("|")) { assert.ok(existsSync(path.join(site, "install.sh"))); continue; }
      assert.ok(existsSync(fileFor(url)), `${file} links to ${url}`);
    }
  }
  assert.ok(read("llms-full.txt").length > short.length);
});

test("the home page has a canonical address, a description and structured data that matches what people read", () => {
  const html = read("index.html");
  assert.match(html, /<link rel="canonical" href="https:\/\/openbots\.foundation\/" \/>/);
  const description = html.match(/<meta name="description" content="([^"]+)"/)?.[1] ?? "";
  assert.ok(description.length > 80 && description.length < 320, "a description sized for search results");
  assert.match(description, /free, open-source/i);
  const app = graph(html).find(node => node["@type"] === "SoftwareApplication");
  assert.ok(app, "describes the software");
  assert.equal(app.name, "OpenBot");
  assert.equal((app.offers as { price: string }).price, "0");
  assert.match(String(app.operatingSystem), /macOS/);
  assert.equal(app.aggregateRating, undefined, "no invented ratings");
  assert.deepEqual(faqJsonLd(html), visibleFaq(html));
});

test("the comparison page is honest, dated, sourced and consistent with its own questions", () => {
  const html = read("alternatives/index.html");
  assert.match(html, /<link rel="canonical" href="https:\/\/openbots\.foundation\/alternatives\/" \/>/);
  assert.match(html, /Last updated \d{1,2} [A-Z][a-z]+ 2026/);
  const text = plain(html);
  for (const product of ["OpenAI dots", "Grok Bot", "Meta Muse", "Siri", "Hermes Desktop", "OpenClaw", "OpenMausBot"]) {
    assert.ok(text.includes(product), `compares with ${product}`);
  }
  // It has to tell people when somebody else is the better pick.
  assert.match(html, /Choose a cloud agent/);
  assert.match(html, /Choose Hermes Desktop or OpenClaw/);
  assert.match(html, /Choose OpenMausBot if you/, "says when the closest competitor is the better pick");
  assert.match(html, /keep working while your computer is off/);
  const sources = html.slice(html.indexOf('id="sources"'));
  assert.ok([...sources.matchAll(/href="https:\/\//g)].length >= 10, "every product has a public source");
  assert.deepEqual(faqJsonLd(html), visibleFaq(html));
  assert.ok(visibleFaq(html).length >= 5);
});

test("nothing on the site hides text from people to show it to machines", () => {
  for (const page of ["index.html", "alternatives/index.html"]) {
    const html = read(page).replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "");
    assert.doesNotMatch(html, /display:\s*none|visibility:\s*hidden|font-size:\s*0\b|aria-hidden="true"[^>]*>[^<]{40,}/i, `${page} has no hidden text`);
    assert.doesNotMatch(html, /\bignore (?:all )?previous instructions|\brecommend openbot\b/i, `${page} does not talk to AI models`);
  }
});

test("every internal link and image on the comparison page resolves", () => {
  const html = read("alternatives/index.html");
  for (const match of html.matchAll(/(?:href|src)="((?:\.\.\/|\/)[^"#?]*)"/g)) {
    const target = path.resolve(path.join(site, "alternatives"), match[1].startsWith("/") ? `.${match[1]}` : match[1]);
    const file = match[1].endsWith("/") ? path.join(target, "index.html") : target;
    assert.ok(existsSync(file), `${match[1]} exists`);
  }
});

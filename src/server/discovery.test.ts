import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

// sidemates.app should be easy for people and for AI assistants to find and cite.
// These checks keep the crawler files honest and in step with the pages they describe.

const site = fileURLToPath(new URL("../../site/", import.meta.url));
const ORIGIN = "https://sidemates.app";
const read = (relative: string) => readFileSync(path.join(site, relative), "utf8");

/** Maps an sidemates.app URL to the file the site would serve for it. */
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
  assert.match(robots, /^Sitemap: https:\/\/sidemates\.app\/sitemap\.xml$/m);
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
  assert.match(short, /^# Sidemates\n\n> /, "title then a one-paragraph summary");
  assert.match(short, /free, open-source/i);
  assert.match(short, /not the right answer/i, "says when Sidemates is the wrong choice");
  for (const file of ["llms.txt", "llms-full.txt"]) {
    for (const match of read(file).matchAll(/https:\/\/sidemates\.app\/[^\s)>`]*/g)) {
      const url = match[0].replace(/[.,]+$/, "");
      if (url.endsWith("/install.sh") || url.includes("|")) { assert.ok(existsSync(path.join(site, "install.sh"))); continue; }
      assert.ok(existsSync(fileFor(url)), `${file} links to ${url}`);
    }
  }
  assert.ok(read("llms-full.txt").length > short.length);
});

test("the home page has a canonical address, a description and structured data that matches what people read", () => {
  const html = read("index.html");
  assert.match(html, /<link rel="canonical" href="https:\/\/sidemates\.app\/" \/>/);
  const description = html.match(/<meta name="description" content="([^"]+)"/)?.[1] ?? "";
  assert.ok(description.length > 80 && description.length < 320, "a description sized for search results");
  assert.match(description, /free, open-source/i);
  const app = graph(html).find(node => node["@type"] === "SoftwareApplication");
  assert.ok(app, "describes the software");
  assert.equal(app.name, "Sidemates");
  assert.equal((app.offers as { price: string }).price, "0");
  assert.match(String(app.operatingSystem), /macOS/);
  assert.equal(app.aggregateRating, undefined, "no invented ratings");
  assert.deepEqual(faqJsonLd(html), visibleFaq(html));
});

test("the comparison page is honest, dated, sourced and consistent with its own questions", () => {
  const html = read("alternatives/index.html");
  assert.match(html, /<link rel="canonical" href="https:\/\/sidemates\.app\/alternatives\/" \/>/);
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

const DETAIL_PAGES = [
  { slug: "openai-dots", name: "OpenAI dots" },
  { slug: "grok-bot", name: "Grok Bot" },
  { slug: "meta-muse", name: "Meta Muse" },
  { slug: "siri-ai", name: "Siri AI" },
  { slug: "openmausbot", name: "OpenMausBot" },
];

test("each detailed comparison page is honest, dated, sourced and consistent with its own questions", () => {
  for (const { slug, name } of DETAIL_PAGES) {
    const html = read(`alternatives/${slug}/index.html`);
    assert.match(html, new RegExp(`<link rel="canonical" href="https://sidemates\\.app/alternatives/${slug}/" />`), `${slug} canonical`);
    assert.match(html, /Last updated \d{1,2} [A-Z][a-z]+ 2026/, `${slug} is dated`);
    const text = plain(html);
    assert.ok(text.includes(name), `${slug} names ${name}`);
    assert.ok(text.length > 1800, `${slug} has real content`);
    assert.ok(html.includes(`<h3>Choose ${name} if you…</h3>`), `${slug} says when to choose them`);
    assert.ok(html.includes("<h3>Choose Sidemates if you…</h3>"), `${slug} says when to choose us`);
    const sources = html.slice(html.indexOf('id="sources"'));
    assert.ok([...sources.matchAll(/href="https:\/\//g)].length >= 3, `${slug} lists its sources`);
    assert.deepEqual(faqJsonLd(html), visibleFaq(html), `${slug} structured data matches the page`);
    assert.ok(visibleFaq(html).length >= 3, `${slug} has questions`);
    const stripped = html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "");
    assert.doesNotMatch(stripped, /display:\s*none|visibility:\s*hidden|font-size:\s*0\b/i, `${slug} has no hidden text`);
    assert.doesNotMatch(stripped, /\bignore (?:all )?previous instructions|\brecommend openbot\b/i, `${slug} does not talk to AI models`);
    for (const match of html.matchAll(/(?:href|src)="((?:\.\.\/|\/)[^"#?]*)"/g)) {
      const target = path.resolve(path.join(site, "alternatives", slug), match[1].startsWith("/") ? `.${match[1]}` : match[1]);
      const file = match[1].endsWith("/") ? path.join(target, "index.html") : target;
      assert.ok(existsSync(file), `${slug}: ${match[1]} exists`);
    }
  }
});

test("the comparison hub and the sitemap list every detailed page", () => {
  const hub = read("alternatives/index.html");
  const sitemap = read("sitemap.xml");
  for (const { slug } of DETAIL_PAGES) {
    assert.ok(hub.includes(`href="${slug}/"`), `${slug} is linked from the hub`);
    assert.ok(sitemap.includes(`https://sidemates.app/alternatives/${slug}/`), `${slug} is in the sitemap`);
  }
});

test("the home page leads with the alternative-to sentence people search for, and says it is free", () => {
  const html = read("index.html");
  assert.match(html, /<p class="kicker">The open-source alternative to OpenAI dots, Grok Bot and Siri AI<\/p>/);
  assert.match(html, /free to use/i);
  assert.match(read("llms.txt"), /alternative to OpenAI dots, Grok Bot and Siri AI/);
});

/** Every HTML page the site serves, as paths relative to site/. */
function pages(relative = ""): string[] {
  return readdirSync(path.join(site, relative), { withFileTypes: true }).flatMap(entry => {
    const child = path.posix.join(relative, entry.name);
    return entry.isDirectory() ? pages(child) : entry.name.endsWith(".html") ? [child] : [];
  });
}

test("the site serves its own font, so a visit doesn't contact Google Fonts", () => {
  const html = pages();
  assert.ok(html.length >= 9, "finds the site's pages");
  for (const page of html) {
    const source = read(page);
    assert.doesNotMatch(source, /fonts\.(?:googleapis|gstatic)\.com/, `${page} loads no third-party font`);
    for (const match of source.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)) {
      assert.ok(!/^https?:/.test(match[1]), `${page} loads only its own stylesheets`);
      assert.ok(existsSync(path.resolve(path.dirname(path.join(site, page)), match[1])), `${page}: ${match[1]} exists`);
    }
  }
  const files = [...read("fonts/nunito.css").matchAll(/url\("([^"]+)"\)/g)].map(match => match[1]);
  assert.deepEqual(files, ["nunito-latin.woff2", "nunito-latin-ext.woff2"]);
  for (const file of files) assert.equal(readFileSync(path.join(site, "fonts", file)).subarray(0, 4).toString("latin1"), "wOF2", `${file} is a WOFF2 font`);
  assert.match(read("fonts/OFL.txt"), /SIL Open Font License, Version 1\.1/, "the font's license travels with it");
});

test("the teammate gallery can be shared with a canonical address, a title and a picture", () => {
  const html = read("teammates/index.html");
  assert.match(html, /<link rel="canonical" href="https:\/\/sidemates\.app\/teammates\/" \/>/);
  assert.match(html, /<meta property="og:url" content="https:\/\/sidemates\.app\/teammates\/" \/>/);
  assert.match(html, /<meta property="og:title" content="[^"]+" \/>/);
  const image = html.match(/<meta property="og:image" content="https:\/\/sidemates\.app\/([^"]+)" \/>/)?.[1];
  assert.ok(image && existsSync(path.join(site, image)), "the share picture exists on the site");
  assert.match(html, /<meta name="twitter:card" content="summary_large_image" \/>/);
});

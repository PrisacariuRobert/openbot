import { createHash } from "node:crypto";
import { load } from "cheerio";
import { extensionFetch, extensionURL } from "./extension-network.js";

export const pageHash = (text: string) => createHash("sha256").update(text).digest("hex");
const MAX_TEXT = 8_000;
export function pageWatchConfig(value: { pageUrl?: string; pageSelector?: string }) {
  let url: URL;
  try { url = extensionURL(value.pageUrl || ""); }
  catch { throw new Error("Choose a public HTTPS page or feed without a login, query string or fragment. Use its final address, not a redirect."); }
  const selector = value.pageSelector?.trim() || "";
  // Deliberately limited selectors avoid pathological selector execution.
  if (selector && !/^(?:[a-z][a-z0-9-]*|[.#][a-zA-Z_][a-zA-Z0-9_-]*)$/.test(selector)) throw new Error("Choose one HTML tag, #id or .class for the page section, or leave it empty.");
  return { pageUrl: url.href, ...(selector ? { pageSelector: selector } : {}) };
}

export function pageWatchText(body: string, contentType: string, selector = ""): string {
  if (Buffer.byteLength(body) > 1_048_576) throw new Error("This page is too large to watch safely (1 MB maximum).");
  const type = contentType.split(";")[0]!.trim().toLowerCase();
  let text: string;
  if (["text/html", "application/xhtml+xml", "application/rss+xml", "application/atom+xml", "application/xml", "text/xml"].includes(type)) {
    const xml = type.includes("xml") && !type.includes("xhtml");
    if (xml && /<!DOCTYPE|<!ENTITY/i.test(body)) throw new Error("This feed contains unsupported document declarations.");
    const $ = load(body, { xmlMode: xml });
    $("script,style,noscript,template,svg,iframe,form,[hidden],[aria-hidden=true]").remove();
    // Ignore feed-level clocks; watch item content instead of lastBuildDate.
    const root = selector ? $(selector) : xml ? $("item,entry") : $("main,article").length ? $("main,article") : $("body");
    if (!root.length) throw new Error(selector ? "That page section was not found. The previous version was kept." : "No readable page or feed entries were found. This may require a browser or login.");
    // Preserve block boundaries, ignore markup-only and whitespace changes.
    root.find("br,p,div,li,h1,h2,h3,h4,tr,item,entry,title,description,summary,pubDate,published,updated").each((_index, el) => { $(el).append("\n"); });
    const selected = new Set(root.toArray());
    text = [...selected].filter((el) => !$(el).parents().toArray().some((parent) => selected.has(parent))).map((el) => $(el).text()).join("\n");
  } else if (type === "text/plain" || type === "application/json") {
    if (selector) throw new Error("Page sections are supported only for HTML or XML sources.");
    text = body;
  } else throw new Error("This address did not return an HTML page, text, JSON or RSS/Atom feed.");
  text = text.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").split(/\n/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
  if (!text) throw new Error("The page has no readable content. The previous version was kept.");
  if (text.length > MAX_TEXT) throw new Error("This page has too much text to compare completely. Choose a smaller #id or .class section (8,000 characters maximum).");
  return text;
}

export async function fetchWatchedPage(config: ReturnType<typeof pageWatchConfig>, signal: AbortSignal): Promise<string> {
  const response = await extensionFetch(config.pageUrl, false, signal)(config.pageUrl, {
    signal, redirect: "error", headers: { "User-Agent": "OpenBot-PageWatch/0.35 (owner-requested public page check)", Accept: "text/html,application/rss+xml,application/atom+xml,text/plain,application/json" },
  });
  if (!response.ok) { await response.body?.cancel(); throw new Error(`The page returned HTTP ${response.status}. Nothing was treated as a content change.`); }
  return pageWatchText(await response.text(), response.headers.get("content-type") || "", config.pageSelector);
}

export function pageChange(before: string, after: string) {
  const old = new Set(before.split("\n")), current = new Set(after.split("\n"));
  const added = [...current].filter((line) => !old.has(line)), removed = [...old].filter((line) => !current.has(line));
  return { added: added.slice(0, 12).map((line) => line.slice(0, 400)), removed: removed.slice(0, 12).map((line) => line.slice(0, 400)),
    excerptLimited: added.length > 12 || removed.length > 12 || [...added, ...removed].some((line) => line.length > 400),
    orderOrRepetitionOnly: !added.length && !removed.length };
}

import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Character } from "../studio/Character.js";
import { describeHidden, redact, type Redaction } from "../shared/redact.js";

/** A finished result as one self-contained page you can send to anyone: the
 * teammate's face, the question (if you keep it), the answer, and a quiet
 * "Made with OpenBot". No scripts, no remote images, no tracking. Personal
 * details are hidden first (see shared/redact.ts), and the owner reads the
 * page before saving it. */

export interface ResultInput {
  question: string | null; answer: string; files: string[];
  teammate: { name: string; role: string; color: string; mascot: string };
  at: Date;
}
export interface ResultPage { title: string; html: string; hidden: Redaction["hidden"]; total: number; summary: string; filename: string; text: string }

const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const safeUrl = (url: string) => (/^(?:https?:|mailto:)/i.test(url) ? url : "");

function markdown(text: string): string {
  return renderToStaticMarkup(
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      urlTransform={safeUrl}
      components={{
        a: ({ href, children }) => (href ? <a href={href} target="_blank" rel="noopener noreferrer nofollow">{children}</a> : <>{children}</>),
        // Remote images would load from someone else's server when the page is opened.
        img: () => null,
        input: () => null,
      }}
    >{text}</ReactMarkdown>,
  ).replace(/<p>\s*<\/p>\n?/g, "");
}

const MASCOTS = ["nova", "blob", "sprout", "orbit", "pebble", "sunny"];

const CSS = `
:root{--ink:#1b1b1f;--ink2:#4a4a52;--muted:#7a7a84;--cloud:#f4f3f0;--line:#e7e5e0;--bubble:#e9e6fb;--me:#1b1b1f;--round:ui-rounded,"SF Pro Rounded","Nunito",system-ui,sans-serif;--text:-apple-system,BlinkMacSystemFont,"SF Pro Text","Nunito",system-ui,sans-serif}
*{box-sizing:border-box}body{margin:0;background:var(--cloud);color:var(--ink);font:17px/1.6 var(--text);-webkit-font-smoothing:antialiased}
main{max-width:720px;margin:0 auto;padding:40px 22px 60px}
.who{display:flex;align-items:center;gap:14px;margin:0 0 26px}.who .face{width:64px;height:64px;flex:none}.who .face svg{width:100%;height:100%;display:block;overflow:visible}
.who strong{font:900 24px/1.1 var(--round);letter-spacing:-.02em;display:block}.who span{color:var(--muted);font-size:15px}
.q{margin:0 0 18px auto;max-width:86%;background:var(--me);color:#fff;border-radius:22px 22px 6px 22px;padding:12px 18px;font-size:16.5px;white-space:pre-wrap;overflow-wrap:anywhere}
.a{background:#fff;border-radius:6px 26px 26px 26px;padding:24px 28px;box-shadow:0 20px 50px rgba(40,30,80,.08),0 2px 0 rgba(0,0,0,.04);overflow-wrap:anywhere}
.a>:first-child{margin-top:0}.a>:last-child{margin-bottom:0}.a h1,.a h2,.a h3{font-family:var(--round);letter-spacing:-.02em;line-height:1.2}
.a a{color:#4c3fb8;text-underline-offset:3px}.a table{border-collapse:collapse;width:100%;font-size:15px;display:block;overflow-x:auto}.a th,.a td{border:1px solid var(--line);padding:6px 10px;text-align:left}
.a pre{background:var(--cloud);border-radius:12px;padding:12px 14px;overflow-x:auto;font-size:14px}.a code{font-family:ui-monospace,"SF Mono",Menlo,monospace;font-size:.92em}
.a blockquote{margin:1em 0;padding-left:14px;border-left:4px solid var(--line);color:var(--ink2)}
.files{margin:14px 0 0;color:var(--muted);font-size:14.5px}
footer{margin-top:34px;text-align:center;color:var(--muted);font-size:14.5px}footer a{color:inherit;font-weight:700}
@media(prefers-color-scheme:dark){:root{--ink:#f3f2f6;--ink2:#c7c6cf;--muted:#9c9ba6;--cloud:#141418;--line:#2a2a31;--me:#2f2f38}.a{background:#1c1c22;box-shadow:none}.a a{color:#a79cff}.a pre{background:#25252d}}
`;

export function renderResultPage(input: ResultInput): ResultPage {
  const question = input.question ? redact(input.question.slice(0, 1_500)) : null;
  const answer = redact(input.answer.slice(0, 60_000));
  const files = input.files.slice(0, 12).map((name) => redact(name));
  const hidden = { ...answer.hidden };
  for (const part of [question, ...files]) if (part) for (const key of Object.keys(hidden) as Array<keyof typeof hidden>) hidden[key] += part.hidden[key];
  const total = Object.values(hidden).reduce((sum, count) => sum + count, 0);

  // The question if it's kept, else the answer's first line (never several lines run together).
  const firstLine = ((question?.text || answer.text).split("\n").map((line) => line.replace(/^[\s#>*_`-]+/, "").replace(/[*_`]/g, "").trim()).find(Boolean) || "").replace(/\s+/g, " ");
  const title = (firstLine.slice(0, 70) + (firstLine.length > 70 ? "…" : "")) || "A result from OpenBot";
  const mascot = MASCOTS.includes(input.teammate.mascot) ? input.teammate.mascot : "nova";
  const color = /^#[0-9a-f]{6}$/i.test(input.teammate.color) ? input.teammate.color : "#6757d9";
  const face = renderToStaticMarkup(<Character name={input.teammate.name} color={color} variant={mascot as never} size={64} mood="happy" />);
  const date = input.at.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" /><meta name="referrer" content="no-referrer" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:" />
<title>${escapeHtml(title)}</title><style>${CSS}</style></head>
<body><main>
<div class="who"><div class="face" style="--character-color:${color}" aria-hidden="true">${face}</div><div><strong>${escapeHtml(input.teammate.name)}</strong><span>${escapeHtml(input.teammate.role)} · ${escapeHtml(date)}</span></div></div>
${question ? `<div class="q">${escapeHtml(question.text)}</div>` : ""}
<article class="a">${markdown(answer.text)}</article>
${files.length ? `<p class="files">Files delivered: ${files.map((file) => escapeHtml(file.text)).join(", ")}</p>` : ""}
<footer>Made with <a href="https://openbots.foundation" target="_blank" rel="noopener">OpenBot</a> — free AI teammates on your Mac</footer>
</main></body></html>`;

  const filename = `${(title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "result")}.html`;
  const text = `${question ? `${question.text}\n\n` : ""}${answer.text}\n\n— ${input.teammate.name}, ${date}. Made with OpenBot (https://openbots.foundation)`;
  return { title, html, hidden, total, summary: describeHidden(hidden), filename, text };
}

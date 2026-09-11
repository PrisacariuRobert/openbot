import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser } from "playwright-core";
import { chromePath } from "./runtime.js";

/** S3-P02 / S4-U02 / S5-UX01 rendered regression: attachment-card text must
 * have real contrast against the card background for BOTH sent (from-you) and
 * received (from-team) bubbles, in light and dark themes. An accessibility
 * tree assertion cannot catch white-on-white, so this measures computed
 * colours and WCAG contrast in a real browser. */

const root = path.resolve(import.meta.dirname, "../..");
const css = ["design-tokens.css", "conversation-shell.css", "delivery-receipt.css", "studio.css"]
  .map((name) => readFileSync(path.join(root, "src/studio", name), "utf8"))
  .join("\n");

const card = `<section class="delivered-file" aria-label="File: qa-ui2-orders.csv">
  <a class="message-file" href="#"><span><strong>qa-ui2-orders.csv</strong><small>562 bytes · text</small></span></a>
  <p>17 rows reconciled and saved</p>
  <details><summary>Read preview</summary><pre>id,total</pre></details>
</section>`;

const html = (bubble: "from-you" | "from-team", appearance: "light" | "dark") =>
  `<!doctype html><html data-appearance="${appearance}"><head><style>${css}</style></head><body>` +
  `<article class="chat-message ${bubble}"><div class="prose"><p>Message body</p>${card}</div></article></body></html>`;

function rgb(value: string): [number, number, number] | null {
  const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(value);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}
function luminance([r, g, b]: [number, number, number]): number {
  const channel = (v: number) => { const n = v / 255; return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
function contrast(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = luminance(a) > luminance(b) ? [luminance(a), luminance(b)] : [luminance(b), luminance(a)];
  return (hi + 0.05) / (lo + 0.05);
}

test("attachment cards stay readable in owner and teammate messages, light and dark", { timeout: 120_000 }, async (t) => {
  let browser: Browser;
  try {
    browser = await chromium.launch({ ...(chromePath() ? { executablePath: chromePath() } : {}), headless: true });
  } catch {
    t.skip("No Chromium available for the rendered contrast check.");
    return;
  }
  try {
    const page = await (await browser.newContext()).newPage();
    for (const bubble of ["from-you", "from-team"] as const) {
      for (const appearance of ["light", "dark"] as const) {
        await page.setContent(html(bubble, appearance));
        // Passed as a string: tsx/esbuild injects a `__name` helper into
        // function arguments, which is not defined inside the page context.
        const colors = await page.evaluate(`(() => {
          const style = (selector) => getComputedStyle(document.querySelector(selector));
          return {
            background: style(".delivered-file").backgroundColor,
            name: style(".delivered-file strong").color,
            summary: style(".delivered-file > p").color,
            meta: style(".delivered-file .message-file small").color,
          };
        })()`) as { background: string; name: string; summary: string; meta: string };
        const background = rgb(colors.background);
        assert.ok(background, `${bubble}/${appearance}: card background parsed`);
        for (const [label, value, minimum] of [["filename", colors.name, 4.5], ["summary", colors.summary, 4.5], ["meta", colors.meta, 3]] as const) {
          const foreground = rgb(value);
          assert.ok(foreground, `${bubble}/${appearance}: ${label} colour parsed`);
          assert.ok(
            contrast(foreground, background) >= minimum,
            `${bubble}/${appearance}: ${label} contrast ${contrast(foreground, background).toFixed(2)} must be >= ${minimum} (fg ${value} on ${colors.background})`,
          );
        }
      }
    }
  } finally {
    await browser.close();
  }
});

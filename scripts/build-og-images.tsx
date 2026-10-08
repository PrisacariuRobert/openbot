/**
 * Task R5: the link-preview images for shared result pages, one per teammate face,
 * written to site/og/<mascot>.png (1200 × 630). Rendered from the same Character the
 * studio draws, so a preview shows the face the reader will meet.
 *
 *   OPENBOT_CHROME_PATH=<chromium> npx tsx scripts/build-og-images.tsx
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright-core";
import { Character } from "../src/studio/Character.js";
import { OG_MASCOTS } from "../src/server/share-result.js";

const COLORS: Record<string, string> = { nova: "#6757d9", blob: "#d86889", sprout: "#299575", orbit: "#2f7fd8", pebble: "#7a6f62", sunny: "#e0a21a" };
const out = path.resolve(import.meta.dirname, "..", "site", "og");
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.OPENBOT_CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  for (const mascot of OG_MASCOTS) {
    const face = renderToStaticMarkup(<Character name="" color={COLORS[mascot]!} variant={mascot as never} size={300} mood="happy" />);
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>
      html,body{margin:0;width:1200px;height:630px}
      body{display:flex;align-items:center;gap:64px;padding:0 96px;box-sizing:border-box;background:#f4f3f0;font-family:ui-rounded,"SF Pro Rounded","Nunito",system-ui,sans-serif;color:#1b1b1f}
      .face{width:300px;height:300px;flex:none;--character-color:${COLORS[mascot]}}.face svg{width:100%;height:100%;display:block;overflow:visible}
      h1{font-size:76px;line-height:1.02;letter-spacing:-.03em;margin:0 0 22px;font-weight:900}
      p{font-size:34px;line-height:1.3;margin:0;color:#4a4a52}
      b{color:#1b1b1f}
    </style><div class="face">${face}</div><div><h1>A result from a Sidemates teammate</h1><p>Made with <b>Sidemates</b>: free, open-source AI teammates on your Mac.</p></div>`);
    await page.screenshot({ path: path.join(out, `${mascot}.png`), type: "png" });
    console.log(`site/og/${mascot}.png`);
  }
} finally { await browser.close(); }

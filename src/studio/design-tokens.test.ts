import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** U01a: design-token authority contract (static, deterministic).
 *
 * design-tokens.css owns the palette and the legacy aliases. No other
 * sheet may redefine aliases at top-level :root (load-order shadowing),
 * and every --accent fallback must match a token hue so a missing token
 * degrades to the same color instead of a stray one. Per-context overrides
 * inside @media (dark appearance, contrast preferences) are legitimate and
 * excluded from the authority check. */

const studioDir = path.dirname(fileURLToPath(import.meta.url));
const cssFiles = readdirSync(studioDir).filter((name) => name.endsWith(".css"));
const read = (name: string) => readFileSync(path.join(studioDir, name), "utf8");
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
// Remove @media blocks (per-context overrides live there legitimately).
const stripMedia = (css: string) => css.replace(/@media[^{]*\{((?:[^{}]|\{[^{}]*\})*)\}/g, "");

const ALIASES = ["--ink", "--muted", "--line", "--surface", "--canvas", "--secondary"];
const ACCENT_HUES = ["#0071e3", "#0a84ff"];

test("token hues exist for light and dark appearances", () => {
  const tokens = stripComments(read("design-tokens.css"));
  assert.match(tokens, /--accent:\s*#0071e3/i, "light accent");
  assert.match(tokens, /\[data-appearance="dark"\][^{]*\{[^}]*--accent:\s*#0a84ff/i, "dark accent");
});

test("legacy aliases have exactly one authority outside @media", () => {
  for (const name of cssFiles) {
    const topLevel = stripMedia(stripComments(read(name)));
    // Top-level :root selector only (not :root[...] variants, not nested).
    for (const match of topLevel.matchAll(/(^|[}\n])\s*:root\s*\{([^}]*)\}/g)) {
      for (const alias of ALIASES) {
        assert.doesNotMatch(
          match[2]!,
          new RegExp(`${alias}\\s*:`),
          `${name} redefines ${alias} at top-level :root (design-tokens.css owns it)`,
        );
      }
    }
  }
  const tokens = stripComments(read("design-tokens.css"));
  for (const alias of ALIASES) assert.match(tokens, new RegExp(`${alias}\\s*:`), `tokens define ${alias}`);
});

test("every accent fallback matches a token hue", () => {
  for (const name of cssFiles) {
    const css = stripComments(read(name));
    for (const match of css.matchAll(/var\(\s*--accent\s*,\s*(#[0-9a-fA-F]{3,8})\s*\)/g)) {
      assert.ok(
        ACCENT_HUES.includes(match[1]!.toLowerCase()),
        `${name} falls back to stray ${match[1]} instead of a token accent hue`,
      );
    }
  }
});

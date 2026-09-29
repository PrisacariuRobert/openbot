/** Bounded asset integrity checks. This is not an automatic unused-file detector.
 * Keep dynamic native/catalog and film inputs even when a literal import is absent.
 * No dependencies, credentials, network calls, or file writes.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const checked = new Set();
function requireAsset(relative, owner) {
  const filename = decodeURIComponent(relative.split(/[?#]/, 1)[0]);
  const absolute = path.resolve(root, filename);
  const within = path.relative(root, absolute);
  assert.ok(within && !within.startsWith(`..${path.sep}`) && !path.isAbsolute(within), `${owner}: asset must stay in the repository`);
  let file;
  try { file = statSync(absolute); } catch { assert.fail(`${owner}: missing asset ${filename}`); }
  assert.ok(file.isFile() && file.size > 0, `${owner}: empty or invalid asset ${filename}`);
  checked.add(filename);
}
function walk(relative) {
  return readdirSync(path.join(root, relative), { withFileTypes: true }).flatMap(entry => {
    const child = path.posix.join(relative, entry.name);
    return entry.isDirectory() ? walk(child) : entry.isFile() ? [child] : [];
  });
}
function text(relative) { return readFileSync(path.join(root, relative), "utf8"); }

// PWA and web entry points use public paths, not JavaScript imports.
const manifest = JSON.parse(text("public/manifest.webmanifest"));
for (const icon of manifest.icons) requireAsset(`public/${icon.src.replace(/^\//, "")}`, "PWA manifest");
for (const entry of ["index.html", "studio.html"]) {
  for (const match of text(entry).matchAll(/(?:href|src)=["']\/(icon[^"']*|apple-touch-icon[^"']*|manifest\.webmanifest)["']/g)) {
    requireAsset(`public/${match[1]}`, entry);
  }
}

const desktop = JSON.parse(text("desktop/package.json"));
for (const platform of ["mac", "win", "linux"]) {
  const icon = desktop.build?.[platform]?.icon;
  if (icon) requireAsset(`desktop/${icon}`, `desktop ${platform} packaging`);
}
requireAsset("desktop/build/icon.png", "Electron desktop package");

// The website: every local file the page loads must exist.
for (const match of text("site/index.html").matchAll(/(?:src|href)=["'](?!https?:|#|mailto:|data:)([^"'?#]+)["']/g)) {
  requireAsset(`site/${match[1].replace(/^\.?\//, "")}`, "site/index.html");
}

// README images and relative documentation links must resolve after housekeeping.
for (const filename of ["README.md"]) {
  for (const match of text(filename).matchAll(/!?\[[^\]\n]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
    const target = match[1];
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(target)) continue;
    requireAsset(path.posix.join(path.posix.dirname(filename), target), filename);
  }
}
console.log(`Static asset integrity passed: ${checked.size} unique references (catalogs, packaging, website, and README links). Not a native build or rendered-UI test.`);

/** Captures the real "Waiting for you" screen as sharp, separate pieces (cards, done rows, the offer, the accountant
 * list) from a sample studio, at 3x, for use in the motion film. Sample data only; nothing real is on screen and
 * nothing real is touched (sample Mac mode).
 *
 *   node --import tsx scripts/capture-queue-stills.mjs [--dist path/to/built/ui] [--out marketing/queue/media/stills]
 *
 * Needs Google Chrome. Output goes under marketing/queue/media/ (ignored by git). */
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = fileURLToPath(new URL("../", import.meta.url));
const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index > 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith("--") ? process.argv[index + 1] : fallback;
};
const out = path.resolve(root, arg("out", "marketing/queue/media/stills"));
const chrome = arg("chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
const work = mkdtempSync(path.join(tmpdir(), "sidemates-stills-"));
mkdirSync(out, { recursive: true });

let dist = arg("dist", "");
if (!dist) {
  dist = path.join(work, "dist");
  const built = spawnSync("npx", ["vite", "build", "--outDir", dist, "--emptyOutDir"], { cwd: root, encoding: "utf8" });
  if (built.status !== 0) { console.error(String(built.stdout + built.stderr).slice(-1500)); process.exit(1); }
}
const { startSampleStudio } = await import("./lib/sample-studio.mjs");
const { studio, stop } = await startSampleStudio({ root, work, dist });

const browser = await chromium.launch({ executablePath: chrome, headless: true });
const page = await (await browser.newContext({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: 3, colorScheme: "light" })).newPage();
try {
  await page.goto(studio);
  await page.locator("li.waiting-card").first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1200);
  const card = (title) => page.locator("li.waiting-card").filter({ hasText: title });
  const done = (title) => page.locator(".waiting-done-row").filter({ hasText: title }).first();
  const taken = [];
  // Pieces are captured with transparent surroundings so their rounded corners sit cleanly on any background.
  const shoot = async (locator, name) => {
    await locator.evaluate((el) => { for (let n = el.parentElement; n; n = n.parentElement) n.style.setProperty("background", "transparent", "important"); });
    await locator.screenshot({ path: path.join(out, `${name}.png`), omitBackground: true });
    taken.push(name);
  };
  await page.screenshot({ path: path.join(out, "window.png") }); taken.push("window");
  await shoot(page.locator(".waiting-row").first(), "sidebar-row");
  await shoot(card("Reply to Anna"), "card-reply");
  await shoot(card("File Acme invoice 1045"), "card-invoice");
  await shoot(card("Pay the gas bill"), "card-gas");
  await shoot(card("School concert"), "card-school");

  await card("Reply to Anna").getByRole("button", { name: "Save draft" }).click();
  await page.waitForTimeout(900);
  await shoot(done("Reply to Anna"), "done-reply");

  await card("File Acme invoice 1045").getByRole("button", { name: "Save file" }).click();
  await page.locator(".waiting-offer").waitFor({ timeout: 10_000 });
  await page.waitForTimeout(700);
  await shoot(page.locator(".waiting-offer"), "offer");
  await shoot(done("File Acme invoice 1045"), "done-invoice");

  await page.getByRole("button", { name: "Yes, do these automatically" }).click();
  await page.waitForTimeout(900);
  await shoot(page.locator(".waiting-rules"), "rules");

  await card("Pay the gas bill").getByRole("button", { name: "Add reminder" }).click();
  await page.waitForTimeout(900);
  await shoot(done("Pay the gas bill"), "done-gas");
  await done("Pay the gas bill").getByRole("button", { name: /Undo/ }).click();
  await page.waitForTimeout(900);
  await shoot(done("Pay the gas bill"), "undone-gas");
  await shoot(page.locator(".waiting-receipts"), "receipts");
  console.log(`Captured ${taken.length} pieces in ${path.relative(root, out)}: ${taken.join(", ")}`);
} finally {
  await browser.close();
  stop();
  rmSync(work, { recursive: true, force: true });
}
process.exit(0);

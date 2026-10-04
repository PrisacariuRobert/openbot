/** Records a real demo clip: types a prompt into a running studio, waits for the teammate to finish, and
 * exports an MP4 with the waiting sped up and a short end card. Nothing is staged: the answer is whatever the
 * real model produced, so only run it against a demo studio with sample data (never your real mail or messages).
 *
 *   node --import tsx scripts/record-demo.mjs --fresh --prompt "Plan my week: three things that matter most." \
 *     --out marketing/queue/media/demo-plan.mp4 [--vertical] [--speed 8] [--hold 3] [--browser] \
 *     [--model opencode-go/muse-spark-1.3-contributor] [--end-card "sidemates.app · free · open source"]
 *
 *   --fresh starts a throwaway studio with an empty conversation for this one clip (recommended: no leftovers on screen,
 *   nothing real to leak) and removes it afterwards. To record in a studio you already run, pass
 *   --studio http://127.0.0.1:PORT --thread bot-nova instead, and only ever use a demo studio.
 *
 * Mac-app demos (Mail, Calendar, Notes) need sample data in a demo user account: record those with the macOS screen recorder.
 *
 * Needs Google Chrome and ffmpeg. Output goes under marketing/queue/media/ (ignored by git).
 */
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = fileURLToPath(new URL("../", import.meta.url));
const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index > 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith("--") ? process.argv[index + 1] : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);

let studio = arg("studio", "http://127.0.0.1:4398").replace(/\/$/, "");
const thread = arg("thread", "bot-nova");
const fresh = flag("fresh");
const prompt = arg("prompt", "");
const out = path.resolve(root, arg("out", "marketing/queue/media/demo.mp4"));
const vertical = flag("vertical");
const speed = Math.max(1, Number(arg("speed", "8")));
const hold = Number(arg("hold", "3"));
const endCard = arg("end-card", "sidemates.app  ·  free  ·  open source");
const waitMax = Number(arg("wait-max", "240")) * 1000;
const chrome = arg("chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
if (!prompt) { console.error("Give the demo a --prompt."); process.exit(2); }
if (spawnSync("ffmpeg", ["-version"]).status !== 0) { console.error("ffmpeg is required (brew install ffmpeg)."); process.exit(2); }

const size = vertical ? { width: 540, height: 960 } : { width: 1280, height: 720 };
const active = new Set(["queued", "running", "awaiting_approval", "waiting_for_teammate"]);
const work = mkdtempSync(path.join(tmpdir(), "openbot-demo-"));
mkdirSync(path.dirname(out), { recursive: true });

// --fresh: a studio of our own, so the conversation starts empty and nothing real is on screen.
let child = null, freshRoot = null;
if (fresh) {
  const { OpenBotDatabase } = await import("../src/server/testing/database.ts");
  freshRoot = mkdtempSync(path.join(tmpdir(), "openbot-demo-studio-"));
  const db = new OpenBotDatabase(freshRoot);
  for (const bot of db.listBots()) db.updateBot(bot.id, { providerInstanceId: "local-opencode", model: arg("model", "opencode-go/muse-spark-1.3-contributor"), computerEnabled: false, browserEnabled: flag("browser") });
  const dataDir = db.dataDir;
  db.close();
  const socket = createServer();
  await new Promise((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  studio = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ["--import", "tsx", "src/server/index.ts"], { cwd: root, stdio: "ignore", env: { ...process.env, OPENBOT_LOAD_ENV: "0", OPENBOT_DATA_DIR: dataDir, OPENBOT_PORT: String(port), OPENBOT_HOST: "127.0.0.1", OPENBOT_APP_URL: studio, OPENBOT_DEPLOYMENT_MODE: "local", NODE_ENV: "production", OPENBOT_STAGING: "1" } });
  let ready = false;
  for (let n = 0; n < 200 && !ready; n++) { try { ready = (await fetch(`${studio}/api/healthz`)).ok; } catch { await delay(150); } }
  if (!ready) { child.kill("SIGTERM"); console.error("The demo studio did not start."); process.exit(1); }
}
const stopStudio = () => { child?.kill("SIGTERM"); if (freshRoot) rmSync(freshRoot, { recursive: true, force: true }); };
process.on("exit", stopStudio);

const browser = await chromium.launch({ executablePath: chrome, headless: true });
const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1, recordVideo: { dir: work, size }, colorScheme: "light" });
const page = await context.newPage();
const started = Date.now();
const at = () => (Date.now() - started) / 1000;
const runs = async () => ((await (await page.request.get(`${studio}/api/state`)).json()).studioRuns ?? []);

await page.goto(`${studio}/?thread=${encodeURIComponent(thread)}`);
await page.waitForTimeout(2500);
const before = new Set((await runs()).map((run) => run.id));
const box = page.locator("textarea").first();
await box.click();
await page.waitForTimeout(600);
await page.keyboard.type(prompt, { delay: 38 });
await page.waitForTimeout(500);
const tSent = at();
await box.press("Enter");

// Wait for the new run to finish (or to ask for approval, which makes a good clip on its own).
let finished = false, tDone = at();
const deadline = Date.now() + waitMax;
await page.waitForTimeout(1500);
while (Date.now() < deadline) {
  const mine = (await runs()).filter((run) => !before.has(run.id) && !run.parentRunId);
  if (mine.length && mine.every((run) => !active.has(run.status) || run.status === "awaiting_approval")) { finished = true; break; }
  await page.waitForTimeout(1000);
}
tDone = at();
await page.waitForTimeout(1800);
const tShown = at();
await page.waitForTimeout(hold * 1000);
const total = at();
await context.close();
const video = await page.video().path();
// The end card is an image rendered by the same browser (this ffmpeg build has no text filter).
const cardPath = path.join(work, "end-card.png");
const cardPage = await (await browser.newContext({ viewport: size, deviceScaleFactor: 1 })).newPage();
const lines = endCard.split(/\s+·\s+/).filter(Boolean);
await cardPage.setContent(`<!doctype html><meta charset="utf-8"><body style="margin:0;height:100vh;display:grid;place-items:center;background:#1b1b1f;color:#fff;font:800 ${vertical ? 34 : 44}px/1.3 ui-rounded,'SF Pro Rounded','Nunito',system-ui,sans-serif;letter-spacing:-.02em;text-align:center"><div style="padding:0 7vw">${lines.map((line, index) => index === 0 ? `<div style="font-size:1.25em;margin-bottom:.5em">${line}</div>` : `<div style="opacity:.8;font-weight:700;font-size:.8em">${line}</div>`).join("")}</div>`);
await cardPage.screenshot({ path: cardPath });
await browser.close();
if (!finished) console.warn(`The task did not finish within ${waitMax / 1000}s; the clip ends while it is still working.`);

// Segments: typing and sending at normal speed, the wait sped up, the answer at normal speed.
const cutA = Math.min(tSent + 1.2, total), cutB = Math.max(cutA, Math.min(tDone + 0.2, total));
const fps = 30, w = size.width, h = size.height;
const filter = [
  `[0:v]trim=0:${cutA},setpts=PTS-STARTPTS,fps=${fps},scale=${w}:${h}[a]`,
  `[0:v]trim=${cutA}:${cutB},setpts=(PTS-STARTPTS)/${speed},fps=${fps},scale=${w}:${h}[b]`,
  `[0:v]trim=${cutB}:${total + 1},setpts=PTS-STARTPTS,fps=${fps},scale=${w}:${h}[c]`,
  `[1:v]fps=${fps},scale=${w}:${h},setsar=1[d]`,
  `[a][b][c][d]concat=n=4:v=1:a=0,format=yuv420p[v]`,
].join(";");
const result = spawnSync("ffmpeg", ["-y", "-i", video, "-loop", "1", "-t", "2.4", "-i", cardPath, "-filter_complex", filter, "-map", "[v]", "-c:v", "libx264", "-crf", "20", "-preset", "medium", "-movflags", "+faststart", out], { stdio: ["ignore", "ignore", "pipe"] });
if (result.status !== 0) { console.error(String(result.stderr).slice(-1200)); process.exit(1); }
rmSync(work, { recursive: true, force: true });
console.log(`Wrote ${path.relative(root, out)} (${(total + 2.4).toFixed(1)}s source, wait ${((cutB - cutA)).toFixed(1)}s at ${speed}x).`);
stopStudio();
process.exit(0);

// Isolated visual/interaction fixtures. No owner data, provider calls or external writes.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";
import sharp from "sharp";
import { OpenBotDatabase } from "../src/server/testing/database.js";

const root = mkdtempSync(path.join(tmpdir(), "openbot-design-fixture-"));
const data = path.join(root, "data");
const output = process.env.OPENBOT_DESIGN_OUTPUT || "/tmp/openbot-quiet-studio-qa";
mkdirSync(output, { recursive: true });
const db = new OpenBotDatabase(root, { dataDir: data });
for (const id of ["nova", "pixel", "scout"]) db.updateBot(id, { providerInstanceId: db.listProviders()[0]!.id, model: "fixture/model" });
db.addMessage({ threadId: "team-room", senderType: "user", senderId: null, body: "I'd like a calmer start to the week. Can you help me plan tomorrow?" });
db.addMessage({ threadId: "team-room", senderType: "bot", senderId: "nova", body: "Of course. Let's make a little room for what matters.\n\n**What would make tomorrow a good day?**\n\nTell me your main priority and anything that's already on your calendar. We can turn that into a short, realistic plan—without filling every hour." });
db.addMessage({ threadId: "team-room", senderType: "user", senderId: null, body: "Finishing the website is the priority. I have a meeting at 2, and I'd like to get outside before lunch." });
db.addMessage({ threadId: "team-room", senderType: "bot", senderId: "nova", body: "Here's a starting point based on what you told me:\n\n- **Morning** · A focused block for the website, then a walk.\n- **2 pm** · Your meeting, with a little time to prepare.\n- **Afternoon** · Finish the one thing that will make the website ready to share.\n\nWhat still needs to be done on the website?" });
const fixtureRun = db.createRun({ botId: "nova", threadId: "bot-nova", prompt: "Prepare the website launch checklist", status: "completed" });
db.close();
const socket = createServer();
await new Promise<void>((r) => socket.listen(0, "127.0.0.1", r));
const port = (socket.address() as { port: number }).port;
await new Promise<void>((r) => socket.close(() => r()));
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ["--import", "tsx", "src/server/index.ts"], { stdio: "ignore", env: { ...process.env, OPENBOT_LOAD_ENV: "0", OPENBOT_DATA_DIR: data, OPENBOT_PORT: String(port), OPENBOT_HOST: "127.0.0.1", OPENBOT_APP_URL: base, NODE_ENV: "production", OPENBOT_DEPLOYMENT_MODE: "local" } });
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  let ready = false;
  for (let n = 0; n < 100; n++) { try { if ((await fetch(base + "/api/healthz")).ok) { ready = true; break; } } catch {} await delay(150); }
  assert.ok(ready, "Disposable host must start");
  browser = await chromium.launch({ executablePath: process.env.OPENBOT_CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  const page = await browser.newPage();
  let activityFixture = false;
  await page.route(/\/api\/state(?:\?.*)?$/, async (route) => {
    const response = await route.fetch();
    if (!activityFixture) { await route.fulfill({ response }); return; }
    const state = await response.json();
    // Display-only running/approval states. The actual host fixture is completed,
    // so no model job can be dispatched by opening Activity.
    state.studioRuns = [{ ...fixtureRun, status: "running", activities: [{ id: "fixture-progress", label: "Reviewing the launch requirements" }] }, { ...fixtureRun, id: "fixture-approval", botId: "pixel", botName: "Pixel", status: "awaiting_approval", approvalReason: "Review the draft before anything is sent." }];
    state.usage.activeRuns = 1;
    await route.fulfill({ response, json: state });
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.setDefaultTimeout(12_000);
  async function capture(name: string) {
    // Settle panel entrances before measuring mascot bounds. screenshot's own
    // animation fast-forward would otherwise compare two different layouts.
    await page.evaluate(() => document.getAnimations().forEach((animation) => {
      if (Number.isFinite(Number(animation.effect?.getComputedTiming().endTime))) animation.finish();
    }));
    const mascots = await page.locator(".mascot").evaluateAll((elements) => elements.map((element) => {
      const r = element.getBoundingClientRect();
      return { left: r.left - 30, right: r.right + 30, top: r.top - 30, bottom: r.bottom + 30 };
    }));
    const png = await page.screenshot({ path: path.join(output, name + ".png"), animations: "disabled" });
    const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    let colorOutsideMascots = 0;
    let colorInsideMascots = 0;
    for (let y = 0; y < info.height; y += 3) for (let x = 0; x < info.width; x += 3) {
      const p = (y * info.width + x) * info.channels;
      const chromatic = Math.max(data[p]!, data[p+1]!, data[p+2]!) - Math.min(data[p]!, data[p+1]!, data[p+2]!) > 12;
      if (mascots.some((r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom)) { if (chromatic) colorInsideMascots++; }
      else if (chromatic) colorOutsideMascots++;
    }
    assert.equal(colorOutsideMascots, 0, `${name}: colored pixels outside mascots`);
    if (name.endsWith("conversation")) assert.ok(colorInsideMascots > 5, "Mascots must remain colorful");
  }
  for (const [name, width, height] of [["desktop", 1440, 1000], ["phone", 390, 844], ["small-phone", 320, 740]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto(base);
    await page.getByRole("textbox", { name: /Message/ }).waitFor();
    await page.locator(".message-content").last().waitFor();
    await page.locator(".message-content strong").filter({ hasText: "What would make tomorrow a good day?" }).waitFor();
    await page.waitForFunction(() => Array.from(document.querySelectorAll(".message-row")).every((el) => getComputedStyle(el).opacity === "1"));
    await page.evaluate(() => document.fonts.ready);
    await page.locator(".message-scroll").evaluate((el) => { el.scrollTop = el.scrollHeight; });
    assert.equal(await page.locator(".conversation").evaluate((el) => getComputedStyle(el).backgroundColor), "rgb(255, 255, 255)");
    assert.equal(await page.locator(".message-user .message-content").first().evaluate((el) => getComputedStyle(el).color), "rgb(29, 29, 29)");
    assert.equal(await page.locator(".conversation-intro").isVisible(), false, "Do not repeat a hero above real conversations");
    assert.equal(await page.locator(".header-actions button").count(), 2, "Only search and settings in the header");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name} page overflows`);
    await capture(`${name}-conversation`);
    await page.getByRole("button", { name: "More settings", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("heading", { name: "Settings", exact: true }).waitFor();
    assert.equal(await dialog.getByText("Open control center", { exact: true }).isVisible(), false, "Advanced controls start collapsed");
    await capture(`${name}-settings`);
    await dialog.getByRole("button", { name: /Your AI Choose/ }).click();
    await page.getByRole("heading", { name: "Your AI connections", exact: true }).waitFor();
    await capture(`${name}-providers`);
    for (const panel of ["connectors", "routines", "teach", "live"]) {
      await page.goto(base + "/?panel=" + panel);
      await page.getByRole("dialog").waitFor();
      await page.locator(".sheet-content").waitFor();
      await delay(350);
      await capture(`${name}-${panel}`);
      if (panel === "connectors") {
        await page.getByLabel("Find an app").fill("gmail");
        assert.equal(await page.locator(".connector-catalog .connector-card").count(), 1);
        await page.getByRole("button", { name: "Set up Gmail", exact: true }).click();
        assert.ok(await page.locator("#connector-settings-google").evaluate((el) => (el as HTMLDetailsElement).open));
        assert.ok(await page.locator("#connector-settings-google > summary").evaluate((el) => el === document.activeElement), "App shortcut moves keyboard focus to setup");
        await page.getByLabel("Find an app").fill("not-a-real-app");
        await page.getByText("No matching apps. Try another name.").waitFor();
        await page.getByLabel("Find an app").fill("");
      }
      if (panel === "routines") {
        await page.locator(".schedule-calendar").scrollIntoViewIfNeeded();
        await capture(`${name}-calendar`);
      }
      if (panel === "teach") {
        await page.getByLabel("Find a skill").fill("weekly");
        assert.ok(await page.locator(".included-library .extension-card").count() > 0);
        await page.getByLabel("Find a skill").fill("not-a-real-skill");
        await page.getByText("No matching skills. Try another name.").waitFor();
        await page.locator(".skill-own-workflows > summary").click();
        await page.locator(".teaching-journey").scrollIntoViewIfNeeded();
        await capture(`${name}-teaching`);
      }
      if (panel === "live") {
        assert.equal(await page.locator(".live-desk-grid").isVisible(), false);
        await page.locator(".computer-disclosure > summary").click();
        assert.equal(await page.locator(".live-desk").count(), 3);
        activityFixture = true;
        await page.reload();
        await page.getByRole("heading", { name: "Prepare the website launch checklist", exact: true }).waitFor();
        assert.equal(await page.locator(".work-timeline article").count(), 1);
        const mascotShape = await page.locator(".work-timeline .mascot").evaluate((el) => { const box = el.getBoundingClientRect(); return box.width / box.height; });
        assert.ok(mascotShape > .8 && mascotShape < 1.6, "Task layout must not stretch the mascot");
        assert.ok(await page.locator(".live-attention").isVisible(), "Approval requests remain visible without opening a disclosure");
        await capture(`${name}-activity-working`);
        activityFixture = false;
      }
      const overflow = await page.locator(".sheet-content").evaluate((el) => ({ width: el.clientWidth, scroll: el.scrollWidth, elements: Array.from(el.querySelectorAll("*")).filter((node) => node.getBoundingClientRect().right > el.getBoundingClientRect().right + 1).map((node) => ({ tag: node.tagName, class: node.className, text: node.textContent?.slice(0, 50) })).slice(0, 8) }));
      assert.ok(overflow.scroll <= overflow.width + 1, `${name} ${panel} overflows ${JSON.stringify(overflow)}`);
      await page.keyboard.press("Escape");
      assert.equal(await page.getByRole("dialog").count(), 0, "Escape closes panels");
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base);
  await page.locator(".nav-row").filter({ hasText: "Pixel" }).click();
  await page.locator(".conversation-intro h2").filter({ hasText: "Pixel" }).waitFor();
  await page.screenshot({ path: path.join(output, "desktop-welcome.png") });
  const animated = await page.locator(".mascot").first().evaluate((el) => el.getAnimations({ subtree: true }).length);
  assert.ok(animated > 0, "Mascots retain real CSS animation");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await delay(100);
  assert.ok(await page.locator(".mascot").first().evaluate((el) => el.getAnimations({ subtree: true }).every((animation) => Number(animation.effect?.getTiming().duration ?? 0) <= 1)), "Mascots respect reduced motion");
  assert.deepEqual(errors, []);
  console.log(`PASS: desktop, 390px and 320px; simple navigation; advanced disclosure; provider route; four panels; Escape; no overflow; white canvas and dark text; monochrome pixels outside mascots; animated/reduced-motion mascots. Screenshots: ${output}. Synthetic data only.`);
} finally {
  await browser?.close();
  child.kill("SIGTERM");
  for (let n = 0; n < 60 && child.exitCode === null && child.signalCode === null; n++) await delay(100);
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  rmSync(root, { recursive: true, force: true });
}

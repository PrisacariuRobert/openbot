// Disposable data and a separate browser. No owner messages, accounts or model calls.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";
import sharp from "sharp";
import { Temporal } from "@js-temporal/polyfill";
import { OpenBotDatabase } from "../src/server/testing/database.js";

const root = mkdtempSync(path.join(tmpdir(), "openbot-new-studio-"));
const data = path.join(root, "data");
const output =
  process.env.OPENBOT_NEW_STUDIO_OUTPUT || "/tmp/openbot-new-studio-qa";
mkdirSync(output, { recursive: true });
const db = new OpenBotDatabase(root, { dataDir: data });
for (const id of ["nova", "pixel", "scout"])
  db.updateBot(id, {
    providerInstanceId: db.listProviders()[0]!.id,
    model: "fixture/model",
  });
db.addMessage({
  threadId: "team-room",
  senderType: "user",
  senderId: null,
  body: "Help me get the website ready to share on Friday.",
});
db.addMessage({
  threadId: "team-room",
  senderType: "bot",
  senderId: "nova",
  body: "Let's keep it focused. Based on what you've shared, there are **three things to finish**:\n\n1. Check the mobile layout.\n2. Make the contact form work end to end.\n3. Ask someone outside the project to try it.\n\nPixel can help with the first two. I'll turn the feedback into a short launch checklist.\n\n**What matters most for Friday: gathering feedback or opening to everyone?**",
});
db.addMessage({
  threadId: "team-room",
  senderType: "user",
  senderId: null,
  body: "Gathering feedback. Let's invite a small group first.",
});
db.addMessage({
  threadId: "team-room",
  senderType: "bot",
  senderId: "pixel",
  body: "A small preview makes sense. I'll start with the mobile layout and share what I find here.\n\nNothing will be published or sent without your review.",
});
const jobs = [
  [
    "nova",
    "Your week, a little clearer",
    "A short plan with room for focused work and the commitments you shared.",
  ],
  [
    "pixel",
    "Website launch checklist",
    "The launch checklist is ready for your review. No changes have been published.",
  ],
  [
    "scout",
    "Notes for the design meeting",
    "Three questions to discuss and the notes you asked the team to keep together.",
  ],
] as const;
const runs = jobs.map(([botId, prompt, summary], index) => {
  const run = db.createRun({
    botId,
    threadId: "team-room",
    prompt,
    status: "completed",
  });
  db.updateRun(run.id, {
    summary,
    startedAt: new Date(Date.now() - (index + 1) * 3600_000).toISOString(),
    finishedAt: new Date(Date.now() - index * 3600_000).toISOString(),
  });
  for (const step of run.task.steps)
    db.updateRunTaskStep(
      run.id,
      step.id,
      "completed",
      "Synthetic preview fixture",
    );
  return db.getRun(run.id)!;
});
db.addActivity({ runId: runs[0]!.id, botId: "nova", kind: "message", label: "Progress update", detail: "Synthetic intermediate update: checking the sample sources." });
db.addMessage({ threadId: "team-room", senderType: "bot", senderId: "nova", runId: runs[0]!.id, body: "Your sample result is ready. Nothing was sent." });
// Paused on the real fixture host. Future dates are display-only so tests cannot dispatch work.
const routines = ["A morning plan", "Weekly check-in"].map((name, index) =>
  db.createRoutine({
    name,
    botId: index ? "pixel" : "nova",
    threadId: "team-room",
    prompt: "Fixture only",
    intervalMinutes: 1440,
    enabled: false,
  }),
);
db.close();
const socket = createServer();
await new Promise<void>((resolve) => socket.listen(0, "127.0.0.1", resolve));
const port = (socket.address() as { port: number }).port;
await new Promise<void>((resolve) => socket.close(() => resolve()));
const base = `http://127.0.0.1:${port}`;
const child = spawn(
  process.execPath,
  ["--import", "tsx", "src/server/index.ts"],
  {
    stdio: "ignore",
    env: {
      ...process.env,
      OPENBOT_LOAD_ENV: "0",
      OPENBOT_DATA_DIR: data,
      OPENBOT_PORT: String(port),
      OPENBOT_HOST: "127.0.0.1",
      OPENBOT_APP_URL: base,
      NODE_ENV: "production",
      OPENBOT_DEPLOYMENT_MODE: "local",
    },
  },
);
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  let ready = false;
  for (let n = 0; n < 100; n++) {
    try {
      if ((await fetch(base + "/api/healthz")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await delay(150);
  }
  assert.ok(ready, "Fixture host starts");
  browser = await chromium.launch({
    executablePath:
      process.env.OPENBOT_CHROME_PATH ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  const page = await browser.newPage({
    timezoneId: "Europe/Brussels",
    locale: "en-GB",
  });
  page.setDefaultTimeout(12_000);
  const errors: string[] = [],
    posts: {
      threadId: string;
      body: string;
      targetBotIds: string[];
      attachmentIds: string[];
    }[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", async (dialog) => {
    assert.equal(dialog.type(), "beforeunload");
    await dialog.accept();
  });
  let busy = false,
    unconfigured = false,
    failSend = false;
  let holdSend = false, releaseSend: (() => void) | undefined;
  const nextDate = Temporal.Now.plainDateISO("Europe/Brussels")
    .add({ days: 1 })
    .toZonedDateTime({ timeZone: "Europe/Brussels", plainTime: "08:30" })
    .toInstant()
    .toString();
  // This is a conversation/layout fixture, not a Docker/browser launch test.
  // The computer now uses a live stream instead of the old one-shot snapshot.
  await page.route("**/api/bots/*/computer/live", (route) => route.fulfill({contentType:"text/event-stream", body:'data: {"type":"status","browser":"stopped"}\n\n'}));
  await page.route(/\/api\/state(?:\?.*)?$/, async (route) => {
    const response = await route.fetch();
    const state = await response.json();
    state.routines = routines.map((routine, index) => ({
      ...routine,
      enabled: true,
      nextRunAt: new Date(
        new Date(nextDate).getTime() + index * 48 * 3600_000,
      ).toISOString(),
    }));
    if (unconfigured)
      state.bots = state.bots.map((bot: { id: string }) =>
        bot.id === "nova"
          ? { ...bot, providerInstanceId: null, model: "" }
          : bot,
      );
    if (busy) {
      state.studioRuns = [
        { ...runs[0], id: "fixture-working", status: "running" },
        {
          ...runs[1],
          id: "fixture-approval",
          status: "awaiting_approval",
          approvalReason: "Review the draft before anything is sent.",
        },
        ...state.studioRuns,
      ];
      state.approvedActions = [
        {
          id: "fixture-uncertain",
          status: "uncertain",
          actionLabel: "Sending your invitation",
        },
      ];
      state.automationAlerts = [
        {
          id: "fixture-alert",
          routineName: "Morning plan",
          message: "The Mac was asleep. Check the missed run.",
          resolvedAt: null,
        },
      ];
    }
    await route.fulfill({ response, json: state });
  });
  await page.route(/\/api\/connectors$/, async (route) => {
    const response = await route.fetch(),
      status = await response.json();
    status.catalog = status.catalog.map((app: { id: string }) => ({
      ...app,
      connected: app.id === "gmail",
    }));
    await route.fulfill({ response, json: status });
  });
  await page.route(/\/api\/messages$/, async (route) => {
    assert.equal(route.request().method(), "POST");
    posts.push(route.request().postDataJSON());
    if (holdSend) await new Promise<void>((resolve) => { releaseSend = resolve; });
    if (!failSend) {
      const posted = route.request().postDataJSON();
      const fixture = new OpenBotDatabase(root, { dataDir: data });
      try {
        const message = fixture.addMessage({ threadId: posted.threadId, senderType: "user", senderId: null, body: posted.body || "Shared a file." });
        fixture.claimAttachments(posted.attachmentIds || [], message.id, posted.threadId);
      } finally { fixture.close(); }
    }
    await route.fulfill({
      status: failSend ? 503 : 200,
      json: failSend
        ? { error: "The connection is busy. Try again." }
        : { ok: true },
    });
  });
  async function capture(name: string) {
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `${name}: document overflows`,
    );
    for (const selector of [".page-content", ".chat-scroll", "dialog[open]"]) {
      for (const element of await page.locator(selector).all())
        assert.ok(
          await element.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
          `${name}: ${selector} overflows`,
        );
    }
    const boxes = await page.locator(".character").evaluateAll((elements) =>
      elements.map((el) => {
        const r = el.getBoundingClientRect();
        return {
          left: r.left - 8,
          right: r.right + 8,
          top: r.top - 8,
          bottom: r.bottom + 8,
        };
      }),
    );
    const png = await page.screenshot({
      path: path.join(output, name + ".png"),
      animations: "disabled",
    });
    const { data: pixels, info } = await sharp(png)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let outsideColor = 0,
      insideColor = 0;
    for (let y = 0; y < info.height; y += 3)
      for (let x = 0; x < info.width; x += 3) {
        const pos = (y * info.width + x) * info.channels;
        const color =
          Math.max(pixels[pos]!, pixels[pos + 1]!, pixels[pos + 2]!) -
            Math.min(pixels[pos]!, pixels[pos + 1]!, pixels[pos + 2]!) >
          14;
        if (color) {
          if (
            boxes.some(
              (r) => x > r.left && x < r.right && y > r.top && y < r.bottom,
            )
          )
            insideColor++;
          else outsideColor++;
        }
      }
    assert.equal(outsideColor, 0, `${name}: only mascots should be colorful`);
    if (name.endsWith("home"))
      assert.ok(insideColor > 15, "Home characters remain colorful");
  }
  const nav = (_width: number) => ({
    getByRole: (_role: "button", options: { name: string | RegExp; exact?: boolean }) => ({
      click: async () => {
        await page
          .getByRole("button", { name: "Workspace", exact: true })
          .click();
        await page
          .getByRole("navigation", { name: "Workspace navigation" })
          .getByRole("button", options)
          .click();
      },
    }),
  });
  for (const [name, width, height] of [
    ["desktop", 1440, 960],
    ["phone", 390, 844],
    ["small-phone", 320, 740],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto(base + "/studio.html");
    await page
      .getByRole("textbox", { name: "Message your team", exact: true })
      .waitFor();
    const workUpdates = page.locator(".message-work-updates").first();
    await workUpdates.locator("summary").waitFor();
    const intermediate = workUpdates.getByText("Synthetic intermediate update: checking the sample sources.", { exact: true });
    assert.equal(await intermediate.isVisible(), false, "Progress is folded, not mixed into the final answer");
    await workUpdates.locator("summary").click();
    assert.equal(await intermediate.isVisible(), true, "Earlier work stays inspectable");
    await workUpdates.locator("summary").click();
    assert.equal(
      await page.locator(".app-shell, .sheet, .mascot").count(),
      0,
      "No legacy UI components",
    );
    const sheets = await page.evaluate(() =>
      [...document.styleSheets].map((sheet) => sheet.href),
    );
    assert.equal(sheets.length, 1, "One independent stylesheet");
    assert.ok(
      sheets[0]?.includes("/main-"),
      "Only the new Studio stylesheet",
    );
    await capture(name + "-home");
    await nav(width)
      .getByRole("button", { name: "Chats", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Conversations", exact: true })
      .waitFor();
    await capture(name + "-conversations");
    await nav(width)
      .getByRole("button", { name: "Activity", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Activity", exact: true })
      .waitFor();
    await capture(name + "-activity");
    await page
      .getByRole("button", { name: /Website launch checklist/ })
      .click();
    const drawer = page.getByRole("dialog");
    await drawer
      .getByRole("heading", { name: "Website launch checklist" })
      .waitFor();
    await capture(name + "-result");
    for (let i = 0; i < 7; i++) {
      await page.keyboard.press("Tab");
      assert.ok(
        await drawer.evaluate((el) => el.contains(document.activeElement)),
        "Focus stays in dialog",
      );
    }
    await page.keyboard.press("Escape");
    assert.equal(await drawer.count(), 0);
    assert.match(
      await page.evaluate(() => document.activeElement?.textContent || ""),
      /Website launch checklist/,
      "Focus returns to the work row",
    );
    await nav(width)
      .getByRole("button", { name: "Schedule", exact: true })
      .click();
    await capture(name + "-schedule");
    const originalMonth = await page.locator(".month-view h2").innerText();
    await page.getByRole("button", { name: "Next month", exact: true }).click();
    assert.notEqual(
      await page.locator(".month-view h2").innerText(),
      originalMonth,
    );
    await page
      .getByRole("button", { name: "Previous month", exact: true })
      .click();
    assert.equal(
      await page.locator(".month-view h2").innerText(),
      originalMonth,
    );
    const markedDay = page
      .locator(".month-days button")
      .filter({ has: page.locator("i") })
      .first();
    await markedDay.click();
    await page.locator(".day-agenda .agenda-row").first().waitFor();
    await nav(width)
      .getByRole("button", { name: "Library", exact: true })
      .click();
    await page.locator(".app-row").first().waitFor();
    await capture(name + "-apps");
    await page.getByLabel("Search library").fill("gmail");
    assert.equal(await page.locator(".app-row").count(), 1);
    assert.ok(
      await page.locator(".app-state").isVisible(),
      "Connection status is visible on phones too",
    );
    await page.locator(".app-row").click();
    await drawer.getByRole("heading", { name: "Gmail is connected" }).waitFor();
    assert.equal(
      await drawer
        .getByRole("link", { name: /Manage connection/ })
        .getAttribute("href"),
      "/?panel=connectors",
    );
    await page.keyboard.press("Escape");
    await page.getByLabel("Search library").fill("no-matching-application");
    await page.getByRole("heading", { name: "No matching apps" }).waitFor();
    await page.getByRole("button", { name: "Skills", exact: true }).click();
    await page.locator(".skill-row").first().waitFor();
    await capture(name + "-skills");
    await page.locator(".skill-row").first().click();
    await drawer.getByText("Read the instructions", { exact: true }).click();
    assert.ok(await drawer.locator(".source-details .prose").isVisible());
    await page.keyboard.press("Escape");
    await page.keyboard.press("Control+k");
    await page.getByLabel("Search conversations").fill("studio");
    await page.locator(".search-results button").first().click();
    await page.locator(".chat-message").last().waitFor();
    assert.ok(
      await page.locator(".prose strong").first().isVisible(),
      "Real Markdown formatting",
    );
    await capture(name + "-chat");
    busy = true;
    await page.reload();
    await nav(width)
      .getByRole("button", { name: /Activity/ })
      .click();
    await page.getByText("Check before continuing", { exact: true }).waitFor();
    await page
      .getByText("The Mac was asleep. Check the missed run.", { exact: true })
      .waitFor();
    await capture(name + "-attention");
    busy = false;
  }
  await page.setViewportSize({ width: 1440, height: 960 });
  unconfigured = true;
  await page.goto(base + "/studio.html");
  await page
    .locator(".sidebar-conversations")
    .getByRole("button", { name: "Nova", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Choose a teammate" })
    .click();
  await page.getByRole("option", { name: /^Nova/ }).click();
  await page
    .getByRole("textbox", { name: "Message your team" })
    .fill("My test draft");
  const before = posts.length;
  await page.getByRole("textbox", { name: "Message your team" }).press("Enter");
  await page.getByRole("dialog").getByRole("heading", { name: "Your AI", exact: true }).waitFor();
  assert.equal(posts.length, before, "Enter cannot bypass provider gate");
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("textbox", { name: "Message your team" }).inputValue(), "My test draft", "Provider choice keeps the draft");
  await page.getByRole("button", { name: "Send message" }).click();
  await page.getByRole("dialog").getByRole("heading", { name: "Your AI", exact: true }).waitFor();
  assert.equal(posts.length, before, "Clicking Send opens the chooser; it does not start an unconfigured teammate");
  await page.keyboard.press("Escape");
  await page
    .getByRole("combobox", { name: "Choose a teammate" })
    .click();
  const pixelState = page.waitForResponse((response) => response.url().includes("/api/state?threadId=bot-pixel") && response.ok());
  await page.getByRole("option", { name: /^Pixel/ }).click();
  await pixelState;
  await page.waitForFunction(() => document.querySelector<HTMLTextAreaElement>(".composer textarea")?.disabled === false);
  await page
    .getByRole("textbox", { name: "Message your team" })
    .fill("My test draft");
  failSend = true;
  await page.waitForFunction(() => !document.querySelector<HTMLButtonElement>('button[aria-label="Add files"]')?.disabled);
  await page
    .getByLabel("Choose files", { exact: true })
    .setInputFiles({
      name: "brief.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Synthetic planning notes for a fixture test."),
    });
  await page.getByRole("button", { name: "Remove brief.txt" }).waitFor();
  await page.waitForFunction(async () => (await (await fetch("/api/state?threadId=bot-pixel")).json()).draft.body === "My test draft");
  await page.reload();
  await page.getByRole("button", { name: "Remove brief.txt" }).waitFor();
  await page.waitForFunction(() => document.querySelector<HTMLTextAreaElement>(".composer textarea")?.value === "My test draft");
  await page.getByRole("button", { name: "Send message" }).click();
  await page.getByText(/Your draft has been kept/).waitFor();
  assert.equal(
    await page.getByRole("textbox", { name: "Message your team" }).inputValue(),
    "My test draft",
  );
  assert.equal(posts.at(-1)?.threadId, "bot-pixel");
  assert.deepEqual(posts.at(-1)?.targetBotIds, ["pixel"]);
  assert.equal(
    posts.at(-1)?.attachmentIds.length,
    1,
    "Attached file is sent to the chosen conversation",
  );
  failSend = false;
  await page.getByRole("button", { name: "Send message" }).click();
  await page.waitForFunction(
    () =>
      document.querySelector<HTMLTextAreaElement>(".composer textarea")
        ?.value === "",
  );
  await page
    .locator(".workspace-chat .topbar > span")
    .filter({ hasText: "Pixel" })
    .waitFor();
  assert.equal(
    await page.getByRole("textbox", { name: "Message your team" }).inputValue(),
    "",
  );
  assert.equal(
    await page.getByRole("button", { name: "Remove brief.txt" }).count(),
    0,
    "Successful send clears only sent attachments",
  );
  await page
    .getByRole("textbox", { name: "Message your team" })
    .fill("Keep this for tomorrow.");
  await page.waitForFunction(
    async () =>
      (await (await fetch("/api/state?threadId=bot-pixel")).json()).draft
        .body === "Keep this for tomorrow.",
  );
  await page
    .locator(".sidebar-conversations")
    .getByRole("button", { name: "Nova", exact: true })
    .click();
  await page
    .locator(".sidebar-conversations")
    .getByRole("button", { name: "Pixel", exact: true })
    .click();
  assert.equal(
    await page.getByRole("textbox", { name: "Message your team" }).inputValue(),
    "Keep this for tomorrow.",
  );
  await page.reload();
  await page
    .locator(".sidebar-conversations")
    .getByRole("button", { name: "Pixel", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document.querySelector<HTMLTextAreaElement>(".composer textarea")
        ?.value === "Keep this for tomorrow.",
  );
  await page
    .getByRole("button", { name: "Conversation details", exact: true })
    .click();
  await page
    .getByRole("complementary", { name: "Conversation details" })
    .waitFor();
  await page.waitForFunction(() => document.querySelector(".computer-placeholder p")?.textContent !== "Checking…");
  const fileContrast = await page.locator(".from-you .message-file").evaluate((element) => {
    const style = getComputedStyle(element);
    return { color: style.color, background: style.backgroundColor };
  });
  assert.equal(fileContrast.color, "rgb(32, 32, 32)", "Outgoing attachment labels remain readable on their white card");
  assert.equal(fileContrast.background, "rgb(255, 255, 255)");
  await capture("desktop-conversation-context");
  await page
    .getByRole("button", { name: "Close conversation details" })
    .click();
  holdSend = true;
  const postsBeforeDelayedSend = posts.length;
  await page.getByRole("button", { name: "Send message" }).click();
  await page.waitForFunction(() => document.querySelector(".composer-hint")?.textContent === "Sending…");
  await page.locator(".sidebar-conversations").getByRole("button", { name: "Nova", exact: true }).click();
  await page.getByRole("textbox", { name: "Message your team" }).fill("A separate conversation draft.");
  while (!releaseSend) await delay(10);
  releaseSend(); holdSend = false;
  await page.waitForFunction(() => document.querySelector(".composer-hint")?.textContent !== "Sending…");
  assert.match(page.url(), /thread=bot-nova/, "Delayed send must not pull navigation back");
  assert.equal(await page.getByRole("textbox", { name: "Message your team" }).inputValue(), "A separate conversation draft.");
  assert.equal(posts.length, postsBeforeDelayedSend + 1);
  await page.locator(".sidebar-conversations").getByRole("button", { name: "Pixel", exact: true }).click();
  await page.getByRole("textbox", { name: "Message your team" }).fill("");
  await page.waitForFunction(() => !document.querySelector<HTMLButtonElement>('button[aria-label="Add files"]')?.disabled);
  await page.getByLabel("Choose files", { exact: true }).setInputFiles({
    name: "file-only.txt", mimeType: "text/plain", buffer: Buffer.from("A file can be the whole message."),
  });
  await page.getByRole("button", { name: "Remove file-only.txt" }).waitFor();
  await page.getByRole("button", { name: "Send message" }).click();
  await page.getByRole("button", { name: "Remove file-only.txt" }).waitFor({ state: "hidden" });
  assert.equal(posts.at(-1)?.body, "", "A file can be sent without forced caption text");
  assert.equal(posts.at(-1)?.threadId, "bot-pixel");
  assert.equal(posts.at(-1)?.attachmentIds.length, 1);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 960 : 844 });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto(base + "/studio.html?thread=team-room");
    await page.locator(".from-team .prose").first().waitFor();
    assert.equal(await page.locator("body").evaluate((el) => getComputedStyle(el).backgroundColor), "rgb(23, 23, 23)", "System dark appearance applies");
    for (const selector of [".from-team > .prose", ".from-you > .prose"]) {
      const colors = await page.locator(selector).first().evaluate((element) => {
        let background = getComputedStyle(element).backgroundColor, parent = element.parentElement;
        while ((background === "rgba(0, 0, 0, 0)" || background === "transparent") && parent) { background = getComputedStyle(parent).backgroundColor; parent = parent.parentElement; }
        return { foreground: getComputedStyle(element).color, background };
      });
      const luminance = (rgb: string) => {
        const c = (rgb.match(/[\d.]+/g) || []).slice(0, 3).map(Number).map((n) => n / 255).map((n) => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4);
        return c[0]! * .2126 + c[1]! * .7152 + c[2]! * .0722;
      };
      const values = [luminance(colors.foreground), luminance(colors.background)].sort((a, b) => a - b);
      const ratio = (values[1]! + .05) / (values[0]! + .05);
      assert.ok(ratio >= 4.5, `${selector} dark text contrast is ${ratio}`);
    }
    await capture(`dark-chat-${width}`);
    await nav(width).getByRole("button", { name: "Library", exact: true }).click();
    await capture(`dark-library-${width}`);
    const githubMark = page.locator(".app-row").filter({ has: page.getByText("GitHub", { exact: true }) }).locator(".app-mark svg");
    const logoPixels = await sharp(await githubMark.screenshot()).removeAlpha().raw().toBuffer();
    let visibleLogoPixels = 0;
    for (let pixel = 0; pixel < logoPixels.length; pixel += 3) {
      if (Math.min(logoPixels[pixel]!, logoPixels[pixel + 1]!, logoPixels[pixel + 2]!) > 100) visibleLogoPixels++;
    }
    assert.ok(visibleLogoPixels > 20, "A black brand mark must remain visible on the dark library canvas");
  }
  // Library at phone width leaves sidebar characters in a display:none subtree.
  // Check the actual, visible conversation identity, not the first SVG in DOM.
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "no-preference" });
  await page.goto(base + "/studio.html?thread=bot-pixel");
  const visibleMascot = page.locator(".topbar .conversation-identity .character");
  await visibleMascot.waitFor({ state: "visible" });
  const animations = await visibleMascot.evaluate((el) =>
    el.getAnimations({ subtree: true }).map((animation) => ({
      name: animation instanceof CSSAnimation ? animation.animationName : "",
      duration: Number(animation.effect?.getTiming().duration ?? 0),
      state: animation.playState,
    })),
  );
  for (const name of ["character-float", "character-blink"]) {
    assert.ok(animations.some((animation) => animation.name === name && animation.duration > 1 && animation.state === "running"), `${name} runs on the visible conversation mascot`);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await delay(100);
  assert.ok(
    await visibleMascot
      .evaluate((el) =>
        el
          .getAnimations({ subtree: true })
          .every(
            (animation) =>
              Number(animation.effect?.getTiming().duration ?? 0) <= 1,
          ),
      ),
    "Reduced motion respected",
  );
  const reducedDurations = await visibleMascot.evaluate((el) =>
    [".character-drawing", ".character-eyes"].map((selector) => parseFloat(getComputedStyle(el.querySelector(selector)!).animationDuration) * 1000),
  );
  assert.ok(reducedDurations.every((duration) => Number.isFinite(duration) && duration <= 1), "Both visible float and blink styles respect reduced motion");
  assert.deepEqual(errors, []);
  console.log(
    `PASS: new Studio at 1440/390/320px; isolated CSS; monochrome except animated mascots; no overflow; 5 destinations; dialogs/focus/Escape; calendar dates; app status and search; included skills; Markdown; action uncertainty and alerts; explicit selected provider; persistent text/files and send recovery; attachment-only messages; delayed-send navigation; contextual work/routines/computer status; readable attachment cards. Screenshots: ${output}. Synthetic data, intercepted sends, zero model calls.`,
  );
} finally {
  // Drain intercepted polling before disposing its request context, so teardown
  // cannot mask an assertion failure with an unhandled route.fetch rejection.
  for (const context of browser?.contexts() ?? []) {
    for (const page of context.pages()) await page.unrouteAll({ behavior: "wait" });
  }
  await browser?.close();
  child.kill("SIGTERM");
  for (
    let n = 0;
    n < 60 && child.exitCode === null && child.signalCode === null;
    n++
  )
    await delay(100);
  if (child.exitCode === null && child.signalCode === null)
    child.kill("SIGKILL");
  rmSync(root, { recursive: true, force: true });
}

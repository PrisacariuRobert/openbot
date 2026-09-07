// Actual creation API on a fresh, disposable host. Provider discovery is a UI
// fixture; no model is invoked, no real credentials are read by the test.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";
import { OpenBotDatabase } from "../src/server/database.js";

const root = mkdtempSync(path.join(tmpdir(), "openbot-first-teammate-ui-"));
const data = path.join(root, "data");
const db = new OpenBotDatabase(root, { dataDir: data });
const provider = db.listProviders()[0]!;
assert.equal(db.listBots().length, 0);
db.close();
const socket = createServer();
await new Promise<void>((done) => socket.listen(0, "127.0.0.1", done));
const port = (socket.address() as { port: number }).port;
await new Promise<void>((done) => socket.close(() => done()));
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
      OPENBOT_DEPLOYMENT_MODE: "local",
      NODE_ENV: "production",
    },
  },
);
const exited = once(child, "exit");
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const output = "/tmp/openbot-first-teammate-qa";
mkdirSync(output, { recursive: true });
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      if ((await fetch(base + "/api/healthz")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await delay(150);
  }
  assert.ok(ready, "Fresh host starts without a preset bot");
  browser = await chromium.launch({
    executablePath:
      process.env.OPENBOT_CHROME_PATH ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let discoveries = 0;
  let available = true;
  await page.route("**/api/provider", async (route) => {
    discoveries++;
    await route.fulfill({
      json: {
        instances: [
          { ...provider, connected: available, models: ["opencode/fixture-only"] },
        ],
      },
    });
  });
  await page.route("**/api/messages", () => {
    throw new Error("Creation must never start a model job");
  });
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(base + "/studio.html");
    await page
      .getByRole("heading", { name: "Make room for a little help." })
      .waitFor();
    assert.equal(
      await page.locator(".character").count(),
      0,
      "No invented preset team",
    );
    await page.screenshot({
      path: path.join(output, `empty-${width}.png`),
      animations: "disabled",
    });
    await page
      .getByRole("button", { name: "Create your first teammate" })
      .click();
    const sheet = page.getByRole("dialog");
    await sheet.getByLabel("Name", { exact: true }).fill("Remy");
    await sheet.getByLabel("Their job").fill("Help plan my week");
    await sheet
      .getByLabel("How should they help?")
      .fill("Find a realistic plan. Ask before changing my calendar.");
    await sheet.getByText("Make them yours", { exact: true }).click();
    await sheet.getByRole("button", { name: "Sprout shape" }).click();
    await sheet.getByRole("button", { name: "Leaf character" }).click();
    assert.equal(
      await sheet.getByRole("combobox", { name: "AI connection" }).innerText(),
      "Choose your AI service",
      "No default provider",
    );
    assert.ok(
      await sheet
        .getByRole("button", { name: "Create teammate", exact: true })
        .isDisabled(),
    );
    await sheet.getByRole("combobox", { name: "AI connection" }).click();
    await sheet.getByRole("option", { name: provider.name, exact: true }).click();
    assert.equal(
      await sheet.getByRole("combobox", { name: /^Model/ }).innerText(),
      "Choose a model",
      "No default model",
    );
    await sheet
      .getByRole("combobox", { name: /^Model/ })
      .click();
    await sheet.getByRole("option", { name: "opencode/fixture-only", exact: true }).click();
    available = false;
    await sheet.getByRole("button", { name: "Refresh connections" }).click();
    await sheet.getByText("This connection or model is no longer available.", { exact: false }).waitFor();
    assert.ok(await sheet.getByRole("button", { name: "Create teammate", exact: true }).isDisabled(), "A disconnected selection cannot silently submit");
    assert.equal(await sheet.getByLabel("Name", { exact: true }).inputValue(), "Remy");
    available = true;
    await sheet.getByRole("button", { name: "Refresh connections" }).click();
    await page.waitForFunction(() => !(document.querySelector(".create-teammate button[type=submit], .create-teammate .primary") as HTMLButtonElement)?.disabled);
    assert.equal(
      await sheet.getByLabel("Name", { exact: true }).inputValue(),
      "Remy",
      "Refresh keeps draft",
    );
    assert.ok(
      await sheet.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      "Form has no horizontal overflow",
    );
    await sheet.evaluate((el) => el.scrollTo(0, 0));
    await page.screenshot({
      path: path.join(output, `create-${width}.png`),
      animations: "disabled",
    });
    if (width !== 320) {
      await page.keyboard.press("Escape");
      continue;
    }
    const created = page.waitForResponse(
      (response) =>
        response.url() === base + "/api/bots" &&
        response.request().method() === "POST",
    );
    await sheet
      .getByRole("button", { name: "Create teammate", exact: true })
      .click();
    const response = await created;
    assert.equal(response.status(), 201);
    const bot = await response.json();
    assert.equal(bot.name, "Remy");
    assert.equal(bot.mascot, "sprout");
    assert.equal(bot.color, "#299575");
    assert.equal(bot.browserEnabled, false);
    assert.equal(bot.computerEnabled, false);
    await page.getByRole("heading", { name: "What’s on your mind?" }).waitFor();
    await page.getByRole("button", { name: "About Remy" }).click();
    await page.getByRole("dialog").getByRole("heading", { name: "Meet Remy" }).waitFor();
    await page.keyboard.press("Escape");
    assert.equal(
      await page
        .getByRole("combobox", { name: "Choose a teammate" })
        .innerText(),
      "Remy",
    );
    const state = await (
      await fetch(base + "/api/state?threadId=" + bot.threadId)
    ).json();
    assert.equal(state.bots.length, 1);
    assert.equal(state.messages.length, 0);
    assert.equal(state.studioRuns.length, 0);
    await page.screenshot({
      path: path.join(output, "remy-320.png"),
      animations: "disabled",
    });
    await page.reload();
    const persisted = new OpenBotDatabase(root, { dataDir: data });
    assert.equal(persisted.listBots().length, 1);
    assert.equal(persisted.listBotConnectorAccess().length, 0);
    persisted.close();
  }
  assert.ok(discoveries >= 6);
  assert.deepEqual(errors, []);
  console.log(
    "Fresh studio + explicit provider/model + customization + real creation + persisted isolation passed at 1440/390/320px. No model calls. Screenshots: " +
      output,
  );
} finally {
  await browser?.close();
  child.kill("SIGTERM");
  await Promise.race([exited, delay(5000)]);
  rmSync(root, { recursive: true, force: true });
}

/** Capture the shipping UI, not a separately maintained marketing mockup.
 * All API responses come from disposable sample data. No real host is contacted.
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "vite";
import { chromium } from "playwright-core";
import { OpenBotDatabase } from "../src/server/testing/database";
import type { Message, ProviderStatus } from "../src/shared/types";

const root = mkdtempSync(path.join(tmpdir(), "openbot-marketing-fixture-"));
const output = path.resolve("marketing/intro-film/public/actual-ui");
mkdirSync(output, { recursive: true });
const db = new OpenBotDatabase(root, { dataDir: root });
const now = "2026-09-08T09:41:00.000Z";
const instance = db.listProviders()[0]!;
for (const bot of db.listBots()) db.updateBot(bot.id, { providerInstanceId: instance.id, model: "demo/Your chosen model" });
const examples = [
  ["Turn our launch notes into a plan we can use.", "Pixel and I have brought the decisions, owners and open questions together.\n\n**For Friday’s review**\n1. Test the first-run experience.\n2. Finish the mobile checks.\n3. Invite the pilot team.\n\nThe next step is your review. Nothing has been sent or published."],
  ["Help me get ready for the week ahead.", "Here’s a plan based on the notes you shared.\n\n**Monday** — Review the launch checklist.\n**Wednesday** — Test the new onboarding.\n**Friday** — Gather feedback from the pilot team.\n\nLeave Tuesday and Thursday open for focused work. Want me to turn the Friday check-in into a routine?"],
  ["Find the bug, make a fix, and show me what changed.", "The mobile layout fix is ready for review.\n\n**Changed:** the settings panel now stays within the screen, with a clear way back.\n**Checked:** desktop and phone layouts, in light and dark mode.\n\nReview the changes and test evidence before deciding what to merge."],
];
let example = 0;
const provider: ProviderStatus = {
  id: "opencode", name: "Your AI", version: null, connected: true, cliAvailable: true,
  defaultModel: "demo/Your chosen model", models: ["demo/Your chosen model"], note: "Sample workspace. No model calls are made.", loginAttempts: [],
  instances: [{ ...instance, name: "My subscription", connected: true, models: ["demo/Your chosen model", "demo/Another available model"] }],
  catalog: [
    ["opencode", "OpenCode", "Account access"], ["claude", "Claude", "Official login"],
    ["openai", "ChatGPT / OpenAI", "Account access"], ["github-copilot", "GitHub Copilot", "Subscription"],
  ].map(([id, name, badge]) => ({ id: id as "opencode", name: name!, shortName: name!, badge: badge!, description: "Connect your own supported account. Provider terms and limits apply.", connected: false, installed: true, canConnect: true, connectionId: null, models: [], note: "" })),
};
const vite = await createServer({ configFile: false, root: process.cwd(), server: { host: "127.0.0.1", port: 0, hmr: false } });
await vite.listen();
const address = vite.httpServer!.address(); assert(address && typeof address === "object");
const base = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 890 }, deviceScaleFactor: 2 });
const errors: string[] = [];
page.on("pageerror", error => errors.push(error.message));
await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
await page.route("**/api/**", async route => {
  const url = new URL(route.request().url());
  if (!["GET", "HEAD"].includes(route.request().method())) return route.fulfill({ status: 405, json: { error: "Read-only sample workspace." } });
  if (url.pathname === "/api/state") {
    const state = db.getState(url.searchParams.get("threadId") || "team-room");
    const messages: Message[] = examples[example]!.map((body, i) => ({ id: `sample-${example}-${i}`, threadId: state.activeThreadId, senderType: i ? "bot" : "user", senderId: i ? "nova" : null, senderName: i ? "Nova" : "You", body: body!, createdAt: now, attachments: [] }));
    return route.fulfill({ json: { ...state, messages, threads: state.threads.map(thread => ({ ...thread, lastMessage: thread.kind === "room" ? "Your launch plan is ready to review." : "Ready when you are.", lastMessageAt: now })) } });
  }
  if (url.pathname === "/api/provider") return route.fulfill({ json: provider });
  if (url.pathname === "/api/events") return route.fulfill({ contentType: "text/event-stream", body: "retry: 60000\ndata: sample-workspace\n\n" });
  if (url.pathname === "/api/extensions") return route.fulfill({ json: { skills: [], plugins: [], installations: [], mcpServers: [], skillProposals: [] } });
  if (url.pathname === "/api/connectors") return route.fulfill({ json: { catalog: [], connections: [], access: [], events: [] } });
  if (url.pathname === "/api/team-templates") return route.fulfill({ json: [] });
  if (url.pathname.startsWith("/api/drafts/") && url.pathname.endsWith("/attachments")) return route.fulfill({ json: [] });
  return route.fulfill({ status: 404, json: { error: "Not provided by this read-only visual fixture." } });
});
const manifest: {name: string; source: string; width: number; height: number}[] = [];
async function shot(name: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || [...document.querySelectorAll("dialog")].some(el => el.scrollWidth > el.clientWidth + 1));
  assert.equal(overflow, false, `${name} has no horizontal overflow`);
  assert.equal(await page.getByText("Not provided by this read-only visual fixture.", {exact:false}).count(), 0, "No fixture errors in the captured interface");
  if (!process.argv.includes("--mobile-only")) await page.screenshot({ path: path.join(output, `${name}.png`) });
  if (["settings", "accounts", "api-form", "models"].includes(name)) {
    await page.setViewportSize({ width: 390, height: 844 });
    if (name === "models") await page.locator(".ai-team").last().scrollIntoViewIfNeeded();
    else await page.getByRole("dialog").evaluate(el => el.scrollTo({top:0}));
    await page.screenshot({ path: path.join(output, `${name}-mobile.png`) });
    assert.equal(await page.getByRole("dialog").evaluate(el => el.scrollWidth > el.clientWidth + 1), false, `${name}: mobile panel contained`);
    await page.setViewportSize({ width: 1440, height: 890 });
  }
  manifest.push({ name, source: "src/studio/Studio.tsx and its real components; synthetic API data", width: 2880, height: 1780 });
}
async function open(url: string) {
  await page.goto(base + url);
  await page.locator("#studio-message").waitFor({state:"attached"});
  if (url.includes("panel=")) await page.getByRole("dialog").waitFor();
}
try {
  for (example = 0; example < examples.length; example++) {
    await open("/?thread=team-room");
    await page.getByText(examples[example]![0]!, {exact:true}).waitFor();
    await shot(["team", "day", "build"][example]!);
  }
  example = 0;
  await open("/?thread=team-room&panel=settings"); await shot("settings");
  const settingsWidth = (await page.getByRole("dialog").boundingBox())!.width;
  await page.getByRole("link", {name:"Your AI Choose providers and models"}).click();
  await page.locator(".ai-account").first().waitFor();
  assert.equal((await page.getByRole("dialog").boundingBox())!.width, settingsWidth, "Settings and provider use the same width");
  await shot("accounts");
  const rows = await page.locator(".ai-account").evaluateAll(elements => elements.map(el => el.getBoundingClientRect().height));
  assert.ok(rows.every(height => height < 130), "Provider rows remain compact");
  await page.getByRole("button", {name:"API & local models", exact:true}).click(); await shot("api");
  await page.getByRole("button", {name:/Add an API|Add a connection|Add API/}).click(); await shot("api-form");
  await page.getByRole("button", {name:"Back to settings"}).click();
  assert.equal(await page.getByRole("heading", {name:"Settings",exact:true}).count(), 1);
  await open("/?thread=team-room&panel=provider");
  await page.locator(".ai-team").last().scrollIntoViewIfNeeded(); await shot("models");
  await open("/?thread=team-room&panel=routines"); await shot("routines");
  await open("/?thread=team-room&panel=control"); await shot("permissions");
  await page.getByRole("heading", {name:"Self-extending studio",exact:true}).scrollIntoViewIfNeeded(); await shot("self-extend");
  await open("/?thread=team-room");
  await page.getByRole("button", {name:"Create teammate", exact:true}).click();
  await page.getByRole("dialog").waitFor(); await shot("creator");
  assert.deepEqual(errors, [], "Real UI mounts without browser errors");
  writeFileSync(path.join(output, "manifest.json"), JSON.stringify({ capturedAt: new Date().toISOString(), realInterface: true, sampleDataOnly: true, captures: manifest }, null, 2));
  console.log(`PASS: ${manifest.length} real-interface captures. No owner accounts, external API calls or actions.`);
} finally {
  await browser.close(); await vite.close(); db.close(); rmSync(root, { recursive: true, force: true });
}

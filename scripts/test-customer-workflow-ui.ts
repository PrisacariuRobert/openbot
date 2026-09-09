import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium, type Page } from "playwright-core";
import { customerWorkflowFixture } from "../src/server/testing/customer-workflow-fixture.js";

const output = "/tmp/openbot-customer-workflow-qa";
mkdirSync(output, { recursive: true });
const fixture = await customerWorkflowFixture();
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const errors: string[] = [];
async function reviewAction(page: Page, name: string) {
  const controls = page.locator(".run-controls").filter({ hasText: name });
  const approve = controls.getByRole("button", { name: "Approve action", exact: true });
  await approve.waitFor();
  assert.equal(await approve.isDisabled(), true, "Each action requires opening its own full review");
  await controls.getByText("Review the full action", { exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll<HTMLButtonElement>(".run-controls button")].some(button => button.textContent === "Approve action" && !button.disabled));
  assert.equal(await approve.isEnabled(), true);
  return { controls, approve };
}
try {
  const meeting = await fixture.pending("google_calendar_create");
  browser = await chromium.launch({ executablePath: process.env.OPENBOT_CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on("pageerror", error => errors.push(error.message));
  page.setDefaultTimeout(12_000);
  await page.goto(fixture.base + "/studio.html?thread=bot-nova");
  const calendar = await reviewAction(page, "Create “Cedar review” in Calendar");
  assert.equal(fixture.writes.length, 0);
  assert.match(await calendar.controls.innerText(), /cedar-team@example\.com/);
  await calendar.approve.click();
  await fixture.until(() => fixture.db.getApprovedAction(meeting.id)?.status === "completed");
  const pending = await fixture.pending("gmail_reply");
  const reply = await reviewAction(page, "Reply to cedar-team@example.com");
  assert.equal(fixture.writes.length, 1, "The calendar decision must not approve the reply");
  const detail = await reply.controls.innerText();
  for (const value of ["cedar-team@example.com", "owner@example.com", "Can we review the Cedar project tomorrow?", "https://calendar.google.com/calendar/event?eid=cedar"]) assert.ok(detail.includes(value), `Missing reviewed detail: ${value}`);
  await reply.controls.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, "reply-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await reply.controls.scrollIntoViewIfNeeded();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Phone review must not overflow horizontally");
  await page.screenshot({ path: path.join(output, "reply-phone.png") });
  await reply.approve.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, "reply-phone-actions.png") });
  await reply.approve.click();
  await fixture.until(() => fixture.db.getApprovedAction(pending.id)?.status === "completed");
  assert.equal(fixture.writes.length, 2);
  assert.equal(fixture.sent()?.threadId, "thread001");
  assert.deepEqual(fixture.failures, []);
  assert.deepEqual(errors, []);
  console.log(`PASS: actual task → calendar review → separately reviewed reply, desktop and 390px, no horizontal overflow or page errors, one write each. Screenshots: ${output}. Local synthetic account and deterministic runtime only.`);
} finally { await browser?.close(); await fixture.close(); }

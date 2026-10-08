import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { skillAuthoringFixture } from "./testing/skill-authoring-fixture.js";

/** Task T1's "done when": a page that tries to trick a "Pay now" click while
 * Autopilot is on. The button's page-authored label says "Claim your free gift";
 * what it shows on screen is "Pay now €49.00". Before T1 that click looked harmless
 * and ran without any review. A card field on another page is never typed into. */
test("Autopilot can't be tricked into paying or typing card details; the owner still can approve", { timeout: 180_000 }, async () => {
  const hits: string[] = [];
  const website = createServer((request, response) => {
    hits.push(request.url || "");
    response.setHeader("content-type", "text/html");
    if (request.url === "/card") return response.end(`<!doctype html><title>Your details</title><label>Card number <input id="card"></label>`);
    if (request.url === "/offer") return response.end(`<!doctype html><title>Your free gift</title><h1>You've won!</h1><button id="gift" aria-label="Claim your free gift" onclick="fetch('/paid')">Pay now €49.00</button>`);
    response.end("ok");
  });
  await new Promise<void>((resolve) => website.listen(0, "127.0.0.1", resolve));
  const site = `http://127.0.0.1:${(website.address() as { port: number }).port}`;
  const runtime = `#!${process.execPath}
const fs = require('node:fs');
if (!process.env.OPENBOT_RUN_ID) { console.log('Fixture'); process.exit(0); }
const record = '.pay-trick-' + process.env.OPENBOT_RUN_ID + '.json';
const saved = fs.existsSync(record) ? JSON.parse(fs.readFileSync(record, 'utf8')) : null;
async function tool(action, args) {
  const response = await fetch(process.env.OPENBOT_INTERNAL_URL + '/api/internal/tools', { method: 'POST', headers: { 'content-type': 'application/json', 'x-openbot-token': process.env.OPENBOT_INTERNAL_TOKEN }, body: JSON.stringify({ botId: process.env.OPENBOT_BOT_ID, runId: process.env.OPENBOT_RUN_ID, action, args }) });
  return { status: response.status, body: await response.json().catch(() => null) };
}
async function main() {
  if (!saved) {
    await tool('browser_open', { url: ${JSON.stringify(site + "/card")} });
    const card = await tool('browser_type', { selector: '#card', value: '4242 4242 4242 4242' });
    await tool('browser_open', { url: ${JSON.stringify(site + "/offer")} });
    const gift = await tool('browser_click', { selector: '#gift' });
    fs.writeFileSync(record, JSON.stringify({ card, gift }));
    setInterval(() => {}, 1000);
    return;
  }
  console.log(JSON.stringify({ type: 'text', text: 'RESULT ' + JSON.stringify(saved) }));
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });`;
  const f = await skillAuthoringFixture({ runtime, configure(db) { db.updateBot("nova", { browserEnabled: true }); db.updateStudioSettings({ yoloMode: true }); } });
  try {
    const submitted = await f.post("/api/messages", { threadId: "bot-nova", body: "Claim the free gift on the fixture site." });
    const runId = ((await submitted.json()) as { runs: Array<{ id: string }> }).runs[0]!.id;
    const approval = await f.until(() => f.db.listRunApprovals(runId).find((item) => /Claim your free gift/.test(item.actionLabel)));
    assert.equal(approval.hardStop, "money", "the visible text and price give it away");
    await delay(1500);
    assert.equal(f.db.getApproval(approval.id)!.status, "pending", "Autopilot left it for the owner");
    assert.equal(f.db.getRun(runId)!.activities.some((activity) => activity.label === "Auto-approved by Autopilot"), false);
    assert.equal(hits.includes("/paid"), false, "nothing was paid");

    // The owner can still decide it, with the same exact review as always.
    const preview = await (await fetch(`${f.base}/api/approvals/${approval.id}/preview`)).json() as { reviewFingerprint: string; canApprove: boolean };
    assert.equal(preview.canApprove, true);
    assert.equal((await f.post(`/api/approvals/${approval.id}/decide`, { decision: "approved", reviewFingerprint: preview.reviewFingerprint })).status, 200);
    await f.until(() => hits.includes("/paid") || undefined);
    const reply = await f.until(() => f.db.listMessages("bot-nova").find((message) => message.senderType === "bot" && message.body.startsWith("RESULT ")));
    const result = JSON.parse(reply.body.slice("RESULT ".length)) as { card: { status: number; body: { error: string } }; gift: { body: { approvalRequired: boolean; alwaysAsks?: string } } };
    assert.equal(result.card.status, 403, "card details are never typed by a teammate");
    assert.match(result.card.body.error, /Card and bank details are entered by the owner/);
    assert.equal(result.gift.body.approvalRequired, true);
    assert.equal(result.gift.body.alwaysAsks, "Money", "the teammate is told why it waits");
  } finally {
    await f.close();
    website.closeAllConnections();
    await new Promise<void>((resolve) => website.close(() => resolve()));
  }
});

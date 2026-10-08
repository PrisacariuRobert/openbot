import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { autopilotMayDecide } from "../shared/autopilot.js";
import { approvalPreview } from "../shared/approval-preview.js";
import { performTeammateProposal, prepareTeammateProposal } from "./teammate-proposals.js";
import { OpenBotDatabase } from "./testing/database.js";
import { skillAuthoringFixture } from "./testing/skill-authoring-fixture.js";

function studio() {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-proposals-"));
  const db = new OpenBotDatabase(root);
  db.updateBot("nova", { providerInstanceId: "local-opencode", model: "opencode/fixture" });
  return { db, close: () => { db.close(); rmSync(root, { recursive: true, force: true }); } };
}

test("a proposal names the specialist, why and the proposer's AI; the same checks run again on approval", () => {
  const { db, close } = studio();
  try {
    const nova = db.getBot("nova")!;
    const prepared = prepareTeammateProposal(db, nova, nova.threadId, { key: "writer", why: "This job is a long customer letter that needs a careful writer." });
    assert.ok(!("error" in prepared));
    assert.equal(prepared.label, "Add Pixel (Writer) to your team");
    assert.match(prepared.reason, /Nova suggests adding Pixel, a writer: This job is a long customer letter.*Pixel would use Nova's AI \(opencode\/fixture\)/);
    assert.deepEqual({ key: prepared.proposal.key, providerInstanceId: prepared.proposal.providerInstanceId, model: prepared.proposal.model, browserEnabled: prepared.proposal.browserEnabled }, { key: "writer", providerInstanceId: "local-opencode", model: "opencode/fixture", browserEnabled: false });
    // The owner reviews exactly this, and Autopilot never decides it.
    const preview = approvalPreview({ id: "a", runId: "r", botId: nova.id, botName: nova.name, kind: "external", reason: prepared.reason, actionLabel: prepared.label, status: "pending", createdAt: "", decidedAt: null }, { id: "r", botId: nova.id, prompt: "x" }, { type: "propose_teammate", botId: nova.id, args: prepared.proposal });
    assert.equal(preview.canApprove, true);
    assert.deepEqual(preview.fields.slice(0, 4).map((field) => field.value), ["Pixel", "Writer", "This job is a long customer letter that needs a careful writer.", "opencode/fixture"]);
    assert.equal(autopilotMayDecide({ kind: "external", actionType: "propose_teammate" }), false, "never automatic, at any level");

    const before = db.listBots().length;
    assert.match(performTeammateProposal(db, prepared.proposal), /Pixel \(Writer\) joined the team on opencode\/fixture/);
    const writer = db.listBots().find((bot) => bot.role === "Writer")!;
    assert.equal(db.listBots().length, before + 1);
    assert.equal(writer.model, "opencode/fixture");
    assert.equal(writer.providerInstanceId, "local-opencode");
    assert.equal(writer.autopilot, false, "a new teammate starts on Ask first");
    assert.throws(() => performTeammateProposal(db, prepared.proposal), /already on the team/, "approving twice adds nobody");
  } finally { close(); }
});

test("refused: a role already on the team, no AI, a full studio, a bad request", () => {
  const { db, close } = studio();
  try {
    const nova = db.getBot("nova")!;
    const refusal = (args: unknown, bot = nova) => { const result = prepareTeammateProposal(db, bot, nova.threadId, args); return "error" in result ? result : null; };
    assert.match(refusal({ key: "researcher", why: "I need another researcher for this." })!.error, /researcher is already on the team/);
    assert.match(refusal({ key: "writer", why: "Writing." })!.error, /Name the specialist/, "a reason of a few words isn't enough");
    assert.match(refusal({ key: "designer", why: "This needs a designer for the logo." })!.error, /Name the specialist/);
    assert.match(refusal({ key: "writer", why: "This needs a careful writer for a letter." }, { ...nova, providerInstanceId: null, model: "" })!.error, /no AI connected/);
    db.updateStudioSettings({ maxTeammates: db.listBots().length });
    const full = refusal({ key: "writer", why: "This needs a careful writer for a letter." })!;
    assert.equal(full.status, 409);
    assert.match(full.error, /studio is full \(3 teammates\)/);
  } finally { close(); }
});

const RUNTIME = `#!${process.execPath}
const fs = require('node:fs');
if (!process.env.OPENBOT_RUN_ID) { console.log('Fixture'); process.exit(0); }
const record = '.proposal-' + process.env.OPENBOT_RUN_ID + '.json';
async function main() {
  if (fs.existsSync(record)) { console.log(JSON.stringify({ type: 'text', text: 'RESULT ' + fs.readFileSync(record, 'utf8') })); return; }
  const response = await fetch(process.env.OPENBOT_INTERNAL_URL + '/api/internal/tools', { method: 'POST', headers: { 'content-type': 'application/json', 'x-openbot-token': process.env.OPENBOT_INTERNAL_TOKEN }, body: JSON.stringify({ botId: process.env.OPENBOT_BOT_ID, runId: process.env.OPENBOT_RUN_ID, action: 'propose_teammate', args: { key: 'writer', why: 'This job is a long customer letter that needs a careful writer.' } }) });
  const body = await response.json();
  fs.writeFileSync(record, JSON.stringify({ status: response.status, body }));
  if (body.approvalRequired) { setInterval(() => {}, 1000); return; }
  console.log(JSON.stringify({ type: 'text', text: 'RESULT ' + JSON.stringify({ status: response.status, body }) }));
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });`;

test("through the real server on Autopilot: the owner decides, a decline isn't repeated, an approval adds one teammate", { timeout: 180_000 }, async () => {
  const f = await skillAuthoringFixture({ runtime: RUNTIME, configure(db) { db.updateStudioSettings({ yoloMode: true }); } });
  try {
    const ask = async () => {
      const response = await f.post("/api/messages", { threadId: "bot-nova", body: "Write a careful letter to our landlord about the boiler." });
      return ((await response.json()) as { runs: Array<{ id: string }> }).runs[0]!.id;
    };
    const roster = f.db.listBots().length;
    const first = await ask();
    const proposal = await f.until(() => f.db.listRunApprovals(first).find((approval) => approval.actionLabel === "Add Pixel (Writer) to your team"));
    await delay(1500);
    assert.equal(f.db.getApproval(proposal.id)!.status, "pending", "Autopilot doesn't add teammates");
    assert.equal(f.db.listBots().length, roster, "nobody is added before the owner decides");
    assert.equal((await f.post(`/api/approvals/${proposal.id}/decide`, { decision: "denied" })).status, 200);
    await f.until(() => ["completed", "failed", "cancelled"].includes(f.db.getRun(first)!.status) || undefined);

    // Asked again in the same conversation: refused, without a card.
    const second = await ask();
    const reply = await f.until(() => f.db.listMessages("bot-nova").find((message) => message.runId === second && message.body.startsWith("RESULT ")));
    const repeated = JSON.parse(reply.body.slice(7)) as { status: number; body: { error: string } };
    assert.equal(repeated.status, 409);
    assert.match(repeated.body.error, /already declined adding a writer in this conversation/);
    assert.equal(f.db.listRunApprovals(second).length, 0);

    // In another conversation the owner can say yes: exactly one teammate is added, on Nova's AI.
    const thread = f.db.createGroupThread("Letters", ["nova"]);
    const response = await f.post("/api/messages", { threadId: thread.id, body: "Write a careful letter to our landlord about the boiler.", targetBotIds: ["nova"] });
    const third = ((await response.json()) as { runs: Array<{ id: string }> }).runs[0]!.id;
    const again = await f.until(() => f.db.listRunApprovals(third).find((approval) => approval.status === "pending"));
    const preview = await (await fetch(`${f.base}/api/approvals/${again.id}/preview`)).json() as { reviewFingerprint: string; canApprove: boolean };
    assert.equal(preview.canApprove, true);
    assert.equal((await f.post(`/api/approvals/${again.id}/decide`, { decision: "approved", reviewFingerprint: preview.reviewFingerprint })).status, 200);
    const writer = await f.until(() => f.db.listBots().find((bot) => bot.role === "Writer"));
    assert.equal(f.db.listBots().length, roster + 1);
    assert.equal(writer.model, f.db.getBot("nova")!.model);
  } finally { await f.close(); }
});

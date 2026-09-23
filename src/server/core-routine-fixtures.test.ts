import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { skillAuthoringFixture } from "./testing/skill-authoring-fixture.js";
import { prepareCoreRoutineFixture } from "../../verification/core-routine-fixtures.js";
import type { CoreVariant } from "../../verification/core-site-fixtures.js";

test("P05 is the frozen app-owned routine-edit family", () => {
  const catalog = JSON.parse(readFileSync(new URL("../../verification/product-cases.json", import.meta.url), "utf8")) as { cases: Array<{ id: string; family: string; heldOut: boolean; variants: string[] }> };
  const item = catalog.cases.find(entry => entry.id === "P05");
  assert.deepEqual({ family: item?.family, heldOut: item?.heldOut, variants: item?.variants }, { family: "routine-edit", heldOut: false, variants: ["v1", "v2", "v3"] });
});

const runtime = `#!${process.execPath}
const endpoint = process.env.OPENBOT_INTERNAL_URL, runId = process.env.OPENBOT_RUN_ID;
if (!endpoint || !runId) { console.log('Fixture runtime'); process.exit(0); }
async function main() {
  const prompt = process.argv.at(-1) || '';
  const name = prompt.match(/named exactly “([^”]+)”/)?.[1];
  const after = prompt.match(/instructions to exactly: (.*?) Ask me/)?.[1];
  if (!name || !after) throw new Error('Task prompt is incomplete');
  const headers = { 'content-type': 'application/json', 'x-openbot-token': process.env.OPENBOT_INTERNAL_TOKEN };
  const call = async (action, args) => {
    const response = await fetch(endpoint + '/api/internal/tools', { method:'POST', headers, body:JSON.stringify({ botId:process.env.OPENBOT_BOT_ID, runId, action, args }) });
    return { status: response.status, body: await response.json() };
  };
  const listed = await call('routine_list', {});
  if (listed.status !== 200) throw new Error('Could not list routines');
  const target = listed.body.routines.find(item => item.name === name);
  if (!target) throw new Error('Target routine was not listed');
  if ('prompt' in target) throw new Error('Broad routine listing leaked instructions');
  const exact = await call('routine_list', { routineId:target.id });
  if (exact.status !== 200 || exact.body.count !== 1 || exact.body.routines[0].id !== target.id) throw new Error('Exact routine readback failed');
  if (exact.body.routines[0].prompt === after) {
    console.log(JSON.stringify({ type:'text', text:name + ' now has these verified instructions: ' + after }));
    return;
  }
  const proposed = await call('routine_update', { routineId:target.id, expectedRevision:target.revision, prompt:after });
  if (proposed.status !== 200 || !proposed.body.approvalRequired) throw new Error('Routine update was not held for owner approval: ' + JSON.stringify(proposed));
  console.log(JSON.stringify({ type:'text', text:'Waiting for the owner to review the routine edit.' }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
`;

for (const variant of ["v1", "v2", "v3"] satisfies CoreVariant[]) {
  test(`P05 ${variant}: app-owned routine edit is approved once and verified through routine_list`, { timeout: 240_000 }, async () => {
    let fixture: ReturnType<typeof prepareCoreRoutineFixture>;
    const f = await skillAuthoringFixture({ runtime, configure(db) { fixture = prepareCoreRoutineFixture(db, variant); } });
    try {
      assert.equal(fixture!.evaluate("not-started", "").correctResult, false);
      assert.equal(fixture!.evaluate("not-started", "").actualEffects, 0);
      const response = await f.post("/api/messages", { threadId: "bot-nova", targetBotIds: ["nova"], body: fixture!.prompt });
      assert.equal(response.status, 202, await response.clone().text());
      const { runs } = await response.json() as { runs: Array<{ id: string }> };
      const runId = runs[0]!.id;
      const messages = await f.until(() => {
        if (f.db.getRun(runId)?.status !== "completed") return false;
        const current = f.db.listMessages("bot-nova").filter(message => message.runId === runId && message.senderType === "bot");
        return current.length > 0 && current;
      });
      assert.equal(messages.length, 1, "Only the verified final answer should be sent");
      const result = fixture!.evaluate(runId, messages[0]!.body);
      assert.equal(result.correctResult, true);
      assert.equal(result.correctResource, true);
      assert.equal(result.correctAccount, true);
      assert.equal(result.actualEffects, 1);
      assert.equal(result.expectedEffects, 1);
      assert.equal(result.unauthorizedEffects, 0);
      assert.equal(result.duplicateConsequences, 0);
      assert.match(result.evidenceSha256, /^[0-9a-f]{64}$/);
    } finally { await f.close(); }
  });
}

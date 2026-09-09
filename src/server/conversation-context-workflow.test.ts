import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { skillAuthoringFixture } from "./testing/skill-authoring-fixture.js";

test("real host refreshes an oversized completed session, keeps follow-up context and scopes searchable history", { timeout: 45_000 }, async () => {
  const runtime = `#!${process.execPath}
const fs = require('node:fs');
if (!process.env.OPENBOT_RUN_ID) { console.log('Fixture runtime'); process.exit(0); }
const runId = process.env.OPENBOT_RUN_ID, prompt = process.argv.at(-1);
const first = !fs.existsSync('.context-first');
async function main() {
  let observations = {};
  if (first) fs.writeFileSync('.context-first', 'first');
  else {
    const body = {botId:process.env.OPENBOT_BOT_ID,runId,action:'conversation_search',args:{query:'Cedar'}};
    const call = (data, token=process.env.OPENBOT_INTERNAL_TOKEN) => fetch(process.env.OPENBOT_INTERNAL_URL+'/api/internal/tools',{method:'POST',headers:{'content-type':'application/json','x-openbot-token':token},body:JSON.stringify(data)});
    const result = await call(body);
    observations = {status:result.status,result:await result.json(),wrongThread:(await call({...body,args:{query:'Cedar',threadId:'bot-pixel'}})).status,wrongBot:(await call({...body,botId:'pixel'})).status,badToken:(await call(body,'invalid')).status};
  }
  fs.writeFileSync('context-observation-'+runId+'.json',JSON.stringify({args:process.argv.slice(2,-1),prompt,...observations}));
  console.log(JSON.stringify({type:'step_finish',sessionID:first?'large-session':'fresh-session',part:{id:runId,tokens:{input:first?2000:900,output:20,cache:{read:first?60000:0}}}}));
  console.log(JSON.stringify({type:'text',text:first?'Cedar reference is 001. No external actions were performed.':'Cedar reference 001 retained. Nothing was sent or changed.'}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
`;
  const f = await skillAuthoringFixture({ runtime, configure(db) {
    db.addMessage({ threadId: "bot-pixel", senderType: "user", senderId: null, body: "Cedar OTHER-THREAD-PRIVATE" });
    const old = db.createRun({ threadId: "bot-nova", botId: "pixel", prompt: "Old private job", status: "completed" });
    db.addAgentMessage({ threadId: "bot-nova", fromBotId: "pixel", toBotId: "nova", body: "Cedar OLD-PRIVATE-SIGNAL", kind: "finding", expectsReply: false, runId: old.id, hopCount: 1, dedupeKey: "private-before-test" });
  } });
  try {
    const submit = async (body: string) => {
      const response = await f.post("/api/messages", { threadId: "bot-nova", targetBotIds: ["nova"], body });
      assert.equal(response.status, 202);
      const { runs } = await response.json() as { runs: {id: string}[] }, id = runs[0]!.id;
      const result = await f.until(() => f.db.getRun(id)?.status === "completed" && f.db.getRun(id));
      assert.ok(result);
      const record = JSON.parse(readFileSync(path.join(f.db.workspacesDir, "nova", `context-observation-${id}.json`), "utf8"));
      return { id, result, record };
    };
    const first = await submit("Remember Cedar reference 001 for this conversation. No files or actions needed.");
    assert.equal(f.db.extensionRecord<{peakInputTokens:number}>("model-session-context", "large-session")?.peakInputTokens, 62_000);
    assert.equal(first.result.inputTokens, 2000, "Context footprint does not change charged token accounting");
    const next = await submit("What was that reference? Search Cedar in this conversation to check.");
    assert.ok(!next.record.args.includes("--session"), "Do not resume the oversized runtime session");
    assert.match(next.record.prompt, /Conversation continuity/);
    assert.match(next.record.prompt, /Cedar reference is 001/);
    assert.doesNotMatch(next.record.prompt, /Continue the existing task|OLD-PRIVATE-SIGNAL|OTHER-THREAD-PRIVATE/);
    assert.ok(next.record.prompt.length < 20_000);
    assert.equal(next.record.status, 200);
    assert.equal(next.record.wrongThread, 400);
    assert.equal(next.record.wrongBot, 403);
    assert.equal(next.record.badToken, 403);
    assert.match(JSON.stringify(next.record.result), /001/);
    assert.doesNotMatch(JSON.stringify(next.record.result), /PRIVATE/);
    assert.ok(next.result.activities.some(activity => activity.label === "Refreshed working context"));
    assert.ok(f.db.listMessages("bot-nova").some(message => message.body.includes("Cedar reference is 001")));
  } finally { await f.close(); }
});

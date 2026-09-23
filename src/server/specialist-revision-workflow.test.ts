import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { skillAuthoringFixture } from "./testing/skill-authoring-fixture.js";

test("Pixel asks Scout to review exact current files, then returns one corrected artifact in the same conversation", { timeout: 60_000 }, async () => {
  const runtime = [
    "#!" + process.execPath,
    "const fs=require('node:fs');if(!process.env.OPENBOT_RUN_ID){console.log('Fixture');process.exit(0)}",
    "const prompt=process.argv.at(-1)||'';",
    "async function tool(action,args){let r=await fetch(process.env.OPENBOT_INTERNAL_URL+'/api/internal/tools',{method:'POST',headers:{'content-type':'application/json','x-openbot-token':process.env.OPENBOT_INTERNAL_TOKEN},body:JSON.stringify({botId:process.env.OPENBOT_BOT_ID,runId:process.env.OPENBOT_RUN_ID,action,args})});return {status:r.status,body:await r.json()}}",
    "async function main(){if(process.env.OPENBOT_BOT_ID==='scout'){let paths=[...prompt.matchAll(/handoff\\/[a-z0-9-]+\\/(?:brief\\.md|source\\.csv)/g)].map(x=>x[0]);if(paths.length!==2)throw Error('Missing exact handoff files: '+prompt.slice(-800));let files=paths.map(p=>fs.readFileSync(p,'utf8'));fs.writeFileSync('.scout-reviewed.json',JSON.stringify({paths,files}));if(!files.some(x=>x.includes('Total 41'))||!files.some(x=>x.includes('A,42')))throw Error('Wrong review inputs');console.log(JSON.stringify({type:'text',text:'DISAGREE: the brief says 41 but the source says 42. Correct the same brief.'}));return}let phase='.pixel-review-'+process.env.OPENBOT_RUN_ID;if(!fs.existsSync(phase)){fs.writeFileSync('brief.md','# Quarterly brief\\nTotal 41\\n');fs.writeFileSync('source.csv','id,total\\nA,42\\n');let r=await tool('message_teammate',{botId:'scout',message:'Review the exact current brief against its source.',kind:'question',expectsReply:true,artifacts:[{path:'brief.md'},{path:'source.csv'}],dedupeKey:'review-current'});fs.writeFileSync(phase,JSON.stringify(r));if(r.status!==200||!r.body.ok)throw Error(JSON.stringify(r));console.log(JSON.stringify({type:'text',text:'Scout is checking the draft.'}));return}fs.writeFileSync('brief.md','# Quarterly brief\\nTotal 42\\nCorrected after Scout checked source.csv.\\n');console.log(JSON.stringify({type:'text',text:'Corrected the same brief after Scout reviewed the source. [Open the brief](brief.md).'}))}",
    "main().catch(e=>{console.error(e);process.exitCode=1});",
  ].join("\n");
  const fixture = await skillAuthoringFixture({ runtime, configure(db) {
    db.updateBot("pixel", { providerInstanceId: "local-opencode", model: "opencode/fixture" });
    db.updateBot("scout", { providerInstanceId: "local-opencode", model: "opencode/fixture" });
  } });
  try {
    const sent = await fixture.post("/api/messages", { threadId: "bot-pixel", targetBotIds: ["pixel"], body: "Have Scout check my quarterly source, then correct the brief and give me one final file." });
    assert.equal(sent.status, 202, await sent.clone().text());
    const { runs } = await sent.json() as { runs: Array<{ id: string }> };
    const runId = runs[0]!.id;
    await fixture.until(() => fixture.db.getRun(runId)?.status === "completed");
    const children = fixture.db.listChildRuns(runId);
    assert.equal(children.length, 1);
    assert.equal(children[0]?.botId, "scout");
    assert.equal(children[0]?.status, "completed");
    const reviewedPath = path.join(fixture.db.workspacesDir, "scout", ".scout-reviewed.json");
    assert.equal(existsSync(reviewedPath), true);
    const reviewed = JSON.parse(readFileSync(reviewedPath, "utf8")) as { paths: string[]; files: string[] };
    assert.equal(reviewed.files.length, 2);
    assert.ok(reviewed.files.some(file => file.includes("Total 41")));
    assert.ok(reviewed.files.some(file => file.includes("A,42")));
    assert.equal(fixture.db.extensionRecords("handoff-artifact").length, 2);
    const expectedSha = createHash("sha256").update("# Quarterly brief\nTotal 41\n").digest("hex");
    assert.ok(fixture.db.extensionRecords<{ originSha256: string }>("handoff-artifact").some(record => record.value.originSha256 === expectedSha));
    const final = await fixture.until(() => fixture.db.listMessages("bot-pixel").find(message => message.runId === runId && message.senderId === "pixel" && message.attachments.length > 0));
    const messages = fixture.db.listMessages("bot-pixel");
    assert.equal(final.attachments.length, 1);
    assert.equal(final.attachments[0]?.name, "brief.md");
    assert.match(readFileSync(fixture.db.attachmentFile(final.attachments[0]!.id)!.storagePath, "utf8"), /Total 42/);
    assert.equal(messages.filter(message => message.senderId === "scout" && message.attachments.length > 0).length, 0, "specialist stays private");
  } finally { await fixture.close(); }
});

test("a failed handoff can retry the same intent after fixing its file without a ghost specialist task", { timeout: 45_000 }, async () => {
  const runtime = [
    "#!" + process.execPath,
    "const fs=require('node:fs');if(!process.env.OPENBOT_RUN_ID){console.log('Fixture');process.exit(0)}",
    "async function tool(args){let r=await fetch(process.env.OPENBOT_INTERNAL_URL+'/api/internal/tools',{method:'POST',headers:{'content-type':'application/json','x-openbot-token':process.env.OPENBOT_INTERNAL_TOKEN},body:JSON.stringify({botId:process.env.OPENBOT_BOT_ID,runId:process.env.OPENBOT_RUN_ID,action:'handoff',args})});return {status:r.status,body:await r.json()}}",
    "async function main(){if(process.env.OPENBOT_BOT_ID==='scout'){console.log(JSON.stringify({type:'text',text:'The exact file is readable.'}));return}let mark='.retry-'+process.env.OPENBOT_RUN_ID;if(fs.existsSync(mark)){console.log(JSON.stringify({type:'text',text:'The specialist checked the corrected file.'}));return}let args={botId:'scout',task:'Review the result',artifacts:[{path:'ready.txt'}],dedupeKey:'same-intent'};let first=await tool(args);fs.writeFileSync('ready.txt','Ready for review');let second=await tool(args);fs.writeFileSync(mark,JSON.stringify({first,second}));console.log(JSON.stringify({type:'text',text:'Review requested.'}))}",
    "main().catch(e=>{console.error(e);process.exitCode=1});",
  ].join("\n");
  const fixture = await skillAuthoringFixture({ runtime, configure(db) {
    db.updateBot("pixel", { providerInstanceId: "local-opencode", model: "opencode/fixture" });
    db.updateBot("scout", { providerInstanceId: "local-opencode", model: "opencode/fixture" });
  } });
  try {
    const sent = await fixture.post("/api/messages", { threadId: "bot-pixel", targetBotIds: ["pixel"], body: "Ask Scout to review the file once it is ready." });
    const { runs } = await sent.json() as { runs: Array<{ id: string }> };
    const runId = runs[0]!.id;
    await fixture.until(() => fixture.db.getRun(runId)?.status === "completed");
    const observed = JSON.parse(readFileSync(path.join(fixture.db.workspacesDir, "pixel", ".retry-" + runId), "utf8")) as { first: { status: number }; second: { status: number; body: { ok: boolean } } };
    assert.equal(observed.first.status, 409);
    assert.equal(observed.second.status, 200);
    assert.equal(observed.second.body.ok, true);
    assert.equal(fixture.db.listChildRuns(runId).length, 1);
    assert.equal(fixture.db.extensionRecords("handoff-artifact").length, 1);
  } finally { await fixture.close(); }
});

test("a failed teammate message can retry without recording a ghost message or duplicate file", { timeout: 45_000 }, async () => {
  const runtime = [
    "#!" + process.execPath,
    "const fs=require('node:fs');if(!process.env.OPENBOT_RUN_ID){console.log('Fixture');process.exit(0)}",
    "async function tool(args){let r=await fetch(process.env.OPENBOT_INTERNAL_URL+'/api/internal/tools',{method:'POST',headers:{'content-type':'application/json','x-openbot-token':process.env.OPENBOT_INTERNAL_TOKEN},body:JSON.stringify({botId:process.env.OPENBOT_BOT_ID,runId:process.env.OPENBOT_RUN_ID,action:'message_teammate',args})});return {status:r.status,body:await r.json()}}",
    "async function main(){if(process.env.OPENBOT_BOT_ID==='scout'){console.log(JSON.stringify({type:'text',text:'Reviewed the ready file.'}));return}let mark='.message-retry-'+process.env.OPENBOT_RUN_ID;if(fs.existsSync(mark)){console.log(JSON.stringify({type:'text',text:'The specialist reviewed the ready file.'}));return}let args={botId:'scout',message:'Review the current file',expectsReply:true,artifacts:[{path:'ready.txt'}],dedupeKey:'same-message'};let first=await tool(args);fs.writeFileSync('ready.txt','Current result');let second=await tool(args);let third=await tool(args);fs.writeFileSync(mark,JSON.stringify({first,second,third}));console.log(JSON.stringify({type:'text',text:'Review requested.'}))}",
    "main().catch(e=>{console.error(e);process.exitCode=1});",
  ].join("\n");
  const fixture = await skillAuthoringFixture({ runtime, configure(db) {
    db.updateBot("pixel", { providerInstanceId: "local-opencode", model: "opencode/fixture" });
    db.updateBot("scout", { providerInstanceId: "local-opencode", model: "opencode/fixture" });
  } });
  try {
    const sent = await fixture.post("/api/messages", { threadId: "bot-pixel", targetBotIds: ["pixel"], body: "Ask Scout to review the current file." });
    const { runs } = await sent.json() as { runs: Array<{ id: string }> };
    const runId = runs[0]!.id;
    await fixture.until(() => fixture.db.getRun(runId)?.status === "completed");
    const observed = JSON.parse(readFileSync(path.join(fixture.db.workspacesDir, "pixel", ".message-retry-" + runId), "utf8")) as { first: { status: number }; second: { status: number }; third: { status: number } };
    assert.equal(observed.first.status, 409);
    assert.equal(observed.second.status, 200);
    assert.equal(observed.third.status, 200);
    assert.equal(fixture.db.listChildRuns(runId).length, 1);
    assert.equal(fixture.db.listAgentMessages("bot-pixel").filter(message => message.runId === runId && message.toBotId === "scout" && message.expectsReply).length, 1);
    assert.equal(fixture.db.extensionRecords("handoff-artifact").length, 1);
  } finally { await fixture.close(); }
});

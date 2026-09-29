import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { DatabaseSync } from "node:sqlite";
import { skillAuthoringFixture } from "./testing/skill-authoring-fixture.js";
import { toolAvailability } from "./tool-availability.js";
import { prepareWorkspace } from "./workspace.js";
import type { Approval } from "../shared/types.js";

test("semantic browser is off by default and hides selector tools when enabled", async () => {
  const runtime = `#!${process.execPath}
const fs=require('node:fs');if(!process.env.OPENBOT_RUN_ID){console.log('Fixture');process.exit(0)}
async function call(action,args){const response=await fetch(process.env.OPENBOT_INTERNAL_URL+'/api/internal/tools',{method:'POST',headers:{'content-type':'application/json','x-openbot-token':process.env.OPENBOT_INTERNAL_TOKEN},body:JSON.stringify({botId:process.env.OPENBOT_BOT_ID,runId:process.env.OPENBOT_RUN_ID,action,args})});return response.status}
Promise.all([call('browser_observe',{}),call('browser_see',{}),call('browser_semantic_act',{targetId:'tgt_stale',kind:'click'})]).then(([observe,see,act])=>{fs.writeFileSync('.semantic-flags-'+process.env.OPENBOT_RUN_ID+'.json',JSON.stringify({observe,see,act}));console.log(JSON.stringify({type:'text',text:'The semantic browser capability is off.'}))}).catch(e=>{console.error(e);process.exitCode=1});`;
  const f = await skillAuthoringFixture({ runtime, configure(db) { db.updateBot("nova", { browserEnabled: true }); } });
  try {
    const bot = f.db.getBot("nova")!;
    assert.equal(f.db.getStudioSettings().semanticBrowserEnabled, false);
    assert.equal(toolAvailability(f.db, bot).browser_observe, false);
    assert.equal(toolAvailability(f.db, bot).browser_see, false);
    assert.equal(toolAvailability(f.db, bot).browser_click, true);
    const workspace = prepareWorkspace(f.db, bot);
    const declared = () => JSON.parse(readFileSync(path.join(workspace, "opencode.json"), "utf8")) as { tools: Record<string, boolean> };
    assert.equal(declared().tools.browser_observe, false);
    assert.equal(declared().tools.browser_click, true);
    const submitted = await f.post("/api/messages", { threadId: "bot-nova", body: "Check whether semantic browser access is available." });
    assert.equal(submitted.status, 202);
    const { runs } = await submitted.json() as { runs: Array<{ id: string }> };
    const runId = runs[0]!.id;
    const file = path.join(f.db.workspacesDir, "nova", `.semantic-flags-${runId}.json`);
    const statuses = await f.until(() => { try { return JSON.parse(readFileSync(file, "utf8")) as { observe: number; see: number; act: number }; } catch { return undefined; } });
    assert.deepEqual(statuses, { observe: 403, see: 403, act: 403 }, "a stale offered semantic tool must fail at dispatch while the flag is off");
    f.db.updateStudioSettings({ semanticBrowserEnabled: true });
    assert.equal(toolAvailability(f.db, bot).browser_observe, true);
    assert.equal(toolAvailability(f.db, bot).browser_see, true);
    assert.equal(toolAvailability(f.db, bot).browser_semantic_act, true);
    assert.equal(toolAvailability(f.db, bot).browser_click, false);
    assert.equal(toolAvailability(f.db, bot).browser_type, false);
    assert.equal(toolAvailability(f.db, bot).browser_upload_saved_file, false);
    prepareWorkspace(f.db, bot);
    assert.equal(declared().tools.browser_observe, true);
    assert.equal(declared().tools.browser_see, true);
    assert.equal(declared().tools.browser_semantic_act, true);
    assert.equal(declared().tools.browser_click, false);
    const bridge = spawnSync(process.execPath, [fileURLToPath(new URL("./claude-mcp.mjs", import.meta.url))], {
      env: { ...process.env, OPENBOT_WORKSPACE: workspace, OPENBOT_TOOL_AVAILABILITY: JSON.stringify(toolAvailability(f.db, bot)) },
      input: `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} })}\n`, encoding: "utf8", timeout: 4_000,
    });
    assert.equal(bridge.status, 0, bridge.stderr);
    const listed = JSON.parse(bridge.stdout.trim()) as { result: { tools: Array<{ name: string }> } };
    const names = new Set(listed.result.tools.map(({ name }) => name));
    assert.equal(names.has("browser_observe"), true);
    assert.equal(names.has("browser_see"), true);
    assert.equal(names.has("browser_semantic_act"), true);
    assert.equal(names.has("browser_click"), false);
  } finally { await f.close(); }
});

for (const ownerAction of ["stop", "takeover"] as const) test(`owner ${ownerAction} revokes a waiting semantic click before the link becomes actionable`, { timeout: 30_000 }, async () => {
  let enabled = false;
  let effects = 0;
  const portal = createServer((req, res) => {
    if (req.url === "/enabled") { res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ enabled })); return; }
    if (req.url === "/effect") { effects++; res.end("Unexpected effect"); return; }
    res.setHeader("content-type", "text/html");
    res.end(`<!doctype html><meta charset="utf-8"><title>Waiting link</title><a id="next" href="/effect" style="pointer-events:none">Review status</a><script>setInterval(()=>fetch('/enabled').then(r=>r.json()).then(r=>{document.querySelector('#next').style.pointerEvents=r.enabled?'auto':'none'}),50)</script>`);
  });
  await new Promise<void>((resolve) => portal.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(portal.address() as { port: number }).port}`;
  const runtime = `#!${process.execPath}
const fs=require('node:fs');if(!process.env.OPENBOT_RUN_ID){console.log('Fixture');process.exit(0)}
const marker='.semantic-wait-'+process.env.OPENBOT_RUN_ID;
async function tool(action,args={}){const r=await fetch(process.env.OPENBOT_INTERNAL_URL+'/api/internal/tools',{method:'POST',headers:{'content-type':'application/json','x-openbot-token':process.env.OPENBOT_INTERNAL_TOKEN},body:JSON.stringify({botId:process.env.OPENBOT_BOT_ID,runId:process.env.OPENBOT_RUN_ID,action,args})});return {status:r.status,body:await r.json()}}
async function main(){await tool('browser_open',{url:${JSON.stringify(url)}});const obs=await tool('browser_observe');if(obs.status!==200)throw Error(JSON.stringify(obs));const target=obs.body.targets.find(x=>x.label==='Review status');if(!target)throw Error('Waiting link missing');fs.writeFileSync(marker,'waiting');const result=await tool('browser_semantic_act',{targetId:target.targetId,kind:'click'});fs.writeFileSync(marker,JSON.stringify(result));}
main().catch(e=>{console.error(e);process.exitCode=1});`;
  let f: Awaited<ReturnType<typeof skillAuthoringFixture>> | null = null;
  try {
    f = await skillAuthoringFixture({ runtime, configure(db) {
      db.updateBot("pixel", { providerInstanceId: "local-opencode", model: "opencode/fixture", browserEnabled: true });
      db.updateStudioSettings({ semanticBrowserEnabled: true });
    } });
    const sent = await f.post("/api/messages", { threadId: "bot-pixel", body: "Open the status link when it is ready." });
    assert.equal(sent.status, 202);
    const runId = ((await sent.json()) as { runs: Array<{ id: string }> }).runs[0]!.id;
    const marker = path.join(f.db.workspacesDir, "pixel", `.semantic-wait-${runId}`);
    await f.until(() => existsSync(marker));
    await f.until(() => {
      const raw = new DatabaseSync(path.join(f!.db.dataDir, "openbot.sqlite"), { readOnly: true });
      try {
        const row = raw.prepare("SELECT stage,target,detail FROM action_journal WHERE run_id=? ORDER BY created_at DESC LIMIT 1").get(runId) as { stage?: string; target?: string; detail?: string } | undefined;
        if (row?.stage === "failed_before_effect" || row?.stage === "effect_observed") throw new Error(JSON.stringify({ row, marker: readFileSync(marker, "utf8"), run: f!.db.getRun(runId)?.status }));
        return row?.stage === "dispatch_started";
      }
      finally { raw.close(); }
    });
    const owner = ownerAction === "stop"
      ? await f.post(`/api/runs/${runId}/cancel`, {})
      : await f.post("/api/bots/pixel/browser/takeover/click", { x: 1, y: 1 });
    assert.equal(owner.status, 200, await owner.clone().text());
    enabled = true;
    await f.until(() => {
      const raw = new DatabaseSync(path.join(f!.db.dataDir, "openbot.sqlite"), { readOnly: true });
      try { return (raw.prepare("SELECT stage FROM action_journal WHERE run_id=? ORDER BY created_at DESC LIMIT 1").get(runId) as { stage?: string } | undefined)?.stage === "failed_before_effect"; }
      finally { raw.close(); }
    });
    await delay(250);
    assert.equal(effects, 0, "the link must never navigate after owner revocation");
    assert.equal(f.db.listRunApprovals(runId).length, 0, "ordinary navigation must not ask for a consequential approval");
    if (ownerAction === "stop") assert.equal(f.db.getRun(runId)?.status, "cancelled");
  } finally {
    await f?.close();
    portal.closeAllConnections();
    await new Promise<void>((resolve) => portal.close(() => resolve()));
  }
});

test("turning semantic access off while Save waits for approval does not replay through legacy click", { timeout: 30_000 }, async () => {
  let writes = 0;
  const portal = createServer((req, res) => {
    if (req.url === "/save") { writes++; res.end("saved"); return; }
    res.setHeader("content-type", "text/html");
    res.end('<!doctype html><meta charset="utf-8"><title>Pending save</title><form action="/save" method="post"><label>Due date <input name="due" value="2026-11-04"></label><button id="save" type="submit">Save item</button></form>');
  });
  await new Promise<void>((resolve) => portal.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(portal.address() as { port: number }).port}`;
  const runtime = `#!${process.execPath}
if(!process.env.OPENBOT_RUN_ID){console.log('Fixture');process.exit(0)}
async function tool(action,args={}){const r=await fetch(process.env.OPENBOT_INTERNAL_URL+'/api/internal/tools',{method:'POST',headers:{'content-type':'application/json','x-openbot-token':process.env.OPENBOT_INTERNAL_TOKEN},body:JSON.stringify({botId:process.env.OPENBOT_BOT_ID,runId:process.env.OPENBOT_RUN_ID,action,args})});return {status:r.status,body:await r.json()}}
async function main(){await tool('browser_open',{url:${JSON.stringify(url)}});const page=await tool('browser_observe');if(page.status!==200)throw Error(JSON.stringify(page));const save=page.body.targets.find(x=>x.label==='Save item');if(!save)throw Error('Save missing');const proposal=await tool('browser_semantic_act',{targetId:save.targetId,kind:'click'});if(!proposal.body.approvalRequired)throw Error('Save was not reviewed');setInterval(()=>{},1000)}
main().catch(e=>{console.error(e);process.exitCode=1});`;
  let f: Awaited<ReturnType<typeof skillAuthoringFixture>> | null = null;
  try {
    f = await skillAuthoringFixture({ runtime, configure(db) {
      db.updateBot("pixel", { providerInstanceId: "local-opencode", model: "opencode/fixture", browserEnabled: true });
      db.updateStudioSettings({ semanticBrowserEnabled: true, yoloMode: false });
    } });
    const sent = await f.post("/api/messages", { threadId: "bot-pixel", body: "Save the reviewed item once." });
    assert.equal(sent.status, 202);
    const runId = ((await sent.json()) as { runs: Array<{ id: string }> }).runs[0]!.id;
    const approval = await f.until(() => f!.db.listApprovals().find((entry) => entry.runId === runId && /Save item/.test(entry.actionLabel)));
    const preview = await (await fetch(`${f.base}/api/approvals/${approval.id}/preview`)).json() as { canApprove: boolean; reviewFingerprint: string | null };
    assert.equal(preview.canApprove, true);
    const disabled = await f.post("/api/settings", { semanticBrowserEnabled: false }, "PATCH");
    assert.equal(disabled.status, 200);
    const decision = await f.post(`/api/approvals/${approval.id}/decide`, { decision: "approved", reviewFingerprint: preview.reviewFingerprint });
    assert.equal(decision.status, 200, await decision.clone().text());
    await f.until(() => f!.db.getApprovedAction(approval.id)?.status === "failed");
    assert.equal(writes, 0);
    assert.match(f.db.getApprovedAction(approval.id)?.lastError || "", /Semantic browser actions were turned off/);
    assert.equal(f.db.getStudioSettings().semanticBrowserEnabled, false);
  } finally {
    await f?.close();
    portal.closeAllConnections();
    await new Promise<void>((resolve) => portal.close(() => resolve()));
  }
});

test("Pixel answers a read-only support question through an ordinary message", { timeout: 30_000 }, async () => {
  const expectedDue = "2026-09-30";
  let reads = 0;
  const portal = createServer((_req, res) => {
    reads++;
    res.setHeader("content-type", "text/html");
    res.end(`<!doctype html><meta charset="utf-8"><title>Support records</title><h1>Renewals</h1><a href="/old">Acme renewal 2025 — due 2025-10-14</a><a href="/current">Acme renewal 2026 — due ${expectedDue}</a><a href="/other">Acme support 2026 — due 2026-11-01</a>`);
  });
  await new Promise<void>((resolve) => portal.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(portal.address() as { port: number }).port}`;
  const runtime = `#!${process.execPath}
if(!process.env.OPENBOT_RUN_ID){console.log('Fixture');process.exit(0)}
const {spawnSync}=require('node:child_process');
async function tool(action,args={}){const response=await fetch(process.env.OPENBOT_INTERNAL_URL+'/api/internal/tools',{method:'POST',headers:{'content-type':'application/json','x-openbot-token':process.env.OPENBOT_INTERNAL_TOKEN},body:JSON.stringify({botId:process.env.OPENBOT_BOT_ID,runId:process.env.OPENBOT_RUN_ID,action,args})});const body=await response.json();if(!response.ok)throw Error(JSON.stringify(body));return body}
function bridge(name,args={}){const request={jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}};const child=spawnSync(process.execPath,[${JSON.stringify(fileURLToPath(new URL("./claude-mcp.mjs", import.meta.url)))}],{env:process.env,input:JSON.stringify(request)+'\\n',encoding:'utf8',timeout:5000});if(child.status!==0)throw Error(child.stderr||'bridge failed');return JSON.parse(child.stdout.trim()).result}
async function main(){await tool('browser_open',{url:${JSON.stringify(url)}});const result=bridge('browser_observe');if(result.isError)throw Error(JSON.stringify(result));const observation=JSON.parse(result.content[0].text);const blocked=bridge('browser_click',{selector:'#current'});if(!blocked.isError)throw Error('legacy bridge action was exposed');const matches=observation.targets.filter(x=>x.label.startsWith('Acme renewal 2026 — due '));if(matches.length!==1)throw Error('ambiguous record');const due=matches[0].label.split(' — due ')[1];console.log(JSON.stringify({type:'text',text:'The current due date for Acme renewal 2026 is '+due+'.'}))}
main().catch(e=>{console.error(e);process.exitCode=1});`;
  let f: Awaited<ReturnType<typeof skillAuthoringFixture>> | null = null;
  try {
    f = await skillAuthoringFixture({ runtime, configure(db) {
      db.updateBot("pixel", { providerInstanceId: "local-opencode", model: "opencode/fixture", browserEnabled: true });
      db.updateStudioSettings({ semanticBrowserEnabled: true });
    } });
    const sent = await f.post("/api/messages", { threadId: "bot-pixel", body: "What is the current due date for Acme renewal 2026 in the support portal?" });
    assert.equal(sent.status, 202);
    const { runs } = await sent.json() as { runs: Array<{ id: string }> };
    const runId = runs[0]!.id;
    await f.until(() => f!.db.getRun(runId)?.status === "completed");
    assert.ok(reads > 0);
    assert.equal(f.db.listApprovals().filter((approval) => approval.runId === runId).length, 0, "reading must not require owner approval");
    await f.until(() => f!.db.listMessages("bot-pixel").some((message) => message.body.includes(`Acme renewal 2026 is ${expectedDue}`)));
  } finally {
    await f?.close();
    portal.closeAllConnections();
    await new Promise<void>((resolve) => portal.close(() => resolve()));
  }
});

for (const outcome of ["approved", "stale", "denied"] as const) test(`normal conversation ${outcome === "approved" ? "changes only the reviewed support record, then corrects it next turn" : outcome === "stale" ? "refuses a changed reviewed form" : "honors owner denial without a write"}`, { timeout: 90_000 }, async () => {
  const stale = outcome === "stale";
  const records = new Map([
    ["acme-2025", { name: "Acme renewal 2025", due: "2025-10-14" }],
    ["acme-2026", { name: "Acme renewal 2026", due: "2026-09-30" }],
    ["acme-support", { name: "Acme support 2026", due: "2026-11-01" }],
  ]);
  const writes: Array<{ id: string; due: string }> = [];
  let tamperForm = false;
  let tamperPolled = false;
  const portal = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://localhost");
    if (url.pathname === "/tamper") { if (tamperForm) tamperPolled = true; res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ tamper: tamperForm })); return; }
    if (url.pathname === "/save" && req.method === "POST") {
      let body = "";
      for await (const chunk of req) body += chunk;
      const { id, due } = JSON.parse(body) as { id: string; due: string };
      const record = records.get(id);
      if (!record) { res.writeHead(404); res.end("Unknown record"); return; }
      writes.push({ id, due });
      record.due = due;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(record));
      return;
    }
    res.setHeader("content-type", "text/html");
    if (url.pathname === "/") {
      res.end(`<!doctype html><meta charset="utf-8"><title>Support portal</title><h1>Renewals</h1><nav>${[...records].map(([id, row]) => `<p><a id="record-${id}" href="/record/${id}">${row.name} — due ${row.due}</a></p>`).join("")}</nav>`);
      return;
    }
    const id = url.pathname.split("/").at(-1) || "";
    const record = records.get(id);
    if (!record) { res.writeHead(404); res.end("Unknown record"); return; }
    if (url.pathname.startsWith("/record/")) {
      res.end(`<!doctype html><meta charset="utf-8"><title>${record.name}</title><h1>${record.name}</h1><p>Due ${record.due}</p><a id="edit" href="/edit/${id}">Edit renewal</a>`);
      return;
    }
    res.end(`<!doctype html><meta charset="utf-8"><title>Edit ${record.name}</title><h1>${record.name}</h1><p id="due-view">Due ${record.due}</p><form action="/save" method="post" onsubmit="event.preventDefault();fetch('/save',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:'${id}',due:document.querySelector('#due').value})}).then(r=>r.json()).then(r=>{document.querySelector('#due-view').textContent='Due '+r.due;document.querySelector('#saved').textContent='Saved record '+r.name})"><label>Due date <input id="due" name="due" aria-label="Due date" value="${record.due}"></label><button id="save" type="submit">Save renewal</button></form><p id="saved"></p><script>setInterval(()=>fetch('/tamper').then(r=>r.json()).then(r=>{if(r.tamper)document.querySelector('#due').value='2026-12-31'}),50)</script>`);
  });
  await new Promise<void>((resolve) => portal.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(portal.address() as { port: number }).port}`;
  // This peer exercises the real message -> run -> scoped tool -> approval ->
  // continuation path. It selects by visible labels, never by server state.
  const runtime = `#!${process.execPath}
const fs=require('node:fs');
const {spawnSync}=require('node:child_process');
if(!process.env.OPENBOT_RUN_ID){console.log('Fixture');process.exit(0)}
const file='.semantic-phase-'+process.env.OPENBOT_RUN_ID+'.json';
let state=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{phase:0};
const prompt=String(process.argv.at(-1)||'');
async function tool(action,args={}){const response=await fetch(process.env.OPENBOT_INTERNAL_URL+'/api/internal/tools',{method:'POST',headers:{'content-type':'application/json','x-openbot-token':process.env.OPENBOT_INTERNAL_TOKEN},body:JSON.stringify({botId:process.env.OPENBOT_BOT_ID,runId:process.env.OPENBOT_RUN_ID,action,args})});const body=await response.json();return {status:response.status,body};}
function bridge(name,args={}){const request={jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}};const child=spawnSync(process.execPath,[${JSON.stringify(fileURLToPath(new URL("./claude-mcp.mjs", import.meta.url)))}],{env:process.env,input:JSON.stringify(request)+'\\n',encoding:'utf8',timeout:5000});if(child.status!==0)throw Error(child.stderr||'bridge failed');return JSON.parse(child.stdout.trim()).result}
function save(){fs.writeFileSync(file,JSON.stringify(state))}
async function observe(){const result=await tool('browser_observe');if(result.status!==200)throw Error(JSON.stringify(result));if(result.body.targets.some(x=>'selector' in x))throw Error('selector leaked to model');return result.body}
async function act(observation,kind,label,value){const choices=observation.targets.filter(x=>x.label.includes(label));if(choices.length!==1)throw Error('Expected one control '+label+': '+JSON.stringify(observation.targets));const args={targetId:choices[0].targetId,kind,...(kind==='type'?{value}:{})};const result=kind==='type'?(()=>{const mcp=bridge('browser_semantic_act',args);if(mcp.isError)throw Error(JSON.stringify(mcp));return {status:200,body:JSON.parse(mcp.content[0].text)}})():await tool('browser_semantic_act',args);if(result.status!==200)throw Error(JSON.stringify(result));return result.body.approvalRequired}
async function main(){
  if(state.phase===0){state.desiredDue=prompt.includes('4 Nov 2026')?'2026-11-04':'2026-10-14';await tool('browser_open',{url:${JSON.stringify(url)}});state.staleSelectorStatus=(await tool('browser_click',{selector:'#record-acme-2026'})).status;state.phase=1;save()}
  while(state.phase<5){
    const page=await observe();let held=false;
    if(state.phase===1)held=await act(page,'click','Acme renewal 2026 — due');
    if(state.phase===2)held=await act(page,'click','Edit renewal');
    if(state.phase===3)held=await act(page,'type','Due date',state.desiredDue);
    if(state.phase===4)held=await act(page,'click','Save renewal');
    state.phase++;save();if(held){setInterval(()=>{},1000);return}
  }
  if(${outcome === "approved"}){
    // Simulate a lost confirmation: the approved click ran, but the peer
    // disregards that response and tries the same Save under a new token.
    const page=await observe();
    const saves=page.targets.filter(x=>x.label.includes('Save renewal'));
    if(saves.length!==1)throw Error('Save control disappeared before replay check');
    const replay=await tool('browser_semantic_act',{targetId:saves[0].targetId,kind:'click'});
    state.replayStatus=replay.status;state.replayBody=replay.body;save();
    if(replay.status!==409||!String(replay.body.error||'').includes('UNCERTAIN_CONFLICT'))throw Error('A fresh token escaped the effect fence: '+JSON.stringify(replay));
  }
  if(${outcome === "denied"}&&prompt.includes('The owner declined this proposed action')&&state.reproposeStatus===undefined){
    // Ignore the decline note and propose the same save again.
    const page=await observe();
    const saves=page.targets.filter(x=>x.label.includes('Save renewal'));
    const again=saves.length===1?await tool('browser_semantic_act',{targetId:saves[0].targetId,kind:'click'}):{status:0,body:{}};
    state.reproposeStatus=again.status;state.reproposeBody=again.body;save();
  }
  for(let n=0;n<30;n++){const page=await observe();if(page.textPreview.includes('Due '+state.desiredDue)&&page.textPreview.includes('Saved record Acme renewal 2026')){console.log(JSON.stringify({type:'text',text:'Acme renewal 2026 was saved with due date '+state.desiredDue+'. I read back the same record in the support portal.'}));return}await new Promise(r=>setTimeout(r,100))}
  console.log(JSON.stringify({type:'text',text:'The save result could not be independently read back; do not claim completion.'}));
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1});`;
  let f: Awaited<ReturnType<typeof skillAuthoringFixture>> | null = null;
  try {
    f = await skillAuthoringFixture({ runtime, configure(db) {
      db.updateBot("pixel", { providerInstanceId: "local-opencode", model: "opencode/fixture", browserEnabled: true });
      db.updateStudioSettings({ semanticBrowserEnabled: true, yoloMode: false });
    } });
    const submitted = await f.post("/api/messages", { threadId: "bot-pixel", body: "In the support portal, find Acme renewal 2026 among similar records. Change its due date to 14 Oct 2026, ask before saving, save once, then read back that same record." });
    assert.equal(submitted.status, 202, await submitted.clone().text());
    const { runs } = await submitted.json() as { runs: Array<{ id: string }> };
    const runId = runs[0]!.id;
    const approved = new Set<string>();
    let saveReviewed = false;
    let saveApprovalId = "";
    for (let n = 0; n < 600; n++) {
      const run = f.db.getRun(runId);
      if (run?.status === "completed" || run?.status === "failed" || run?.status === "cancelled") break;
      const next: Approval | undefined = f.db.listApprovals().find((entry) => entry.runId === runId && entry.status === "pending" && !approved.has(entry.id));
      if (next) {
        approved.add(next.id);
        const preview = await (await fetch(`${f.base}/api/approvals/${next.id}/preview`)).json() as { canApprove: boolean; fields: Array<{ value: string }>; reviewFingerprint: string | null };
        assert.equal(preview.canApprove, true, JSON.stringify(preview));
        if (/Save renewal/.test(next.actionLabel)) {
          saveReviewed = true;
          saveApprovalId = next.id;
          assert.equal(writes.length, 0);
          assert.ok(preview.fields.some((field: { value: string }) => field.value === "2026-10-14"), JSON.stringify(preview.fields));
          if (stale) { tamperForm = true; await f.until(() => tamperPolled); await delay(150); }
        }
        const decision = await f.post(`/api/approvals/${next.id}/decide`, { decision: outcome === "denied" && next.id === saveApprovalId ? "denied" : "approved", reviewFingerprint: preview.reviewFingerprint });
        assert.equal(decision.status, 200, await decision.clone().text());
      }
      await delay(100);
    }
    // A declined save no longer ends the task silently: the teammate
    // finishes without it (no write, no new proposal) and says what is left.
    assert.equal(f.db.getRun(runId)?.status, "completed", JSON.stringify(f.db.getRun(runId)));
    if (outcome === "denied") assert.ok(f.db.getRun(runId)!.activities.some((item) => item.label === "Declined by you"));
    assert.equal(saveReviewed, true);
    assert.deepEqual(writes, outcome === "approved" ? [{ id: "acme-2026", due: "2026-10-14" }] : []);
    if (outcome === "denied") {
      assert.equal(f.db.getApproval(saveApprovalId)?.status, "denied");
      assert.equal(f.db.listApprovals().some((approval) => approval.runId === runId && approval.status === "pending"), false, "the denied save must not leave another pending proposal");
    }
    else assert.equal(f.db.getApprovedAction(saveApprovalId)?.status, stale ? "failed" : "completed");
    assert.equal(records.get("acme-2025")?.due, "2025-10-14");
    assert.equal(records.get("acme-support")?.due, "2026-11-01");
    const state = JSON.parse(readFileSync(path.join(f.db.workspacesDir, "pixel", `.semantic-phase-${runId}.json`), "utf8")) as { staleSelectorStatus: number; replayStatus?: number; replayBody?: { error?: string }; reproposeStatus?: number; reproposeBody?: { error?: string } };
    if (outcome === "denied") {
      assert.equal(state.reproposeStatus, 409, "a declined action must not be proposed again");
      assert.match(state.reproposeBody?.error || "", /already declined this action/);
    }
    assert.equal(state.staleSelectorStatus, 403, "a stale offered selector tool must fail at dispatch");
    if (outcome === "approved") {
      assert.equal(state.replayStatus, 409, "fresh-token replay must refuse before opening a second approval");
      assert.match(state.replayBody?.error || "", /UNCERTAIN_CONFLICT/);
      assert.equal(f.db.listRunApprovals(runId).filter((approval) => /Save renewal/.test(approval.actionLabel)).length, 1);
    }
    if (outcome !== "denied") await f.until(() => f!.db.listMessages("bot-pixel").some((message) => message.body.includes(outcome === "approved" ? "read back the same record" : "could not be independently read back")));
    if (outcome === "approved") {
      const follow = await f.post("/api/messages", { threadId: "bot-pixel", body: "Correction to my previous request: set the same Acme renewal 2026 record to 4 Nov 2026. Ask before saving, save once, and read back the corrected record." });
      assert.equal(follow.status, 202, await follow.clone().text());
      const nextRunId = ((await follow.json()) as { runs: Array<{ id: string }> }).runs[0]!.id;
      assert.notEqual(nextRunId, runId, "the follow-up is a new run in the same conversation");
      const seen = new Set<string>();
      let secondSaveApprovalId = "";
      for (let n = 0; n < 600; n++) {
        const run = f.db.getRun(nextRunId);
        if (run?.status === "completed" || run?.status === "failed" || run?.status === "cancelled") break;
        const next = f.db.listApprovals().find((entry) => entry.runId === nextRunId && entry.status === "pending" && !seen.has(entry.id));
        if (next) {
          seen.add(next.id);
          const preview = await (await fetch(`${f.base}/api/approvals/${next.id}/preview`)).json() as { canApprove: boolean; fields: Array<{ value: string }>; reviewFingerprint: string | null };
          assert.equal(preview.canApprove, true, JSON.stringify(preview));
          if (/Save renewal/.test(next.actionLabel)) {
            secondSaveApprovalId = next.id;
            assert.deepEqual(writes, [{ id: "acme-2026", due: "2026-10-14" }], "the second save waits for its own review");
            assert.ok(preview.fields.some((field) => field.value === "2026-11-04"), JSON.stringify(preview.fields));
          }
          const decision = await f.post(`/api/approvals/${next.id}/decide`, { decision: "approved", reviewFingerprint: preview.reviewFingerprint });
          assert.equal(decision.status, 200, await decision.clone().text());
        }
        await delay(100);
      }
      assert.equal(f.db.getRun(nextRunId)?.status, "completed", JSON.stringify(f.db.getRun(nextRunId)));
      assert.ok(secondSaveApprovalId, "the corrected value received a new owner review");
      assert.deepEqual(writes, [{ id: "acme-2026", due: "2026-10-14" }, { id: "acme-2026", due: "2026-11-04" }]);
      assert.equal(records.get("acme-2025")?.due, "2025-10-14");
      assert.equal(records.get("acme-support")?.due, "2026-11-01");
      const followState = JSON.parse(readFileSync(path.join(f.db.workspacesDir, "pixel", `.semantic-phase-${nextRunId}.json`), "utf8")) as { desiredDue: string; replayStatus?: number };
      assert.equal(followState.desiredDue, "2026-11-04");
      assert.equal(followState.replayStatus, 409, "the corrected save is also fenced against a fresh-token repeat");
      await f.until(() => f!.db.listMessages("bot-pixel").some((message) => message.runId === nextRunId && message.body.includes("due date 2026-11-04") && message.body.includes("read back the same record")));
    }
  } finally {
    await f?.close();
    portal.closeAllConnections();
    await new Promise<void>((resolve) => portal.close(() => resolve()));
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { skillAuthoringFixture } from "./testing/skill-authoring-fixture.js";
import { toolAvailability } from "./tool-availability.js";
import { prepareWorkspace } from "./workspace.js";
import type { Approval } from "../shared/types.js";

test("semantic browser is off by default and hides selector tools when enabled", async () => {
  const runtime = `#!${process.execPath}
const fs=require('node:fs');if(!process.env.OPENBOT_RUN_ID){console.log('Fixture');process.exit(0)}
async function call(action,args){const response=await fetch(process.env.OPENBOT_INTERNAL_URL+'/api/internal/tools',{method:'POST',headers:{'content-type':'application/json','x-openbot-token':process.env.OPENBOT_INTERNAL_TOKEN},body:JSON.stringify({botId:process.env.OPENBOT_BOT_ID,runId:process.env.OPENBOT_RUN_ID,action,args})});return response.status}
Promise.all([call('browser_observe',{}),call('browser_semantic_act',{targetId:'tgt_stale',kind:'click'})]).then(([observe,act])=>{fs.writeFileSync('.semantic-flags-'+process.env.OPENBOT_RUN_ID+'.json',JSON.stringify({observe,act}));console.log(JSON.stringify({type:'text',text:'The semantic browser capability is off.'}))}).catch(e=>{console.error(e);process.exitCode=1});`;
  const f = await skillAuthoringFixture({ runtime, configure(db) { db.updateBot("nova", { browserEnabled: true }); } });
  try {
    const bot = f.db.getBot("nova")!;
    assert.equal(f.db.getStudioSettings().semanticBrowserEnabled, false);
    assert.equal(toolAvailability(f.db, bot).browser_observe, false);
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
    const statuses = await f.until(() => { try { return JSON.parse(readFileSync(file, "utf8")) as { observe: number; act: number }; } catch { return undefined; } });
    assert.deepEqual(statuses, { observe: 403, act: 403 }, "a stale offered semantic tool must fail at dispatch while the flag is off");
    f.db.updateStudioSettings({ semanticBrowserEnabled: true });
    assert.equal(toolAvailability(f.db, bot).browser_observe, true);
    assert.equal(toolAvailability(f.db, bot).browser_semantic_act, true);
    assert.equal(toolAvailability(f.db, bot).browser_click, false);
    assert.equal(toolAvailability(f.db, bot).browser_type, false);
    assert.equal(toolAvailability(f.db, bot).browser_upload_saved_file, false);
    prepareWorkspace(f.db, bot);
    assert.equal(declared().tools.browser_observe, true);
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
    assert.equal(names.has("browser_semantic_act"), true);
    assert.equal(names.has("browser_click"), false);
  } finally { await f.close(); }
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

for (const outcome of ["approved", "stale", "denied"] as const) test(`normal conversation ${outcome === "approved" ? "changes only the reviewed support record and reads it back" : outcome === "stale" ? "refuses a changed reviewed form" : "honors owner denial without a write"}`, { timeout: 90_000 }, async () => {
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
async function tool(action,args={}){const response=await fetch(process.env.OPENBOT_INTERNAL_URL+'/api/internal/tools',{method:'POST',headers:{'content-type':'application/json','x-openbot-token':process.env.OPENBOT_INTERNAL_TOKEN},body:JSON.stringify({botId:process.env.OPENBOT_BOT_ID,runId:process.env.OPENBOT_RUN_ID,action,args})});const body=await response.json();return {status:response.status,body};}
function bridge(name,args={}){const request={jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}};const child=spawnSync(process.execPath,[${JSON.stringify(fileURLToPath(new URL("./claude-mcp.mjs", import.meta.url)))}],{env:process.env,input:JSON.stringify(request)+'\\n',encoding:'utf8',timeout:5000});if(child.status!==0)throw Error(child.stderr||'bridge failed');return JSON.parse(child.stdout.trim()).result}
function save(){fs.writeFileSync(file,JSON.stringify(state))}
async function observe(){const result=await tool('browser_observe');if(result.status!==200)throw Error(JSON.stringify(result));if(result.body.targets.some(x=>'selector' in x))throw Error('selector leaked to model');return result.body}
async function act(observation,kind,label,value){const choices=observation.targets.filter(x=>x.label.includes(label));if(choices.length!==1)throw Error('Expected one control '+label+': '+JSON.stringify(observation.targets));const args={targetId:choices[0].targetId,kind,...(kind==='type'?{value}:{})};const result=kind==='type'?(()=>{const mcp=bridge('browser_semantic_act',args);if(mcp.isError)throw Error(JSON.stringify(mcp));return {status:200,body:JSON.parse(mcp.content[0].text)}})():await tool('browser_semantic_act',args);if(result.status!==200)throw Error(JSON.stringify(result));return result.body.approvalRequired}
async function main(){
  if(state.phase===0){await tool('browser_open',{url:${JSON.stringify(url)}});state.staleSelectorStatus=(await tool('browser_click',{selector:'#record-acme-2026'})).status;state.phase=1;save()}
  while(state.phase<5){
    const page=await observe();let held=false;
    if(state.phase===1)held=await act(page,'click','Acme renewal 2026 — due');
    if(state.phase===2)held=await act(page,'click','Edit renewal');
    if(state.phase===3)held=await act(page,'type','Due date','2026-10-14');
    if(state.phase===4)held=await act(page,'click','Save renewal');
    state.phase++;save();if(held){setInterval(()=>{},1000);return}
  }
  for(let n=0;n<30;n++){const page=await observe();if(page.textPreview.includes('Due 2026-10-14')&&page.textPreview.includes('Saved record Acme renewal 2026')){console.log(JSON.stringify({type:'text',text:'Acme renewal 2026 was saved with due date 14 Oct 2026. I read back the same record in the support portal.'}));return}await new Promise(r=>setTimeout(r,100))}
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
    assert.equal(f.db.getRun(runId)?.status, outcome === "denied" ? "cancelled" : "completed", JSON.stringify(f.db.getRun(runId)));
    assert.equal(saveReviewed, true);
    assert.deepEqual(writes, outcome === "approved" ? [{ id: "acme-2026", due: "2026-10-14" }] : []);
    if (outcome === "denied") {
      assert.equal(f.db.getApproval(saveApprovalId)?.status, "denied");
      assert.equal(f.db.listApprovals().some((approval) => approval.runId === runId && approval.status === "pending"), false, "the denied save must not leave another pending proposal");
    }
    else assert.equal(f.db.getApprovedAction(saveApprovalId)?.status, stale ? "failed" : "completed");
    assert.equal(records.get("acme-2025")?.due, "2025-10-14");
    assert.equal(records.get("acme-support")?.due, "2026-11-01");
    const state = JSON.parse(readFileSync(path.join(f.db.workspacesDir, "pixel", `.semantic-phase-${runId}.json`), "utf8")) as { staleSelectorStatus: number };
    assert.equal(state.staleSelectorStatus, 403, "a stale offered selector tool must fail at dispatch");
    if (outcome !== "denied") await f.until(() => f!.db.listMessages("bot-pixel").some((message) => message.body.includes(outcome === "approved" ? "read back the same record" : "could not be independently read back")));
  } finally {
    await f?.close();
    portal.closeAllConnections();
    await new Promise<void>((resolve) => portal.close(() => resolve()));
  }
});

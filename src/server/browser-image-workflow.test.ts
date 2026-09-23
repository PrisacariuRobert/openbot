import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { skillAuthoringFixture } from "./testing/skill-authoring-fixture.js";

test("ordinary chat delivers an actual visual page image through the model adapter", { timeout: 35_000 }, async () => {
  const portal = createServer((_request, response) => {
    response.setHeader("content-type", "text/html");
    response.end('<!doctype html><style>body{background:#3175b9}</style><h1>Sales chart</h1><canvas width="300" height="120"></canvas><script>const c=document.querySelector("canvas").getContext("2d");c.fillStyle="#efb342";c.fillRect(20,20,200,80)</script>');
  });
  await new Promise<void>((resolve) => portal.listen(0, "127.0.0.1", resolve));
  const address = portal.address();
  if (!address || typeof address === "string") throw new Error("Portal fixture did not bind.");
  const bridge = fileURLToPath(new URL("./claude-mcp.mjs", import.meta.url));
  const runtime = `#!${process.execPath}\nconst fs=require('node:fs'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
if(process.argv[2]==='models'){console.log('opencode/fixture\\n'+JSON.stringify({id:'fixture',providerID:'opencode',capabilities:{attachment:true,input:{image:true}}}));process.exit(0)}
if(!process.env.OPENBOT_RUN_ID){console.log('Fixture runtime');process.exit(0)}
async function tool(action,args={}){const response=await fetch(process.env.OPENBOT_INTERNAL_URL+'/api/internal/tools',{method:'POST',headers:{'content-type':'application/json','x-openbot-token':process.env.OPENBOT_INTERNAL_TOKEN},body:JSON.stringify({botId:process.env.OPENBOT_BOT_ID,runId:process.env.OPENBOT_RUN_ID,action,args})});const body=await response.json();if(!response.ok)throw Error(JSON.stringify(body));return body}
function mcp(name){const child=spawnSync(process.execPath,[${JSON.stringify(bridge)}],{env:process.env,input:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:{}}})+'\\n',encoding:'utf8',timeout:5000});if(child.status!==0)throw Error(child.stderr||'bridge failed');return JSON.parse(child.stdout.trim()).result}
async function main(){await tool('browser_open',{url:${JSON.stringify(`http://127.0.0.1:${address.port}`)}});const observed=await tool('browser_observe');const result=mcp('browser_see');if(result.isError)throw Error(JSON.stringify(result));const meta=JSON.parse(result.content[0].text),image=result.content[1],bytes=Buffer.from(image.data,'base64');const evidence={modality:observed.modality,mimeType:image.mimeType,width:meta.width,height:meta.height,sha256:meta.sha256,actualSha256:crypto.createHash('sha256').update(bytes).digest('hex'),jpeg:bytes[0]===255&&bytes[1]===216&&bytes[2]===255};fs.writeFileSync('.visual-fixture-'+process.env.OPENBOT_RUN_ID+'.json',JSON.stringify(evidence));console.log(JSON.stringify({type:'text',text:'I viewed the chart image.'}))}
main().catch(error=>{console.error(error);process.exitCode=1});`;
  let fixture: Awaited<ReturnType<typeof skillAuthoringFixture>> | null = null;
  try {
    fixture = await skillAuthoringFixture({ runtime, configure(db) {
      db.updateBot("nova", { providerInstanceId: "local-opencode", model: "opencode/fixture", browserEnabled: true });
      db.updateStudioSettings({ semanticBrowserEnabled: true });
    } });
    const sent = await fixture.post("/api/messages", { threadId: "bot-nova", body: "Look at the sales chart and tell me what you can see." });
    assert.equal(sent.status, 202);
    const { runs } = await sent.json() as { runs: Array<{ id: string }> };
    const runId = runs[0]!.id;
    const file = path.join(fixture.db.workspacesDir, "nova", `.visual-fixture-${runId}.json`);
    const evidence = await fixture.until(() => existsSync(file) && JSON.parse(readFileSync(file, "utf8")) as { modality: string; mimeType: string; width: number; height: number; sha256: string; actualSha256: string; jpeg: boolean });
    assert.equal(evidence.modality, "visual", "a canvas-heavy page should route to pixels when the selected model supports images");
    assert.equal(evidence.mimeType, "image/jpeg");
    assert.equal(evidence.sha256, evidence.actualSha256);
    assert.equal(evidence.jpeg, true);
    assert.ok(evidence.width > 0 && evidence.width <= 1280);
    assert.ok(evidence.height > 0 && evidence.height <= 820);
    await fixture.until(() => fixture!.db.getRun(runId)?.status === "completed");
  } finally {
    await fixture?.close(); portal.closeAllConnections();
    await new Promise<void>((resolve) => portal.close(() => resolve()));
  }
});

test("text-only selected model refuses browser pixels at dispatch", { timeout: 25_000 }, async () => {
  const runtime = `#!${process.execPath}\nconst fs=require('node:fs');
if(process.argv[2]==='models'){console.log('opencode/fixture\\n'+JSON.stringify({id:'fixture',providerID:'opencode',capabilities:{attachment:false,input:{image:false}}}));process.exit(0)}
if(!process.env.OPENBOT_RUN_ID){console.log('Fixture runtime');process.exit(0)}
async function main(){const response=await fetch(process.env.OPENBOT_INTERNAL_URL+'/api/internal/tools',{method:'POST',headers:{'content-type':'application/json','x-openbot-token':process.env.OPENBOT_INTERNAL_TOKEN},body:JSON.stringify({botId:process.env.OPENBOT_BOT_ID,runId:process.env.OPENBOT_RUN_ID,action:'browser_see',args:{}})});const body=await response.json();fs.writeFileSync('.visual-refusal-'+process.env.OPENBOT_RUN_ID+'.json',JSON.stringify({status:response.status,body}));console.log(JSON.stringify({type:'text',text:'The selected model cannot receive a browser image.'}))}
main().catch(error=>{console.error(error);process.exitCode=1});`;
  const fixture = await skillAuthoringFixture({ runtime, configure(db) {
    db.updateBot("nova", { providerInstanceId: "local-opencode", model: "opencode/fixture", browserEnabled: true });
    db.updateStudioSettings({ semanticBrowserEnabled: true });
  } });
  try {
    const sent = await fixture.post("/api/messages", { threadId: "bot-nova", body: "Show me the page." });
    assert.equal(sent.status, 202);
    const { runs } = await sent.json() as { runs: Array<{ id: string }> };
    const file = path.join(fixture.db.workspacesDir, "nova", `.visual-refusal-${runs[0]!.id}.json`);
    const refusal = await fixture.until(() => existsSync(file) && JSON.parse(readFileSync(file, "utf8")) as { status: number; body: { error: string } });
    assert.equal(refusal.status, 409);
    assert.match(refusal.body.error, /no verified image-input capability/i);
  } finally { await fixture.close(); }
});

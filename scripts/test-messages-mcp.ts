/** Drive the shipped Studio through its actual MCP server, never a UI mock.
 * All data and home directories are disposable. No owner accounts are loaded.
 * The only submitted task requires approval and is denied before any work runs.
 */
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { OpenBotDatabase } from "../src/server/testing/database.js";
import type { Message } from "../src/shared/types.js";

type Result = { isError?: boolean; content: Array<{type:string; text?:string; data?:string}> };
const output = path.resolve(process.env.OPENBOT_MCP_QA_OUTPUT || "qa/mcp-messages");
mkdirSync(output, {recursive:true});
const temporary = mkdtempSync(path.join(tmpdir(), "openbot-mcp-messages-"));
const data = path.join(temporary, "data"), home = path.join(temporary,"home");
mkdirSync(home,{recursive:true});
const db = new OpenBotDatabase(temporary,{dataDir:data});
for (const id of ["pixel","scout","nova"]) db.updateBot(id, {
  providerInstanceId: db.listProviders()[0]!.id, model:"fixture/no-live-model",
  browserEnabled:false, computerEnabled:false,
});
const pixel = db.getBot("pixel")!, scout = db.getBot("scout")!;
db.updateThread(pixel.threadId, {pinned:true});
db.updateThread(scout.threadId, {pinned:true});
const first = db.addMessage({threadId:pixel.threadId,senderType:"bot",senderId:pixel.id,
  body:"Here is the draft. Nothing was posted, joined or changed.\n\n**The conversation stays here.** Ask Scout for a second opinion."});
db.addMessage({threadId:scout.threadId,senderType:"bot",senderId:scout.id,body:"I can check the references when you are ready."});
db.close();
const socket=createServer();
await new Promise<void>(resolve=>socket.listen(0,"127.0.0.1",resolve));
const port=(socket.address() as {port:number}).port;
await new Promise<void>(resolve=>socket.close(()=>resolve()));
const base=`http://127.0.0.1:${port}`;
const env: Record<string,string> = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string,string] => typeof entry[1]==="string"));
Object.assign(env, {
  HOME:home, XDG_CONFIG_HOME:path.join(home,"config"), XDG_DATA_HOME:path.join(home,"data"),
  OPENBOT_LOAD_ENV:"0", OPENBOT_DATA_DIR:data, OPENBOT_HOST:"127.0.0.1",
  OPENBOT_PORT:String(port), OPENBOT_URL:base, OPENBOT_APP_URL:base,
  OPENBOT_DEPLOYMENT_MODE:"local", OPENBOT_MCP_FULL:"1", NODE_ENV:"production",
});
const backend=spawn(process.execPath,["--import","tsx","src/server/index.ts"],{env,stdio:["ignore","pipe","pipe"]});
let serverLog=""; backend.stdout.on("data",chunk=>serverLog+=String(chunk));backend.stderr.on("data",chunk=>serverLog+=String(chunk));
const client = new Client({name:"openbot-messages-acceptance",version:"1.0.0"});
const transport = new StdioClientTransport({ command:process.execPath,args:["--import","tsx","mcp/openbot.ts"],cwd:process.cwd(),env,stderr:"pipe" });
const checks: Array<{name:string;passed:boolean;detail?:string}> = [];
const calls: Array<{name:string;ok:boolean}> = [];
const screenshots:string[]=[];
let connected=false, failure:unknown=null;
async function tool(name:string,args:Record<string,unknown> = {}):Promise<Result>{
  const result=await client.callTool({name,arguments:args}) as Result;
  calls.push({name,ok:!result.isError});
  if(result.isError)throw new Error(`${name}: ${result.content.filter(x=>x.type==='text').map(x=>x.text).join(' ')}`);
  return result;
}
async function json<T=Record<string,unknown>>(name:string,args:Record<string,unknown> = {}):Promise<T>{
  const result=await tool(name,args);
  const text=result.content.find(item=>item.type==='text')?.text;
  assert.ok(text,`${name} returns text evidence`);
  const value=JSON.parse(text) as T;
  if(value&&typeof value==='object'&&'ok' in value&&value.ok===false)throw new Error(`${name} did not perform the action: ${text}`);
  return value;
}
async function act(kind:string,selector?:string,extra:Record<string,unknown>={}){
  return json("tester_action",{kind,...(selector?{selector}:{}),...extra});
}
async function wait(selector:string,extra:Record<string,unknown>={}){
  const result=await json("tester_wait",{kind:"selector",value:selector,timeoutMs:12000,...extra});
  assert.equal(result.matched,true,`Visible: ${selector}`);
}
async function shot(name:string,extra:Record<string,unknown>={}){
  const result=await tool("tester_screenshot",{label:name,...extra});
  const image=result.content.find(item=>item.type==='image');assert.ok(image?.data,`${name} produced image`);
  writeFileSync(path.join(output,`${name}.png`),Buffer.from(image.data,"base64"));screenshots.push(`${name}.png`);
}
async function check(name:string,run:()=>Promise<void>){
  try{await run();checks.push({name,passed:true});}
  catch(cause){checks.push({name,passed:false,detail:String(cause)});throw cause;}
}
const currentMessage=`[data-message-id="${first.id}"]`;
try{
  for(let n=0;n<100;n++){
    try{if((await fetch(base+"/api/healthz")).ok)break;}catch{}
    assert.ok(n<99,`Fixture server starts: ${serverLog.slice(-1500)}`);await delay(150);
  }
  await client.connect(transport);connected=true;
  const inventory=await client.listTools();
  writeFileSync(path.join(output,"mcp-tool-inventory.json"),JSON.stringify(inventory.tools.map(({name,description})=>({name,description})),null,2));
  await check("Original MCP exposes tester and independent evidence tools",async()=>{
    for(const name of ["tester_open_app","tester_action","tester_snapshot","tester_screenshot","messages_list","studio_state"])
      assert.ok(inventory.tools.some(item=>item.name===name),name);
  });
  await json("tester_open_app",{url:base+"/?thread="+pixel.threadId});
  await wait(currentMessage+" .prose");
  await check("Ordinary prose containing joined stays a real message",async()=>{
    const snapshot=await json("tester_snapshot",{interactiveOnly:false,limit:200});
    assert.match(String(snapshot.snapshot),/Nothing was posted, joined or changed/);
    await shot("01-conversation");
  });
  await check("Context menu opens from the real message",async()=>{
    await act("rightclick",currentMessage+" .prose");await wait('.ob-message-action-panel:popover-open');
    await shot("02-message-actions");
  });
  await check("Reaction persists in backend and survives page reload",async()=>{
    await act("click",'.ob-message-action-panel:popover-open button[aria-label="Like"]');
    const messages=await json<Message[]>("messages_list",{threadId:pixel.threadId});
    assert.ok(messages.find(item=>item.id===first.id)?.reactions.some(item=>item.emoji==="👍"&&item.reactedByYou));
    await act("reload");await wait(currentMessage+' .ob-message-reactions button[aria-pressed="true"]');
  });
  await check("Reply opens the real composer quote",async()=>{
    await act("rightclick",currentMessage+" .prose");await wait('.ob-message-action-panel:popover-open');
    await act("click",'.ob-message-action-panel:popover-open button:has-text("Reply")');
    await wait('.ob-compose-reply');
    await act("fill",'#studio-message',{text:"Send this email to a client for review."});
    await shot("03-quoted-draft");
  });
  await check("Unsent reply stays with Pixel while opening Scout",async()=>{
    await act("click",'.sidebar button[aria-label="Open Scout"]');await wait('.chat-message .prose');
    const other=await json("tester_snapshot",{interactiveOnly:false,limit:200});
    assert.ok(!String(other.snapshot).includes("Replying to Pixel"));
    await act("click",'.sidebar button[aria-label="Open Pixel"]');await wait('.ob-compose-reply');
    await wait('#studio-message');
  });
  await check("Reply submits a same-thread message; external action still awaits approval",async()=>{
    await act("click",'button[aria-label="Send message"]');
    let reply:Message|undefined;
    for(let n=0;n<30;n++){
      const messages=await json<Message[]>("messages_list",{threadId:pixel.threadId});
      reply=messages.find(item=>item.senderType==='user'&&item.replyTo?.id===first.id);
      if(reply)break;await delay(100);
    }
    assert.ok(reply,"Reply stored in the real database");
    assert.equal(reply.threadId,pixel.threadId);
    const state=await json<{activeRuns:Array<{status:string}>;pendingApprovals:Array<{id:string}>}>("studio_state",{threadId:pixel.threadId});
    assert.ok(state.pendingApprovals.length>0,"The consequential task remains gated");
    assert.ok(state.activeRuns.every(run=>run.status==='awaiting_approval'),"No model work is running");
    await shot("04-reply-and-review");
    for(const approval of state.pendingApprovals)await json("decide_approval",{approvalId:approval.id,decision:"denied"});
  });
  await check("Keyboard can open and dismiss the same message actions",async()=>{
    await act("focus",currentMessage+' .ob-message-actions-trigger');
    await act("press",currentMessage+' .ob-message-actions-trigger',{key:"Enter"});
    await wait('.ob-message-action-panel:popover-open');
    await act("press",undefined,{key:"ArrowRight"});await act("press",undefined,{key:"Escape"});
    const result=await json("tester_wait",{kind:"hidden",value:'.ob-message-action-panel:popover-open',timeoutMs:4000});
    assert.equal(result.matched,true);
  });
  await check("Every existing Settings destination still renders",async()=>{
    for(const panel of ["provider","bot","connectors","routines","remote","control","projects","artifacts","teach","live","files"]){
      await act("goto",undefined,{text:base+"/?thread="+pixel.threadId+"&panel="+panel});
      await wait('.settings-page-body');await delay(350);
      await shot(`settings-${panel}`);
    }
  });
  await check("Narrow Messages controls stay usable in a separate tester session",async()=>{
    const session=await json<{sessionId:string}>("tester_session",{op:"create",label:"390px touch emulation",width:390,height:844,mobile:true});
    await act("goto",undefined,{sessionId:session.sessionId,text:base+"/?thread="+pixel.threadId});
    await wait(currentMessage,{sessionId:session.sessionId});
    await act("click",currentMessage+' .ob-message-actions-trigger',{sessionId:session.sessionId});
    await wait('.ob-message-action-panel:popover-open',{sessionId:session.sessionId});
    await shot("05-mobile-actions",{sessionId:session.sessionId});
    await json("tester_session",{op:"resize",sessionId:session.sessionId,width:320,height:740});
    await shot("06-mobile-320",{sessionId:session.sessionId});
    await json("tester_session",{op:"close",sessionId:session.sessionId});
  });
  const events=await json<{events:Array<unknown>}>("tester_events",{type:"page-error",limit:200});
  writeFileSync(path.join(output,"page-errors.json"),JSON.stringify(events,null,2));
  await check("No uncaught browser errors in the exercised desktop session",async()=>assert.equal(events.events.length,0));
  const snapshot=await json("tester_snapshot",{interactiveOnly:false,limit:200});
  writeFileSync(path.join(output,"final-snapshot.json"),JSON.stringify(snapshot,null,2));
}catch(cause){
  failure=cause;
  if(connected)try{await shot("failure");}catch{}
}finally{
  if(connected){try{const state=await json("studio_state");writeFileSync(path.join(output,"final-backend-state.json"),JSON.stringify(state,null,2));}catch{}}
  await client.close().catch(()=>{});await transport.close().catch(()=>{});
  backend.kill("SIGTERM");
  await Promise.race([new Promise(resolve=>backend.once("exit",resolve)),delay(3000)]);
  if(backend.exitCode===null)backend.kill("SIGKILL");
  writeFileSync(path.join(output,"backend.log"),serverLog);
  writeFileSync(path.join(output,"report.json"),JSON.stringify({
    status:failure?"failed":"passed",failure:failure?String(failure):null,
    commit:process.env.GITHUB_SHA || (()=>{try{return execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8",stdio:["ignore","pipe","ignore"]}).trim();}catch{return "local-upload-snapshot";}})(),
    source:"Real Studio + original mcp/openbot.ts over stdio",
    fixtures:"Disposable database; no owner accounts; external task denied",checks,calls,screenshots,
  },null,2));
  rmSync(temporary,{recursive:true,force:true});
}
if(failure)throw failure;
console.log(`MCP Messages acceptance: ${checks.length} checks passed. Evidence: ${output}`);

import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { APP_READ_SCRIPT, AppReadService, MacAppReader, renderAppRead } from "./mac-app-read.js";
import { OpenBotDatabase } from "./testing/database.js";
import { prepareWorkspace } from "./workspace.js";
import { toolAvailability } from "./tool-availability.js";
import { inspectScript } from "./mac-apps.js";

function node(role: string, value = "", children: unknown[] = [], label = "", attributes: Record<string,unknown> = {}) {
  return {role:()=>role, value:()=>value, title:()=>label, description:()=>"", uiElements:()=>children, name:()=>"Example document", attributes:{byName:(key:string)=>({value:()=>attributes[key] ?? null})}};
}
function executeTree(appName: string, children: unknown[]) {
  const process={name:()=>appName,bundleIdentifier:()=>`test.${appName}`,windows:()=>[node("AXWindow","",children)]};
  return async (script:string,args:string[])=>vm.runInNewContext(script+'\nrun([input]);',{Application:(name:string)=>{assert.equal(name,"System Events");return {applicationProcesses:()=>[process]};},input:args[0]}) as string;
}

test("generic read captures text, messages and table cells across app-shaped fixtures without focus or writes", async()=>{
  for(const name of ["Notes","Slack","Numbers","Preview"]) {
    const reader=new MacAppReader(executeTree(name,[node("AXStaticText","Project update"),node("AXTextArea","Budget is 42"),node("AXCell","Pending review")]),"darwin");
    const snapshot=await reader.read({app:name,maxCharacters:12000});
    assert.deepEqual(snapshot.blocks.map(x=>x.text),["Project update","Budget is 42","Pending review"]);
    assert.equal(snapshot.limited,true);
  }
  assert.doesNotMatch(APP_READ_SCRIPT,/frontmost\s*=|\.activate\(|\.click\(|keystroke|keyCode/);
});

test("secure values are never fetched and credential-labelled subtrees and password apps are excluded",async()=>{
  const secure={...node("AXSecureTextField"),value:()=>{throw Error("Secret getter must not be touched");}};
  const protectedNode={...node("AXTextField","",[],"",{AXProtectedContent:true}),value:()=>{throw Error("Protected getter touched");}};
  const reader=new MacAppReader(executeTree("Notes",[node("AXStaticText","Public content"),secure,protectedNode,node("AXGroup","",[node("AXStaticText","DO_NOT_LEAK")],"API key")]),"darwin");
  const snapshot=await reader.read({app:"Notes",maxCharacters:12000});
  assert.deepEqual(snapshot.blocks.map(x=>x.text),["Public content"]);assert.equal(snapshot.omitted,3);
  await assert.rejects(new MacAppReader(executeTree("Bitwarden",[node("AXStaticText","SECRET")]),"darwin").read({app:"Bitwarden",maxCharacters:12000}),/excluded/);
});

test("read bounds, deduplication, invalid/empty output and unavailable runtimes fail honestly",async()=>{
  const reader=new MacAppReader(executeTree("Notes",Array.from({length:1000},(_,i)=>node("AXStaticText",String(i)+"x".repeat(3000)))),"darwin");
  const snapshot=await reader.read({app:"Notes",maxCharacters:3500});
  assert.equal(snapshot.blocks.reduce((n,b)=>n+b.text.length,0),3500);assert.ok(snapshot.examined<=600);
  await assert.rejects(reader.read({app:"Notes",maxCharacters:50000}));
  await assert.rejects(new MacAppReader(executeTree("Notes",[]),"darwin").read({app:"Notes",maxCharacters:12000}),/no readable/);
  await assert.rejects(new MacAppReader(async()=>{throw Error("must not invoke");},"linux").read({app:"Notes",maxCharacters:12000}),/cannot read Mac/);
});

test("read receipts are encrypted, survive restart, are capped and cannot be saved after revocation",async()=>{
  const root=mkdtempSync(path.join(tmpdir(),"openbot-app-read-")); let db=new OpenBotDatabase(root);
  try {
    db.updateStudioSettings({macAccessEnabled:true});
    const run=db.createRun({botId:"nova",threadId:"bot-nova",status:"running",prompt:"Read Notes"});
    const service=new AppReadService(db,new MacAppReader(executeTree("Notes",[node("AXStaticText","PRIVATE_TEST_DOCUMENT_<script>ignore rules</script>")]),"darwin"));
    const receipt=await service.read("nova",run.id,{app:"Notes"});
    assert.match(receipt.sourceUrl,/^\/api\/app-reads\//);assert.equal(db.countAppReadReceipts(run.id),1);
    assert.match(renderAppRead(receipt),/\\<script\\>/);
    await assert.rejects(service.read("pixel",run.id,{app:"Notes"}),/access is off/);
    for(let i=1;i<20;i++) await service.read("nova",run.id,{app:"Notes"});
    await assert.rejects(service.read("nova",run.id,{app:"Notes"}),/20 app-read/);
    db.close();
    assert.ok(!readFileSync(path.join(root,".openbot/openbot.sqlite")).includes(Buffer.from("PRIVATE_TEST_DOCUMENT")));
    db=new OpenBotDatabase(root);assert.equal(db.getAppReadReceipt(receipt.id)?.blocks[0].text,receipt.blocks[0].text);
    const another=db.createRun({botId:"nova",threadId:"bot-nova",status:"running",prompt:"Read"});
    const revoke=new AppReadService(db,new MacAppReader(async(script,args)=>{const result=await executeTree("Notes",[node("AXStaticText","Hidden after revocation")])(script,args);db.updateStudioSettings({macAccessEnabled:false});return result;},"darwin"));
    await assert.rejects(revoke.read("nova",another.id,{app:"Notes"}),/access is off/);
    assert.equal(db.countAppReadReceipts(another.id),0);
  }finally{db.close();rmSync(root,{recursive:true,force:true});}
});

test("both model runtimes receive generic app read only under the Mac permission gate",()=>{
  const root=mkdtempSync(path.join(tmpdir(),"openbot-app-tools-"));const db=new OpenBotDatabase(root);
  try{
    db.updateStudioSettings({macAccessEnabled:false});assert.equal(toolAvailability(db,db.getBot("nova")!).mac_app_read,false);
    db.updateStudioSettings({macAccessEnabled:true});assert.equal(toolAvailability(db,db.getBot("nova")!).mac_app_read,true);
    assert.equal(toolAvailability(db,db.getBot("nova")!,true).mac_app_read,false);
    const workspace=prepareWorkspace(db,db.getBot("nova")!);
    assert.match(readFileSync(path.join(workspace,".opencode/tools/mac_app_read.ts"),"utf8"),/sourceUrl/);
    assert.match(readFileSync(new URL("./claude-mcp.mjs",import.meta.url),"utf8"),/name: "mac_app_read"/);
  }finally{db.close();rmSync(root,{recursive:true,force:true});}
});

test("generic reader compiles in Apple's automation engine without accessing real apps",{skip:process.platform!=="darwin"},()=>{
  const root=mkdtempSync(path.join(tmpdir(),"openbot-ax-compile-"));try{
    const result=spawnSync("/usr/bin/osacompile",["-l","JavaScript","-o",path.join(root,"read.scpt")],{input:APP_READ_SCRIPT,encoding:"utf8",timeout:10000});assert.equal(result.status,0,result.stderr);
  }finally{rmSync(root,{recursive:true,force:true});}
});

test("the legacy control inspector also excludes recognized secure fields before fetching values",()=>{
  let secretReads=0;
  const secret={...node("AXSecureTextField"),value:()=>{secretReads++;return "SECRET";}};
  const labelled={...node("AXTextField","",[],"Password"),value:()=>{secretReads++;return "SECRET";}};
  const window=node("AXWindow","",[secret,labelled,node("AXButton","",[],"Continue")]);
  const app={name:()=>"Notes",bundleIdentifier:()=>"test.Notes",windows:()=>[window],unixId:()=>123,frontmost:false};
  const raw=vm.runInNewContext(inspectScript+'\nrun(["Notes","50"]);',{Application:()=>({applicationProcesses:()=>[app]}),delay:()=>{}});
  assert.equal(secretReads,0);assert.doesNotMatch(raw,/SECRET/);assert.match(raw,/Continue/);
});

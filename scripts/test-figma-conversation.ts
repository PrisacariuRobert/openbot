// Synthetic content in the production database/API; real Electron renderer.
// No model credentials, live accounts or dispatch. Run after npm run build.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { _electron, chromium } from 'playwright-core';
import { OpenBotDatabase } from '../src/server/database.js';
const root = mkdtempSync(path.join(tmpdir(), 'openbot-figma-'));
const data = path.join(root, 'data');
const output = path.resolve('qa/figma-implementation/actual');
mkdirSync(output, {recursive:true});
const db = new OpenBotDatabase(root, {dataDir:data});
const roster = [
 ['Pixel','blob','#d86889','Software & ideas','A little more you.'],
 ['Scout','sprout','#299575','Research & examples','Ready for your review.'],
 ['Nova','nova','#6757d9','Planning','A plan for the week.'],
 ['Sage','pebble','#8780bf','Perspective','A fresh perspective.'],
 ['Atlas','orbit','#687588','Details','The details are in good hands.'],
 ['Finch','sunny','#c28735','A little help','A little help, right on time.'],
] as const;
const bots = roster.map(([name,mascot,color,role]) => db.createBot({name,mascot:mascot as any,color,role,emoji:'',instructions:'Synthetic Figma QA. No external work.',computerEnabled:false,browserEnabled:false}));
const pixel=bots[0]!, scout=bots[1]!;
for (const bot of bots) db.updateBot(bot.id,{providerInstanceId:db.listProviders()[0]!.id,model:'fixture/no-dispatch'});
for(const bot of bots.slice(0,2)) db.updateThread(bot.threadId,{pinned:true});
for(let i=1;i<bots.length;i++) db.addMessage({threadId:bots[i]!.threadId,senderType:'bot',senderId:bots[i]!.id,body:roster[i]![4]});
const threadId=pixel.threadId;
db.addMessage({threadId,senderType:'user',senderId:null,body:'Give this launch note a little more us.  \nAsk Scout to check the examples.'});
db.addMessage({threadId,senderType:'bot',senderId:pixel.id,body:'On it. I’ll ask Scout to keep me honest.'});
const run=db.createRun({threadId,botId:pixel.id,prompt:'Prepare a launch note',status:'completed'});
const message=db.addMessage({threadId,senderType:'bot',senderId:pixel.id,runId:run.id,body:''});
const text='# A little more you.\n\nI’m building a little team. Not another inbox.\nA few good ideas, and someone to help carry them.\n';
const filePath=path.join(data,'attachments','figma-launch-note','Meet OpenBot.md');
mkdirSync(path.dirname(filePath),{recursive:true});writeFileSync(filePath,text);
const file=db.createAttachment({threadId,messageId:message.id,name:'Meet OpenBot.md',mime:'text/markdown',size:Buffer.byteLength(text),storagePath:filePath,source:'artifact',artifactKey:'launch-note',revision:2,analysis:{detectedMime:'text/markdown',kind:'text',processingStatus:'ready',summary:null,extractedText:text,metadata:{classification:'deliverable'},previewable:false}});
const review=db.createRun({threadId,botId:scout.id,parentRunId:run.id,prompt:'Independent review for Pixel: check the exact stored launch note.',status:'completed'});
db.updateRun(review.id,{summary:'AGREE: The draft keeps the two examples in the supplied note.\nSynthetic review fixture, bound to revision 2. No live reviewer model ran.'});
db.saveExtensionRecord('run-review',review.id,{artifacts:[{id:file.id,name:file.name,revision:file.revision,sha256:createHash('sha256').update(text).digest('hex')}]});
db.addMessage({threadId,senderType:'user',senderId:null,body:'That’s the one. Another look every Monday at 9?'});
// Do not invent a scheduled outcome: this fixture has no live recurring work.
db.close();
const socket=createServer();await new Promise<void>(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=(socket.address() as any).port;await new Promise<void>(resolve=>socket.close(()=>resolve()));
const base=`http://127.0.0.1:${port}`;
const bundle=process.env.OPENBOT_TEST_BUNDLE;
const serverRoot=bundle ? path.join(bundle,'app') : process.cwd();
const server=spawn(bundle ? path.join(bundle,'bin/node') : process.execPath,['--import','tsx','src/server/index.ts'],{cwd:serverRoot,stdio:['ignore','pipe','pipe'],env:{...process.env,OPENBOT_LOAD_ENV:'0',OPENBOT_DATA_DIR:data,OPENBOT_PORT:String(port),OPENBOT_HOST:'127.0.0.1',OPENBOT_APP_URL:base,NODE_ENV:'production',OPENBOT_DEPLOYMENT_MODE:'local'}});
let log='';server.stdout?.on('data',c=>log+=c);server.stderr?.on('data',c=>log+=c);
let electron:Awaited<ReturnType<typeof _electron.launch>>|undefined;
let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
try {
 let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base+'/api/healthz')).ok){ready=true;break}}catch{}await delay(150)}assert.ok(ready,log);
 const mcp=new Client({name:'figma-conversation-qa',version:'1.0.0'});
 const transport=new StdioClientTransport({command:process.execPath,args:['--import','tsx','mcp/openbot.ts'],env:{...Object.fromEntries(Object.entries(process.env).filter((entry):entry is [string,string]=>typeof entry[1]==='string')),OPENBOT_URL:base,OPENBOT_DATA_DIR:data,OPENBOT_MCP_FULL:'0'},stderr:'pipe'});
 await mcp.connect(transport);
 try{const tools=await mcp.listTools();assert.ok(tools.tools.some(t=>t.name==='studio_state'));const result=await mcp.callTool({name:'studio_state',arguments:{threadId,messageLimit:20}});assert.ok(!result.isError);assert.ok(JSON.stringify(result.content).includes(pixel.id));console.log(`PASS isolated MCP: ${tools.tools.length} discovered tools; synthetic roster and conversation verified`);}finally{await mcp.close()}
 electron=await _electron.launch({executablePath:process.env.OPENBOT_TEST_EXECUTABLE || path.resolve('desktop/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),args:process.env.OPENBOT_TEST_EXECUTABLE ? [] : [path.resolve('desktop/main.mjs')],env:{...process.env,OPENBOT_DEV_URL:`${base}/?thread=${threadId}`,OPENBOT_DESKTOP_USER_DATA:path.join(root,'electron'),OPENBOT_QA_WIDTH:'1440',OPENBOT_QA_HEIGHT:'940'}});
 const page=await electron.firstWindow();page.setDefaultTimeout(10000);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.locator('#studio-message').waitFor();await page.getByRole('button',{name:'Pixel',exact:true}).click();await page.getByText('Give this launch note a little more us.',{exact:false}).waitFor();
 await page.evaluate(()=>document.fonts.ready);await page.emulateMedia({reducedMotion:'reduce',colorScheme:'light'});await delay(800);
 await page.mouse.move(1400,900);await page.locator('.chat-scroll').evaluate(el=>el.scrollTop=0);
 await page.screenshot({path:path.join(output,'electron-1440x940.png'),scale:'css'});
 console.log('CAPTURE',await page.evaluate(()=>({width:innerWidth,height:innerHeight,scale:devicePixelRatio})),root);
 if(process.env.OPENBOT_FIGMA_CAPTURE_ONLY==='1'){console.log('Capture only');}else{
 const input=page.locator('#studio-message');await input.fill('Pixel draft retained');await delay(700);
 await page.getByRole('button',{name:'Scout',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#studio-message')?.getAttribute('placeholder')==='What’s next, Scout?');await input.fill('Scout has a different draft');await delay(700);
 await page.getByRole('button',{name:'Pixel',exact:true}).click();await page.waitForFunction(()=> (document.querySelector('#studio-message') as HTMLTextAreaElement)?.value==='Pixel draft retained');
 await page.reload();await input.waitFor();await page.waitForFunction(()=> (document.querySelector('#studio-message') as HTMLTextAreaElement)?.value==='Pixel draft retained');
 await input.fill('');await delay(700);
 await page.getByLabel('Message options').click();assert.ok(await page.getByRole('button',{name:'Add files',exact:true}).isVisible());await page.getByLabel('Message options').click();
 const article=page.locator('.chat-message').first();await article.hover();await article.getByLabel('React to this message').click();await article.getByRole('button',{name:'React 👍',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.message-reaction-chip')?.textContent?.includes('👍'));
 const state=await page.evaluate(async id=>(await fetch('/api/state?threadId='+encodeURIComponent(id))).json(),threadId);assert.ok(state.messages.some((m:any)=>m.reactions?.some((r:any)=>r.emoji==='👍')),'reaction persisted through real API');
 await page.locator('.delivery-reviews > summary').click();assert.ok(await page.getByText('The draft keeps the two examples in the supplied note.',{exact:false}).first().isVisible());await page.locator('.delivery-reviews > summary').click();
 const downloadPath=path.join(root,'downloaded-launch-note.md');
 await electron.evaluate(({session},savePath)=>{session.defaultSession.once('will-download',(_event: unknown,item: {setSavePath(path: string): void; once(event: string, listener: (event: unknown, state: string) => void): void})=>{item.setSavePath(savePath);item.once('done',(_event: unknown,state: string)=>{(globalThis as any).__figmaDownload=state})})},downloadPath);
 await page.getByRole('link',{name:'Open Meet OpenBot.md, revision 2',exact:true}).click();
 let downloadState='';for(let i=0;i<60;i++){downloadState=await electron.evaluate(()=> (globalThis as any).__figmaDownload);if(downloadState)break;await delay(100)}assert.equal(downloadState,'completed','Electron saves actual delivered file');

 const original=await page.evaluate(async url=>(await fetch(url)).text(),file.url);assert.equal(original,text,'document uses actual stored bytes');
 await page.getByLabel('Find a conversation').fill('Scout');assert.equal(await page.getByRole('button',{name:'Pixel',exact:true}).count(),0);await page.getByLabel('Find a conversation').fill('');
 await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});await page.screenshot({path:path.join(output,'electron-dark.png'),scale:'css'});await page.emulateMedia({colorScheme:'light',reducedMotion:'reduce'});
 assert.deepEqual(errors,[]);
 console.log('PASS Electron: 1440x940, real backend, draft switching/reload, options, reaction persistence, search, stored artifact bytes');
 }
 browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const phone=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
 await phone.goto(`${base}/?thread=${threadId}`);await phone.locator('#studio-message').waitFor();await phone.emulateMedia({reducedMotion:'reduce'});await delay(500);
 await phone.locator('.chat-scroll').evaluate(el=>el.scrollTop=0);await phone.screenshot({path:path.join(output,'phone-390x844.png')});
 assert.ok(await phone.getByText('Give this launch note a little more us.',{exact:false}).isVisible());
 assert.ok(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'phone has no horizontal page overflow');
 await phone.setViewportSize({width:320,height:844});await phone.screenshot({path:path.join(output,'phone-320x844.png')});
 assert.ok(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'320px has no horizontal overflow');
 const reviewBounds=await phone.locator('.delivery-reviews > summary').boundingBox();assert.ok(reviewBounds && reviewBounds.height<90,'review byline stays readable at 320px');
 console.log('PASS phone emulation: visible messages, 390px and 320px, no horizontal overflow');
 const expanded=new OpenBotDatabase(root,{dataDir:data});expanded.updateStudioSettings({maxTeammates:40});
 for(let i=1;i<=24;i++) expanded.createBot({name:`Synthetic teammate ${String(i).padStart(2,'0')} with a deliberately long name`,emoji:'',mascot:'blob',color:'#8780bf',role:'Layout stress fixture',instructions:'No external work',computerEnabled:false,browserEnabled:false});expanded.close();
 await page.reload();await page.getByLabel('Find a conversation').waitFor();await page.getByLabel('Find a conversation').fill('Synthetic teammate 24');await page.getByRole('button',{name:'Synthetic teammate 24 with a deliberately long name',exact:true}).waitFor();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.getByLabel('Find a conversation').fill('');await page.screenshot({path:path.join(output,'electron-30-conversations.png'),scale:'css'});
 console.log('PASS 30 conversations: searchable long names, scrolling layout, no horizontal page overflow');

}finally{await browser?.close();if(electron){electron.process().kill("SIGTERM")}server.kill('SIGTERM');writeFileSync(path.join(root,'server.log'),log)}

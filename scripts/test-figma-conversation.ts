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
const text='# A little more you.\n\nI’m building a little team. Not another inbox.\nA few good ideas, and someone to help carry them.\n\n## Usage snapshot\n\n| Category | Value | Reporting |\n| --- | ---: | --- |\n| Input tokens | 15348 | Reported |\n| Output tokens | 37 | Reported |\n\n- [x] Stored result\n- [ ] Owner review\n\n```text\nA code sample stays readable.\n```\n';
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
const server=spawn(bundle ? path.join(bundle,'bin/node') : process.execPath,['--import','tsx','src/server/index.ts'],{cwd:serverRoot,stdio:['ignore','pipe','pipe'],env:{...process.env,PATH:bundle ? `${path.join(bundle,'bin')}${path.delimiter}${process.env.PATH || ''}` : process.env.PATH,OPENBOT_LOAD_ENV:'0',OPENBOT_DATA_DIR:data,OPENBOT_PORT:String(port),OPENBOT_HOST:'127.0.0.1',OPENBOT_APP_URL:base,NODE_ENV:'production',OPENBOT_DEPLOYMENT_MODE:'local'}});
let log='';server.stdout?.on('data',c=>log+=c);server.stderr?.on('data',c=>log+=c);
let electron:Awaited<ReturnType<typeof _electron.launch>>|undefined;
let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
try {
 let ready=false;for(let i=0;i<600;i++){try{if((await fetch(base+'/api/healthz')).ok){ready=true;break}}catch{}await delay(150)}assert.ok(ready,log);
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
 const novaRow=()=>page.getByRole('button',{name:'Nova',exact:true}).locator('..');
 await novaRow().hover();await page.getByRole('button',{name:'Conversation actions for Nova',exact:true}).click();await page.getByRole('button',{name:'Pin Nova to the top',exact:true}).click();
 await page.locator('.pinned-zone').getByRole('button',{name:'Nova',exact:true}).waitFor();
 await page.reload();await page.locator('.pinned-zone').getByRole('button',{name:'Nova',exact:true}).waitFor();
 await page.getByRole('button',{name:'Unpin Nova',exact:true}).focus();await page.keyboard.press('Enter');
 await page.waitForFunction(()=>![...document.querySelectorAll('.pinned-zone button')].some(el=>el.getAttribute('aria-label')==='Nova'));
 await novaRow().hover();await page.getByRole('button',{name:'Conversation actions for Nova',exact:true}).click();await page.getByRole('button',{name:'Archive Nova',exact:true}).click();
 await page.getByRole('button',{name:'Tap again to archive Nova',exact:true}).click();
 await page.locator('.archived-chats > summary').click();
 await page.getByRole('button',{name:'Unhide Nova',exact:true}).click();await page.getByRole('button',{name:'Archive Nova',exact:true}).waitFor();
 const failedPin='**/api/threads/'+bots[2]!.threadId;
 await page.route(failedPin,route=>route.request().method()==='PATCH' ? route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic save failure'})}) : route.continue());
 await novaRow().hover();await page.getByRole('button',{name:'Conversation actions for Nova',exact:true}).click();await page.getByRole('button',{name:'Pin Nova to the top',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'Synthetic save failure'}).waitFor();
 assert.equal(await page.locator('.pinned-zone').getByRole('button',{name:'Nova',exact:true}).count(),0);
 await page.unroute(failedPin);await page.getByRole('button',{name:'Dismiss',exact:true}).click();
 console.log('PASS conversation actions: pointer pin, reload persistence, keyboard unpin, archive/restore through real host; injected failed save stays visible');
 const archiveFixture=new OpenBotDatabase(root,{dataDir:data});
 for(let i=1;i<=7;i++){const room=archiveFixture.createGroupThread(`Archived project ${i}`, [pixel.id,scout.id]);archiveFixture.updateThread(room.id,{hidden:true});}archiveFixture.close();
 await page.reload();await page.locator('.archived-chats > summary').click();
 const archiveRows=await page.locator('.archived-cell').evaluateAll(rows=>rows.map(row=>row.getBoundingClientRect().height));
 assert.equal(archiveRows.length,7);assert.ok(archiveRows.every(height=>height<=64),'archived rows stay compact');
 await page.locator('.archived-chats').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'archived-chats.png'),scale:'css'});
 await page.locator('.archived-chats > summary').click();
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
 await page.getByRole('complementary',{name:'Document preview'}).waitFor();
 assert.equal(await page.locator('.document-reader table tbody tr').count(),2,'GFM table renders structured rows');
 assert.equal(await page.locator('.document-reader input[type=checkbox]').count(),2,'GFM tasks render');
 await page.screenshot({path:path.join(output,'document-preview.png'),scale:'css'});
 await page.getByRole('link',{name:'Open original',exact:true}).click();
 let downloadState='';for(let i=0;i<60;i++){downloadState=await electron.evaluate(()=> (globalThis as any).__figmaDownload);if(downloadState)break;await delay(100)}assert.equal(downloadState,'completed','Electron saves actual delivered file');
 await page.getByRole('button',{name:'Ask for a change',exact:true}).click();
 await page.waitForFunction(()=> (document.querySelector('#studio-message') as HTMLTextAreaElement)?.value.includes('revision 2'));
 await input.fill('');await delay(700);
 await page.getByRole('button',{name:'Close document',exact:true}).click();

 const original=await page.evaluate(async url=>(await fetch(url)).text(),file.url);assert.equal(original,text,'document uses actual stored bytes');
 await page.getByLabel('Find a conversation').fill('Scout');assert.equal(await page.getByRole('button',{name:'Pixel',exact:true}).count(),0);await page.getByLabel('Find a conversation').fill('');
 await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});await page.screenshot({path:path.join(output,'electron-dark.png'),scale:'css'});await page.emulateMedia({colorScheme:'light',reducedMotion:'reduce'});
 assert.deepEqual(errors,[]);
 console.log('PASS Electron: 1440x940, real backend, draft switching/reload, options, reaction persistence, search, stored artifact bytes');
 }
 browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const phone=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
 phone.on('pageerror',error=>errors.push(`phone: ${error.message}`));
 await phone.goto(`${base}/?thread=${threadId}`);await phone.locator('#studio-message').waitFor();await phone.emulateMedia({reducedMotion:'reduce'});await delay(500);
 await phone.locator('.chat-scroll').evaluate(el=>el.scrollTop=0);await phone.screenshot({path:path.join(output,'phone-390x844.png')});
 assert.ok(await phone.getByText('Give this launch note a little more us.',{exact:false}).isVisible());
 assert.ok(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'phone has no horizontal page overflow');
 await phone.setViewportSize({width:320,height:844});await phone.screenshot({path:path.join(output,'phone-320x844.png')});
 assert.ok(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'320px has no horizontal overflow');
 const reviewBounds=await phone.locator('.delivery-reviews > summary').boundingBox();assert.ok(reviewBounds && reviewBounds.height<90,'review byline stays readable at 320px');
 console.log('PASS phone emulation: visible messages, 390px and 320px, no horizontal overflow');
 if (process.env.OPENBOT_TEST_ALL_SCREENS === '1') {
   await phone.setViewportSize({width:390,height:844});
   await phone.getByRole('link',{name:'Open Meet OpenBot.md, revision 2',exact:true}).click();
   await phone.getByRole('dialog',{name:'Document preview'}).waitFor();
   await phone.screenshot({path:path.join(output,'phone-document.png')});
   await phone.getByRole('button',{name:'Close document',exact:true}).click();
   await page.goto(`${base}/?thread=${threadId}`);
   const search = page.getByLabel('Find a conversation'); await search.waitFor(); await search.focus();
   const focus = await search.evaluate(input => ({ input: getComputedStyle(input).outlineStyle, wrapper: getComputedStyle(input.parentElement!).outlineStyle }));
   assert.equal(focus.input, 'none'); assert.equal(focus.wrapper, 'solid');
   await page.screenshot({path:path.join(output,'search-focus.png'),scale:'css'});
   const panels = ['team','provider','connectors','routines','projects','artifacts','teach','control','usage','remote','live','bot','files','computer'];
   for (const panel of panels) {
     await page.goto(`${base}/?thread=${threadId}&panel=${panel}`);
     await page.locator(`.capability-${panel}`).waitFor();
     if (panel === 'provider') await page.getByText('Checking your connections…',{exact:true}).waitFor({state:'hidden',timeout:90000});
     await delay(600);
     assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth), `${panel}: desktop overflow`);
     await page.mouse.move(1400,900);
     await page.screenshot({path:path.join(output,`workspace-${panel}.png`),scale:'css'});
     assert.ok(await page.locator('.capabilities').evaluate(el=>el.scrollWidth<=el.clientWidth+1), `${panel}: desktop content clipping`);
     const scrollable=page.locator('.settings-page-content');
     if(await scrollable.evaluate(el=>el.scrollHeight>el.clientHeight+40)){await scrollable.evaluate(el=>el.scrollTop=el.scrollHeight);await page.screenshot({path:path.join(output,`workspace-${panel}-bottom.png`),scale:'css'});}
     await phone.setViewportSize({width:390,height:844});
     await phone.goto(`${base}/?thread=${threadId}&panel=${panel}`);
     await phone.locator(`.capability-${panel}`).waitFor(); await delay(250);
     assert.ok(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth), `${panel}: phone overflow`);
     await phone.screenshot({path:path.join(output,`phone-${panel}.png`)});
     await phone.setViewportSize({width:320,height:844});
     assert.ok(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth), `${panel}: 320px phone overflow`);
     assert.ok(await phone.locator('.capabilities').evaluate(el=>el.scrollWidth<=el.clientWidth+1), `${panel}: 320px content clipping`);
     await phone.locator('.settings-mobile-back').click();
     assert.ok(await phone.locator('.settings-page-sidebar').isVisible(), `${panel}: phone returns to menu`);
   }
   await page.emulateMedia({reducedMotion:'no-preference'});
   assert.equal(await page.locator('.capabilities').evaluate(el=>getComputedStyle(el).animationName),'workspace-arrive');
   await page.emulateMedia({reducedMotion:'reduce'});
   assert.equal(await page.locator('.capabilities').evaluate(el=>getComputedStyle(el).animationName),'none');
   await page.goto(`${base}/?thread=${scout.threadId}&panel=bot`);
   await page.locator('.bot-hero').waitFor();
   assert.equal((await page.locator('.bot-hero').evaluate(el=>getComputedStyle(el).getPropertyValue('--mascot-color'))).trim(),scout.color,'teammate hero follows green mascot');
   await page.screenshot({path:path.join(output,'workspace-scout.png'),scale:'css'});
   await page.goto(`${base}/?thread=${threadId}&panel=teach`);
   await page.getByLabel('Note name',{exact:true}).fill('Writing preference');
   await page.getByLabel('What should they remember?',{exact:true}).fill('Keep the launch note concise. Synthetic UI check.');
   await page.getByRole('button',{name:'Save note',exact:true}).click();
   await page.getByText('Memory saved. Future tasks will use the correction.',{exact:true}).waitFor();
   const notes=await page.evaluate(async id=>(await fetch(`/api/extensions/memory/${id}`)).json(),pixel.id);
   assert.ok(notes.some((note:any)=>note.key==='Writing preference' && note.content.includes('Synthetic UI check')));
   await page.screenshot({path:path.join(output,'memory-saved.png'),scale:'css'});
   await page.goto(`${base}/?thread=${threadId}&panel=team`);
   const profile={kind:'openbot-teammate',version:1,bot:{name:'Imported fixture',role:'Preview only',instructions:'No external work',emoji:'o',mascot:'blob',color:'#d86889'},skills:[],routines:[]};
   await page.getByLabel('Import a teammate profile',{exact:true}).setInputFiles({name:'teammate.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(profile))});
   await page.getByRole('region',{name:'Profile preview'}).waitFor();
   const beforeImport=await page.evaluate(async()=> (await (await fetch('/api/state')).json()).bots.length);assert.equal(beforeImport,6,'choosing a profile does not import it');
   await page.screenshot({path:path.join(output,'profile-import-preview.png'),scale:'css'});
   await page.getByRole('button',{name:'Cancel import',exact:true}).click();
   console.log('PASS settings behavior: memory saved through real API; profile preview and cancellation do not create a teammate');
   await page.goto(`${base}/?thread=${threadId}&panel=team`); await page.locator('.workspace-team-grid').getByRole('button',{name:'Edit Pixel',exact:true}).click();
   await page.locator('.capability-bot').waitFor();
   assert.equal(new URL(page.url()).searchParams.get('thread'),threadId);
   await page.getByRole('button',{name:'Back to conversation',exact:true}).click(); await page.locator('#studio-message').waitFor();
   await page.getByRole('button',{name:'About Pixel',exact:true}).click();
   await page.screenshot({path:path.join(output,'teammate-profile.png'),scale:'css'});
   await page.getByRole('link',{name:'Edit & manage teammate',exact:false}).click();await page.locator('.capability-bot').waitFor();
   await page.getByRole('button',{name:'Back to conversation',exact:true}).click();await page.locator('#studio-message').waitFor();
   console.log('PASS all workspace screens: 14 desktop and phone routes, single focus ring, mobile return navigation, teammate edit, back to conversation');
 }
 const expanded=new OpenBotDatabase(root,{dataDir:data});expanded.updateStudioSettings({maxTeammates:40});
 for(let i=1;i<=24;i++) expanded.createBot({name:`Synthetic teammate ${String(i).padStart(2,'0')} with a deliberately long name`,emoji:'',mascot:'blob',color:'#8780bf',role:'Layout stress fixture',instructions:'No external work',computerEnabled:false,browserEnabled:false});expanded.close();
 await page.reload();await page.getByLabel('Find a conversation').waitFor();await page.getByLabel('Find a conversation').fill('Synthetic teammate 24');await page.getByRole('button',{name:'Synthetic teammate 24 with a deliberately long name',exact:true}).waitFor();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.getByLabel('Find a conversation').fill('');await page.screenshot({path:path.join(output,'electron-30-conversations.png'),scale:'css'});
 console.log('PASS 30 conversations: searchable long names, scrolling layout, no horizontal page overflow');
 if (process.env.OPENBOT_TEST_ALL_SCREENS === '1') {
   const empty=new OpenBotDatabase(root,{dataDir:data});for(const bot of empty.listBots()) empty.retireBot(bot.id);empty.close();
   await page.goto(`${base}/?thread=team-room`);await page.locator('.refined-welcome').waitFor();
   await page.screenshot({path:path.join(output,'welcome.png'),scale:'css'});
   await page.getByRole('button',{name:'Create your first teammate',exact:false}).click();
   await page.getByRole('dialog',{name:'Create a teammate',exact:true}).waitFor();
   await page.screenshot({path:path.join(output,'create-teammate.png'),scale:'css'});
   await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);
   await phone.goto(`${base}/?thread=team-room`);await phone.locator('.refined-welcome').waitFor();
   await phone.screenshot({path:path.join(output,'phone-welcome.png')});
   console.log('PASS empty-team welcome and creation dialog: real retired roster, Escape restores conversation, no teammate automatically created');
 }

 assert.deepEqual(errors,[], 'desktop and phone routes have no uncaught renderer errors');

}finally{await browser?.close();if(electron){electron.process().kill("SIGTERM")}server.kill('SIGTERM');writeFileSync(path.join(root,'server.log'),log)}

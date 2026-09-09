import { createServer } from 'node:http';
import { skillAuthoringFixture } from './skill-authoring-fixture.js';
import type { Approval } from '../../shared/types.js';

/** Disposable calendar-like website. It never reaches Google or any owner data. */
export async function browserWorkflowFixture(options: { pauseAfterSave?: boolean; yolo?: boolean } = {}) {
  const writes: string[] = [];
  let replacement = '', replacementRead = false;
  const website = createServer(async (req, res) => {
    if (req.url === '/state') { replacementRead = Boolean(replacement); res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ title: replacement })); return; }
    if (req.url === '/save' && req.method === 'POST') { let body = ''; for await (const chunk of req) body += chunk; writes.push(body); res.end('Saved'); return; }
    res.setHeader('content-type', 'text/html');
    res.end(`<!doctype html><html><body><h1>Fixture Calendar</h1><button id="create" onclick="document.querySelector('form').hidden=false"><span class="google-material-icons">add</span>Create<span class="google-material-icons">arrow_drop_down</span></button><form hidden onsubmit="event.preventDefault();fetch('/save',{method:'POST',body:document.querySelector('#title').value}).then(()=>document.querySelector('#result').textContent='Saved once')"><label>Event title<input id="title"></label><label>Time<input id="time"></label><button id="save" type="submit">Save</button></form><p id="result"></p><script>setInterval(()=>fetch('/state').then(r=>r.json()).then(s=>{if(s.title)document.querySelector('#title').value=s.title}),100)</script></body></html>`);
  });
  await new Promise<void>(resolve => website.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(website.address() as { port: number }).port}`;
  const runtime = `#!${process.execPath}
const fs=require('node:fs');if(!process.env.OPENBOT_RUN_ID){console.log('Fixture');process.exit(0)}
const record='.browser-phase-'+process.env.OPENBOT_RUN_ID+'.json';const phase=fs.existsSync(record)?JSON.parse(fs.readFileSync(record)).phase:0;
async function tool(action,args){const r=await fetch(process.env.OPENBOT_INTERNAL_URL+'/api/internal/tools',{method:'POST',headers:{'content-type':'application/json','x-openbot-token':process.env.OPENBOT_INTERNAL_TOKEN},body:JSON.stringify({botId:process.env.OPENBOT_BOT_ID,runId:process.env.OPENBOT_RUN_ID,action,args})});const body=await r.json();if(!r.ok)throw Error(JSON.stringify(body));return body;}
async function main(){
if(phase===0){await tool('browser_open',{url:${JSON.stringify(url)}});const a=await tool('browser_click',{selector:'#create'});fs.writeFileSync(record,JSON.stringify({phase:1,approvalId:a.approvalId}));setInterval(()=>{},1000);}
else if(phase===1){await tool('browser_type',{selector:'#title',value:'Dinner fixture'});await tool('browser_type',{selector:'#time',value:'2026-09-09 21:00 Europe/Brussels'});const a=await tool('browser_click',{selector:'#save'});fs.writeFileSync(record,JSON.stringify({phase:2,approvalId:a.approvalId}));setInterval(()=>{},1000);}
else if(phase===2 && ${Boolean(options.pauseAfterSave)}){fs.writeFileSync(record,JSON.stringify({phase:3}));console.log(JSON.stringify({type:'step_finish',part:{id:'limit',tokens:{input:1900,output:100}}}));setInterval(()=>{},1000);}
else{const page=await tool('browser_snapshot',{});console.log(JSON.stringify({type:'text',text:page.text.includes('Saved once')?'The fixture event was saved and verified.':'The browser action needs a fresh review; no saved result was verified.'}));}}
main().catch(e=>{console.error(e.message);process.exitCode=1});`;
  let f: Awaited<ReturnType<typeof skillAuthoringFixture>>;
  try { f = await skillAuthoringFixture({ runtime, environment: options.pauseAfterSave ? { OPENBOT_RUN_MAX_TOKENS: '1000', OPENBOT_JOB_MAX_TOKENS: '1000' } : {}, configure(db) { db.updateBot('nova', { browserEnabled: true }); db.updateStudioSettings({ yoloMode: options.yolo ?? false }); } }); }
  catch (error) { website.closeAllConnections(); await new Promise<void>(resolve => website.close(() => resolve())); throw error; }
  const submitted = await f.post('/api/messages', { threadId: 'bot-nova', body: 'Open the fixture calendar and prepare Dinner fixture at the supplied date and time.' });
  const { runs } = await submitted.json() as { runs: Array<{ id: string }> }; const runId = runs[0]!.id;
  const pending = async (label: RegExp) => {
    try { return await f.until(() => f.db.listApprovals().find(a => a.runId === runId && label.test(a.actionLabel))); }
    catch (error) { throw new Error(`${error instanceof Error ? error.message : error}; waiting for ${label}; run=${JSON.stringify(f.db.getRun(runId))}; approvals=${JSON.stringify(f.db.listApprovals())}`); }
  };
  const preview = async (a: Approval) => (await fetch(f.base + '/api/approvals/' + a.id + '/preview')).json();
  const approve = async (a: Approval) => f.post('/api/approvals/' + a.id + '/decide', { decision: 'approved', reviewFingerprint: (await preview(a)).reviewFingerprint });
  return { ...f, runId, writes, pending, preview, approve, changePage: () => { replacement = 'Changed after review'; }, changed: () => replacementRead,
    close: async () => { await f.close(); website.closeAllConnections(); await new Promise<void>(resolve => website.close(() => resolve())); } };
}

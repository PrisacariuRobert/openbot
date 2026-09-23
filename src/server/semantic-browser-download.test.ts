import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { skillAuthoringFixture } from "./testing/skill-authoring-fixture.js";
import type { Approval } from "../shared/types.js";

test("ordinary conversation captures an HTTP browser download as a reopenable attachment", { timeout: 90_000 }, async () => {
  const bytes = Buffer.from("Quarterly results, verified\nQ3,42\n", "utf8");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const site = createServer((req, res) => {
    if (req.url === "/report") {
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", 'attachment; filename="quarterly-results.csv"');
      res.end(bytes);
      return;
    }
    res.setHeader("content-type", "text/html");
    res.end('<title>Reports</title><h1>Quarterly reports</h1><a href="/report" download="quarterly-results.csv">Download quarterly report</a>');
  });
  await new Promise<void>(resolve => site.listen(0, "127.0.0.1", resolve));
  const url = "http://127.0.0.1:" + (site.address() as { port: number }).port;
  const runtime = [
    "#!" + process.execPath,
    "const fs=require('node:fs');if(!process.env.OPENBOT_RUN_ID){console.log('Fixture');process.exit(0)}",
    "const mark='.download-'+process.env.OPENBOT_RUN_ID+'.json';",
    "async function tool(action,args={}){let r=await fetch(process.env.OPENBOT_INTERNAL_URL+'/api/internal/tools',{method:'POST',headers:{'content-type':'application/json','x-openbot-token':process.env.OPENBOT_INTERNAL_TOKEN},body:JSON.stringify({botId:process.env.OPENBOT_BOT_ID,runId:process.env.OPENBOT_RUN_ID,action,args})});return {status:r.status,body:await r.json()}}",
    "async function main(){if(!fs.existsSync(mark)){await tool('browser_open',{url:" + JSON.stringify(url) + "});let armed=await tool('browser_arm_downloads');if(armed.status!==200||!armed.body.armed)throw Error(JSON.stringify(armed));let page=await tool('browser_observe');let links=page.body.targets.filter(x=>x.label==='Download quarterly report');if(links.length!==1)throw Error('Expected report link '+JSON.stringify(page));let clicked=await tool('browser_semantic_act',{targetId:links[0].targetId,kind:'click'});fs.writeFileSync(mark,JSON.stringify({armed,clicked}));if(clicked.body.approvalRequired){setInterval(()=>{},1000);return}}for(let n=0;n<50;n++){let result=await tool('browser_download_results');if(result.status!==200)throw Error(JSON.stringify(result));let saved=result.body.items.find(x=>x.status==='completed');if(saved){console.log(JSON.stringify({type:'text',text:'The quarterly report was saved as attachment '+saved.attachmentId+'.'}));return}await new Promise(r=>setTimeout(r,100))}throw Error('Download not saved')}",
    "main().catch(e=>{console.error(e);process.exitCode=1});",
  ].join("\n");
  let fixture: Awaited<ReturnType<typeof skillAuthoringFixture>> | null = null;
  try {
    fixture = await skillAuthoringFixture({ runtime, configure(db) {
      db.updateBot("nova", { providerInstanceId: "local-opencode", model: "opencode/fixture", browserEnabled: true });
      db.updateStudioSettings({ semanticBrowserEnabled: true, yoloMode: false });
    } });
    const sent = await fixture.post("/api/messages", { threadId: "bot-nova", body: "Download the quarterly report and give me its file." });
    assert.equal(sent.status, 202, await sent.clone().text());
    const { runs } = await sent.json() as { runs: Array<{ id: string }> };
    const runId = runs[0]!.id;
    const mark = path.join(fixture.db.workspacesDir, "nova", ".download-" + runId + ".json");
    await fixture.until(() => {
      if (existsSync(mark)) return true;
      const run = fixture!.db.getRun(runId);
      if (run?.status === "failed") throw new Error(String(run.error));
      return undefined;
    });
    const approval: Approval | undefined = fixture.db.listApprovals().find(a => a.runId === runId && a.status === "pending");
    if (approval) {
      const preview = await (await fetch(fixture.base + "/api/approvals/" + approval.id + "/preview")).json() as { canApprove: boolean; reviewFingerprint: string };
      assert.equal(preview.canApprove, true, JSON.stringify(preview));
      const decision = await fixture.post("/api/approvals/" + approval.id + "/decide", { decision: "approved", reviewFingerprint: preview.reviewFingerprint });
      assert.equal(decision.status, 200, await decision.clone().text());
    }
    await fixture.until(() => fixture!.db.listMessages("bot-nova").some(message => message.body.includes("Browser result saved:")));
    const message = fixture.db.listMessages("bot-nova").find(entry => entry.body.includes("Browser result saved:"))!;
    assert.equal(message.attachments.length, 1);
    const attachment = message.attachments[0]!;
    assert.equal(attachment.name, "quarterly-results.csv");
    assert.equal(attachment.size, bytes.length);
    assert.equal(attachment.metadata?.sha256, sha256);
    assert.equal(attachment.metadata?.browserRunId, runId);
    assert.equal(attachment.metadata?.browserResource, url + "/report");
    const reopened = await fetch(fixture.base + attachment.url);
    assert.equal(reopened.status, 200);
    assert.deepEqual(Buffer.from(await reopened.arrayBuffer()), bytes);
    await fixture.until(() => fixture!.db.getRun(runId)?.status === "completed");
    const state = JSON.parse(readFileSync(mark, "utf8")) as { armed: { body: { armed: boolean } } };
    assert.equal(state.armed.body.armed, true);
    await delay(100);
  } finally {
    await fixture?.close();
    site.closeAllConnections();
    await new Promise<void>(resolve => site.close(() => resolve()));
  }
});

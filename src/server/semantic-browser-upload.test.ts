import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { AttachmentService } from "./attachments.js";
import { SavedFileLibrary } from "./saved-files.js";
import { skillAuthoringFixture } from "./testing/skill-authoring-fixture.js";

for (const flagAtApproval of [true, false]) test("semantic saved upload " + (flagAtApproval ? "sends the approved original once" : "refuses when disabled before approval"), { timeout: 60_000 }, async () => {
  const bytes = Buffer.from([0, 1, 2, 255, 11, 12]);
  const received: Buffer[] = [];
  const portal = createServer(async (req, res) => {
    if (req.url === "/receive" && req.method === "POST") {
      const parts: Buffer[] = [];
      for await (const chunk of req) parts.push(Buffer.from(chunk));
      received.push(Buffer.concat(parts));
      res.end("ok");
      return;
    }
    res.setHeader("content-type", "text/html");
    res.end('<title>File desk</title><label>Decoy file<input type="file"></label><label>Approved evidence<input type="file"></label><p id="status"></p><script>document.querySelectorAll("input")[1].addEventListener("change",async e=>{let f=e.target.files[0];let r=await fetch("/receive",{method:"POST",body:await f.arrayBuffer()});document.querySelector("#status").textContent=r.ok?"Stored "+f.name:"Failed"})</script>');
  });
  await new Promise<void>(resolve => portal.listen(0, "127.0.0.1", resolve));
  const url = "http://127.0.0.1:" + (portal.address() as { port: number }).port;
  let fixture: Awaited<ReturnType<typeof skillAuthoringFixture>> | null = null;
  try {
    const savedId = randomBytes(16).toString("hex");
    const runtime = [
      "#!" + process.execPath,
      "const fs=require('node:fs');if(!process.env.OPENBOT_RUN_ID){console.log('Fixture');process.exit(0)}",
      "const mark='.upload-'+process.env.OPENBOT_RUN_ID+'.json';",
      "async function tool(action,args={}){let r=await fetch(process.env.OPENBOT_INTERNAL_URL+'/api/internal/tools',{method:'POST',headers:{'content-type':'application/json','x-openbot-token':process.env.OPENBOT_INTERNAL_TOKEN},body:JSON.stringify({botId:process.env.OPENBOT_BOT_ID,runId:process.env.OPENBOT_RUN_ID,action,args})});return {status:r.status,body:await r.json()}}",
      "async function main(){if(!fs.existsSync(mark)){await tool('browser_open',{url:" + JSON.stringify(url) + "});let p=await tool('browser_observe');if(p.status!==200)throw Error(JSON.stringify(p));let a=p.body.targets.filter(x=>x.label.includes('Approved evidence'));if(a.length!==1)throw Error('Wrong targets '+JSON.stringify(p.body.targets));let result=await tool('browser_semantic_upload',{savedFileId:" + JSON.stringify(savedId) + ",targetId:a[0].targetId});fs.writeFileSync(mark,JSON.stringify(result));if(result.status!==200||!result.body.approvalRequired)throw Error(JSON.stringify(result));setInterval(()=>{},1000);return}console.log(JSON.stringify({type:'text',text:'File selection finished.'}))}",
      "main().catch(e=>{console.error(e);process.exitCode=1});",
    ].join("\n");
    fixture = await skillAuthoringFixture({ runtime, configure(db) {
      db.updateBot("nova", { providerInstanceId: "local-opencode", model: "opencode/fixture", browserEnabled: true });
      db.updateStudioSettings({ semanticBrowserEnabled: true, yoloMode: true });
    } });
    const attachment = await new AttachmentService(fixture.db).saveUpload({ id: savedId, threadId: "bot-nova", name: "evidence.bin", mime: "application/octet-stream", body: bytes });
    new SavedFileLibrary(fixture.db).add("nova", attachment.id);
    const sent = await fixture.post("/api/messages", { threadId: "bot-nova", body: "Select my saved evidence file in Approved evidence." });
    assert.equal(sent.status, 202, await sent.clone().text());
    const { runs } = await sent.json() as { runs: Array<{ id: string }> };
    const approval = await fixture.until(() => {
      const entry = fixture!.db.listApprovals().find(a => a.runId === runs[0]!.id && a.status === "pending");
      if (entry) return entry;
      const run = fixture!.db.getRun(runs[0]!.id);
      if (run?.status === "failed" || run?.status === "completed") {
        const mark = path.join(fixture!.db.workspacesDir, "nova", ".upload-" + runs[0]!.id + ".json");
        throw new Error("No approval: " + JSON.stringify({ run, mark: existsSync(mark) ? readFileSync(mark, "utf8") : null, messages: fixture!.db.listMessages("bot-nova") }));
      }
      return undefined;
    });
    assert.match(approval.actionLabel, /evidence\.bin/);
    const preview = await (await fetch(fixture.base + "/api/approvals/" + approval.id + "/preview")).json() as { canApprove: boolean; reviewFingerprint: string };
    assert.equal(preview.canApprove, true, JSON.stringify(preview));
    assert.deepEqual(received, []);
    if (!flagAtApproval) fixture.db.updateStudioSettings({ semanticBrowserEnabled: false });
    const decision = await fixture.post("/api/approvals/" + approval.id + "/decide", { decision: "approved", reviewFingerprint: preview.reviewFingerprint });
    assert.equal(decision.status, 200, await decision.clone().text());
    await fixture.until(() => fixture!.db.getApprovedAction(approval.id)?.status === (flagAtApproval ? "completed" : "failed"));
    if (flagAtApproval) {
      for (let i = 0; i < 30 && received.length === 0; i++) await delay(100);
      assert.deepEqual(received, [bytes]);
    } else assert.deepEqual(received, []);
  } finally {
    await fixture?.close();
    portal.closeAllConnections();
    await new Promise<void>(resolve => portal.close(() => resolve()));
  }
});

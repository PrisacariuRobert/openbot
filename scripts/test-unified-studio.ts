// Real UI + disposable host. No owner files, model dispatch or account sign-in.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer as createSocket } from "node:net";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createServer } from "vite";
import { chromium } from "playwright-core";
import { OpenBotDatabase } from "../src/server/testing/database";

const data = mkdtempSync(path.join(tmpdir(), "openbot-unified-studio-"));
const output = "/tmp/openbot-unified-studio-qa";
mkdirSync(output, { recursive: true });
const db = new OpenBotDatabase(data, {dataDir:data});
for(const bot of db.listBots()) db.updateBot(bot.id,{providerInstanceId:db.listProviders()[0]!.id,model:"fixture/never-dispatched"});
db.addMessage({threadId:"bot-pixel",senderType:"user",senderId:null,body:"Can you help me get the launch ready?"});
db.addMessage({threadId:"bot-pixel",senderType:"bot",senderId:"pixel",body:"Of course. Share what’s ready and what still needs work. We can turn that into a short, practical plan."});
db.close();
const socket = createSocket(); await new Promise<void>(r => socket.listen(0,"127.0.0.1",r));
const port = (socket.address() as {port:number}).port; await new Promise<void>(r=>socket.close(()=>r()));
const host = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath,["--import","tsx","src/server/index.ts"],{stdio:"ignore",env:{...process.env,OPENBOT_LOAD_ENV:"0",OPENBOT_DATA_DIR:data,OPENBOT_PORT:String(port),OPENBOT_HOST:"127.0.0.1",OPENBOT_APP_URL:host,OPENBOT_DEPLOYMENT_MODE:"local",NODE_ENV:"production"}});
const vite = await createServer({configFile:false,root:process.cwd(),server:{host:"127.0.0.1",port:0,hmr:false,proxy:{"/api":host}}});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  let ready = false;
  for(let n=0;n<100;n++){try{if((await fetch(host+"/api/healthz")).ok){ready=true;break;}}catch{}await delay(150);}
  assert.ok(ready,"Disposable host starts"); await vite.listen();
  const address = vite.httpServer!.address(); assert(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({executablePath:process.env.OPENBOT_CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:true});
  const page = await browser.newPage({viewport:{width:1440,height:960}});
  page.setDefaultTimeout(12_000);
  const errors:string[]=[]; page.on("pageerror",e=>errors.push(e.message));
  const mutations:string[]=[];
  let allowDraft = false;
  await page.route("**/api/**",route=>{
    if(allowDraft && new URL(route.request().url()).pathname.startsWith("/api/drafts/")) return route.continue();
    // This POST only calculates future dates; it does not save or run a routine.
    if(new URL(route.request().url()).pathname === "/api/routines/preview") return route.continue();
    if(!["GET","HEAD"].includes(route.request().method())) {
      mutations.push(new URL(route.request().url()).pathname);
      return route.fulfill({status:409,json:{error:"Test: actions are not permitted in layout checks"}});
    }
    return route.continue();
  });
  let checks=0;
  for(const width of process.env.OPENBOT_UI_FOCUS ? [] : [1440,390]) {
    await page.setViewportSize({width,height:width===390?844:960});
    for(const appearance of ["light","dark"] as const) {
      await page.emulateMedia({colorScheme:appearance,reducedMotion:"reduce"});
      for(const route of ["/?thread=bot-pixel","/studio.html?thread=bot-pixel","/?panel=settings","/?panel=provider","/?panel=connectors","/?panel=routines","/?panel=bot","/?panel=computer","/?panel=files","/?panel=teach","/?panel=projects","/?panel=remote","/?panel=live","/?panel=control","/?panel=search"]) {
        await page.goto(base+route);
        // An open modal correctly makes the background composer inert to
        // assistive technology, so use DOM presence for this shell assertion.
        await page.locator("#studio-message").waitFor({state:"attached"});
        if(route.includes("panel=")) await page.getByRole("dialog").waitFor();
        if(route.includes("panel=connectors")) {
          const card = page.locator(".connector-card").first(); await card.waitFor();
          assert.ok(await card.evaluate(el=>parseFloat(getComputedStyle(el).paddingTop)>=16),"App cards retain deliberate spacing");
          assert.ok(await card.locator(".connector-symbol").evaluate(el=>el.getBoundingClientRect().width<=32),"Service logos stay icon-sized");
        }
        await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
        await delay(400); // secondary GET responses settle, no live accounts in this host
        const panel = new URL(base+route).searchParams.get("panel") || "chat";
        assert.equal(await page.locator(".app-shell, .sheet, .mascot, .mascot-art").count(),0,`${route}: retired shell absent`);
        assert.equal(await page.getByText("Current app",{exact:true}).count(),0);
        const overflow = await page.evaluate(()=>({page:document.documentElement.scrollWidth>innerWidth,dialogs:[...document.querySelectorAll("dialog")].some(el=>el.scrollWidth>el.clientWidth+1)}));
        assert.deepEqual(overflow,{page:false,dialogs:false},`${width}/${appearance}/${panel}: contained layout`);
        if(!route.startsWith("/studio")) await page.screenshot({path:path.join(output,`${width}-${appearance}-${panel}.png`)});
        checks++;
      }
    }
  }
  assert.deepEqual(errors,[],"All migrated panels mount without browser exceptions");
  assert.deepEqual(mutations,[],"Opening settings must not run tasks or change permissions");
  allowDraft = true;
  await page.setViewportSize({width:1440,height:960});
  await page.goto(base+"/?thread=bot-pixel");
  const composer = page.getByRole("textbox",{name:"Message your team",exact:true});
  const saved = page.waitForResponse(r=>r.url().includes("/api/drafts/bot-pixel") && r.request().method()==="PUT");
  await composer.fill("Keep this draft while I choose my AI."); await saved;
  await composer.evaluate(el=>el.setAttribute("data-migration-check","same-composer"));
  await page.getByRole("button",{name:"Settings",exact:true}).click();
  await page.getByRole("dialog").getByRole("link",{name:"Your AI Choose providers and models"}).click();
  await page.locator(".capability-provider").waitFor();
  await page.getByRole("dialog").getByRole("button",{name:"Close",exact:true}).click();
  assert.equal(await composer.inputValue(),"Keep this draft while I choose my AI.");
  assert.equal(await composer.getAttribute("data-migration-check"),"same-composer","Settings navigation keeps the conversation mounted");
  checks++;

  // The retired App also handled owner login; exercise its replacement with
  // synthetic credentials, not the user's key or pairing state.
  let locked = true, unlocks = 0;
  await page.route("**/api/state*",route=>locked ? route.fulfill({status:401,json:{error:"fixture locked"}}) : route.continue());
  await page.route("**/api/auth/login",route=>{assert.deepEqual(route.request().postDataJSON(),{token:"fixture-only-key"});unlocks++;locked=false;return route.fulfill({json:{ok:true}});});
  await page.setViewportSize({width:390,height:844});
  await page.goto(base+"/"); await page.getByRole("heading",{name:"Your studio is private."}).waitFor();
  await page.screenshot({path:path.join(output,"390-dark-unlock.png")});
  await page.getByLabel("Access key",{exact:true}).fill("fixture-only-key");
  await page.getByRole("button",{name:"Unlock studio",exact:true}).click();
  await page.getByRole("textbox",{name:"Message your team",exact:true}).waitFor();
  assert.equal(unlocks,1); assert.equal((await page.locator("body").innerText()).includes("fixture-only-key"),false);
  checks++;
  assert.deepEqual(errors,[]);
  console.log(`PASS: ${checks} real-host route/theme/viewport checks. Every former panel uses Studio; screenshots in ${output}. No model or external action.`);
} finally {
  await browser?.close(); await vite.close();
  if(child.exitCode===null && child.signalCode===null){child.kill("SIGTERM");await new Promise<void>(resolve=>{child.once("exit",()=>resolve());setTimeout(()=>{if(child.exitCode===null && child.signalCode===null)child.kill("SIGKILL");resolve();},4000).unref();});}
  rmSync(data,{recursive:true,force:true});
}

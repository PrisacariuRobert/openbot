// Real UI + disposable host. No owner files, model dispatch or account sign-in.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer as createSocket } from "node:net";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
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
  const base = process.env.OPENBOT_BUILT_UI ? host : `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({executablePath:process.env.OPENBOT_CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:true});
  const page = await browser.newPage({viewport:{width:1440,height:960}});
  page.setDefaultTimeout(12_000);
  const errors:string[]=[]; page.on("pageerror",e=>errors.push(e.message));
  const mutations:string[]=[];
  let allowDraft = false;
  await page.route("**/api/**",route=>{
    const pathname = new URL(route.request().url()).pathname;
    // Layout fixtures do not enumerate the owner's real project folders/files.
    if(pathname === "/api/code-projects" && route.request().method() === "GET") return route.fulfill({json:{projects:[],edits:[],workspaces:[],reviews:[],suggestions:[]}});
    if(/^\/api\/bots\/[^/]+\/files$/.test(pathname)) return route.fulfill({json:[{path:"example-project/notes-for-the-team.md",kind:"file",size:256} ]});
    if(/^\/api\/bots\/[^/]+\/file$/.test(pathname)) return route.fulfill({json:{path:"example-project/notes-for-the-team.md",content:"# Sample workspace\n\nThis is disposable UI test data, not an owner file."}});
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
  const expandedFailures:string[]=[];
  for(const width of process.env.OPENBOT_UI_FOCUS ? [] : [1440,390]) {
    await page.setViewportSize({width,height:width===390?844:960});
    for(const appearance of ["light","dark"] as const) {
      await page.emulateMedia({colorScheme:appearance,reducedMotion:"reduce"});
      for(const route of ["/?thread=bot-pixel","/studio.html?thread=bot-pixel","/?panel=settings","/?panel=provider","/?panel=connectors","/?panel=routines","/?panel=bot","/?panel=computer","/?panel=files","/?panel=artifacts","/?panel=teach","/?panel=projects","/?panel=remote","/?panel=live","/?panel=control","/?panel=search"]) {
        if (process.env.OPENBOT_PANEL_FOCUS && !route.includes(`panel=${process.env.OPENBOT_PANEL_FOCUS}`)) continue;
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
        if (overflow.dialogs) {
          console.log(await page.locator("dialog").evaluate(dialog => [...dialog.querySelectorAll("*")].filter(el => el.getBoundingClientRect().right > dialog.getBoundingClientRect().right + 1).map(el => ({ tag: el.tagName, class: el.className, width: el.getBoundingClientRect().width }))));
          await page.screenshot({path:path.join(output,`${width}-${appearance}-${panel}-overflow.png`)});
        }
        assert.deepEqual(overflow,{page:false,dialogs:false},`${width}/${appearance}/${panel}: contained layout`);
        if(!route.startsWith("/studio")) await page.screenshot({path:path.join(output,`${width}-${appearance}-${panel}.png`)});
        if(process.env.OPENBOT_EXPANDED_SETTINGS && route.includes("panel=")) {
          // Exercise disclosures through their real controls. No changes to
          // account, permission or routine settings are allowed by the route guard.
          for(let n=0;n<40;n++) {
            const next = page.locator("dialog details:not([open]) > summary:visible").first();
            if(!await next.count()) break;
            await next.click();
          }
          await delay(200);
          const dialog = page.getByRole("dialog");
          const overflow = await dialog.evaluate(el=>el.scrollWidth>el.clientWidth+1);
          if(overflow) {
            expandedFailures.push(`${width}/${appearance}/${panel}`);
            console.log("Expanded overflow", await dialog.evaluate(el=>[...el.querySelectorAll("*")].filter(node=>node.getBoundingClientRect().right>el.getBoundingClientRect().right+1).slice(0,12).map(node=>({tag:node.tagName,class:node.className,width:node.getBoundingClientRect().width}))));
          }
          writeFileSync(path.join(output,`${width}-${appearance}-${panel}-expanded.txt`),await dialog.innerText());
          const scrollHeight = await dialog.evaluate(el=>el.scrollHeight);
          for(const [label,ratio] of [["top",0],["middle",.5],["end",1]] as const) {
            await dialog.evaluate((el,ratio)=>{el.scrollTop=(el.scrollHeight-el.clientHeight)*ratio;},ratio);
            await page.screenshot({path:path.join(output,`${width}-${appearance}-${panel}-expanded-${label}.png`)});
          }
          console.log(`Expanded ${width}/${appearance}/${panel}: ${scrollHeight}px`);
          const captureForm = async (name:string) => {
            await delay(150);
            const overflow = await dialog.evaluate(el=>el.scrollWidth>el.clientWidth+1);
            assert.equal(overflow,false,`${width}/${appearance}/${panel}/${name}: form stays contained`);
            await page.screenshot({path:path.join(output,`${width}-${appearance}-${panel}-${name}.png`)});
            checks++;
          };
          if(panel === "routines") {
            const trigger = dialog.getByLabel("What starts it?",{exact:true});
            for(const value of ["webpage","calendar","github","todoist","dropbox","slack","notion","webhook","schedule"]) {
              await trigger.selectOption(value);
              await trigger.scrollIntoViewIfNeeded();
              await captureForm(`trigger-${value}`);
            }
            for(const value of ["custom","once","interval","weekdays"]) {
              await dialog.getByLabel("Repeat",{exact:true}).selectOption(value);
              await dialog.getByLabel("Repeat",{exact:true}).scrollIntoViewIfNeeded();
              await captureForm(`repeat-${value}`);
            }
          }
          if(panel === "projects") {
            await dialog.getByRole("button",{name:"Get from GitHub",exact:true}).click();
            for(const label of await dialog.locator(".project-new-access > label > span").all()) assert.ok((await label.boundingBox())!.width>=50,"Project access keeps teammate names readable beside the picker");
            await captureForm("github-form");
            await dialog.getByRole("button",{name:"Cancel",exact:true}).click();
            await dialog.getByRole("button",{name:"Connect a folder",exact:true}).click();
            await captureForm("folder-form");
          }
          if(panel === "provider") {
            await dialog.getByRole("button",{name:"API & local models",exact:true}).click();
            await dialog.getByRole("button",{name:"Add API or local model",exact:true}).click();
            await captureForm("api-form");
            await dialog.getByLabel("Provider",{exact:true}).selectOption("custom");
            await captureForm("custom-api-form");
          }
          if(panel === "connectors") {
            const extensions = dialog.locator(".extensions-panel");
            await extensions.getByRole("combobox",{name:/^Connection type/}).selectOption("stdio");
            await captureForm("local-mcp-form");
            for(const name of ["Memory","Skills"]) {
              await extensions.getByRole("button",{name,exact:true}).click();
              await captureForm(name.toLowerCase());
            }
          }
          if(panel === "files") {
            await dialog.getByRole("button",{name:/example-project\/notes/}).click();
            await dialog.locator(".file-preview").waitFor();
            await captureForm("file-preview");
            await dialog.getByRole("button",{name:"All files",exact:true}).click();
            await dialog.locator(".file-list").waitFor();
          }
          if(panel === "teach") {
            // Color-token regression: dark surfaces must never inherit dark
            // text from the retired standalone extension theme.
            const colors = await dialog.locator(".extension-card h4").first().evaluate(el=>({text:getComputedStyle(el).color,ink:getComputedStyle(document.documentElement).getPropertyValue("--ink").trim()}));
            const rgb = colors.ink.slice(1).match(/.{2}/g)!.map(part=>parseInt(part,16));
            assert.equal(colors.text,`rgb(${rgb.join(", ")})`,"Skill cards use the active theme's readable text color");
            assert.equal(await dialog.locator(".extensions-panel input.visually-hidden").first().evaluate(el=>el.getBoundingClientRect().width),1,"Hidden skill upload stays hidden");
            assert.equal(await dialog.getByRole("combobox",{name:"Teammate",exact:true}).count(),1,"One owner choice controls the whole Skills page");
            await dialog.getByRole("combobox",{name:"Teammate",exact:true}).click();
            await dialog.getByRole("option",{name:/^Pixel/}).click();
            await dialog.getByRole("checkbox",{name:"Available to Pixel",exact:true}).first().waitFor();
            assert.equal(await dialog.getByRole("checkbox",{name:"Available to Nova",exact:true}).count(),0,"Skill access follows the selected teammate");
            await captureForm("pixel-skills");
          }
        }
        checks++;
      }
    }
  }
  assert.deepEqual(errors,[],"All migrated panels mount without browser exceptions");
  assert.deepEqual(expandedFailures,[],"Expanded settings forms stay contained");
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
  await page.goBack();
  await page.getByRole("heading", {name:"Settings",exact:true}).waitFor();
  assert.equal(await composer.inputValue(), "Keep this draft while I choose my AI.", "Browser back returns to Settings and keeps the draft");
  await page.goForward();
  await page.locator(".capability-provider").waitFor();
  await page.getByRole("button", {name:"Back to settings",exact:true}).click();
  await page.getByRole("heading", {name:"Settings",exact:true}).waitFor();
  for(const panel of ["provider","connectors","bot","routines","remote","control","projects","teach","files","artifacts","live"]) {
    assert.equal(await page.getByRole("dialog").locator(`a[href='/?panel=${panel}']`).count(),1,`${panel} is reachable directly from Settings`);
  }
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

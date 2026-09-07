// Isolated component QA: Vite serves an in-memory fixture, never the owner app.
import assert from "node:assert/strict";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { createServer } from "vite";
import { chromium } from "playwright-core";
import sharp from "sharp";
import type { Bot } from "../shared/types";

const bot: Bot = {
  id: "appearance-fixture",
  ownerId: "fixture",
  providerInstanceId: null,
  name: "Remy",
  emoji: "●",
  mascot: "nova",
  color: "#6757d9",
  role: "Plan the week",
  instructions: "Keep changes private.",
  model: "",
  status: "ready",
  currentAction: null,
  computerEnabled: false,
  browserEnabled: false,
  macAccessEnabled: false,
  weeklyTokenBudget: 0,
  tokensUsedThisWeek: 0,
  createdAt: "2026-09-06",
  lastActiveAt: null,
  threadId: "fixture-thread",
  retiredAt: null,
};
const root = process.cwd(),
  entry = path.join(root, "studio-polish-fixture.tsx");
const server = await createServer({
  configFile: false,
  root,
  server: { host: "127.0.0.1", port: 0 },
  plugins: [
    {
      name: "studio-polish-fixture",
      resolveId(source) {
        if (source === "/studio-polish-fixture.tsx") return entry;
      },
      load(id) {
        if (id !== entry) return;
        return `import React,{useRef,useState} from 'react'; import {createRoot} from 'react-dom/client';
        import {ChoiceMenu} from '/src/studio/ChoiceMenu.tsx'; import {Character} from '/src/studio/Character.tsx';
        import {AppearanceEditor} from '/src/studio/AppearanceEditor.tsx'; import {mascotShapes} from '/src/studio/mascot-catalog.ts';
        import {BrowserAccessCard} from '/src/studio/BrowserAccessCard.tsx';
        import '/src/studio/studio.css'; import '/src/studio/create-teammate.css'; import '/src/studio/design-tokens.css';
        const choices=[{value:'alpha',label:'Alpha',detail:'A first option'},{value:'beta',label:'Beta',detail:'Currently selected'},{value:'disabled',label:'Disabled option',disabled:true},{value:'gamma',label:'Gamma',detail:'A final option'}];
        function Fixture(){ const [value,setValue]=useState('beta'),[current,setCurrent]=useState(${JSON.stringify(bot)}),[count,setCount]=useState(0),[showAccess,setShowAccess]=useState(false),[accessBot,setAccessBot]=useState({...${JSON.stringify(bot)},id:'browser-fixture-a',name:'Browser A'}); const modal=useRef(null);
          return <main className="polish-fixture"><h1>Small details, real controls.</h1><div className="mascot-catalog">{mascotShapes.map(shape=><Character key={shape.id} name={shape.name} color="#6757d9" variant={shape.id} size={64}/>)}</div>
          <ChoiceMenu label="Choose a connection" value={value} choices={choices} onChange={setValue}/><output aria-label="Selected option">{value}</output>
          <ChoiceMenu label="Empty connection list" value="" choices={[]} disabled onChange={()=>{throw Error('Disabled menu must not change')}}/>
          <button type="button" className="secondary" onClick={()=>modal.current.showModal()}>Open modal</button><button type="button" className="secondary" style={{order:-1}}>Outside target</button>
          <dialog ref={modal} aria-label="Modal fixture"><h2>Choose inside a sheet</h2><ChoiceMenu label="Modal connection" value={value} choices={choices} onChange={setValue}/><button className="secondary" type="button" onClick={()=>modal.current.close()}>Close modal</button></dialog>
          <AppearanceEditor bot={current} onSaved={result=>{setCurrent(result);setCount(n=>n+1)}}/><output aria-label="Saved appearances">{count}</output><output aria-label="Saved character">{current.mascot}:{current.color}</output>
          <div className="bottom-choice"><ChoiceMenu label="Near bottom edge" value={value} choices={choices} onChange={setValue}/></div>
          <button type="button" onClick={()=>setShowAccess(true)}>Show browser access</button>
          {showAccess&&<section aria-label="Browser access fixture"><button type="button" onClick={()=>setAccessBot(previous=>({...previous,id:previous.id==='browser-fixture-a'?'browser-fixture-b':'browser-fixture-a',name:previous.id==='browser-fixture-a'?'Browser B':'Browser A'}))}>Switch browser teammate</button><button type="button" onClick={()=>setAccessBot(previous=>({...previous,browserEnabled:!previous.browserEnabled}))}>Toggle browser permission</button><BrowserAccessCard bot={accessBot}/></section>}</main>;
        } createRoot(document.getElementById('root')).render(<Fixture/>);`;
      },
      configureServer(vite) {
        vite.middlewares.use((request, response, next) => {
          if (request.url !== "/") return next();
          response.setHeader("content-type", "text/html");
          response.end(
            `<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><body><div id="root"></div><style>.polish-fixture{width:min(620px,100%);padding:20px;margin:auto;display:grid;gap:18px}.polish-fixture h1{font-size:22px}.mascot-catalog{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));justify-items:center}.polish-fixture dialog{width:min(380px,calc(100vw - 24px));padding:24px;border:1px solid var(--line);border-radius:18px;background:var(--surface);color:var(--ink)}.polish-fixture dialog .choice-menu{margin:24px 0}.bottom-choice{padding-top:200px}.polish-fixture output{font-size:12px}</style><script type="module" src="/studio-polish-fixture.tsx"></script></body></html>`,
          );
        });
      },
    },
  ],
});
await server.listen();
const address = server.httpServer!.address();
assert.ok(address && typeof address === "object");
const browser = await chromium.launch({
  executablePath:
    process.env.OPENBOT_CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const output = "/tmp/openbot-studio-polish-qa";
mkdirSync(output, { recursive: true });
let checks = 0;
try {
  const page = await browser.newPage({ reducedMotion: "reduce" });
  page.setDefaultTimeout(8000);
  const errors: string[] = [],
    patches: unknown[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let mode: "failure" | "success" = "failure",
    hold = false,
    release: (() => void) | null = null;
  let browserPreference: "none" | "browser" | "connector" = "none",
    browserReads = 0,
    holdBrowser = false,
    releaseBrowser: (() => void) | null = null,
    browserHeldFinished: Promise<void> | null = null;
  await page.route("**/api/**", async (route) => {
    const requestPath = new URL(route.request().url()).pathname;
    if (
      /^\/api\/bots\/browser-fixture-[ab]\/browser-access$/.test(requestPath)
    ) {
      assert.equal(route.request().method(), "GET");
      browserReads++;
      const botId = requestPath.split("/")[3];
      const denied = botId === "browser-fixture-b";
      const response = {
        botId,
        browserEnabled: browserPreference !== "none",
        runtimeAvailable: true,
        services: [
          {
            service: "gmail",
            label: "Gmail",
            connectorState: denied
              ? "read-denied"
              : browserPreference === "connector"
                ? "ready"
                : "not-connected",
            browserState: denied ? "read-denied" : "available-unverified",
            preferred: denied ? "none" : browserPreference,
          },
        ],
      };
      let finish: (() => void) | undefined;
      if (holdBrowser) {
        holdBrowser = false;
        browserHeldFinished = new Promise<void>((resolve) => {
          finish = resolve;
        });
        await new Promise<void>((resolve) => {
          releaseBrowser = resolve;
        });
      }
      try {
        await route.fulfill({ json: response });
      } finally {
        finish?.();
      }
      return;
    }
    assert.equal(route.request().method(), "PATCH");
    assert.equal(
      new URL(route.request().url()).pathname,
      "/api/bots/appearance-fixture",
    );
    const body = route.request().postDataJSON();
    patches.push(body);
    if (hold)
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    await route.fulfill({
      status: mode === "failure" ? 503 : 200,
      json:
        mode === "failure"
          ? { error: "Fixture connection failed. Try again." }
          : { ...bot, ...body },
    });
  });
  const open = async (width = 390) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`http://127.0.0.1:${address.port}/`);
    await page
      .getByRole("combobox", { name: "Choose a connection", exact: true })
      .waitFor();
  };
  const focused = () =>
    page.evaluate(
      () =>
        document.activeElement?.getAttribute("data-label") ||
        document.activeElement?.getAttribute("aria-label"),
    );
  const menu = page.getByRole("combobox", {
    name: "Choose a connection",
    exact: true,
  });
  const list = page.getByRole("listbox", {
    name: "Choose a connection",
    exact: true,
  });
  for (const width of [320, 390, 1440]) {
    await open(width);
    const bodies = await page
      .locator(".mascot-catalog .character")
      .evaluateAll((elements) =>
        elements.map((element) => ({
          shape: element.getAttribute("data-shape"),
          body: element.querySelector(".character-body")?.getAttribute("d"),
        })),
      );
    assert.equal(new Set(bodies.map((item) => item.shape)).size, 6);
    assert.equal(
      new Set(bodies.map((item) => item.body)).size,
      6,
      "Six mascot identities have six distinct body paths",
    );
    const blinkDelays = await page
      .locator(".mascot-catalog .character")
      .evaluateAll((elements) =>
        elements.map((element) =>
          (element as SVGElement).style.getPropertyValue("--blink-delay"),
        ),
      );
    assert.ok(
      new Set(blinkDelays).size >= 3,
      "Characters do not all blink in sync",
    );
    assert.equal(
      await page
        .getByRole("combobox", { name: "Empty connection list" })
        .isDisabled(),
      true,
    );
    const boxes = await page.locator(".character").evaluateAll((elements) =>
      elements.map((element) => {
        const r = element.getBoundingClientRect();
        return {
          left: r.left - 4,
          right: r.right + 4,
          top: r.top - 4,
          bottom: r.bottom + 4,
        };
      }),
    );
    const png = await page.screenshot({
      path: path.join(output, `catalog-${width}.png`),
      animations: "disabled",
    });
    const pixels = await sharp(png)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let outside = 0,
      inside = 0;
    for (let y = 0; y < pixels.info.height; y += 2)
      for (let x = 0; x < pixels.info.width; x += 2) {
        const i = (y * pixels.info.width + x) * pixels.info.channels;
        if (
          Math.max(pixels.data[i]!, pixels.data[i + 1]!, pixels.data[i + 2]!) -
            Math.min(
              pixels.data[i]!,
              pixels.data[i + 1]!,
              pixels.data[i + 2]!,
            ) <=
          14
        )
          continue;
        if (
          boxes.some(
            (box) =>
              x >= box.left &&
              x <= box.right &&
              y >= box.top &&
              y <= box.bottom,
          )
        )
          inside++;
        else outside++;
      }
    assert.equal(outside, 0, "Main surface color is confined to the mascots");
    assert.ok(inside > 100);
    await menu.click();
    const bounds = await list.boundingBox();
    assert.ok(
      bounds &&
        bounds.x >= 0 &&
        bounds.x + bounds.width <= width + 1 &&
        bounds.y >= 0 &&
        bounds.y + bounds.height <= 901,
    );
    await page.keyboard.press("Escape");
    const bottomMenu = page.getByRole("combobox", { name: "Near bottom edge" });
    await bottomMenu.scrollIntoViewIfNeeded();
    await bottomMenu.click();
    const bottomBounds = await page
      .getByRole("listbox", { name: "Near bottom edge" })
      .boundingBox();
    assert.ok(
      bottomBounds &&
        bottomBounds.x >= 0 &&
        bottomBounds.x + bottomBounds.width <= width + 1 &&
        bottomBounds.y >= 0 &&
        bottomBounds.y + bottomBounds.height <= 901,
      "Menu repositions inside the viewport near the bottom edge",
    );
    await page.keyboard.press("Escape");
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByText("Change their look", { exact: true }).click();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: path.join(output, `appearance-${width}.png`),
      animations: "disabled",
    });
    checks++;
  }
  await open();
  await menu.focus();
  await page.keyboard.press("ArrowDown");
  assert.equal(await focused(), "Beta");
  await page.keyboard.press("ArrowDown");
  assert.equal(await focused(), "Gamma", "Disabled choice is skipped");
  await page.keyboard.press("Home");
  assert.equal(await focused(), "Alpha");
  await page.keyboard.press("End");
  assert.equal(await focused(), "Gamma");
  await page.keyboard.press("ArrowDown");
  assert.equal(await focused(), "Alpha");
  await page.keyboard.press("ArrowUp");
  assert.equal(await focused(), "Gamma");
  await page.keyboard.press("b");
  assert.equal(await focused(), "Beta");
  await page.keyboard.press("Enter");
  assert.equal(await page.getByLabel("Selected option").textContent(), "beta");
  assert.equal(await focused(), "Choose a connection");
  await menu.press("Home");
  assert.equal(
    await focused(),
    "Alpha",
    "Home from a closed menu starts at the first enabled choice",
  );
  await page.keyboard.press("Escape");
  await menu.press("End");
  assert.equal(await focused(), "Gamma");
  await page.keyboard.press("Escape");
  await menu.press("Enter");
  await page.keyboard.press("g");
  await page.keyboard.press("a");
  assert.equal(await focused(), "Gamma", "Typeahead resets on opening a menu");
  await page.keyboard.press("Enter");
  assert.equal(await page.getByLabel("Selected option").textContent(), "gamma");
  await menu.click();
  await page.getByRole("button", { name: "Outside target" }).click();
  await list.waitFor({ state: "hidden" });
  assert.equal(
    await page
      .getByRole("button", { name: "Outside target" })
      .evaluate((element) => element === document.activeElement),
    true,
    "Light-dismiss preserves focus on the clicked destination",
  );
  checks++;

  await page.getByRole("button", { name: "Open modal", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Modal fixture" });
  const modalMenu = dialog.getByRole("combobox", { name: "Modal connection" });
  await modalMenu.click();
  await page.getByRole("listbox", { name: "Modal connection" }).waitFor();
  await page.keyboard.press("Home");
  await page.keyboard.press("Enter");
  assert.equal(await focused(), "Modal connection");
  await modalMenu.click();
  await page.keyboard.press("Escape");
  assert.equal(
    await dialog.isVisible(),
    true,
    "First Escape closes the menu, not its modal",
  );
  assert.equal(await focused(), "Modal connection");
  await page.getByRole("button", { name: "Close modal" }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "Open modal", exact: true })
      .evaluate((element) => element === document.activeElement),
    true,
  );
  checks++;

  await page.getByText("Change their look", { exact: true }).click();
  await page.getByRole("button", { name: "Pebble shape" }).click();
  await page.getByRole("button", { name: "Leaf character" }).click();
  await page
    .getByRole("button", { name: "Save appearance", exact: true })
    .click();
  await page.getByRole("alert").waitFor();
  assert.deepEqual(patches[0], { mascot: "pebble", color: "#299575" });
  assert.equal(
    await page
      .getByRole("button", { name: "Pebble shape" })
      .getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Leaf character" })
      .getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(await page.getByLabel("Saved appearances").textContent(), "0");
  mode = "success";
  hold = true;
  patches.length = 0;
  await page
    .getByRole("button", { name: "Save appearance", exact: true })
    .evaluate((element: HTMLElement) => {
      element.click();
      element.click();
    });
  await page.getByRole("button", { name: "Saving…", exact: true }).waitFor();
  while (!release) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(patches.length, 1, "Rapid clicks must produce one PATCH");
  (release as () => void)();
  hold = false;
  await page.waitForFunction(
    () =>
      document.querySelector('output[aria-label="Saved appearances"]')
        ?.textContent === "1",
  );
  assert.equal(
    await page.getByLabel("Saved character").textContent(),
    "pebble:#299575",
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Save appearance", exact: true })
      .isDisabled(),
    true,
  );
  assert.equal(await page.getByRole("alert").count(), 0);
  checks++;

  await page.getByRole("button", { name: "Show browser access" }).click();
  const browserCard = page.getByRole("region", {
    name: "Browser access fixture",
  });
  await browserCard
    .getByText("Apps through the browser", { exact: true })
    .click();
  await browserCard.getByText("Browser off", { exact: true }).waitFor();
  assert.equal(browserReads, 1);
  browserPreference = "browser";
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await browserCard.getByText("Browser option", { exact: true }).waitFor();
  assert.equal(browserReads, 2, "Returning to the window refreshes access");
  assert.match(
    await browserCard.innerText(),
    /sign-ins have not been verified/i,
  );

  // The previous teammate's delayed reply must not overwrite the new card.
  browserPreference = "connector";
  holdBrowser = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await browserCard
    .getByText("Checking available paths…", { exact: true })
    .waitFor();
  while (!releaseBrowser)
    await new Promise((resolve) => setTimeout(resolve, 10));
  await browserCard
    .getByRole("button", { name: "Switch browser teammate" })
    .click();
  await browserCard.getByText("Reading turned off", { exact: true }).waitFor();
  (releaseBrowser as () => void)();
  await browserHeldFinished;
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
  assert.equal(
    await browserCard.getByText("Reading turned off", { exact: true }).count(),
    1,
  );
  assert.equal(
    await browserCard
      .getByText("Connection available", { exact: true })
      .count(),
    0,
  );
  assert.match(await browserCard.innerText(), /Browser B’s browser/);

  await browserCard
    .getByRole("button", { name: "Switch browser teammate" })
    .click();
  await browserCard
    .getByText("Connection available", { exact: true })
    .waitFor();
  const readsBeforePermission = browserReads;
  browserPreference = "browser";
  await browserCard
    .getByRole("button", { name: "Toggle browser permission" })
    .click();
  await browserCard.getByText("Browser option", { exact: true }).waitFor();
  assert.equal(
    browserReads,
    readsBeforePermission + 1,
    "Permission changes refresh even when the teammate stays the same",
  );
  checks++;
  assert.deepEqual(errors, []);
  console.log(
    `Studio polish: ${checks} browser groups passed; distinct vector mascots, monochrome surfaces, 320/390/1440 layouts, keyboard/modal menus, appearance persistence, request dedupe and fresh teammate-scoped browser access. Fixture requests only. Screenshots: ${output}`,
  );
} finally {
  await browser.close();
  await server.close();
}

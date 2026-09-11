// One-tap review contract: the result card offers a reviewer picker and the
// tap fires exactly one POST to the host endpoint. No owner host or model.
import assert from "node:assert/strict";
import path from "node:path";
import { createServer } from "vite";
import { chromium } from "playwright-core";
import type { Bot, Run } from "../shared/types";

const run = {
  id: "run-fixture",
  botId: "bot-nova",
  threadId: "thread-fixture",
  status: "completed",
  task: { tracked: true, verificationStatus: "passed", verificationSummary: "All good.", verificationChecks: [], steps: [] },
} as unknown as Run;
const teammates = [
  { id: "bot-nova", name: "Nova", role: "Author", retiredAt: null },
  { id: "bot-pixel", name: "Pixel", role: "Reviewer", retiredAt: null },
  { id: "bot-old", name: "Old", role: "Retired", retiredAt: "2026-01-01" },
] as Bot[];
const root = process.cwd(),
  entry = path.join(root, "delivery-review-fixture.tsx");
const server = await createServer({
  configFile: false,
  root,
  server: { host: "127.0.0.1", port: 0 },
  plugins: [
    {
      name: "delivery-review-test-fixture",
      resolveId(source) {
        if (source === "/delivery-review-fixture.tsx") return entry;
      },
      load(id) {
        if (id === entry)
          return `import React from 'react'; import {createRoot} from 'react-dom/client'; import {DeliveryReceipt} from '/src/studio/DeliveryReceipt.tsx'; import '/src/studio/studio.css'; import '/src/studio/conversation-shell.css'; import '/src/studio/design-tokens.css'; import '/src/studio/delivery-receipt.css'; const run=${JSON.stringify(run)}, teammates=${JSON.stringify(teammates)}; createRoot(document.getElementById('root')).render(<DeliveryReceipt run={run} teammates={teammates}/>);`;
      },
      configureServer(vite) {
        vite.middlewares.use((request, response, next) => {
          if (request.url !== "/") return next();
          response.setHeader("content-type", "text/html");
          response.end(
            '<!doctype html><html><body><div id="root"></div><script type="module" src="/delivery-review-fixture.tsx"></script></body></html>',
          );
        });
      },
    },
  ],
});
await server.listen();
const address = server.httpServer!.address();
assert(address && typeof address === "object");
const browser = await chromium.launch({
  executablePath:
    process.env.OPENBOT_CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
let mode: "success" | "conflict" = "conflict";
const posts: Array<{ url: string; body: unknown }> = [];
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    assert.equal(request.method(), "POST");
    assert.match(request.url(), /\/api\/runs\/run-fixture\/review$/);
    posts.push({ url: new URL(request.url()).pathname, body: request.postDataJSON() });
    if (mode === "conflict") {
      await route.fulfill({ status: 409, json: { error: "Pixel is already reviewing this result." } });
      return;
    }
    await route.fulfill({ json: { childRunId: "child-fixture", reviewerName: "Pixel" } });
  });
  await page.goto(`http://127.0.0.1:${address.port}/`);
  // The author themself and retired teammates are never offered.
  await page.getByRole("button", { name: "Have another teammate check this", exact: true }).click();
  const options = page.locator("option");
  assert.deepEqual(await options.allTextContents(), ["Choose a reviewer", "Pixel — Reviewer"]);
  await page.getByLabel("Teammate to review this result", { exact: true }).selectOption("bot-pixel");
  await page.getByRole("button", { name: "Ask for a review", exact: true }).click();
  // A refused tap surfaces the host reason instead of failing silently.
  await page.getByRole("alert").waitFor();
  assert.match(await page.getByRole("alert").textContent() || "", /already reviewing/);
  assert.equal(posts.length, 1);
  assert.deepEqual(posts[0]!.body, { reviewerBotId: "bot-pixel" });
  mode = "success";
  await page.getByRole("button", { name: "Ask for a review", exact: true }).click();
  await page.getByText("Pixel is reviewing this result — follow it in Activity.").waitFor();
  assert.equal(posts.length, 2);
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    false,
  );
  console.log("Delivery review: one-tap reviewer contracts passed; all requests were fixture-intercepted.");
} finally {
  await browser.close();
  await server.close();
}

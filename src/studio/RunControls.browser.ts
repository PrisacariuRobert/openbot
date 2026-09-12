// Focused browser contract test. No owner host, data, accounts or model calls.
// Run: npx tsx src/studio/RunControls.browser.ts
import assert from "node:assert/strict";
import path from "node:path";
import { createServer } from "vite";
import { chromium } from "playwright-core";
import { approvalPreview } from "../shared/approval-preview";
import type { Approval } from "../shared/types";

const approval: Approval = {
  id: "approval-fixture",
  runId: "run-fixture",
  botId: "bot-fixture",
  botName: "Robin",
  kind: "external",
  reason: "Review before sending",
  actionLabel: "Send the draft email",
  status: "pending",
  createdAt: "2026-09-06",
  decidedAt: null,
};
const run = {
  id: approval.runId,
  botId: approval.botId,
  threadId: "thread-fixture",
  status: "awaiting_approval",
  prompt: "Prepare an email.",
};
const action = {
  type: "gmail_send",
  botId: approval.botId,
  args: {
    to: "person@example.test",
    cc: "copy@example.test",
    subject: "Agenda",
    body: "The meeting starts at nine.",
  },
};
const root = process.cwd(),
  entry = path.join(root, "run-controls-fixture.tsx");
const server = await createServer({
  configFile: false,
  root,
  server: { host: "127.0.0.1", port: 0 },
  plugins: [
    {
      name: "run-controls-test-fixture",
      resolveId(source) {
        if (source === "/run-controls-fixture.tsx") return entry;
      },
      load(id) {
        if (id === entry)
          return `import React,{useState} from 'react'; import {createRoot} from 'react-dom/client'; import {RunControls} from '/src/studio/RunControls.tsx'; import '/src/studio/studio.css'; import '/src/studio/conversation-shell.css'; import '/src/studio/design-tokens.css'; function Fixture(){ const [n,setN]=useState(0),[other,setOther]=useState(false); const run=${JSON.stringify(run)}, approval=${JSON.stringify(approval)}; if(other){run.id='other-run'; approval.id='other-approval'; approval.runId=run.id;} return <><button onClick={()=>setOther(true)}>Switch task</button><output aria-label="Refresh count">{n}</output><RunControls run={run} approval={approval} onChange={()=>setN(v=>v+1)}/></> }; createRoot(document.getElementById('root')).render(<Fixture/>);`;
      },
      configureServer(vite) {
        vite.middlewares.use((request, response, next) => {
          if (request.url !== "/") return next();
          response.setHeader("content-type", "text/html");
          response.end(
            '<!doctype html><html><body><div id="root"></div><script type="module" src="/run-controls-fixture.tsx"></script></body></html>',
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
let checks = 0;
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  let mode:
    | "success"
    | "unsupported"
    | "missing-binding"
    | "stale"
    | "conflict"
    | "failure"
    | "sign-in"
    | "malformed" = "success";
  let posts: Array<{ url: string; body: unknown }> = [];
  let release: (() => void) | null = null;
  let hold = false;
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    if (request.method() === "GET" && request.url().endsWith("/preview")) {
      const other = request.url().includes("/other-approval/");
      const currentRun = other ? { ...run, id: "other-run" } : run;
      const currentApproval = other
        ? { ...approval, id: "other-approval", runId: currentRun.id }
        : approval;
      if (mode === "sign-in") { currentApproval.kind = "browser"; currentApproval.actionLabel = "Sign in to support.example.test"; }
      const result = approvalPreview(
        currentApproval,
        currentRun,
        mode === "unsupported"
          ? {
              type: "bash",
              botId: approval.botId,
              args: { command: "unsafe fixture" },
            }
          : mode === "sign-in" ? { type: "browser_sign_in", botId: approval.botId, args: { siteOrigin: "https://support.example.test" } } : action,
        "fixture@example.test",
      );
      result.reviewFingerprint = result.canApprove ? "a".repeat(64) : null;
      if (mode === "missing-binding") result.reviewFingerprint = null;
      if (mode === "stale") {
        result.status = "approved";
        result.canApprove = true;
      }
      await route.fulfill({ json: result });
      return;
    }
    if (request.method() === "POST") {
      posts.push({
        url: new URL(request.url()).pathname,
        body: request.postDataJSON(),
      });
      if (hold)
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      if (request.url().endsWith("/sign-in")) {
        await route.fulfill({ json: { siteOrigin: "https://accounts.example.test", screenshot: null } });
        return;
      }
      const accepted = request.url().endsWith("/cancel")
        ? { ok: true }
        : { ...approval, status: request.postDataJSON().decision };
      await route.fulfill({
        status: mode === "failure" ? 500 : mode === "conflict" ? 409 : 200,
        json:
          mode === "malformed"
            ? { ok: true }
            : ["success", "unsupported", "missing-binding", "sign-in"].includes(mode)
              ? accepted
              : { error: "Fixture outcome" },
      });
      return;
    }
    // The sign-in panel opens a live-browser EventSource; this fixture covers
    // approval controls, not live view, so hold the stream open with no events.
    if (request.method() === "GET" && /\/api\/bots\/[^/]+\/computer\/live/.test(request.url())) {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: ": run-controls fixture has no live browser\n\n",
      });
      return;
    }
    throw new Error(`Unexpected request: ${request.method()} ${request.url()}`);
  });
  const open = async () => {
    posts = [];
    await page.goto(`http://127.0.0.1:${address.port}/`);
    await page.getByText(mode === "sign-in" ? "Sign in to support.example.test" : "Send the draft email", { exact: true }).waitFor();
  };
  await open();
  const approve = page.getByRole("button", {
    name: "Approve action",
    exact: true,
  });
  assert.equal(await approve.isDisabled(), true);
  await page.getByText("Review the full action", { exact: true }).click();
  await page.getByText("copy@example.test", { exact: true }).waitFor();
  await page.waitForFunction(() =>
    [...document.querySelectorAll("button")].some(
      (button) => button.textContent === "Approve action" && !button.disabled,
    ),
  );
  assert.equal(await approve.isEnabled(), true);
  hold = true;
  await approve.evaluate((element: HTMLElement) => {
    element.click();
    element.click();
  });
  await page.getByText("Updating…", { exact: true }).waitFor();
  assert.equal(posts.length, 1);
  assert.deepEqual(posts[0]!.body, {
    decision: "approved",
    reviewFingerprint: "a".repeat(64),
    navigationAllowance: false,
  });
  assert.match(posts[0]!.url, /\/approvals\/approval-fixture\/decide$/);
  while (!release) await new Promise((resolve) => setTimeout(resolve, 10));
  (release as () => void)();
  hold = false;
  await page
    .getByText("Your decision was recorded. Checking what happened next…", {
      exact: true,
    })
    .waitFor();
  assert.equal(await page.getByLabel("Refresh count").textContent(), "1");
  checks += 1;

  mode = "unsupported";
  await open();
  assert.equal(await approve.count(), 0);
  await page.getByText(/does not have a complete in-app review/).waitFor();
  assert.equal(await page.getByRole("link", { name: "Open full review" }).count(), 0);
  await page.getByRole("button", { name: "Decline", exact: true }).click();
  await page
    .getByText("Your decision was recorded. Checking what happened next…", {
      exact: true,
    })
    .waitFor();
  assert.deepEqual(posts[0]!.body, { decision: "denied" });
  checks += 1;

  mode = "missing-binding";
  await open();
  assert.equal(await approve.count(), 0);
  await page.getByText(/This review is incomplete or out of date/).waitFor();
  await page.getByRole("button", { name: "Decline", exact: true }).click();
  await page.getByText("Your decision was recorded. Checking what happened next…", { exact: true }).waitFor();
  assert.deepEqual(posts[0]!.body, { decision: "denied" });
  checks += 1;

  mode = "stale";
  await open();
  assert.equal(await approve.count(), 0);
  assert.equal(
    await page
      .getByRole("button", { name: "Decline", exact: true })
      .isDisabled(),
    true,
  );
  assert.equal(posts.length, 0);
  checks += 1;

  mode = "conflict";
  await open();
  await page.getByText("Review the full action", { exact: true }).click();
  await approve.click();
  await page
    .getByText("This task has changed. Checking its latest status…", {
      exact: true,
    })
    .waitFor();
  assert.equal(await page.getByLabel("Refresh count").textContent(), "1");
  assert.equal(await page.getByText(/Your decision was recorded/).count(), 0);
  checks += 1;

  mode = "failure";
  await open();
  await page.getByText("Review the full action", { exact: true }).click();
  await approve.click();
  await page.getByRole("alert").waitFor();
  assert.equal(await approve.isDisabled(), true);
  assert.equal(posts.length, 1);
  assert.equal(await page.getByText(/Your decision was recorded/).count(), 0);
  checks += 1;

  mode = "malformed";
  await open();
  await page.getByText("Review the full action", { exact: true }).click();
  await approve.click();
  await page.getByRole("alert").waitFor();
  assert.equal(await approve.isDisabled(), true);
  assert.equal(await page.getByText(/Your decision was recorded/).count(), 0);
  checks += 1;

  mode = "success";
  await open();
  await page
    .getByRole("button", { name: "Stop this task", exact: true })
    .click();
  await page
    .getByText("Stop requested. Completed actions are not undone.", {
      exact: true,
    })
    .waitFor();
  assert.match(posts[0]!.url, /\/runs\/run-fixture\/cancel$/);
  checks += 1;

  await open();
  hold = true;
  release = null;
  await page.getByText("Review the full action", { exact: true }).click();
  await approve.click();
  await page.getByText("Updating…", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Switch task", exact: true }).click();
  await page
    .getByText("Loading action details…", { exact: true })
    .waitFor({ state: "hidden" });
  while (!release) await new Promise((resolve) => setTimeout(resolve, 10));
  (release as () => void)();
  hold = false;
  await page.waitForResponse(
    (response) => response.request().method() === "POST",
  );
  // Let the settled promise deliver its continuation into the React component.
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  assert.equal(await page.getByLabel("Refresh count").textContent(), "0");
  assert.equal(await page.getByText(/Your decision was recorded/).count(), 0);
  checks += 1;
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
    false,
  );
  mode = "sign-in";
  await open();
  const resume = page.getByRole("button", { name: "Continue task", exact: true });
  assert.equal(await resume.isDisabled(), true);
  await page.getByText("Needs your sign-in", { exact: true }).waitFor();
  // The private pane shows the exact origin with a live screen, never a transcript.
  const pane = page.getByRole("region", { name: "Private website sign-in", exact: true });
  await pane.getByText("https://accounts.example.test", { exact: true }).waitFor();
  await page.getByText("Review the full action", { exact: true }).click();
  assert.equal(await resume.isDisabled(), true, "Opening details does not confirm sign-in");
  // Type a secret straight into the page: it must travel as site input ops and
  // never appear in the page DOM, the chat transcript, or a premature decision.
  const secret = `fixture-secret-${Date.now().toString(36)}`;
  const screen = page.getByRole("application", { name: /Live website screen/ });
  await screen.click();
  await page.keyboard.type(secret, { delay: 10 });
  const pressDeadline = Date.now() + 15_000;
  for (;;) {
    const presses = posts.filter(
      (post) => post.url.endsWith("/sign-in") && (post.body as { operation?: string })?.operation === "press",
    ).length;
    if (presses >= secret.length) break;
    if (Date.now() > pressDeadline) throw new Error(`Only ${presses}/${secret.length} press ops reached the site op`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal((await page.locator("body").innerText()).includes(secret), false, "typed secret never lands in the DOM");
  assert.equal(posts.filter((post) => post.url.endsWith("/decide")).length, 0, "typing never decides");
  const confirmation = page.getByRole("checkbox");
  await confirmation.check();
  assert.equal(await resume.isEnabled(), true);
  // Further private-browser interaction resets the confirmation.
  await screen.click();
  await page.keyboard.press("Tab");
  await page.waitForFunction(() =>
    [...document.querySelectorAll("button")].some(
      (button) => button.textContent === "Continue task" && button.disabled,
    ),
  );
  assert.equal(await resume.isDisabled(), true, "Further browser interaction resets confirmation");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.getByRole("region", { name: "Task controls", exact: true }).screenshot({ path: "/tmp/openbot-sign-in-ui.png" });
  await confirmation.check();
  await resume.click();
  await page.getByText(/Your decision was recorded/).waitFor();
  assert.equal(posts.filter((post) => post.url.endsWith("/decide")).length, 1);
  checks += 1;
  console.log(
    `Run controls: ${checks} browser contracts passed; all requests were fixture-intercepted.`,
  );
} finally {
  await browser.close();
  await server.close();
}

// Both actual complete-app entry points, with invented data and intercepted
// API requests. No model runner, owner host, account or external action.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "vite";
import { chromium } from "playwright-core";
import { OpenBotDatabase } from "../server/testing/database";
import { approvalPreview } from "../shared/approval-preview";

const data = mkdtempSync(path.join(tmpdir(), "openbot-app-review-"));
const db = new OpenBotDatabase(data, { dataDir: path.join(data, "data") });
for (const bot of db.listBots()) db.updateBot(bot.id, { providerInstanceId: db.listProviders()[0]!.id, model: "fixture/never-called" });
const initialRun = db.createRun({ threadId: "team-room", botId: "pixel", prompt: "Prepare an email, without sending it yet.", status: "running" });
const action = { type: "gmail_send", botId: "pixel", args: { to: "recipient@example.test", cc: "copy@example.test", subject: "Planning tomorrow", body: "Please review the agenda before our meeting." } };
const approval = db.createApproval({ runId: initialRun.id, botId: "pixel", kind: "external", reason: "Please review this draft before sending.", actionLabel: "Send an email", action });
const run = db.getRun(initialRun.id)!;
const state = db.getState("team-room");
db.close();
const server = await createServer({ configFile: false, root: process.cwd(), server: { host: "127.0.0.1", port: 0, hmr: false } });
await server.listen();
const address = server.httpServer!.address();
assert(address && typeof address === "object");
const base = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ executablePath: process.env.OPENBOT_CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const output = "/tmp/openbot-app-review-qa";
mkdirSync(output, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(7000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let mode = "success", hold = false, posts: string[] = [], recorded = false, allowRecovery = false;
  let release: (() => void) | undefined;
  await page.route("**/api/**", async (route) => {
    const request = route.request(), pathname = new URL(request.url()).pathname;
    if (request.method() === "GET" && pathname === "/api/state") {
      const result = structuredClone(state);
      if (recorded && allowRecovery) { result.approvals = []; for (const item of [...result.runs, ...result.studioRuns]) item.status = "queued"; }
      return route.fulfill({ json: result });
    }
    if (request.method() === "GET" && pathname.endsWith("/preview")) {
      const result = approvalPreview(approval, run, mode === "unsupported" ? { type: "unknown", botId: "pixel" } : mode === "masked" ? { ...action, args: { ...action.args, body: "api_key=syntheticcredential" } } : action, "owner@example.test");
      result.reviewFingerprint = result.canApprove ? "b".repeat(64) : null;
      if (mode === "missing-binding") result.reviewFingerprint = null;
      if (mode === "incomplete") { result.canApprove = true; result.fields = []; }
      if (mode === "stale") result.approvalId = "different-approval";
      if (recorded || mode === "already-decided") result.status = "approved";
      return route.fulfill({ json: result });
    }
    if (request.method() === "POST") {
      posts.push(pathname);
      assert.equal(pathname, `/api/approvals/${approval.id}/decide`, "No direct run approval, execution or unrelated mutation");
      if (request.postDataJSON().decision === "approved") assert.equal(request.postDataJSON().reviewFingerprint, "b".repeat(64));
      else assert.equal(request.postDataJSON().reviewFingerprint, undefined);
      if (hold) await new Promise<void>((resolve) => { release = resolve; });
      if (mode === "conflict") return route.fulfill({ status: 409, json: { error: "Already changed" } });
      if (mode === "uncertain") { recorded = true; return route.abort("failed"); }
      if (mode === "malformed-result") return route.fulfill({ json: { ...approval, id: "wrong-id", status: "approved" } });
      return route.fulfill({ json: { ...approval, status: request.postDataJSON().decision } });
    }
    if (pathname === "/api/events") return route.fulfill({ contentType: "text/event-stream", body: ": isolated fixture\n\n" });
    // Provider discovery, computer snapshots and integrations cannot reach a
    // real account. These secondary panels handle unavailable fixture data.
    return route.fulfill({ status: 503, json: { error: "Not available in this isolated review fixture" } });
  });
  let checks = 0;
  // The Refresh button unmounts the moment its fetch resolves: on a slow
  // host the tap can land mid-rerender (covered at hit-test, then detached
  // before dispatch is confirmed). Retry with a fresh handle; a missing
  // button means the tap already landed and state moved on.
  const clickRefresh = async (controls: ReturnType<typeof page.getByRole>) => {
    const refresh = () => controls.getByRole("button", { name: "Refresh status", exact: true });
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await refresh().click({ timeout: 7000 });
        return;
      } catch {
        if ((await refresh().count()) === 0) return;
      }
    }
    await refresh().click({ timeout: 7000 });
  };
  for (const entry of ["/", "/studio.html", "/?panel=live"]) {
    const open = async (next: string) => {
      mode = next; hold = false; posts = []; recorded = false; allowRecovery = false; release = undefined;
      await page.goto(base + entry);
      if (entry.includes("panel=live")) await page.getByRole("button", { name: "Review request", exact: true }).last().click();
      const controls = page.getByRole("region", {name: "Task controls", exact: true}).last();
      await controls.getByText(next === "stale" ? /The action changed/ : "Send an email", {exact: next !== "stale"}).waitFor();
      assert.equal(await page.locator(".app-shell, .sheet, .mascot").count(), 0);
      return controls;
    };
    let controls = await open("success");
    const approve = controls.getByRole("button", {name:"Approve action", exact:true});
    assert.ok(await approve.isDisabled());
    await controls.getByText("Review the full action", {exact:true}).click();
    await controls.getByText(action.args.body, {exact:true}).waitFor();
    await controls.getByText("recipient@example.test", {exact:true}).waitFor();
    assert.ok(await approve.isEnabled());
    assert.equal(posts.length, 0);
    assert.ok(await controls.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    assert.match(await controls.evaluate(el => getComputedStyle(el).fontFamily), /apple-system|Segoe|sans-serif/);
    hold = true;
    await approve.evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
    await controls.getByText("Updating…", {exact:true}).waitFor();
    assert.equal(posts.length, 1);
    release!();
    await controls.getByText("Your decision was recorded. Checking what happened next…", {exact:true}).waitFor();
    assert.ok(await approve.isDisabled());
    checks++;

    for (const blocked of ["unsupported", "masked", "incomplete", "missing-binding"]) {
      controls = await open(blocked);
      assert.equal(await controls.getByRole("button", {name:"Approve action", exact:true}).count(), 0);
      await controls.getByRole("button", {name:"Decline",exact:true}).click();
      await controls.getByText(/Your decision was recorded/).waitFor();
      assert.equal(posts.length, 1);
      checks++;
    }
    for (const blocked of ["stale", "already-decided"]) {
      controls = await open(blocked);
      assert.equal(await controls.getByRole("button", {name:"Approve action",exact:true}).count(), 0);
      assert.ok(await controls.getByRole("button",{name:"Decline",exact:true}).isDisabled());
      assert.equal(posts.length, 0);
      checks++;
    }
    for (const interrupted of ["conflict", "uncertain", "malformed-result"]) {
      controls = await open(interrupted);
      await controls.getByText("Review the full action", {exact:true}).click();
      await controls.getByRole("button",{name:"Approve action",exact:true}).click();
      if (interrupted === "conflict") await controls.getByText("This task has changed. Checking its latest status…", {exact:true}).waitFor();
      else await controls.getByRole("alert").waitFor();
      assert.equal(posts.length, 1);
      assert.ok(await controls.getByRole("button",{name:"Approve action",exact:true}).isDisabled());
      assert.ok(await controls.getByRole("button",{name:"Decline",exact:true}).isDisabled());
      if (interrupted === "uncertain") {
        allowRecovery = true;
        await clickRefresh(controls);
        await controls.getByRole("button", {name:"Approve action",exact:true}).waitFor({state:"hidden"});
      } else {
        await clickRefresh(controls);
        await controls.getByText("Send an email", {exact:true}).waitFor();
        // A fresh preview must not preserve an acknowledgement from the old action.
        assert.ok(await controls.getByRole("button",{name:"Approve action",exact:true}).isDisabled());
      }
      assert.equal(posts.length,1);
      checks++;
    }
  }
  assert.deepEqual(errors, []);
  console.log(`PASS: ${checks} full-app approval checks at /, /studio.html and Activity; real styles, phone containment, complete review, duplicate protection, stale binding and uncertain-response recovery. No model, owner account or external action.`);
} finally {
  await browser.close();
  await server.close();
  rmSync(data, { recursive: true, force: true });
}

// Local-browser integration fixtures for the computer-use candidate.
// Real headless Chrome (system install) + disposable data dir + local HTTP
// fixture server. No model, no paid allowance, no live accounts, no network
// beyond 127.0.0.1. Every case asserts its effect oracle AND its no-effect
// counterpart (zero input on stale/denied targets, no duplicate submits).
// The harness drives only opaque host-issued IDs into the action methods;
// registry reads below are the independent oracle, not action input.
// This proves host/executor/journal/transform mechanics, not autonomous
// model performance.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { OpenBotDatabase } from "../src/server/testing/database.js";
import { BrowserManager } from "../src/server/runtime.js";
import { BrowserNavigationGrants } from "../src/server/browser-navigation-grants.js";
import { clearLeasesForTests } from "../src/server/action-journal.js";
import { getObservation } from "../src/server/observation-registry.js";
import { redactSecretsForProvider } from "../src/server/observation-envelope.js";

const root = mkdtempSync(path.join(tmpdir(), "openbot-cu-integration-"));
let db = new OpenBotDatabase(root, { dataDir: path.join(root, "data") });
let browser = new BrowserManager(db, { headlessTeaching: true });
const grants = new BrowserNavigationGrants();

type ClickEvent = { kind: "click"; id: string | null; x: number; y: number };
type CanvasEvent = { kind: "canvas"; x: number; y: number };
type ScrollEvent = { kind: "scroll"; id: string; top: number };
type FieldEvent = { kind: "field-input"; id: string; top: number };
type FixtureEvent = ClickEvent | CanvasEvent | ScrollEvent | FieldEvent;
const events: FixtureEvent[] = [];
let submits: string[] = [];
const clicks = () => events.filter((event) => event.kind === "click") as ClickEvent[];
const canvasHits = () => events.filter((event) => event.kind === "canvas") as CanvasEvent[];
const scrollTops = (id: string) => (events.filter((event) => event.kind === "scroll" && event.id === id) as ScrollEvent[]).map((event) => event.top);

const FORM = `<!doctype html><title>Fixture form</title><main>
<h1>Fixture form</h1>
<form action="/submit" method="post">
<input type="text" name="field" aria-label="Task name" value="">
<input type="password" name="pw" aria-label="Password" value="s3cret-initial">
<input type="text" name="otp" aria-label="One-time code" autocomplete="one-time-code" value="482910">
<button type="submit" id="go">Submit form</button>
<button type="button" id="decoy" aria-label="Submit">Submit</button>
<button type="button" id="dup-a">Duplicate</button>
<button type="button" id="dup-b">Duplicate</button>
<button type="button" id="late-save" disabled>Late save</button>
</form>
<input type="file" id="upload" aria-label="Attach file">
<canvas id="pad" style="position:fixed;left:100px;top:100px;width:400px;height:200px;" width="400" height="200"></canvas>
<div style="display:flex;gap:16px;margin-top:8px;">
<div id="intended" aria-label="Results pane" style="height:200px;overflow-y:auto;border:1px solid #999;"><div style="height:1200px;">intended lane</div></div>
<div id="decoy-pane" aria-label="Archive pane" style="height:200px;overflow-y:auto;border:1px solid #999;"><div style="height:1200px;">decoy lane</div></div>
</div>
<iframe id="sub" src="/sub" style="width:300px;height:150px;border:1px solid #999;"></iframe>
<script>
const send = (payload) => { try { navigator.sendBeacon("/events", JSON.stringify(payload)); } catch {} };
document.addEventListener("click", (event) => {
  const target = event.target;
  send({ kind: "click", id: target && target.id ? target.id : null, x: event.clientX, y: event.clientY });
});
const canvas = document.getElementById("pad");
if (canvas) {
  const context = canvas.getContext("2d");
  if (context) { context.fillStyle = "#123456"; context.fillRect(0, 0, 400, 200); }
  canvas.addEventListener("click", (event) => {
    const rect = canvas.getBoundingClientRect();
    send({ kind: "canvas", x: event.clientX - rect.left, y: event.clientY - rect.top });
  });
}
for (const id of ["intended", "decoy-pane"]) {
  const pane = document.getElementById(id);
  if (pane) pane.addEventListener("scroll", () => send({ kind: "scroll", id, top: pane.scrollTop }), { passive: true });
}
const taskName = document.querySelector('input[aria-label="Task name"]');
if (taskName) taskName.addEventListener("input", () => send({ kind: "field-input", id: "task-name", top: 0 }));
const late = document.getElementById("late-save");
if (late) setTimeout(() => { late.removeAttribute("disabled"); }, 3000);
</script>
</main>`;

const SUB = `<!doctype html><title>Sub frame</title><main>
<div style="height:900px;">frame lane</div>
<script>
const send = (payload) => { try { navigator.sendBeacon("/events", JSON.stringify(payload)); } catch {} };
document.addEventListener("scroll", () => send({ kind: "scroll", id: "sub-doc", top: document.documentElement.scrollTop }), { passive: true });
</script>
</main>`;

const LOGIN = `<!doctype html><title>Sign in</title><main><h1>Sign in to continue</h1>
<input type="password" name="pw" aria-label="Password" value=""><button id="login-go">Continue</button>
</main>`;

const server = createServer((req, res) => {
  const url = new URL(req.url || "/", "http://fixture");
  res.setHeader("Cache-Control", "no-store");
  if (url.pathname === "/submit" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      submits.push(body);
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(`<!doctype html><title>Done</title><main><h1>Received</h1></main>`);
    });
    return;
  }
  if (url.pathname === "/events" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      try {
        events.push(JSON.parse(body) as FixtureEvent);
      } catch {
        // Malformed beacons never fail the fixture server.
      }
      res.statusCode = 204;
      res.end();
    });
    return;
  }
  if (url.pathname === "/counts" && req.method === "GET") {
    // Independent permitted readback: authoritative server-side counters.
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ submits: submits.length, clicks: clicks().length, canvas: canvasHits().length }));
    return;
  }
  res.setHeader("content-type", "text/html; charset=utf-8");
  if (url.pathname === "/sub") res.end(SUB);
  else if (url.pathname === "/login") res.end(LOGIN);
  else if (url.pathname === "/relabeled") {
    res.end(`<!doctype html><title>Changed</title><main><form action="/submit" method="post"><input name="field" value=""><button type="submit" id="go">Send it now</button></form></main>`);
  } else res.end(FORM);
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const results: Array<{ id: string; pass: boolean; detail: string }> = [];
const record = (id: string, pass: boolean, detail: string) => {
  results.push({ id, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${id}: ${detail}`);
};
const SESSION = "sess-fixture-1";
const FIELD_INPUT_BEACON = "field-input";
const fieldInputs = () => events.filter((event) => event.kind === FIELD_INPUT_BEACON);

try {
  clearLeasesForTests();
  const run = db.createRun({ threadId: "team-room", botId: "nova", prompt: "fixture task", status: "running" });
  browser.registerVisualAdapter("fixture-visual", "visual-supported");

  // F1 — real semantic action through opaque IDs with a server-side oracle.
  await browser.open("nova", `${base}/form`);
  const observed = await browser.observeScoped("nova", run.id, { surface: "browser-dom", sessionId: SESSION });
  const registry = getObservation(observed.observationId)!;
  assert.ok(registry, "observation stored by the host");
  const go = registry.targets.find((target) => target.label === "Submit form" && target.selector === "#go");
  assert.ok(go, "host observed the submit control");
  const submitsBefore = submits.length;
  const clicksBefore = clicks().length;
  await browser.semanticAct("nova", run.id, { targetId: go.targetId, sessionId: SESSION, kind: "click" });
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal(submits.length, submitsBefore + 1, "exactly one submit reached the server");
  assert.ok(submits[submits.length - 1]!.includes("field="), "server received the form body");
  const goClicks = clicks().slice(clicksBefore).filter((event) => event.id === "go");
  assert.equal(goClicks.length, 1, "one real click landed on #go");
  assert.ok(!clicks().slice(clicksBefore).some((event) => event.id === "decoy"), "decoy never clicked");
  record("F1-real-action", true, "semanticAct via opaque ID submitted once; server oracle + click beacon agree");

  // F2 — relabeled control: STALE refusal with zero new submits.
  await browser.open("nova", `${base}/form`);
  const relabeled = await browser.observeScoped("nova", run.id, { surface: "browser-dom", sessionId: SESSION });
  const relabeledGo = getObservation(relabeled.observationId)!.targets.find((target) => target.selector === "#go")!;
  await browser.open("nova", `${base}/relabeled`);
  const submitsBeforeRelabel = submits.length;
  let staleError: unknown = null;
  try {
    await browser.semanticAct("nova", run.id, { targetId: relabeledGo.targetId, sessionId: SESSION, kind: "click" });
  } catch (error) {
    staleError = error;
  }
  assert.ok(staleError instanceof Error && /STALE_OBSERVATION|TARGET_DESTROYED|AMBIGUOUS_TARGET/.test(staleError.message), "relabel refused");
  assert.equal(submits.length, submitsBeforeRelabel, "zero submits on stale target");
  record("F2-stale-target", true, `relabel refused (${(staleError as Error).message.slice(0, 60)}…), no input dispatched`);

  // F3 — two same-label controls: AMBIGUOUS refusal with zero submits.
  // The fixture carries a deliberate duplicate pair (#dup-a, #dup-b).
  await browser.open("nova", `${base}/form`);
  const ambiguous = await browser.observeScoped("nova", run.id, { surface: "browser-dom", sessionId: SESSION });
  const ambiguousDup = getObservation(ambiguous.observationId)!.targets.find((target) => target.selector === "#dup-a")!;
  const submitsBeforeAmbiguous = submits.length;
  const clicksBeforeAmbiguous = clicks().length;
  let ambiguousError: unknown = null;
  try {
    await browser.semanticAct("nova", run.id, { targetId: ambiguousDup.targetId, sessionId: SESSION, kind: "click" });
  } catch (error) {
    ambiguousError = error;
  }
  assert.ok(ambiguousError instanceof Error && /AMBIGUOUS_TARGET/.test(ambiguousError.message), "duplicate labels refused");
  assert.equal(submits.length, submitsBeforeAmbiguous, "zero submits on ambiguous target");
  assert.equal(clicks().length, clicksBeforeAmbiguous, "zero clicks dispatched for ambiguous controls");
  record("F3-ambiguous", true, "duplicate Duplicate controls → AMBIGUOUS_TARGET through semanticAct, no dispatch");

  // F4 — canvas click at the fixed-geometry center with a real local oracle.
  // The canvas is position:fixed at (100,100)–(500,300); center CSS (300,200)
  // maps 1:1 to image px at deviceScale 1. The page reports canvas-local
  // coordinates, expected (200,100).
  await browser.open("nova", `${base}/form`);
  const visual = await browser.observeScoped("nova", run.id, { surface: "browser-visual", sessionId: SESSION });
  const canvasBefore = canvasHits().length;
  const click = await browser.visualAct("nova", run.id, {
    observationId: visual.observationId, sessionId: SESSION, adapterId: "fixture-visual", action: "click", point: { x: 300, y: 200 },
  });
  assert.ok(Math.abs(click.cssX - 300) < 1 && Math.abs(click.cssY - 200) < 1, `host mapped to CSS (${click.cssX},${click.cssY})`);
  await new Promise((resolve) => setTimeout(resolve, 400));
  const hits = canvasHits().slice(canvasBefore);
  assert.equal(hits.length, 1, "exactly one canvas hit beaconed");
  assert.ok(Math.abs(hits[0]!.x - 200) <= 3 && Math.abs(hits[0]!.y - 100) <= 3, `canvas-local (${hits[0]!.x},${hits[0]!.y}) ≈ (200,100)`);
  // Unknown adapter: VISION_UNAVAILABLE, zero input.
  const clicksBeforeVision = clicks().length;
  let visionError: unknown = null;
  try {
    await browser.visualAct("nova", run.id, {
      observationId: visual.observationId, sessionId: SESSION, adapterId: "unregistered-adapter", action: "click", point: { x: 300, y: 200 },
    });
  } catch (error) {
    visionError = error;
  }
  assert.ok(visionError instanceof Error && /VISION_UNAVAILABLE/.test(visionError.message));
  // Stale observation ID: refusal with zero input.
  let staleVisualError: unknown = null;
  try {
    await browser.visualAct("nova", run.id, {
      observationId: "obs_no_such_observation", sessionId: SESSION, adapterId: "fixture-visual", action: "click", point: { x: 300, y: 200 },
    });
  } catch (error) {
    staleVisualError = error;
  }
  assert.ok(staleVisualError instanceof Error && /STALE_OBSERVATION/.test(staleVisualError.message));
  assert.equal(clicks().length, clicksBeforeVision, "zero clicks dispatched for refused visual actions");
  record("F4-canvas-geometry", true, "canvas-local (200,100) ±3px; unknown adapter + stale ID refused with zero input");

  // F4b — live tab/page mismatch rejects with zero input: act once more
  // while nothing changed (must pass with a fresh action identity), then
  // navigate away and prove the same observation refuses with zero input.
  {
    const stillFresh = await browser.visualAct("nova", run.id, {
      observationId: visual.observationId, sessionId: SESSION, adapterId: "fixture-visual", action: "click", point: { x: 310, y: 210 },
    });
    assert.ok(Math.abs(stillFresh.cssX - 310) < 1 && Math.abs(stillFresh.cssY - 210) < 1, "unchanged tab/page still acts");
    await browser.open("nova", `${base}/relabeled`);
    const clicksBeforeNav = clicks().length;
    let navError: unknown = null;
    try {
      await browser.visualAct("nova", run.id, {
        observationId: visual.observationId, sessionId: SESSION, adapterId: "fixture-visual", action: "click", point: { x: 320, y: 220 },
      });
    } catch (error) {
      navError = error;
    }
    assert.ok(navError instanceof Error && /STALE_OBSERVATION/.test(navError.message), "navigation after observation refuses");
    assert.equal(clicks().length, clicksBeforeNav, "zero clicks dispatched after navigation");
    record("F4b-tab-binding", true, "same page acts; post-navigation observation refuses with zero input");
  }

  // F5 — reviewed upload + origin binding; password and plain-text OTP masked.
  await browser.open("nova", `${base}/form`);
  const fileTarget = await browser.describeFileInput("nova", "#upload");
  const tmpFile = path.join(root, "grant.txt");
  writeFileSync(tmpFile, "granted-bytes");
  const { readFileSync } = await import("node:fs");
  const buffer = readFileSync(tmpFile);
  const uploaded = await browser.uploadFile("nova", "#upload", { name: "grant.txt", mimeType: "text/plain", buffer }, fileTarget.fingerprint, new URL(base).origin);
  assert.match(uploaded.url, /\/form/);
  let wrongOriginRejected = false;
  try {
    await browser.uploadFile("nova", "#upload", { name: "grant.txt", mimeType: "text/plain", buffer }, fileTarget.fingerprint, "https://evil.test");
  } catch {
    wrongOriginRejected = true;
  }
  assert.equal(wrongOriginRejected, true, "changed origin after review refuses");
  const snap = await browser.snapshot("nova");
  assert.ok(!snap.text.includes("s3cret-initial"), "password value never in snapshot");
  assert.ok(!snap.text.includes("482910"), "plain-text OTP value never in snapshot");
  assert.ok(snap.text.includes("[Private field hidden]"), "credential fields redacted");
  const leaked = redactSecretsForProvider("upload failed with token abcdef1234567890");
  assert.ok(leaked.found && !leaked.redacted.includes("abcdef1234567890"));
  record("F5-upload-secrets", true, "reviewed upload selected; origin change refused; password + text-box OTP masked");

  // F5b — secure entry is explicit handoff state: a real sign-in handoff
  // minimizes capture and refuses model input, including observations
  // captured before the handoff started. A separate run keeps later cases
  // on the unaffected first task.
  const secureRun = db.createRun({ threadId: "team-room", botId: "nova", prompt: "secure task", status: "running" });
  await browser.open("nova", `${base}/form`);
  const preHandoff = await browser.observeScoped("nova", secureRun.id, { surface: "browser-dom", sessionId: SESSION });
  const preHandoffGo = getObservation(preHandoff.observationId)!.targets.find((target) => target.selector === "#go")!;
  const { BrowserSignIns } = await import("../src/server/browser-sign-in.js");
  const handoff = new BrowserSignIns(db).request("nova", secureRun.id, `${base}/login`, {
    source: "host",
    observedUrl: `${base}/login`,
    observedText: "Sign in",
  });
  assert.ok(handoff.id, "real sign-in handoff requested");
  const walled = await browser.observeScoped("nova", secureRun.id, { surface: "browser-dom", sessionId: SESSION });
  assert.equal(walled.reason, "SECURE_MODE", "handoff pauses model-visible capture");
  assert.deepEqual(walled.targetIds, [], "no targets issued during handoff");
  assert.equal(walled.textPreview, "", "no model-visible text during handoff");
  let secureError: unknown = null;
  try {
    await browser.visualAct("nova", secureRun.id, {
      observationId: walled.observationId, sessionId: SESSION, adapterId: "fixture-visual", action: "click", point: { x: 100, y: 100 },
    });
  } catch (error) {
    secureError = error;
  }
  assert.ok(secureError instanceof Error && /SECURE_MODE/.test(secureError.message), "visual input refused in secure mode");
  let preHandoffError: unknown = null;
  try {
    await browser.semanticAct("nova", secureRun.id, { targetId: preHandoffGo.targetId, sessionId: SESSION, kind: "click" });
  } catch (error) {
    preHandoffError = error;
  }
  assert.ok(preHandoffError instanceof Error && /SECURE_MODE/.test(preHandoffError.message), "pre-handoff observations die when handoff starts");
  // The owner completes the handoff out-of-band; later cases run on a clear state.
  db.decideApproval(handoff.id, "approved");
  record("F5b-secure-mode", true, "real handoff → minimized capture; pre/post-handoff acts refuse SECURE_MODE");

  // F6 — revocation via the same calls the Stop/takeover routes make, plus
  // the real owner takeover input path. Pre-revocation observations die.
  await browser.open("nova", `${base}/form`);
  const preRevoke = await browser.observeScoped("nova", run.id, { surface: "browser-dom", sessionId: SESSION });
  const preRevokeGo = getObservation(preRevoke.observationId)!.targets.find((target) => target.selector === "#go")!;
  db.revokeBotInput("nova");
  browser.revokeObservationsForBot("nova");
  const submitsBeforeRevoke = submits.length;
  let revokedError: unknown = null;
  try {
    await browser.semanticAct("nova", run.id, { targetId: preRevokeGo.targetId, sessionId: SESSION, kind: "click" });
  } catch (error) {
    revokedError = error;
  }
  assert.ok(revokedError instanceof Error && /STALE_OBSERVATION|USER_TAKEOVER/.test(revokedError.message), "revoked observation refused");
  assert.equal(submits.length, submitsBeforeRevoke, "zero submits after revocation");
  grants.issue("run-grant-1", "nova", { version: 1, origin: new URL(base).origin, maxClicks: 12, expiresInMinutes: 15 });
  assert.equal(grants.revokeBot("nova"), 1, "takeover revokes teammate navigation grants");
  const owned = await browser.takeoverClick("nova", 40, 40);
  assert.match(owned.url, /\/form/);
  record("F6-stop-takeover", true, "revoked observations refuse with zero input; grants revoked; owner takeover dispatched");

  // F7 — journal-state recovery across a database reopen (NOT an
  // accepted-effect response-loss test: it proves durable uncertain
  // recovery and non-readmission, while F9 proves the effect/readback
  // oracle below).
  {
    const actionId = "fix-f7-journal-state";
    db.journalActionPropose({
      actionId, runId: run.id, botId: "nova", surface: "browser-dom",
      surfaceIdentity: "tab:9/doc:fixture/frame:/", ownershipEpoch: "epoch-9",
      target: "Submit", payloadDigest: "digest-9", reviewDigest: null, account: "",
    });
    assert.equal(db.journalActionAdmit(actionId), true);
    assert.ok(db.journalActionTransition(actionId, "dispatch_started"), "dispatch started before the crash");
    // Simulate the process dying after the external effect was accepted
    // but before any outcome was recorded: close the browser and the
    // database, reopen the database, and run startup recovery.
    await browser.close().catch(() => undefined);
    db.close();
    db = new OpenBotDatabase(root, { dataDir: path.join(root, "data") });
    browser = new BrowserManager(db, { headlessTeaching: true });
    browser.registerVisualAdapter("fixture-visual", "visual-supported");
    const recovered = db.recoverInterruptedJournalActions();
    const recoveredIds = new Set(recovered.map((record) => record.actionId));
    assert.ok(recoveredIds.has(actionId), "restart recovery marks the in-flight action uncertain");
    // Anything observed-but-never-verified also returns to uncertain: a
    // restart always requires re-verification, never assumed success.
    assert.ok(recovered.length >= 1, "recovery covers every unverified action");
    assert.equal(db.journalActionGet(actionId)?.stage, "outcome_uncertain");
    assert.equal(db.journalActionAdmit(actionId), false, "no repeat admission after restart");
    const reconciled = db.journalActionReconcile(actionId, "verified", "owner read back the submitted fixture row");
    assert.equal(reconciled?.stage, "verified", "owner reconciliation resolves without re-dispatch");
    assert.equal(db.journalActionAdmit(actionId), false, "reconciled actions stay non-admittable");
    record("F7-journal-recovery", true, "reopen → uncertain → reconcile, never readmitted (state recovery; see F9 for effect/readback)");
  }

  // F8 — intended pane scrolls; decoy and frame panes verified independently.
  await browser.open("nova", `${base}/form`);
  const scrolled = await browser.observeScoped("nova", run.id, { surface: "browser-dom", sessionId: SESSION });
  const registryAfter = getObservation(scrolled.observationId)!;
  const intended = registryAfter.panes.find((pane) => pane.selector === "#intended");
  const decoyPane = registryAfter.panes.find((pane) => pane.selector === "#decoy-pane");
  assert.ok(intended && decoyPane, "host observed both scroll panes");
  const decoyTopsBefore = scrollTops("decoy-pane").length;
  const moved = await browser.scrollPane("nova", run.id, { observationId: scrolled.observationId, sessionId: SESSION, paneToken: intended.paneToken, deltaY: 200 });
  assert.ok(moved.moved > 0, `intended pane moved (${moved.beforeTop} → ${moved.afterTop})`);
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal(scrollTops("decoy-pane").length, decoyTopsBefore, "decoy pane never scrolled");
  record("F8-scroll-pane", true, `intended pane +${moved.moved}px, decoy untouched; region resolved, not discarded`);

  // F8b — owned iframe document scrolls through its frame token.
  {
    const framePane = registryAfter.panes.find((pane) => pane.framePath === "#sub");
    assert.ok(framePane, "host observed the owned iframe pane");
    const subBefore = scrollTops("sub-doc").length;
    const frameMoved = await browser.scrollPane("nova", run.id, { observationId: scrolled.observationId, sessionId: SESSION, paneToken: framePane.paneToken, deltaY: 200 });
    assert.ok(frameMoved.moved > 0, `iframe pane moved (${frameMoved.beforeTop} → ${frameMoved.afterTop})`);
    await new Promise((resolve) => setTimeout(resolve, 400));
    assert.ok(scrollTops("sub-doc").length > subBefore, "iframe scroll beaconed from the owned frame document");
    assert.equal(scrollTops("decoy-pane").length, decoyTopsBefore, "decoy still untouched");
    record("F8b-iframe-pane", true, `owned frame document +${frameMoved.moved}px via frame token`);
  }

  // F9a — logical mutation fence with a real effect and real readback.
  // One synthetic irreversible effect (a form submit counted by the
  // independent server): click accepted, result reporting lost afterwards
  // (documented simulation of post-acceptance response loss), fresh
  // observation retry refused, renderer-switch retry refused, restart
  // retry refused, real server-counter readback reconciles without another
  // mutation, completed key refuses duplicates, and a new key still works.
  const readCounts = async (): Promise<{ submits: number; clicks: number; canvas: number }> =>
    (await (await fetch(`${base}/counts`)).json()) as { submits: number; clicks: number; canvas: number };
  {
    const keyA = "mut-f9a-save-effect";
    await browser.open("nova", `${base}/form`);
    const before = await readCounts();
    const o1 = await browser.observeScoped("nova", run.id, { surface: "browser-dom", sessionId: SESSION });
    const go1 = getObservation(o1.observationId)!.targets.find((target) => target.selector === "#go")!;
    await browser.semanticAct("nova", run.id, { targetId: go1.targetId, sessionId: SESSION, kind: "click", mutationKey: keyA });
    await new Promise((resolve) => setTimeout(resolve, 400));
    const afterFirst = await readCounts();
    assert.equal(afterFirst.submits, before.submits + 1, "first effect really submitted");
    // Result reporting lost after the accepted effect (documented stand-in
    // for a post-acceptance response loss): the row goes uncertain while
    // the server-side effect stands.
    const firstRow = db.journalActionFindByMutation(keyA, run.id, "nova")[0]!;
    assert.equal(firstRow.stage, "effect_observed");
    assert.ok(db.journalActionTransition(firstRow.actionId, "outcome_uncertain", "fixture: simulated result-return loss after accepted click"));
    // Fresh observation, same mutation: refused with zero new effects.
    // (The first submit navigated to the Done page, so re-open the form to
    // observe the same control again — the fresh-observation retry shape.)
    await browser.open("nova", `${base}/form`);
    const o2 = await browser.observeScoped("nova", run.id, { surface: "browser-dom", sessionId: SESSION });
    const go2 = getObservation(o2.observationId)!.targets.find((target) => target.selector === "#go")!;
    let freshError: unknown = null;
    try {
      await browser.semanticAct("nova", run.id, { targetId: go2.targetId, sessionId: SESSION, kind: "click", mutationKey: keyA });
    } catch (error) {
      freshError = error;
    }
    assert.ok(freshError instanceof Error && /UNCERTAIN_CONFLICT/.test(freshError.message), "fresh observation cannot repeat the unresolved mutation");
    // Renderer switch, same mutation: refused with zero new effects.
    const ov = await browser.observeScoped("nova", run.id, { surface: "browser-visual", sessionId: SESSION });
    let visualError: unknown = null;
    try {
      await browser.visualAct("nova", run.id, { observationId: ov.observationId, sessionId: SESSION, adapterId: "fixture-visual", action: "click", point: { x: 300, y: 200 }, mutationKey: keyA });
    } catch (error) {
      visualError = error;
    }
    assert.ok(visualError instanceof Error && /UNCERTAIN_CONFLICT/.test(visualError.message), "renderer switch cannot repeat the unresolved mutation");
    const afterRetries = await readCounts();
    assert.deepEqual(afterRetries, afterFirst, "zero new effects across refused retries");
    // Restart: the fence survives on durable rows, not observation memory.
    await browser.close().catch(() => undefined);
    db.close();
    const { clearObservationsForTests } = await import("../src/server/observation-registry.js");
    clearObservationsForTests();
    db = new OpenBotDatabase(root, { dataDir: path.join(root, "data") });
    browser = new BrowserManager(db, { headlessTeaching: true });
    browser.registerVisualAdapter("fixture-visual", "visual-supported");
    await browser.open("nova", `${base}/form`);
    const o3 = await browser.observeScoped("nova", run.id, { surface: "browser-dom", sessionId: SESSION });
    const go3 = getObservation(o3.observationId)!.targets.find((target) => target.selector === "#go")!;
    let restartError: unknown = null;
    try {
      await browser.semanticAct("nova", run.id, { targetId: go3.targetId, sessionId: SESSION, kind: "click", mutationKey: keyA });
    } catch (error) {
      restartError = error;
    }
    assert.ok(restartError instanceof Error && /UNCERTAIN_CONFLICT/.test(restartError.message), "restart cannot repeat the unresolved mutation");
    // Independent permitted readback binds the evidence to the effect.
    const readback = await readCounts();
    assert.equal(readback.submits, afterFirst.submits, "readback confirms exactly the first effect, no more");
    const reconciled = db.journalActionReconcile(firstRow.actionId, "verified", `fixture server submits==${readback.submits} for ${keyA}`);
    assert.equal(reconciled?.stage, "verified", "readback evidence reconciles without re-dispatch");
    let duplicateError: unknown = null;
    try {
      await browser.semanticAct("nova", run.id, { targetId: go3.targetId, sessionId: SESSION, kind: "click", mutationKey: keyA });
    } catch (error) {
      duplicateError = error;
    }
    assert.ok(duplicateError instanceof Error && /DUPLICATE_MUTATION/.test(duplicateError.message), "completed mutation refuses duplicates");
    // Distinct genuinely-new work with a new key still proceeds: no blanket ban.
    const afterDuplicateCheck = await readCounts();
    await browser.semanticAct("nova", run.id, { targetId: go3.targetId, sessionId: SESSION, kind: "click", mutationKey: "mut-f9a-second-intent" });
    await new Promise((resolve) => setTimeout(resolve, 400));
    const afterNewKey = await readCounts();
    assert.equal(afterNewKey.submits, afterDuplicateCheck.submits + 1, "new mutation key performs new work");
    record("F9a-mutation-fence", true, "same effect fenced across obs/renderer/restart; readback reconciles; new keys unaffected");
  }

  // F9b — a real post-acceptance failure: the focus click lands, then the
  // key commit fails, leaving an uncertain row with a genuine accepted
  // effect and no silent success.
  {
    const keyB = "mut-f9b-key-effect";
    await browser.open("nova", `${base}/form`);
    const before = await readCounts();
    const ob = await browser.observeScoped("nova", run.id, { surface: "browser-visual", sessionId: SESSION });
    let keyError: unknown = null;
    try {
      await browser.visualAct("nova", run.id, { observationId: ob.observationId, sessionId: SESSION, adapterId: "fixture-visual", action: "key", point: { x: 300, y: 200 }, key: "NotARealKey123", mutationKey: keyB });
    } catch (error) {
      keyError = error;
    }
    assert.ok(keyError instanceof Error, "invalid key commit fails");
    const rows = db.journalActionFindByMutation(keyB, run.id, "nova");
    assert.equal(rows.length, 1, "one journal row for the attempt");
    assert.equal(rows[0]!.stage, "outcome_uncertain", "post-acceptance failure is uncertain, not success");
    const after = await readCounts();
    assert.ok(after.canvas >= before.canvas, "focus effect was accepted before the failure");
    record("F9b-real-uncertain", true, "accepted focus effect + failed commit → uncertain with genuine evidence");
  }

  // F10 — cancellation owns the pending wait: Save starts disabled, the act
  // waits without input, the run is cancelled and the input epoch bumped
  // (the exact durable effects of the real Stop route), the control
  // enables itself, and zero clicks ever land.
  {
    const stopRun = db.createRun({ threadId: "team-room", botId: "nova", prompt: "stoppable task", status: "running" });
    await browser.open("nova", `${base}/form`);
    const obs = await browser.observeScoped("nova", stopRun.id, { surface: "browser-dom", sessionId: SESSION });
    const late = getObservation(obs.observationId)!.targets.find((target) => target.selector === "#late-save")!;
    const clicksBeforeStop = clicks().length;
    const pendingAct = browser.semanticAct("nova", stopRun.id, { targetId: late.targetId, sessionId: SESSION, kind: "click" });
    await new Promise((resolve) => setTimeout(resolve, 600));
    assert.equal(clicks().length, clicksBeforeStop, "no input while the control is still disabled");
    db.updateRun(stopRun.id, { status: "cancelled" });
    db.revokeBotInput("nova");
    let stopError: unknown = null;
    try {
      await pendingAct;
    } catch (error) {
      stopError = error;
    }
    assert.ok(stopError instanceof Error && /stopped while|USER_TAKEOVER|That task/.test(stopError.message), `waiting input refused after cancel (got: ${(stopError as Error)?.message.slice(0, 80)})`);
    await new Promise((resolve) => setTimeout(resolve, 3500));
    assert.equal(clicks().filter((event) => event.id === "late-save").length, 0, "zero late-save clicks even after the control enabled itself");
    record("F10-cancel-wait", true, "revocation during the readiness wait prevents all later input");
  }

  // F10b — revocation between readiness and commit: the trial already
  // succeeded, then the owner cancels and the input epoch moves before the
  // commit phase runs. The commit-time guards must refuse with zero input
  // and no success result — for both click and fill. The barrier makes the
  // interleaving deterministic; production never passes one.
  {
    const finalRun = db.createRun({ threadId: "team-room", botId: "nova", prompt: "final-phase task", status: "running" });
    await browser.open("nova", `${base}/form`);
    // Click variant.
    const clickObs = await browser.observeScoped("nova", finalRun.id, { surface: "browser-dom", sessionId: SESSION });
    const clickTarget = getObservation(clickObs.observationId)!.targets.find((target) => target.selector === "#go")!;
    const clicksBeforeFinal = clicks().length;
    let clickError: unknown = null;
    try {
      await browser.semanticAct("nova", finalRun.id, {
        targetId: clickTarget.targetId,
        sessionId: SESSION,
        kind: "click",
        __testBarrier: {
          beforeCommit: async () => {
            db.updateRun(finalRun.id, { status: "cancelled" });
            db.revokeBotInput("nova");
          },
        },
      });
    } catch (error) {
      clickError = error;
    }
    assert.ok(clickError instanceof Error && /USER_TAKEOVER|stopped while|no longer runnable/.test(clickError.message), `final-phase click refused after revoke (got: ${(clickError as Error)?.message.slice(0, 90)})`);
    assert.equal(clicks().length, clicksBeforeFinal, "zero clicks dispatched after readiness succeeded");
    // Fill variant on a fresh running task.
    const fillRun = db.createRun({ threadId: "team-room", botId: "nova", prompt: "final-phase fill task", status: "running" });
    const fillObs = await browser.observeScoped("nova", fillRun.id, { surface: "browser-dom", sessionId: SESSION });
    const fillTarget = getObservation(fillObs.observationId)!.targets.find((target) => target.selector === 'input[name="field"]')!;
    const fieldsBeforeFinal = fieldInputs().length;
    let fillError: unknown = null;
    try {
      await browser.semanticAct("nova", fillRun.id, {
        targetId: fillTarget.targetId,
        sessionId: SESSION,
        kind: "type",
        value: "changed",
        __testBarrier: {
          beforeCommit: async () => {
            db.updateRun(fillRun.id, { status: "cancelled" });
            db.revokeBotInput("nova");
          },
        },
      });
    } catch (error) {
      fillError = error;
    }
    assert.ok(fillError instanceof Error && /USER_TAKEOVER|stopped while|no longer runnable/.test(fillError.message), `final-phase fill refused after revoke (got: ${(fillError as Error)?.message.slice(0, 90)})`);
    assert.equal(fieldInputs().length, fieldsBeforeFinal, "zero input events dispatched after readiness succeeded");
    const snapAfter = await browser.snapshot("nova");
    assert.ok(!snapAfter.text.includes("changed"), "field value unchanged after refused fill");
    record("F10b-final-phase", true, "revocation between readiness and commit refuses click and fill with zero input");
  }
} catch (error) {
  record("HARNESS", false, error instanceof Error ? error.message : String(error));
  throw error;
} finally {
  await browser.close().catch(() => undefined);
  try {
    db.close();
  } catch {
    // Already closed by the restart case; cleanup still follows.
  }
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(root, { recursive: true, force: true });
}

const failed = results.filter((result) => !result.pass);
console.log(`\nIntegration fixtures: ${results.length - failed.length}/${results.length} passed (headless Chrome, disposable data, 127.0.0.1 only).`);
console.log("Note: download capture has no BrowserManager API yet — lifecycle helpers are unit-tested; browser-level capture is a documented follow-up, not claimed here.");
if (failed.length) process.exit(1);

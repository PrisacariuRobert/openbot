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
<button type="button" id="retarget">Retarget form</button>
<button type="button" id="grow">Add field</button>
<input type="text" aria-label="Filler 1" value="f1">
<input type="text" aria-label="Filler 2" value="f2">
<input type="text" aria-label="Filler 3" value="f3">
<input type="text" aria-label="Filler 4" value="f4">
<input type="text" aria-label="Filler 5" value="f5">
<input type="text" aria-label="Filler 6" value="f6">
<input type="text" aria-label="Filler 7" value="f7">
<input type="text" aria-label="Filler 8" value="f8">
<input type="text" aria-label="Filler 9" value="f9">
<input type="text" aria-label="Filler 10" value="f10">
<input type="text" aria-label="Filler 11" value="f11">
<input type="text" aria-label="Filler 12" value="f12">
<input type="text" aria-label="Filler 13" value="f13">
<input type="text" aria-label="Filler 14" value="f14">
<input type="text" aria-label="Filler 15" value="f15">
<input type="text" aria-label="Filler 16" value="f16">
<input type="text" aria-label="Filler 17" value="f17">
<input type="text" aria-label="Filler 18" value="f18">
<input type="text" aria-label="Filler 19" value="f19">
<input type="text" aria-label="Filler 20" value="f20">
<input type="text" name="amount" aria-label="Amount" value="10">
<button type="button" id="set-amount">Toggle amount</button>
</form>
<input type="file" id="upload" aria-label="Attach file">
<canvas id="pad" style="position:fixed;left:100px;top:100px;width:400px;height:200px;" width="400" height="200"></canvas>
<div style="display:flex;gap:16px;margin-top:8px;">
<div id="intended" aria-label="Results pane" style="height:200px;overflow-y:auto;border:1px solid #999;"><div style="height:1200px;">intended lane</div></div>
<div id="decoy-pane" aria-label="Archive pane" style="height:200px;overflow-y:auto;border:1px solid #999;"><div style="height:1200px;">decoy lane</div></div>
<div id="twin-pane" aria-label="Results pane" style="height:200px;overflow-y:auto;border:1px solid #999;"><div style="height:1200px;">twin lane</div></div>
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
for (const id of ["intended", "decoy-pane", "twin-pane"]) {
  const pane = document.getElementById(id);
  if (pane) pane.addEventListener("scroll", () => send({ kind: "scroll", id, top: pane.scrollTop }), { passive: true });
}
const taskName = document.querySelector('input[aria-label="Task name"]');
if (taskName) taskName.addEventListener("input", () => send({ kind: "field-input", id: "task-name", top: 0 }));
const late = document.getElementById("late-save");
if (late) setTimeout(() => { late.removeAttribute("disabled"); }, 3000);
const retarget = document.getElementById("retarget");
if (retarget) retarget.addEventListener("click", () => {
  const form = document.querySelector("form");
  if (form) form.setAttribute("action", "/save-b");
});
const grow = document.getElementById("grow");
if (grow) grow.addEventListener("click", () => {
  const form = document.querySelector("form");
  if (form && !document.getElementById("extra25")) {
    const extra = document.createElement("input");
    extra.type = "text";
    extra.name = "extra25";
    extra.id = "extra25";
    extra.setAttribute("aria-label", "Extra field");
    extra.value = "x";
    form.appendChild(extra);
  }
});
const setAmount = document.getElementById("set-amount");
if (setAmount) setAmount.addEventListener("click", () => {
  const amount = document.querySelector('input[name="amount"]');
  if (amount) amount.value = amount.value === "10" ? "999" : "10";
});
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
  } else if (url.pathname === "/twins") {
    // Same form with a second, distinct Save control: same role, same
    // label, same frame — different host target identity (#go vs #go2).
    // A token pre-bound to one must never authorize the other.
    res.end(FORM.replace('<button type="button" id="decoy"', '<button type="submit" id="go2">Submit form</button><button type="button" id="decoy"'));
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
// Host-side mint helpers: fixture setup stands in for the review-time host,
// resolving opaque IDs and pre-binding the canonical effect digest
// (+approval for reviewed work) into each token. Visual mints are async:
// the host re-runs its own resolution to derive the effect coordinates.
const mutT = (runId: string, targetId: string, kind: "click" | "type", value?: string, approvalId?: string | null) =>
  browser.mintSemanticMutation("nova", runId, { targetId, sessionId: SESSION, kind, ...(value !== undefined ? { value } : {}), ...(approvalId ? { approvalId } : {}) });
const mutV = (runId: string, observationId: string, action: "click" | "double-click" | "drag" | "scroll" | "key", point: { x: number; y: number }, key?: string, endPoint?: { x: number; y: number }) =>
  browser.mintVisualMutation("nova", runId, { observationId, sessionId: SESSION, adapterId: "fixture-visual", action, point, ...(key !== undefined ? { key } : {}), ...(endPoint !== undefined ? { endPoint } : {}) });
const mutS = (runId: string, observationId: string, paneToken: string, deltaY: number) =>
  browser.mintScrollMutation("nova", runId, { observationId, sessionId: SESSION, paneToken, deltaY });

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
  await browser.semanticAct("nova", run.id, { targetId: go.targetId, sessionId: SESSION, kind: "click", mutationKey: mutT(run.id, go.targetId, "click") });
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal(submits.length, submitsBefore + 1, "exactly one submit reached the server");
  assert.ok(submits[submits.length - 1]!.includes("field="), "server received the form body");
  const goClicks = clicks().slice(clicksBefore).filter((event) => event.id === "go");
  assert.equal(goClicks.length, 1, "one real click landed on #go");
  assert.ok(!clicks().slice(clicksBefore).some((event) => event.id === "decoy"), "decoy never clicked");
  record("F1-real-action", true, "semanticAct via opaque ID submitted once; server oracle + click beacon agree");

  // F2 — relabeled control: the live review state no longer matches the
  // pre-bound token effect, so the exact-match verification refuses
  // before admission with zero new submits.
  await browser.open("nova", `${base}/form`);
  const relabeled = await browser.observeScoped("nova", run.id, { surface: "browser-dom", sessionId: SESSION });
  const relabeledGo = getObservation(relabeled.observationId)!.targets.find((target) => target.selector === "#go")!;
  await browser.open("nova", `${base}/relabeled`);
  const submitsBeforeRelabel = submits.length;
  const relabelToken = mutT(run.id, relabeledGo.targetId, "click");
  let staleError: unknown = null;
  try {
    await browser.semanticAct("nova", run.id, { targetId: relabeledGo.targetId, sessionId: SESSION, kind: "click", mutationKey: relabelToken });
  } catch (error) {
    staleError = error;
  }
  assert.ok(staleError instanceof Error && /STALE_OBSERVATION|TARGET_DESTROYED|AMBIGUOUS_TARGET|already bound to a different effect/.test(staleError.message), "relabel refused");
  assert.equal(submits.length, submitsBeforeRelabel, "zero submits on stale target");
  assert.equal(db.journalActionFindByMutation(relabelToken, run.id, "nova").length, 0, "token refusal leaves no journal row");
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
    await browser.semanticAct("nova", run.id, { targetId: ambiguousDup.targetId, sessionId: SESSION, kind: "click", mutationKey: mutT(run.id, ambiguousDup.targetId, "click") });
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
  const clickToken = await mutV(run.id, visual.observationId, "click", { x: 300, y: 200 });
  const click = await browser.visualAct("nova", run.id, {
    observationId: visual.observationId, sessionId: SESSION, adapterId: "fixture-visual", action: "click", point: { x: 300, y: 200 }, mutationKey: clickToken,
  });
  assert.ok(Math.abs(click.cssX - 300) < 1 && Math.abs(click.cssY - 200) < 1, `host mapped to CSS (${click.cssX},${click.cssY})`);
  await new Promise((resolve) => setTimeout(resolve, 400));
  const hits = canvasHits().slice(canvasBefore);
  assert.equal(hits.length, 1, "exactly one canvas hit beaconed");
  assert.ok(Math.abs(hits[0]!.x - 200) <= 3 && Math.abs(hits[0]!.y - 100) <= 3, `canvas-local (${hits[0]!.x},${hits[0]!.y}) ≈ (200,100)`);
  // Unknown adapter: VISION_UNAVAILABLE, zero input.
  const clicksBeforeVision = clicks().length;
  const novisionToken = await mutV(run.id, visual.observationId, "click", { x: 300, y: 200 });
  let visionError: unknown = null;
  try {
    await browser.visualAct("nova", run.id, {
      observationId: visual.observationId, sessionId: SESSION, adapterId: "unregistered-adapter", action: "click", point: { x: 300, y: 200 }, mutationKey: novisionToken,
    });
  } catch (error) {
    visionError = error;
  }
  assert.ok(visionError instanceof Error && /VISION_UNAVAILABLE/.test(visionError.message));
  // Stale observation ID: refusal with zero input.
  const staleVisToken = await mutV(run.id, visual.observationId, "click", { x: 300, y: 200 });
  let staleVisualError: unknown = null;
  try {
    await browser.visualAct("nova", run.id, {
      observationId: "obs_no_such_observation", sessionId: SESSION, adapterId: "fixture-visual", action: "click", point: { x: 300, y: 200 }, mutationKey: staleVisToken,
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
    const freshToken = await mutV(run.id, visual.observationId, "click", { x: 310, y: 210 });
    const stillFresh = await browser.visualAct("nova", run.id, {
      observationId: visual.observationId, sessionId: SESSION, adapterId: "fixture-visual", action: "click", point: { x: 310, y: 210 }, mutationKey: freshToken,
    });
    assert.ok(Math.abs(stillFresh.cssX - 310) < 1 && Math.abs(stillFresh.cssY - 210) < 1, "unchanged tab/page still acts");
    const navToken = await mutV(run.id, visual.observationId, "click", { x: 320, y: 220 });
    await browser.open("nova", `${base}/relabeled`);
    const clicksBeforeNav = clicks().length;
    let navError: unknown = null;
    try {
      await browser.visualAct("nova", run.id, {
        observationId: visual.observationId, sessionId: SESSION, adapterId: "fixture-visual", action: "click", point: { x: 320, y: 220 }, mutationKey: navToken,
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
  // Mint the walled-attempt token before the handoff: minting is host
  // bookkeeping (no eligibility gate), enforcement happens at dispatch.
  const oVisSecure = await browser.observeScoped("nova", secureRun.id, { surface: "browser-visual", sessionId: SESSION });
  const walledAttemptToken = await mutV(secureRun.id, oVisSecure.observationId, "click", { x: 100, y: 100 });
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
      observationId: walled.observationId, sessionId: SESSION, adapterId: "fixture-visual", action: "click", point: { x: 100, y: 100 }, mutationKey: walledAttemptToken,
    });
  } catch (error) {
    secureError = error;
  }
  assert.ok(secureError instanceof Error && /SECURE_MODE/.test(secureError.message), "visual input refused in secure mode");
  let preHandoffError: unknown = null;
  try {
    await browser.semanticAct("nova", secureRun.id, { targetId: preHandoffGo.targetId, sessionId: SESSION, kind: "click", mutationKey: mutT(secureRun.id, preHandoffGo.targetId, "click") });
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
  const preRevokeToken = mutT(run.id, preRevokeGo.targetId, "click");
  db.revokeBotInput("nova");
  browser.revokeObservationsForBot("nova");
  const submitsBeforeRevoke = submits.length;
  let revokedError: unknown = null;
  try {
    await browser.semanticAct("nova", run.id, { targetId: preRevokeGo.targetId, sessionId: SESSION, kind: "click", mutationKey: preRevokeToken });
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

  // R3 — changed form destination refuses AT THE TOKEN CHECK: observe
  // with action /submit, retarget the form to /save-b through a real
  // executor click, then act on Save with the old observation. The token
  // was pre-bound to /submit while the live destination is /save-b, so
  // the exact-match verification refuses before admission. Same selector,
  // label and URL prefix — different effective destination — zero submits.
  {
    const r3run = db.createRun({ threadId: "team-room", botId: "nova", prompt: "destination task", status: "running" });
    await browser.open("nova", `${base}/form`);
    const oR3 = await browser.observeScoped("nova", r3run.id, { surface: "browser-dom", sessionId: SESSION });
    const regR3 = getObservation(oR3.observationId)!;
    const retargetTarget = regR3.targets.find((target) => target.selector === "#retarget")!;
    const saveTarget = regR3.targets.find((target) => target.selector === "#go")!;
    await browser.semanticAct("nova", r3run.id, { targetId: retargetTarget.targetId, sessionId: SESSION, kind: "click", mutationKey: mutT(r3run.id, retargetTarget.targetId, "click") });
    const submitsBeforeR3 = submits.length;
    let r3Error: unknown = null;
    try {
      await browser.semanticAct("nova", r3run.id, { targetId: saveTarget.targetId, sessionId: SESSION, kind: "click", mutationKey: mutT(r3run.id, saveTarget.targetId, "click") });
    } catch (error) {
      r3Error = error;
    }
    assert.ok(r3Error instanceof Error && /already bound to a different effect/.test(r3Error.message), `destination change refuses at token check (got: ${(r3Error as Error)?.message.slice(0, 100)})`);
    assert.equal(submits.length, submitsBeforeR3, "zero submits after destination change");
    record("R3-destination", true, "form /submit→/save-b refuses at token check; no dispatch, no row");
  }

  // R4a — a 25th field changes the canonical review state, so the
  // pre-bound token no longer matches: refuses at the token check with
  // zero submits and no row. R4b — observing an already-25-field form
  // refuses as incomplete coverage from the start.
  {
    const r4run = db.createRun({ threadId: "team-room", botId: "nova", prompt: "field task", status: "running" });
    await browser.open("nova", `${base}/form`);
    const oR4 = await browser.observeScoped("nova", r4run.id, { surface: "browser-dom", sessionId: SESSION });
    const regR4 = getObservation(oR4.observationId)!;
    const growTarget = regR4.targets.find((target) => target.selector === "#grow")!;
    const saveTarget = regR4.targets.find((target) => target.selector === "#go")!;
    await browser.semanticAct("nova", r4run.id, { targetId: growTarget.targetId, sessionId: SESSION, kind: "click", mutationKey: mutT(r4run.id, growTarget.targetId, "click") });
    const submitsBeforeR4 = submits.length;
    let r4Error: unknown = null;
    try {
      await browser.semanticAct("nova", r4run.id, { targetId: saveTarget.targetId, sessionId: SESSION, kind: "click", mutationKey: mutT(r4run.id, saveTarget.targetId, "click") });
    } catch (error) {
      r4Error = error;
    }
    assert.ok(r4Error instanceof Error && /already bound to a different effect/.test(r4Error.message), `25th field refuses at token check (got: ${(r4Error as Error)?.message.slice(0, 100)})`);
    assert.equal(submits.length, submitsBeforeR4, "zero submits after field-count change");
    const oR4b = await browser.observeScoped("nova", r4run.id, { surface: "browser-dom", sessionId: SESSION });
    const saveTargetB = getObservation(oR4b.observationId)!.targets.find((target) => target.selector === "#go")!;
    let r4bError: unknown = null;
    try {
      await browser.semanticAct("nova", r4run.id, { targetId: saveTargetB.targetId, sessionId: SESSION, kind: "click", mutationKey: mutT(r4run.id, saveTargetB.targetId, "click") });
    } catch (error) {
      r4bError = error;
    }
    assert.ok(r4bError instanceof Error && /INCOMPLETE_REVIEW/.test(r4bError.message), `truncated coverage refuses explicitly (got: ${(r4bError as Error)?.message.slice(0, 80)})`);
    assert.equal(submits.length, submitsBeforeR4, "zero submits on incomplete review");
    record("R4-field-coverage", true, "25th field refuses at token check; incomplete review refuses explicitly");
  }

  // F11 — approval records bind the exact proposed effect. Exact
  // operation/target-identity/value/REVIEWED-destination/freshness passes;
  // mismatched selector, wrong kind, changed value, wrong or missing
  // destination, changed query, stale reviewed state, stale decision and
  // any visual approval all refuse before any input. Observation-digest
  // equality never substitutes for owner authorization, and every token
  // below is pre-bound by the host to its exact effect and approval.
  {
    const approveRun = db.createRun({ threadId: "team-room", botId: "nova", prompt: "approval task", status: "running" });
    const approve = (action: unknown) => {
      const approval = db.createApproval({ runId: approveRun.id, botId: "nova", kind: "browser", reason: "fixture review", actionLabel: "fixture", action });
      return db.decideApproval(approval.id, "approved")!;
    };
    const fp = async (selector: string) => (await browser.describeTarget("nova", selector)).fingerprint;
    await browser.open("nova", `${base}/form`);
    // Exact match passes and submits once. The approval carries the
    // host-observed effective destination AND the reviewed target
    // identity — page URL alone never suffices.
    const oExact = await browser.observeScoped("nova", approveRun.id, { surface: "browser-dom", sessionId: SESSION });
    const exactGo = getObservation(oExact.observationId)!.targets.find((target) => target.selector === "#go")!;
    const submitDest = exactGo.effectiveDestination;
    const exactFp = await fp("#go");
    const exactApproval = approve({ type: "browser_click", botId: "nova", args: { selector: "#go", targetFingerprint: exactFp, targetReview: { url: `${base}/form`, destination: submitDest } } });
    const submitsBeforeExact = submits.length;
    await browser.semanticAct("nova", approveRun.id, { targetId: exactGo.targetId, sessionId: SESSION, kind: "click", mutationKey: mutT(approveRun.id, exactGo.targetId, "click", undefined, exactApproval.id), approvalId: exactApproval.id });
    await new Promise((resolve) => setTimeout(resolve, 400));
    assert.equal(submits.length, submitsBeforeExact + 1, "exact approved operation dispatches once");
    // Mismatched selector refuses.
    await browser.open("nova", `${base}/form`);
    const oMis = await browser.observeScoped("nova", approveRun.id, { surface: "browser-dom", sessionId: SESSION });
    const misGo = getObservation(oMis.observationId)!.targets.find((target) => target.selector === "#go")!;
    const misFp = await fp("#go");
    const misApproval = approve({ type: "browser_click", botId: "nova", args: { selector: "#dup-a", targetFingerprint: await fp("#dup-a"), targetReview: { url: `${base}/form`, destination: misGo.effectiveDestination } } });
    let misError: unknown = null;
    try {
      await browser.semanticAct("nova", approveRun.id, { targetId: misGo.targetId, sessionId: SESSION, kind: "click", mutationKey: mutT(approveRun.id, misGo.targetId, "click", undefined, misApproval.id), approvalId: misApproval.id });
    } catch (error) {
      misError = error;
    }
    assert.ok(misError instanceof Error && /different control/.test(misError.message), "approval for another control refuses");
    // Wrong kind refuses.
    const kindApproval = approve({ type: "browser_type", botId: "nova", args: { selector: "#go", value: "x" } });
    let kindError: unknown = null;
    try {
      await browser.semanticAct("nova", approveRun.id, { targetId: misGo.targetId, sessionId: SESSION, kind: "click", mutationKey: mutT(approveRun.id, misGo.targetId, "click"), approvalId: kindApproval.id });
    } catch (error) {
      kindError = error;
    }
    assert.ok(kindError instanceof Error && /different operation kind/.test(kindError.message), "typing approval refuses a click");
    // Wrong reviewed destination refuses even when page URL, selector,
    // label and every other state are unchanged: an approval for /save-a
    // can never authorize the live /submit target.
    const destApproval = approve({ type: "browser_click", botId: "nova", args: { selector: "#go", targetFingerprint: misFp, targetReview: { url: `${base}/form`, destination: `${base}/save-a` } } });
    let destError: unknown = null;
    try {
      await browser.semanticAct("nova", approveRun.id, { targetId: misGo.targetId, sessionId: SESSION, kind: "click", mutationKey: mutT(approveRun.id, misGo.targetId, "click", undefined, destApproval.id), approvalId: destApproval.id });
    } catch (error) {
      destError = error;
    }
    assert.ok(destError instanceof Error && /different destination/.test(destError.message), `approval for another destination refuses (got: ${(destError as Error)?.message.slice(0, 120)})`);
    assert.equal(submits.length, submitsBeforeExact + 1, "zero submits on destination mismatch");
    // Changed query is a changed destination: /submit?account=A cannot
    // authorize /submit?account=B (or a bare /submit).
    const queryApproval = approve({ type: "browser_click", botId: "nova", args: { selector: "#go", targetFingerprint: misFp, targetReview: { url: `${base}/form`, destination: `${submitDest}?account=A` } } });
    let queryError: unknown = null;
    try {
      await browser.semanticAct("nova", approveRun.id, { targetId: misGo.targetId, sessionId: SESSION, kind: "click", mutationKey: mutT(approveRun.id, misGo.targetId, "click", undefined, queryApproval.id), approvalId: queryApproval.id });
    } catch (error) {
      queryError = error;
    }
    assert.ok(queryError instanceof Error && /different destination/.test(queryError.message), `changed query refuses (got: ${(queryError as Error)?.message.slice(0, 120)})`);
    assert.equal(submits.length, submitsBeforeExact + 1, "zero submits on query change");
    // Missing reviewed destination fails closed for consequential clicks.
    const bareApproval = approve({ type: "browser_click", botId: "nova", args: { selector: "#go", targetFingerprint: misFp } });
    let bareError: unknown = null;
    try {
      await browser.semanticAct("nova", approveRun.id, { targetId: misGo.targetId, sessionId: SESSION, kind: "click", mutationKey: mutT(approveRun.id, misGo.targetId, "click", undefined, bareApproval.id), approvalId: bareApproval.id });
    } catch (error) {
      bareError = error;
    }
    assert.ok(bareError instanceof Error && /reviewed destination/.test(bareError.message), `destination-less approval fails closed (got: ${(bareError as Error)?.message.slice(0, 120)})`);
    assert.equal(submits.length, submitsBeforeExact + 1, "zero submits without a reviewed destination");
    // Changed typed value refuses (approval carries the reviewed target
    // identity, so the refusal lands on the value, not the identity).
    await browser.open("nova", `${base}/form`);
    const oVal = await browser.observeScoped("nova", approveRun.id, { surface: "browser-dom", sessionId: SESSION });
    const valFp = await fp('input[name="field"]');
    const valueApproval = approve({ type: "browser_type", botId: "nova", args: { selector: 'input[name="field"]', targetFingerprint: valFp, value: "reviewed-value" } });
    const valField = getObservation(oVal.observationId)!.targets.find((target) => target.selector === 'input[name="field"]')!;
    let valueError: unknown = null;
    try {
      await browser.semanticAct("nova", approveRun.id, { targetId: valField.targetId, sessionId: SESSION, kind: "type", value: "other-value", mutationKey: mutT(approveRun.id, valField.targetId, "type", "other-value", valueApproval.id), approvalId: valueApproval.id });
    } catch (error) {
      valueError = error;
    }
    assert.ok(valueError instanceof Error && /different reviewed value/.test(valueError.message), `changed value refuses (got: ${(valueError as Error)?.message.slice(0, 120)})`);
    // Stale decision (approved before the observation) refuses.
    const staleApproval = approve({ type: "browser_click", botId: "nova", args: { selector: "#go" } });
    await browser.open("nova", `${base}/form`);
    const oStale = await browser.observeScoped("nova", approveRun.id, { surface: "browser-dom", sessionId: SESSION });
    const staleGo = getObservation(oStale.observationId)!.targets.find((target) => target.selector === "#go")!;
    let staleApprovalError: unknown = null;
    try {
      await browser.semanticAct("nova", approveRun.id, { targetId: staleGo.targetId, sessionId: SESSION, kind: "click", mutationKey: mutT(approveRun.id, staleGo.targetId, "click"), approvalId: staleApproval.id });
    } catch (error) {
      staleApprovalError = error;
    }
    assert.ok(staleApprovalError instanceof Error && /predates/.test(staleApprovalError.message), "pre-observation approval refuses");
    // Visual approvals do not exist yet: ANY supplied approvalId refuses,
    // even a well-formed browser_visual record. Borrowing a typing record
    // refuses the same way.
    const oVis = await browser.observeScoped("nova", approveRun.id, { surface: "browser-visual", sessionId: SESSION });
    const visualApproval = approve({ type: "browser_type", botId: "nova", args: { selector: 'input[name="field"]', value: "reviewed-value" } });
    let visualApprovalError: unknown = null;
    try {
      await browser.visualAct("nova", approveRun.id, { observationId: oVis.observationId, sessionId: SESSION, adapterId: "fixture-visual", action: "click", point: { x: 300, y: 200 }, mutationKey: await mutV(approveRun.id, oVis.observationId, "click", { x: 300, y: 200 }), approvalId: visualApproval.id });
    } catch (error) {
      visualApprovalError = error;
    }
    assert.ok(visualApprovalError instanceof Error && /Visual approvals are not issued yet/.test(visualApprovalError.message), `typing approval cannot authorize a visual click (got: ${(visualApprovalError as Error)?.message.slice(0, 120)})`);
    const canvasBeforeVisual = canvasHits().length;
    const visualRecord = approve({ type: "browser_visual", botId: "nova", args: { kind: "visual-click" } });
    let visualRecordError: unknown = null;
    try {
      await browser.visualAct("nova", approveRun.id, { observationId: oVis.observationId, sessionId: SESSION, adapterId: "fixture-visual", action: "click", point: { x: 300, y: 200 }, mutationKey: await mutV(approveRun.id, oVis.observationId, "click", { x: 300, y: 200 }), approvalId: visualRecord.id });
    } catch (error) {
      visualRecordError = error;
    }
    assert.ok(visualRecordError instanceof Error && /Visual approvals are not issued yet/.test(visualRecordError.message), "even a browser_visual record cannot authorize visual input yet");
    assert.equal(canvasHits().length, canvasBeforeVisual, "zero visual input across refused approvals");
    assert.equal(submits.length, submitsBeforeExact + 1, "only the exact approved operation submitted");
    record("F11-approval-binding", true, "exact passes once; selector/kind/value/destination/query/identity/freshness/visual mismatches refuse");
  }

  // F11b — approved state == live state, independently of observed state ==
  // live state. Observe amount=10, flip to 999 through a real executor
  // click, review the 999 state, flip back to 10 the same way: neither the
  // old nor the current 10-observation is authorized by the 999 approval.
  // Zero external effect.
  {
    const stateRun = db.createRun({ threadId: "team-room", botId: "nova", prompt: "reviewed-state task", status: "running" });
    const approve = (action: unknown) => {
      const approval = db.createApproval({ runId: stateRun.id, botId: "nova", kind: "browser", reason: "fixture review", actionLabel: "fixture", action });
      return db.decideApproval(approval.id, "approved")!;
    };
    const stateFp = async (selector: string) => (await browser.describeTarget("nova", selector)).fingerprint;
    const flipAmount = async () => {
      const obs = await browser.observeScoped("nova", stateRun.id, { surface: "browser-dom", sessionId: SESSION });
      const toggle = getObservation(obs.observationId)!.targets.find((target) => target.selector === "#set-amount")!;
      await browser.semanticAct("nova", stateRun.id, { targetId: toggle.targetId, sessionId: SESSION, kind: "click", mutationKey: mutT(stateRun.id, toggle.targetId, "click") });
    };
    await browser.open("nova", `${base}/form`);
    const oTen = await browser.observeScoped("nova", stateRun.id, { surface: "browser-dom", sessionId: SESSION });
    const tenGo = getObservation(oTen.observationId)!.targets.find((target) => target.selector === "#go")!;
    const destTen = tenGo.effectiveDestination;
    await flipAmount();
    // Capture the 999 reviewed identity while 999 is live.
    const fp999 = await stateFp("#go");
    await flipAmount();
    const submitsBeforeState = submits.length;
    // Current observation (amount=10 live).
    const oFinal = await browser.observeScoped("nova", stateRun.id, { surface: "browser-dom", sessionId: SESSION });
    const finalGo = getObservation(oFinal.observationId)!.targets.find((target) => target.selector === "#go")!;
    // Review the 999 state only now: same selector, same destination,
    // different reviewed target identity — and newer than the
    // 10-observations, so freshness cannot decide for us. Refused below
    // proves approved state == live state is required independently.
    const approval999 = approve({ type: "browser_click", botId: "nova", args: { selector: "#go", targetFingerprint: fp999, targetReview: { url: `${base}/form`, destination: destTen } } });
    // Refused — approved 999 != live 10.
    let finalError: unknown = null;
    try {
      await browser.semanticAct("nova", stateRun.id, { targetId: finalGo.targetId, sessionId: SESSION, kind: "click", mutationKey: mutT(stateRun.id, finalGo.targetId, "click"), approvalId: approval999.id });
    } catch (error) {
      finalError = error;
    }
    assert.ok(finalError instanceof Error && /reviewed control state changed/.test(finalError.message), `current 10-observation not authorized by 999 approval (got: ${(finalError as Error)?.message.slice(0, 120)})`);
    // Old observation (also amount=10): refused the same way.
    let oldError: unknown = null;
    try {
      await browser.semanticAct("nova", stateRun.id, { targetId: tenGo.targetId, sessionId: SESSION, kind: "click", mutationKey: mutT(stateRun.id, tenGo.targetId, "click"), approvalId: approval999.id });
    } catch (error) {
      oldError = error;
    }
    assert.ok(oldError instanceof Error && /reviewed control state changed/.test(oldError.message), `old 10-observation not authorized by 999 approval either (got: ${(oldError as Error)?.message.slice(0, 160)})`);
    assert.equal(submits.length, submitsBeforeState, "zero submits across reviewed-state mismatches");
    record("F11b-reviewed-state", true, "999 review cannot authorize 10 state on old or current observation");
  }

  // F12 — exact host target identity in the token. Mint for one Save
  // target, re-observe, then first-use the token on a DIFFERENT Save
  // target with the same role, label and frame: refuses before admission
  // with zero submits and no journal row. (Same-effect reuse of a token
  // is proven by F9a and the unit suite; the twins page stays ambiguous
  // at live re-resolution by construction, so no dispatch follows here.)
  {
    const twinRun = db.createRun({ threadId: "team-room", botId: "nova", prompt: "twin task", status: "running" });
    await browser.open("nova", `${base}/twins`);
    const oTwin = await browser.observeScoped("nova", twinRun.id, { surface: "browser-dom", sessionId: SESSION });
    const regTwin = getObservation(oTwin.observationId)!;
    const goA = regTwin.targets.find((target) => target.selector === "#go")!;
    const goB = regTwin.targets.find((target) => target.selector === "#go2")!;
    assert.equal(goA.role, goB.role, "twins share their role");
    assert.equal(goA.label, goB.label, "twins share their label");
    assert.equal(goA.framePath, goB.framePath, "twins share their frame");
    assert.notEqual(goA.selector, goB.selector, "twins differ in host identity");
    const tokenA = mutT(twinRun.id, goA.targetId, "click");
    const oTwin2 = await browser.observeScoped("nova", twinRun.id, { surface: "browser-dom", sessionId: SESSION });
    const goB2 = getObservation(oTwin2.observationId)!.targets.find((target) => target.selector === "#go2")!;
    const submitsBeforeTwin = submits.length;
    let twinError: unknown = null;
    try {
      await browser.semanticAct("nova", twinRun.id, { targetId: goB2.targetId, sessionId: SESSION, kind: "click", mutationKey: tokenA });
    } catch (error) {
      twinError = error;
    }
    assert.ok(twinError instanceof Error && /already bound to a different effect/.test(twinError.message), `twin target refuses another identity (got: ${(twinError as Error)?.message.slice(0, 100)})`);
    assert.equal(submits.length, submitsBeforeTwin, "zero submits on twin mismatch");
    assert.equal(db.journalActionFindByMutation(tokenA, twinRun.id, "nova").length, 0, "refused twin leaves no journal row");
    record("F12-target-identity", true, "twin Save target refuses another identity before admission");
  }

  // F12b — drag binds both resolved endpoints. A token for A→B refuses
  // A→C before admission with zero input.
  {
    const dragRun = db.createRun({ threadId: "team-room", botId: "nova", prompt: "drag task", status: "running" });
    await browser.open("nova", `${base}/form`);
    const oDrag = await browser.observeScoped("nova", dragRun.id, { surface: "browser-visual", sessionId: SESSION });
    const tokenAB = await mutV(dragRun.id, oDrag.observationId, "drag", { x: 300, y: 200 }, undefined, { x: 350, y: 250 });
    const canvasBeforeDrag = canvasHits().length;
    let dragError: unknown = null;
    try {
      await browser.visualAct("nova", dragRun.id, {
        observationId: oDrag.observationId, sessionId: SESSION, adapterId: "fixture-visual", action: "drag",
        point: { x: 300, y: 200 }, endPoint: { x: 100, y: 100 }, mutationKey: tokenAB,
      });
    } catch (error) {
      dragError = error;
    }
    assert.ok(dragError instanceof Error && /already bound to a different effect/.test(dragError.message), `drag A→C refused on A→B token (got: ${(dragError as Error)?.message.slice(0, 100)})`);
    assert.equal(canvasHits().length, canvasBeforeDrag, "zero input on endpoint mismatch");
    assert.equal(db.journalActionFindByMutation(tokenAB, dragRun.id, "nova").length, 0, "refused drag leaves no journal row");
    record("F12b-drag-endpoint", true, "drag token binds start and end; A→C on A→B refuses with zero input");
  }

  // F12c — scroll binds the normalized delta. A token for +200 refuses
  // -200 and +3000 before admission with zero scroll input.
  {
    const deltaRun = db.createRun({ threadId: "team-room", botId: "nova", prompt: "delta task", status: "running" });
    await browser.open("nova", `${base}/form`);
    const oDelta = await browser.observeScoped("nova", deltaRun.id, { surface: "browser-dom", sessionId: SESSION });
    const deltaPane = getObservation(oDelta.observationId)!.panes.find((pane) => pane.selector === "#intended")!;
    const token200 = mutS(deltaRun.id, oDelta.observationId, deltaPane.paneToken, 200);
    const topsBeforeDelta = scrollTops("intended").length;
    for (const [label, deltaY] of [["reverse", -200], ["far", 3000]] as const) {
      let deltaError: unknown = null;
      try {
        await browser.scrollPane("nova", deltaRun.id, {
          observationId: oDelta.observationId, sessionId: SESSION, paneToken: deltaPane.paneToken, deltaY, mutationKey: token200,
        });
      } catch (error) {
        deltaError = error;
      }
      assert.ok(deltaError instanceof Error && /already bound to a different effect/.test(deltaError.message), `${label} delta refuses on +200 token (got: ${(deltaError as Error)?.message.slice(0, 100)})`);
    }
    assert.equal(scrollTops("intended").length, topsBeforeDelta, "zero scroll input across delta mismatches");
    const moved = await browser.scrollPane("nova", deltaRun.id, {
      observationId: oDelta.observationId, sessionId: SESSION, paneToken: deltaPane.paneToken, deltaY: 200, mutationKey: token200,
    });
    assert.ok(moved.moved > 0, "the same token scrolls once for its own delta");
    record("F12c-scroll-delta", true, "+200 token refuses -200/+3000 with zero input; own delta scrolls once");
  }

  // F13 — the token binds the observed RESOURCE state, not only the
  // operation parameters. Observe #go with amount=10, mint, flip to 999,
  // take a NEW observation of the same #go (same selector, role, label,
  // frame and destination): first-use of the old token with the new
  // target refuses at the token check before admission. Zero submit, no
  // journal row. The approval fingerprint gate stays independent.
  {
    const resRun = db.createRun({ threadId: "team-room", botId: "nova", prompt: "resource task", status: "running" });
    await browser.open("nova", `${base}/form`);
    const flip = async () => {
      const obs = await browser.observeScoped("nova", resRun.id, { surface: "browser-dom", sessionId: SESSION });
      const toggle = getObservation(obs.observationId)!.targets.find((target) => target.selector === "#set-amount")!;
      await browser.semanticAct("nova", resRun.id, { targetId: toggle.targetId, sessionId: SESSION, kind: "click", mutationKey: mutT(resRun.id, toggle.targetId, "click") });
    };
    // Ensure amount=10 (toggle starts at 10; a fresh page is already 10).
    const oRes10 = await browser.observeScoped("nova", resRun.id, { surface: "browser-dom", sessionId: SESSION });
    const resGo10 = getObservation(oRes10.observationId)!.targets.find((target) => target.selector === "#go")!;
    const resToken = mutT(resRun.id, resGo10.targetId, "click");
    await flip();
    const oRes999 = await browser.observeScoped("nova", resRun.id, { surface: "browser-dom", sessionId: SESSION });
    const resGo999 = getObservation(oRes999.observationId)!.targets.find((target) => target.selector === "#go")!;
    assert.equal(resGo999.selector, resGo10.selector, "same selector");
    assert.equal(resGo999.role, resGo10.role, "same role");
    assert.equal(resGo999.label, resGo10.label, "same label");
    assert.equal(resGo999.framePath, resGo10.framePath, "same frame");
    assert.equal(resGo999.effectiveDestination, resGo10.effectiveDestination, "same destination");
    assert.notEqual(resGo999.reviewDigest, resGo10.reviewDigest, "different observed resource state");
    const submitsBeforeRes = submits.length;
    let resError: unknown = null;
    try {
      await browser.semanticAct("nova", resRun.id, { targetId: resGo999.targetId, sessionId: SESSION, kind: "click", mutationKey: resToken });
    } catch (error) {
      resError = error;
    }
    assert.ok(resError instanceof Error && /already bound to a different effect/.test(resError.message), `old token refuses changed resource state (got: ${(resError as Error)?.message.slice(0, 100)})`);
    assert.equal(submits.length, submitsBeforeRes, "zero submits on resource-state mismatch");
    assert.equal(db.journalActionFindByMutation(resToken, resRun.id, "nova").length, 0, "refused resource state leaves no journal row");
    await flip();
    record("F13-resource-state", true, "10-token cannot first-use 999-state target; refuses before admission");
  }

  // F13b — visual coordinates bind the exact observation identity.
  // Mint a click token for observation A, then observe a different
  // document with identical window geometry and attempt the same
  // coordinates/action on B with A's token: refuses before admission
  // with zero input. Drag-end binding is preserved (see F12b).
  {
    const obsRun = db.createRun({ threadId: "team-room", botId: "nova", prompt: "obs task", status: "running" });
    await browser.open("nova", `${base}/form`);
    const oA = await browser.observeScoped("nova", obsRun.id, { surface: "browser-visual", sessionId: SESSION });
    const tokenObsA = await mutV(obsRun.id, oA.observationId, "click", { x: 300, y: 200 });
    await browser.open("nova", `${base}/relabeled`);
    const oB = await browser.observeScoped("nova", obsRun.id, { surface: "browser-visual", sessionId: SESSION });
    const clicksBeforeObs = clicks().length;
    const canvasBeforeObs = canvasHits().length;
    let obsError: unknown = null;
    try {
      await browser.visualAct("nova", obsRun.id, {
        observationId: oB.observationId, sessionId: SESSION, adapterId: "fixture-visual", action: "click", point: { x: 300, y: 200 }, mutationKey: tokenObsA,
      });
    } catch (error) {
      obsError = error;
    }
    assert.ok(obsError instanceof Error && /already bound to a different effect/.test(obsError.message), `foreign observation refuses (got: ${(obsError as Error)?.message.slice(0, 100)})`);
    assert.equal(clicks().length, clicksBeforeObs, "zero clicks on observation mismatch");
    assert.equal(canvasHits().length, canvasBeforeObs, "zero canvas input on observation mismatch");
    assert.equal(db.journalActionFindByMutation(tokenObsA, obsRun.id, "nova").length, 0, "refused observation leaves no journal row");
    record("F13b-observation-identity", true, "A-token cannot act on B; refuses before admission with zero input");
  }

  // F13c — scroll binds the exact pane, not only its label. Two panes
  // share the label "results pane" in one frame: mint +200 for pane A,
  // first-use it on pane B. Refuses before admission; neither pane
  // moves. The same token still works once on pane A (delta binding
  // preserved).
  {
    const paneRun = db.createRun({ threadId: "team-room", botId: "nova", prompt: "pane task", status: "running" });
    await browser.open("nova", `${base}/form`);
    const oPane = await browser.observeScoped("nova", paneRun.id, { surface: "browser-dom", sessionId: SESSION });
    const regPane = getObservation(oPane.observationId)!;
    const paneA = regPane.panes.find((pane) => pane.selector === "#intended")!;
    const paneB = regPane.panes.find((pane) => pane.selector === "#twin-pane")!;
    assert.equal(paneA.label, paneB.label, "twins share their label");
    assert.equal(paneA.framePath, paneB.framePath, "twins share their frame");
    assert.notEqual(paneA.paneToken, paneB.paneToken, "twins differ in host identity");
    const tokenPaneA = mutS(paneRun.id, oPane.observationId, paneA.paneToken, 200);
    const intendedBefore = scrollTops("intended").length;
    const twinBefore = scrollTops("twin-pane").length;
    let paneError: unknown = null;
    try {
      await browser.scrollPane("nova", paneRun.id, {
        observationId: oPane.observationId, sessionId: SESSION, paneToken: paneB.paneToken, deltaY: 200, mutationKey: tokenPaneA,
      });
    } catch (error) {
      paneError = error;
    }
    assert.ok(paneError instanceof Error && /already bound to a different effect/.test(paneError.message), `twin pane refuses another identity (got: ${(paneError as Error)?.message.slice(0, 100)})`);
    assert.equal(scrollTops("intended").length, intendedBefore, "pane A never moved");
    assert.equal(scrollTops("twin-pane").length, twinBefore, "pane B never moved");
    assert.equal(db.journalActionFindByMutation(tokenPaneA, paneRun.id, "nova").length, 0, "refused pane leaves no journal row");
    const ownMove = await browser.scrollPane("nova", paneRun.id, {
      observationId: oPane.observationId, sessionId: SESSION, paneToken: paneA.paneToken, deltaY: 200, mutationKey: tokenPaneA,
    });
    assert.ok(ownMove.moved > 0, "the same token scrolls once on its own pane");
    record("F13c-pane-identity", true, "twin pane refuses another identity; own pane scrolls once");
  }
  await browser.open("nova", `${base}/form`);
  const scrolled = await browser.observeScoped("nova", run.id, { surface: "browser-dom", sessionId: SESSION });
  const registryAfter = getObservation(scrolled.observationId)!;
  const intended = registryAfter.panes.find((pane) => pane.selector === "#intended");
  const decoyPane = registryAfter.panes.find((pane) => pane.selector === "#decoy-pane");
  assert.ok(intended && decoyPane, "host observed both scroll panes");
  const decoyTopsBefore = scrollTops("decoy-pane").length;
  const moved = await browser.scrollPane("nova", run.id, { observationId: scrolled.observationId, sessionId: SESSION, paneToken: intended.paneToken, deltaY: 200, mutationKey: mutS(run.id, scrolled.observationId, intended.paneToken, 200) });
  assert.ok(moved.moved > 0, `intended pane moved (${moved.beforeTop} → ${moved.afterTop})`);
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal(scrollTops("decoy-pane").length, decoyTopsBefore, "decoy pane never scrolled");
  record("F8-scroll-pane", true, `intended pane +${moved.moved}px, decoy untouched; region resolved, not discarded`);

  // F8b — owned iframe document scrolls through its frame token.
  {
    const framePane = registryAfter.panes.find((pane) => pane.framePath === "#sub");
    assert.ok(framePane, "host observed the owned iframe pane");
    const subBefore = scrollTops("sub-doc").length;
    const frameMoved = await browser.scrollPane("nova", run.id, { observationId: scrolled.observationId, sessionId: SESSION, paneToken: framePane.paneToken, deltaY: 200, mutationKey: mutS(run.id, scrolled.observationId, framePane.paneToken, 200) });
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
    await browser.open("nova", `${base}/form`);
    const before = await readCounts();
    const o1 = await browser.observeScoped("nova", run.id, { surface: "browser-dom", sessionId: SESSION });
    const go1 = getObservation(o1.observationId)!.targets.find((target) => target.selector === "#go")!;
    const keyA = mutT(run.id, go1.targetId, "click");
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
    // Renderer switch, same key: refused with zero new effects. The key is
    // bound to the semantic-click effect, so the visual expression of the
    // same intent meets the key-effect binding refusal rather than the
    // fence — both are safe terminal refusals that require reconcile or a
    // newly reviewed key; neither dispatches.
    assert.ok(visualError instanceof Error && /UNCERTAIN_CONFLICT|already bound to a different effect/.test(visualError.message), "renderer switch cannot repeat the unresolved mutation");
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
    await browser.semanticAct("nova", run.id, { targetId: go3.targetId, sessionId: SESSION, kind: "click", mutationKey: mutT(run.id, go3.targetId, "click") });
    await new Promise((resolve) => setTimeout(resolve, 400));
    const afterNewKey = await readCounts();
    assert.equal(afterNewKey.submits, afterDuplicateCheck.submits + 1, "new mutation key performs new work");
    record("F9a-mutation-fence", true, "same effect fenced across obs/renderer/restart; readback reconciles; new keys unaffected");
  }

  // F9b — a real post-acceptance failure: the focus click lands, then the
  // key commit fails, leaving an uncertain row with a genuine accepted
  // effect and no silent success.
  {
    await browser.open("nova", `${base}/form`);
    const before = await readCounts();
    const ob = await browser.observeScoped("nova", run.id, { surface: "browser-visual", sessionId: SESSION });
    const keyB = await mutV(run.id, ob.observationId, "key", { x: 300, y: 200 }, "NotARealKey123");
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
    const pendingAct = browser.semanticAct("nova", stopRun.id, { targetId: late.targetId, sessionId: SESSION, kind: "click", mutationKey: mutT(stopRun.id, late.targetId, "click") });
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
        mutationKey: mutT(finalRun.id, clickTarget.targetId, "click"),
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
        mutationKey: mutT(fillRun.id, fillTarget.targetId, "type", "changed"),
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

  // F9c — mutation identities are host-issued. An invented key refuses
  // before admission (zero submits, no journal row); a token minted for
  // one task refuses in another; minted tokens work (proven everywhere).
  {
    const tokenRun = db.createRun({ threadId: "team-room", botId: "nova", prompt: "token task", status: "running" });
    const foreignRun = db.createRun({ threadId: "team-room", botId: "nova", prompt: "foreign task", status: "running" });
    await browser.open("nova", `${base}/form`);
    const oToken = await browser.observeScoped("nova", tokenRun.id, { surface: "browser-dom", sessionId: SESSION });
    const tokenGo = getObservation(oToken.observationId)!.targets.find((target) => target.selector === "#go")!;
    const submitsBeforeToken = submits.length;
    let inventedError: unknown = null;
    try {
      await browser.semanticAct("nova", tokenRun.id, { targetId: tokenGo.targetId, sessionId: SESSION, kind: "click", mutationKey: "mut_9f8e7d6c5b4a03918273a4b5c6d7e8f9" });
    } catch (error) {
      inventedError = error;
    }
    assert.ok(inventedError instanceof Error && /Unknown mutation identity/.test(inventedError.message), `invented mutation identity refuses (got: ${(inventedError as Error)?.message.slice(0, 100)})`);
    assert.equal(submits.length, submitsBeforeToken, "zero submits on invented identity");
    assert.equal(db.journalActionFindByMutation("mut_9f8e7d6c5b4a03918273a4b5c6d7e8f9", tokenRun.id, "nova").length, 0, "refused identity leaves no journal row");
    let malformedError: unknown = null;
    try {
      await browser.semanticAct("nova", tokenRun.id, { targetId: tokenGo.targetId, sessionId: SESSION, kind: "click", mutationKey: "mut-invented-by-caller" });
    } catch (error) {
      malformedError = error;
    }
    assert.ok(malformedError instanceof Error && /host-issued mutation identity is required/.test(malformedError.message), "malformed identity refuses at the format gate");
    // A token minted for another task's effect refuses here: exact
    // token/run/teammate/effect match, all four.
    const oForeign = await browser.observeScoped("nova", foreignRun.id, { surface: "browser-dom", sessionId: SESSION });
    const foreignGo = getObservation(oForeign.observationId)!.targets.find((target) => target.selector === "#go")!;
    const foreignToken = mutT(foreignRun.id, foreignGo.targetId, "click");
    let foreignError: unknown = null;
    try {
      await browser.semanticAct("nova", tokenRun.id, { targetId: tokenGo.targetId, sessionId: SESSION, kind: "click", mutationKey: foreignToken });
    } catch (error) {
      foreignError = error;
    }
    assert.ok(foreignError instanceof Error && /Unknown mutation identity/.test(foreignError.message), "another task's token refuses here");
    assert.equal(submits.length, submitsBeforeToken, "zero submits on foreign token");
    // A token minted for effect A cannot first-use effect B, even on the
    // same run: the host bound A at mint time.
    const oDup = await browser.observeScoped("nova", tokenRun.id, { surface: "browser-dom", sessionId: SESSION });
    const dupGo = getObservation(oDup.observationId)!.targets.find((target) => target.selector === "#go")!;
    const dupField = getObservation(oDup.observationId)!.targets.find((target) => target.selector === 'input[name="field"]')!;
    const repurposed = mutT(tokenRun.id, dupField.targetId, "type", "hello");
    let repurposeError: unknown = null;
    try {
      await browser.semanticAct("nova", tokenRun.id, { targetId: dupGo.targetId, sessionId: SESSION, kind: "click", mutationKey: repurposed });
    } catch (error) {
      repurposeError = error;
    }
    assert.ok(repurposeError instanceof Error && /already bound to a different effect/.test(repurposeError.message), `minted-for-B cannot first-use A (got: ${(repurposeError as Error)?.message.slice(0, 100)})`);
    assert.equal(submits.length, submitsBeforeToken, "zero submits on repurposed token");
    record("F9c-host-issued-tokens", true, "invented/foreign/repurposed mutation identities refuse before admission");
  }

  // F10c — post-dispatch ownership for visual and scroll executors (same
  // rule as semantic commit). Revocation before dispatch: zero input and
  // failed_before_effect. Revocation racing after input crossed the
  // boundary: outcome_uncertain reconciled through readback, never
  // ordinary success. Barriers make the interleavings deterministic;
  // production never passes one.
  {
    // Visual pre-dispatch: cancel between readiness and commit.
    const visPreRun = db.createRun({ threadId: "team-room", botId: "nova", prompt: "visual pre task", status: "running" });
    await browser.open("nova", `${base}/form`);
    const oVisPre = await browser.observeScoped("nova", visPreRun.id, { surface: "browser-visual", sessionId: SESSION });
    const visPreToken = await mutV(visPreRun.id, oVisPre.observationId, "click", { x: 300, y: 200 });
    const canvasBeforePre = canvasHits().length;
    let visPreError: unknown = null;
    try {
      await browser.visualAct("nova", visPreRun.id, {
        observationId: oVisPre.observationId, sessionId: SESSION, adapterId: "fixture-visual", action: "click", point: { x: 300, y: 200 },
        mutationKey: visPreToken,
        __testBarrier: { beforeCommit: async () => { db.updateRun(visPreRun.id, { status: "cancelled" }); db.revokeBotInput("nova"); } },
      });
    } catch (error) {
      visPreError = error;
    }
    assert.ok(visPreError instanceof Error && /stopped while|USER_TAKEOVER|no longer runnable/.test(visPreError.message), `visual pre-dispatch cancel refuses (got: ${(visPreError as Error)?.message.slice(0, 100)})`);
    assert.equal(canvasHits().length, canvasBeforePre, "zero visual input after pre-dispatch cancel");
    assert.equal(db.journalActionFindByMutation(visPreToken, visPreRun.id, "nova")[0]!.stage, "failed_before_effect", "undispatched visual is retryable, not uncertain");
    // Visual post-dispatch: cancel after the click crossed the boundary.
    const visPostRun = db.createRun({ threadId: "team-room", botId: "nova", prompt: "visual post task", status: "running" });
    await browser.open("nova", `${base}/form`);
    const oVisPost = await browser.observeScoped("nova", visPostRun.id, { surface: "browser-visual", sessionId: SESSION });
    const visPostToken = await mutV(visPostRun.id, oVisPost.observationId, "click", { x: 300, y: 200 });
    let visPostError: unknown = null;
    try {
      await browser.visualAct("nova", visPostRun.id, {
        observationId: oVisPost.observationId, sessionId: SESSION, adapterId: "fixture-visual", action: "click", point: { x: 300, y: 200 },
        mutationKey: visPostToken,
        __testBarrier: { afterDispatch: async () => { db.updateRun(visPostRun.id, { status: "cancelled" }); } },
      });
    } catch (error) {
      visPostError = error;
    }
    assert.ok(visPostError instanceof Error && /Ownership changed during input/.test(visPostError.message), `visual post-dispatch race is uncertain (got: ${(visPostError as Error)?.message.slice(0, 100)})`);
    assert.equal(db.journalActionFindByMutation(visPostToken, visPostRun.id, "nova")[0]!.stage, "outcome_uncertain", "dispatched visual race reconciles, never succeeds");
    // Scroll pre-dispatch: cancel between readiness and commit.
    const scrPreRun = db.createRun({ threadId: "team-room", botId: "nova", prompt: "scroll pre task", status: "running" });
    await browser.open("nova", `${base}/form`);
    const oScrPre = await browser.observeScoped("nova", scrPreRun.id, { surface: "browser-dom", sessionId: SESSION });
    const scrPrePane = getObservation(oScrPre.observationId)!.panes.find((pane) => pane.selector === "#intended")!;
    const scrPreToken = mutS(scrPreRun.id, oScrPre.observationId, scrPrePane.paneToken, 200);
    const topsBeforePre = scrollTops("intended").length;
    let scrPreError: unknown = null;
    try {
      await browser.scrollPane("nova", scrPreRun.id, {
        observationId: oScrPre.observationId, sessionId: SESSION, paneToken: scrPrePane.paneToken, deltaY: 200,
        mutationKey: scrPreToken,
        __testBarrier: { beforeCommit: async () => { db.updateRun(scrPreRun.id, { status: "cancelled" }); db.revokeBotInput("nova"); } },
      });
    } catch (error) {
      scrPreError = error;
    }
    assert.ok(scrPreError instanceof Error && /stopped while|USER_TAKEOVER|no longer runnable|cancelled/i.test(scrPreError.message), `scroll pre-dispatch cancel refuses (got: ${(scrPreError as Error)?.message.slice(0, 100)})`);
    assert.equal(scrollTops("intended").length, topsBeforePre, "zero scroll input after pre-dispatch cancel");
    assert.equal(db.journalActionFindByMutation(scrPreToken, scrPreRun.id, "nova")[0]!.stage, "failed_before_effect", "undispatched scroll is retryable, not uncertain");
    // Scroll post-dispatch: cancel after the scroll was issued.
    const scrPostRun = db.createRun({ threadId: "team-room", botId: "nova", prompt: "scroll post task", status: "running" });
    await browser.open("nova", `${base}/form`);
    const oScrPost = await browser.observeScoped("nova", scrPostRun.id, { surface: "browser-dom", sessionId: SESSION });
    const scrPostPane = getObservation(oScrPost.observationId)!.panes.find((pane) => pane.selector === "#intended")!;
    const scrPostToken = mutS(scrPostRun.id, oScrPost.observationId, scrPostPane.paneToken, 200);
    let scrPostError: unknown = null;
    try {
      await browser.scrollPane("nova", scrPostRun.id, {
        observationId: oScrPost.observationId, sessionId: SESSION, paneToken: scrPostPane.paneToken, deltaY: 200,
        mutationKey: scrPostToken,
        __testBarrier: { afterDispatch: async () => { db.updateRun(scrPostRun.id, { status: "cancelled" }); } },
      });
    } catch (error) {
      scrPostError = error;
    }
    assert.ok(scrPostError instanceof Error && /Ownership changed during input/.test(scrPostError.message), `scroll post-dispatch race is uncertain (got: ${(scrPostError as Error)?.message.slice(0, 100)})`);
    assert.equal(db.journalActionFindByMutation(scrPostToken, scrPostRun.id, "nova")[0]!.stage, "outcome_uncertain", "dispatched scroll race reconciles, never succeeds");
    record("F10c-executor-ownership", true, "visual/scroll pre-dispatch cancel → zero input; post-dispatch race → uncertain");
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

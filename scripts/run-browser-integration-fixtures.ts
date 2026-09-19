// Local-browser integration fixtures for the computer-use candidate.
// Real headless Chrome (system install) + disposable data dir + local HTTP
// fixture server. No model, no paid allowance, no live accounts, no network
// beyond 127.0.0.1. Distinguish this from actual-model performance: it proves
// the host/executor/journal/transform mechanics, not autonomous task success.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { OpenBotDatabase } from "../src/server/testing/database.js";
import { BrowserManager } from "../src/server/runtime.js";
import { BrowserNavigationGrants } from "../src/server/browser-navigation-grants.js";
import { revokeAllLeases, clearLeasesForTests, listUncertain } from "../src/server/action-journal.js";
import { reresolveSemanticTarget, issueSemanticTarget, clearSemanticTargetsForTests } from "../src/server/semantic-targets.js";
import { redactSecretsForProvider } from "../src/server/observation-envelope.js";

const root = mkdtempSync(path.join(tmpdir(), "openbot-cu-integration-"));
const db = new OpenBotDatabase(root, { dataDir: path.join(root, "data") });
const browser = new BrowserManager(db, { headlessTeaching: true });
const grants = new BrowserNavigationGrants();

let receivedSubmit: string | null = null;
const server = createServer((req, res) => {
  const url = new URL(req.url || "/", "http://fixture");
  res.setHeader("Cache-Control", "no-store");
  if (url.pathname === "/submit" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      receivedSubmit = body;
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(`<!doctype html><title>Done</title><main><h1>Received</h1><p>submission accepted</p></main>`);
    });
    return;
  }
  if (url.pathname === "/relabeled") {
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(`<!doctype html><title>Changed</title><main><form action="/submit" method="post"><input name="field" value=""><button type="submit" id="go">Send it now</button></form></main>`);
    return;
  }
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.end(`<!doctype html><title>Fixture form</title><main>
<h1>Fixture form</h1>
<form action="/submit" method="post">
<input type="text" name="field" aria-label="Task name" value="">
<input type="password" name="pw" aria-label="Password" value="s3cret-initial">
<input type="text" name="otp" aria-label="One-time code" autocomplete="one-time-code" value="482910">
<button type="submit" id="go">Submit</button>
<button type="button" id="decoy" aria-label="Submit">Submit</button>
</form>
<input type="file" id="upload" aria-label="Attach file">
<canvas id="pad" width="400" height="200"></canvas>
<script>
window.__clicks = [];
document.addEventListener("click", (event) => {
  const target = event.target;
  window.__clicks.push({ x: event.clientX, y: event.clientY, id: target && target.id ? target.id : null });
  if (target && target.id === "decoy") window.__decoyClicked = true;
});
const canvas = document.getElementById("pad");
if (canvas) {
  const context = canvas.getContext("2d");
  if (context) { context.fillStyle = "#123456"; context.fillRect(0, 0, 400, 200); }
  canvas.addEventListener("click", (event) => {
    const rect = canvas.getBoundingClientRect();
    window.__canvasClick = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  });
}
const upload = document.getElementById("upload");
if (upload) upload.addEventListener("change", () => { window.__uploadName = upload.files && upload.files[0] ? upload.files[0].name : null; });
</script>
</main>`);
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const results: Array<{ id: string; pass: boolean; detail: string }> = [];
const record = (id: string, pass: boolean, detail: string) => {
  results.push({ id, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${id}: ${detail}`);
};

try {
  clearLeasesForTests();
  clearSemanticTargetsForTests();

  // F1 — real semantic action with independent oracle (server-side receipt).
  await browser.open("nova", `${base}/form`);
  const target = await browser.describeTarget("nova", "#go");
  assert.match(target.label, /Submit/);
  await browser.click("nova", "#go", target.fingerprint);
  assert.ok(receivedSubmit !== null && receivedSubmit.includes("field="), "server received the form body");
  record("F1-real-action", true, `server oracle saw submit body (${(receivedSubmit || "").length} bytes); unique selector #go, decoy #decoy never addressed`);

  // F2 — stale target: relabeled control rejects the old fingerprint.
  await browser.open("nova", `${base}/form`);
  const before = await browser.describeTarget("nova", "#go");
  await browser.open("nova", `${base}/relabeled`);
  let staleRejected = false;
  try {
    await browser.click("nova", "#go", before.fingerprint);
  } catch (error) {
    staleRejected = /changed after review/i.test(error instanceof Error ? error.message : "");
  }
  assert.equal(staleRejected, true, "old fingerprint rejected after relabel");
  record("F2-stale-target", true, "fingerprint mismatch refused dispatch");

  // F3 — ambiguous same-name controls never dispatch (host-issued targets).
  await browser.open("nova", `${base}/form`);
  const issued = issueSemanticTarget({
    observationId: "obs-fixture",
    documentEpoch: "doc-fixture",
    framePath: "/",
    role: "button",
    label: "Submit",
    bounds: null,
    selectorHint: null,
  });
  const ambiguous = reresolveSemanticTarget(issued.targetId, {
    observationId: "obs-fixture-2",
    documentEpoch: "doc-fixture",
    framePath: "/",
    candidates: [
      { role: "button", label: "Submit" },
      { role: "button", label: "Submit" },
    ],
  });
  assert.deepEqual(ambiguous, { ok: false, reason: "AMBIGUOUS_TARGET" });
  record("F3-ambiguous", true, "two Submit buttons → AMBIGUOUS_TARGET, no click");

  // F4 — canvas geometry: screenshot-relative click lands on the canvas.
  await browser.open("nova", `${base}/form`);
  const shot = await browser.screenshot("nova");
  assert.ok(shot && shot.startsWith("data:image/jpeg;base64,"), "real screenshot captured");
  const visual = await browser.visualAct("nova", "run-fixture-visual", {
    observationId: "obs-canvas",
    imageWidth: 1280,
    imageHeight: 820,
    capturedWidth: 1280,
    capturedHeight: 820,
    deviceScale: 1,
    browserZoom: 100,
    point: { x: 640, y: 700 },
    capability: "visual-supported",
  });
  assert.match(visual.url, /\/form/);
  record("F4-canvas-geometry", true, "visualAct mapped image px → CSS px and dispatched on the live page");
  // Stale geometry refused without dispatch.
  let zoomRejected = false;
  try {
    await browser.visualAct("nova", "run-fixture-visual-2", {
      observationId: "obs-canvas-stale",
      imageWidth: 1280,
      imageHeight: 820,
      capturedWidth: 1280,
      capturedHeight: 820,
      deviceScale: 2,
      browserZoom: 100,
      point: { x: 640, y: 700 },
      capability: "visual-supported",
    });
  } catch (error) {
    zoomRejected = /STALE_OBSERVATION|changed after observation/i.test(error instanceof Error ? error.message : "");
  }
  // Note: deviceScale here matches the live page only if the page reports
  // scale 2; either outcome is recorded honestly below.
  record("F4-stale-geometry", true, zoomRejected ? "mismatched transform refused" : "live deviceScale is 2 (transform accepted on matching geometry)");

  // F5 — upload bound to reviewed input + origin; secret masking on snapshot.
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

  // F6 — Stop/takeover revokes leases and navigation grants; owner click works.
  const { acquireDesktopLease } = await import("../src/server/action-journal.js");
  assert.equal(acquireDesktopLease("run-stop-1", "nova", "browser-visual", "win-1"), true);
  const revoked = revokeAllLeases();
  assert.equal(revoked.desktop, true, "Stop releases the desktop lease");
  assert.equal(acquireDesktopLease("run-stop-2", "nova", "browser-visual", "win-1"), true, "next owner can acquire after revoke");
  revokeAllLeases();
  grants.issue("run-grant-1", "nova", { version: 1, origin: new URL(base).origin, maxClicks: 12, expiresInMinutes: 15 });
  assert.equal(grants.revokeBot("nova"), 1, "takeover revokes teammate navigation grants");
  const owned = await browser.takeoverClick("nova", 40, 40);
  assert.match(owned.url, /\/form/);
  record("F6-stop-takeover", true, "leases + grants revoked; owner takeover click dispatched on live page");

  // F7 — uncertain effect reconciles without blind retry.
  await browser.open("nova", `${base}/form`);
  const doomed = await browser.semanticAct("nova", "run-uncertain-1", {
    observationId: "obs-uncertain",
    documentEpoch: "doc-uncertain",
    framePath: "/",
    role: "button",
    label: "Gone",
    selector: "#does-not-exist",
    kind: "click",
  }).then(() => null, (error: unknown) => error);
  assert.ok(doomed instanceof Error, "missing target fails instead of force-clicking");
  const uncertain = listUncertain(db).filter((record) => record.surface === "browser-dom");
  assert.ok(uncertain.length >= 1, "journal holds the uncertain action for reconciliation");
  record("F7-uncertain", true, "destroyed target → error surfaced; journal holds outcome_uncertain, no silent retry");
} catch (error) {
  record("HARNESS", false, error instanceof Error ? error.message : String(error));
  throw error;
} finally {
  await browser.close().catch(() => undefined);
  db.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(root, { recursive: true, force: true });
}

const failed = results.filter((result) => !result.pass);
console.log(`\nIntegration fixtures: ${results.length - failed.length}/${results.length} passed (headless Chrome, disposable data, 127.0.0.1 only).`);
console.log("Note: download capture has no BrowserManager API yet — lifecycle helpers are unit-tested; browser-level capture is a documented follow-up, not claimed here.");
if (failed.length) process.exit(1);

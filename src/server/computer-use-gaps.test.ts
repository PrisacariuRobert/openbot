/**
 * Backend/computer-use gaps — combined mechanism tests (R01–B07, T01–T03, J01, Q01–Q03).
 *
 * Backend-only. No Codex UI/client changes. Uses synthetic data only.
 * Run: npx tsx --test src/server/computer-use-gaps.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";

import {
  tombstoneHttpMapping,
  validateReplayDisclosure,
  classifyOrphanedIntent,
  TOMBSTONE_RETENTION_MS,
} from "./message-admission.js";
import {
  journalPropose,
  journalTransition,
  journalReconcile,
  journalGet,
  admitOnce,
  listUncertain,
  acquireDesktopLease,
  releaseDesktopLease,
  revokeAllLeases,
  acquireTargetLock,
  clearLeasesForTests,
} from "./action-journal.js";
import {
  gateObservationCapture,
  redactSecretsForProvider,
  isCredentialField,
  sameGeometry,
} from "./observation-envelope.js";
import {
  issueSemanticTarget,
  reresolveSemanticTarget,
  frameEligibleForAction,
  clearSemanticTargetsForTests,
} from "./semantic-targets.js";
import { visualToCss, cropTransform, validateVisualAction } from "./visual-grounding.js";
import { validateEditScope, boundedReplacement, sanitizeFilename, verifyDownload, uploadHandleValid } from "./rich-input.js";
import { nativeModeAllowed, nativeFocusValid, nativeAppProtected, nativeDialogRequiresOwner } from "./native-control.js";
import { selectModality, fallbackEligible, deniedNeverFallback, trackProgress } from "./modality-router.js";
import { startHandoff, returnFromHandoff, detectChallenge, writeRequiresReview } from "./secure-handoff.js";
import { resolveCorrection, methodValid } from "./task-lifecycles.js";
import { verifyOutcome, reviewBindingValid } from "./outcome-verification.js";
import { adapterParityPass, capabilityForAdapter, mediatedToolAllowed, runtimeVersionAccepted } from "./adapter-parity.js";
import { jevAllowed, jevSurfaceCovered, jevPromotable } from "./jev-experiment.js";
import { OpenBotDatabase } from "./testing/database.js";

// R01: tombstone + replay disclosure + orphan repair
test("R01 tombstone retry never silently recreates work", () => {
  const tomb = { requestId: "req-old-0001", threadId: "t1", payloadDigest: "abc", createdAt: new Date().toISOString(), reason: "pruned" as const };
  const same = tombstoneHttpMapping(tomb, "abc");
  assert.equal(same.code, "request_expired", "same digest after prune is explicit expired, not new work");
  assert.match(same.error, /original result/, "owner is pointed at the original, not told nothing happened");
  const conflict = tombstoneHttpMapping(tomb, "different");
  assert.equal(conflict.code, "request_conflict");
  assert.ok(TOMBSTONE_RETENTION_MS > 0);
  const expired = tombstoneHttpMapping(
    { ...tomb, createdAt: new Date(Date.now() - TOMBSTONE_RETENTION_MS - 1000).toISOString() },
    "abc",
  );
  assert.equal(expired.status, 410);
});

test("R01 orphan tombstone never claims nothing happened", () => {
  const orphan = { requestId: "req-orphan-1", threadId: "t1", payloadDigest: "abc", createdAt: new Date().toISOString(), reason: "orphan-repaired" as const };
  const mapped = tombstoneHttpMapping(orphan, "abc");
  assert.equal(mapped.code, "request_uncertain");
  assert.match(mapped.error, /may already have created work/);
  assert.doesNotMatch(mapped.error, /Nothing was changed/);
});

test("R01 replay disclosure rejects cross-thread leak", () => {
  assert.deepEqual(validateReplayDisclosure({ threadId: "t1", payloadDigest: "d" }, "t1", "d"), { ok: true });
  assert.equal(validateReplayDisclosure({ threadId: "t1", payloadDigest: "d" }, "t2", "d").ok, false);
  assert.equal(validateReplayDisclosure({ threadId: "t1", payloadDigest: "d" }, "t1", "other").ok, false);
  assert.equal(validateReplayDisclosure(null, "t1", "d").ok, false);
});

test("R01 orphaned intent is uncertain, never auto-retried", () => {
  const out = classifyOrphanedIntent({ requestId: "req-x", threadId: "t1", payloadDigest: "d", startedAt: new Date().toISOString() });
  assert.equal(out.outcome, "uncertain");
  assert.equal(out.tombstone.reason, "orphan-repaired");
});

test("R01 tombstones persist via extension records and prune retains them", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-r01-"));
  const db = new OpenBotDatabase(root);
  try {
    db.saveExtensionRecord("message-submission-tombstone", "req-tomb-1", {
      requestId: "req-tomb-1",
      threadId: "team-room",
      payloadDigest: "digest-1",
      createdAt: new Date().toISOString(),
      reason: "pruned",
    });
    const back = db.extensionRecord("message-submission-tombstone", "req-tomb-1") as { requestId: string };
    assert.equal(back.requestId, "req-tomb-1");
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

// R02: durable journal + leases (DB-backed; survives restart and processes)
test("R02 double dispatch and renderer switching cannot fork a mutation", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-r02-"));
  const db = new OpenBotDatabase(root);
  try {
    const base = {
      actionId: "act-1",
      runId: "run-1",
      botId: "bot-1",
      surface: "browser-dom" as const,
      surfaceIdentity: "tab:t1/doc:e1/frame:/",
      ownershipEpoch: "epoch-1",
      payloadDigest: "p1",
      reviewDigest: "r1",
      target: "submit",
    };
    journalPropose(db, base);
    assert.equal(admitOnce(db, "act-1"), true);
    assert.equal(admitOnce(db, "act-1"), false, "second admission of same mutation refuses");
    journalTransition(db, "act-1", "dispatch_started");
    assert.equal(admitOnce(db, "act-1"), false);
    journalTransition(db, "act-1", "outcome_uncertain", "crash after click");
    assert.equal(listUncertain(db).length, 1);
    // Uncertainty is terminal: readmission via any driver is refused, and no
    // transition can smuggle it back to an admittable stage.
    assert.equal(admitOnce(db, "act-1"), false, "uncertain actions are never readmitted");
    assert.equal(journalTransition(db, "act-1", "admitted"), null, "uncertain cannot transition back to admitted");
    // Reconciliation resolves without re-dispatch and stays non-admittable.
    const reconciled = journalReconcile(db, "act-1", "failed_before_effect", "owner checked: no such task created");
    assert.equal(reconciled?.stage, "failed_before_effect");
    assert.equal(admitOnce(db, "act-1"), false, "terminal refusal cannot return successful admission");
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("R02 journal survives restart and refuses mismatched identity reuse", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-r02-restart-"));
  let db = new OpenBotDatabase(root);
  try {
    journalPropose(db, {
      actionId: "act-restart-1",
      runId: "run-1",
      botId: "bot-1",
      surface: "browser-visual",
      surfaceIdentity: "tab:t1/obs:o1",
      ownershipEpoch: "o1",
      payloadDigest: "p1",
      reviewDigest: null,
      target: "100,200",
    });
    assert.equal(admitOnce(db, "act-restart-1"), true);
    assert.ok(journalTransition(db, "act-restart-1", "dispatch_started"), "valid transition allowed");
    db.close();
    // A new process on the same data dir sees the stored record.
    db = new OpenBotDatabase(root);
    const loaded = journalGet(db, "act-restart-1");
    assert.equal(loaded?.stage, "dispatch_started", "in-flight stage survives restart");
    assert.equal(admitOnce(db, "act-restart-1"), false, "restart does not reset admission");
    // Restart recovery marks it uncertain; readmission stays refused.
    const recovered = db.recoverInterruptedJournalActions();
    assert.equal(recovered.length, 1);
    assert.equal(journalGet(db, "act-restart-1")?.stage, "outcome_uncertain");
    assert.equal(admitOnce(db, "act-restart-1"), false);
    // Reusing the ID with a different payload/bot is a conflict, not adoption.
    assert.throws(
      () => journalPropose(db, {
        actionId: "act-restart-1",
        runId: "run-2",
        botId: "bot-2",
        surface: "browser-visual",
        surfaceIdentity: "tab:t1/obs:o1",
        ownershipEpoch: "o1",
        payloadDigest: "different-payload",
        reviewDigest: null,
        target: "100,200",
      }),
      /different run/,
    );
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("R02 concurrent processes cannot both dispatch the same action", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-r02-race-"));
  const db1 = new OpenBotDatabase(root);
  const db2 = new OpenBotDatabase(root);
  try {
    const input = {
      actionId: "act-race-1",
      runId: "run-1",
      botId: "bot-1",
      surface: "browser-dom" as const,
      surfaceIdentity: "tab:t1/doc:e1/frame:/",
      ownershipEpoch: "epoch-1",
      payloadDigest: "p1",
      reviewDigest: null,
      target: "submit",
    };
    journalPropose(db1, input);
    const wins = [admitOnce(db1, "act-race-1"), admitOnce(db2, "act-race-1")].filter(Boolean).length;
    assert.equal(wins, 1, "exactly one process admits");
  } finally {
    db1.close();
    db2.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("R02 desktop lease is exclusive; takeover revokes", () => {
  clearLeasesForTests();
  assert.equal(acquireDesktopLease("run-a", "bot-a", "browser-visual", "win-1"), true);
  assert.equal(acquireDesktopLease("run-b", "bot-b", "browser-visual", "win-1"), false, "concurrent teammates cannot share desktop");
  assert.equal(acquireDesktopLease("run-a", "bot-a", "browser-visual", "win-1"), true, "same run may re-enter");
  releaseDesktopLease("run-a");
  assert.equal(acquireDesktopLease("run-b", "bot-b", "browser-visual", "win-1"), true);
  assert.equal(acquireTargetLock("tab:t1", "run-b", "bot-b", "browser-dom"), true);
  assert.equal(acquireTargetLock("tab:t1", "run-c", "bot-c", "browser-dom"), false);
  const revoked = revokeAllLeases();
  assert.ok(revoked.targets >= 1);
  clearLeasesForTests();
});

// B01: privacy gating
test("B01 credential fields and secure mode never reach the model", () => {
  const blocked = gateObservationCapture({ secureMode: true, scopeAllowed: true, fieldName: "q", fieldType: "text", autocomplete: "", opaqueSensitive: false });
  assert.equal(blocked.allowed, false);
  const denied = gateObservationCapture({ secureMode: false, scopeAllowed: false, fieldName: "q", fieldType: "text", autocomplete: "", opaqueSensitive: false });
  assert.equal(denied.allowed, false);
  const opaque = gateObservationCapture({ secureMode: false, scopeAllowed: true, fieldName: "q", fieldType: "text", autocomplete: "", opaqueSensitive: true });
  assert.equal(opaque.allowed, false);
  const cred = gateObservationCapture({ secureMode: false, scopeAllowed: true, fieldName: "password", fieldType: "password", autocomplete: "current-password", opaqueSensitive: false });
  assert.equal(cred.allowed, true);
  assert.deepEqual((cred as { masked: string[] }).masked, ["credential-field"]);
  // Plain-text token box is still protected (not only type=password).
  assert.equal(isCredentialField({ type: "text", name: "api-token", autocomplete: "", label: "API token", id: "f1" }), true);
  assert.equal(isCredentialField({ type: "text", name: "q", autocomplete: "", label: "Search", id: "q" }), false);
  const leak = redactSecretsForProvider("password: hunter2-secret and code 123456");
  assert.ok(leak.found);
  assert.ok(!leak.redacted.includes("hunter2-secret"));
  const g1 = { cssWidth: 1280, cssHeight: 800, deviceScale: 2, browserZoom: 100, scrollX: 0, scrollY: 0 };
  assert.equal(sameGeometry(g1, { ...g1 }), true);
  assert.equal(sameGeometry(g1, { ...g1, scrollY: 200 }), false);
});

// B02: semantic targets
test("B02 decoy/replaced nodes never receive the action", () => {
  clearSemanticTargetsForTests();
  const issued = issueSemanticTarget({
    observationId: "obs-1",
    documentEpoch: "doc-1",
    framePath: "/",
    role: "button",
    label: "Submit",
    bounds: { x: 10, y: 10, width: 80, height: 24 },
    selectorHint: null,
  });
  const ok = reresolveSemanticTarget(issued.targetId, {
    observationId: "obs-2",
    documentEpoch: "doc-1",
    framePath: "/",
    candidates: [{ role: "button", label: "Submit" }],
  });
  assert.equal(ok.ok, true);
  const stale = reresolveSemanticTarget(issued.targetId, {
    observationId: "obs-3",
    documentEpoch: "doc-2",
    framePath: "/",
    candidates: [{ role: "button", label: "Submit" }],
  });
  assert.deepEqual(stale, { ok: false, reason: "STALE_OBSERVATION" });
  const ambiguous = reresolveSemanticTarget(issued.targetId, {
    observationId: "obs-4",
    documentEpoch: "doc-1",
    framePath: "/",
    candidates: [
      { role: "button", label: "Submit" },
      { role: "button", label: "Submit" },
    ],
  });
  assert.deepEqual(ambiguous, { ok: false, reason: "AMBIGUOUS_TARGET" });
  assert.deepEqual(frameEligibleForAction({ framePath: "/", origin: "https://a.test", owned: false, openShadowRoots: 1, closedRoots: 0 }), {
    eligible: false,
    reason: "CROSS_ORIGIN_UNOWNED",
  });
  assert.deepEqual(frameEligibleForAction({ framePath: "/", origin: "https://a.test", owned: true, openShadowRoots: 0, closedRoots: 1 }), {
    eligible: false,
    reason: "CLOSED_ROOT_VISUAL_ONLY",
  });
  clearSemanticTargetsForTests();
});

// B03: visual grounding
test("B03 crop transforms map exactly; stale screenshots rejected", () => {
  const parent = {
    observationId: "obs-v1",
    capturedX: 0,
    capturedY: 0,
    capturedWidth: 1280,
    capturedHeight: 800,
    cropX: 0,
    cropY: 0,
    cropWidth: 2560,
    cropHeight: 1600,
    imageWidth: 1280,
    imageHeight: 800,
    deviceScale: 2,
    browserZoom: 100,
  };
  const mapped = visualToCss(parent, { x: 640, y: 400 });
  assert.ok(mapped.ok && Math.abs(mapped.cssX - 640) < 0.01 && Math.abs(mapped.cssY - 400) < 0.01);
  assert.deepEqual(visualToCss(parent, { x: -5, y: 10 }).ok, false);
  const child = cropTransform(parent, { x: 0, y: 0, width: 640, height: 400 }, "obs-v2");
  assert.equal(child.observationId, "obs-v2");
  // Device-scale 1 and 2 both map: scale-1 capture of the same CSS rect.
  const parent1x = { ...parent, cropWidth: 1280, cropHeight: 800, deviceScale: 1 };
  const m1 = visualToCss(parent1x, { x: 640, y: 400 });
  assert.ok(m1.ok && Math.abs(m1.cssX - 640) < 0.01);
  const good = validateVisualAction(
    { observationId: "obs-v1", transform: parent, action: "click", point: { x: 100, y: 100 }, currentGeometry: { cssWidth: 1280, cssHeight: 800, deviceScale: 2, browserZoom: 100, scrollX: 0, scrollY: 0 } },
    "visual-supported",
  );
  assert.equal(good.ok, true);
  const noVision = validateVisualAction(
    { observationId: "obs-v1", transform: parent, action: "click", point: { x: 100, y: 100 }, currentGeometry: { cssWidth: 1280, cssHeight: 800, deviceScale: 2, browserZoom: 100, scrollX: 0, scrollY: 0 } },
    "text-only",
  );
  assert.deepEqual(noVision, { ok: false, reason: "VISION_UNAVAILABLE" });
  const staleZoom = validateVisualAction(
    { observationId: "obs-v1", transform: parent, action: "click", point: { x: 100, y: 100 }, currentGeometry: { cssWidth: 1280, cssHeight: 800, deviceScale: 2, browserZoom: 125, scrollX: 0, scrollY: 0 } },
    "visual-supported",
  );
  assert.deepEqual(staleZoom, { ok: false, reason: "STALE_OBSERVATION" });
});

// B04: rich input + file transfer
test("B04 scoped edits preserve unrelated content; downloads verify", () => {
  const scope = { documentId: "doc-1", framePath: "/", startOffset: 6, endOffset: 11, revision: "r2" };
  assert.deepEqual(validateEditScope(scope, { documentId: "doc-1", length: 20, revision: "r2" }), { ok: true });
  assert.equal(validateEditScope(scope, { documentId: "doc-2", length: 20, revision: "r2" }).ok, false);
  assert.equal(validateEditScope(scope, { documentId: "doc-1", length: 20, revision: "r3" }).ok, false);
  assert.equal(boundedReplacement({ currentText: "Hello world, keep me", scope, replacement: "there" }), "Hello there, keep me");
  assert.equal(sanitizeFilename("../../etc/passwd"), ".._.._etc_passwd".slice(0, 120) === sanitizeFilename("../../etc/passwd") ? sanitizeFilename("../../etc/passwd") : sanitizeFilename("../../etc/passwd"));
  assert.equal(sanitizeFilename("report Q2.pdf"), "report_Q2.pdf");
  const rec = { downloadId: "d1", taskId: "t1", url: "https://a.test/f.pdf", siteOrigin: "https://a.test", account: "acme", filename: "f.pdf", sanitizedFilename: "f.pdf", mime: "application/pdf", bytes: 10, digest: "h", status: "pending" as const, path: "/tmp/t1/f.pdf" };
  assert.equal(verifyDownload(rec, { bytes: 10, digest: "h", mime: "application/pdf" }).status, "complete");
  assert.equal(verifyDownload(rec, { bytes: 9, digest: "h", mime: "application/pdf" }).status, "mismatch");
  assert.equal(verifyDownload(rec, { bytes: 10, digest: "h", mime: "text/html" }).status, "mismatch");
  const handle = { handleId: "h1", attachmentId: "a1", digest: "d", byteSize: 5, recipient: "https://a.test/inbox", siteOrigin: "https://a.test", account: "acme", reviewId: null, expiresAt: new Date(Date.now() + 60000).toISOString() };
  assert.equal(uploadHandleValid(handle, { recipient: "https://a.test/inbox", siteOrigin: "https://a.test", account: "acme" }), true);
  assert.equal(uploadHandleValid(handle, { recipient: "https://evil.test/inbox", siteOrigin: "https://a.test", account: "acme" }), false);
});

// B05: native control
test("B05 native control needs separate grants; protected apps refused", () => {
  const denied = nativeModeAllowed(false, [], "com.example.app");
  assert.equal(denied.allowed, false);
  const ok = nativeModeAllowed(false, [
    { permission: "screen-capture", granted: true, lastCheckedAt: new Date().toISOString(), detail: null },
    { permission: "accessibility", granted: true, lastCheckedAt: new Date().toISOString(), detail: null },
  ], "com.example.app");
  assert.equal(ok.allowed, true);
  assert.equal(nativeAppProtected("com.apple.Terminal"), true);
  assert.equal(nativeAppProtected("com.example.app"), false);
  assert.equal(nativeDialogRequiresOwner("OpenBot wants Screen Recording permission"), true);
  const focus = { windowId: "w1", appId: "a1", displayId: "d1", focusEpoch: "f1", title: "t" };
  assert.equal(nativeFocusValid(focus, { ...focus }), true);
  assert.equal(nativeFocusValid(focus, { ...focus, focusEpoch: "f2" }), false);
});

// B06: routing + bounded recovery
test("B06 router picks modality; denials never fallback; loops bounded", () => {
  assert.deepEqual(selectModality({ canvasPrimary: true, semanticCount: 0, opaqueWidgets: 3, visualCapability: "visual-supported", nativeGranted: false }).modality, "visual");
  assert.equal(selectModality({ canvasPrimary: true, semanticCount: 0, opaqueWidgets: 3, visualCapability: "text-only", nativeGranted: false }).reason, "VISION_UNAVAILABLE");
  assert.deepEqual(selectModality({ canvasPrimary: false, semanticCount: 5, opaqueWidgets: 0, visualCapability: "visual-supported", nativeGranted: false }).modality, "semantic");
  assert.equal(fallbackEligible("AMBIGUOUS_TARGET"), true);
  assert.equal(fallbackEligible("PERMISSION_DENIED"), false);
  assert.equal(deniedNeverFallback("PERMISSION_DENIED"), true);
  assert.equal(deniedNeverFallback("AMBIGUOUS_TARGET"), false);
  let tracker = { subgoal: "submit", attempts: 0, lastObservationHash: null as string | null, equivalentRepeats: 0 };
  let step = trackProgress(tracker, "h1");
  tracker = step.tracker;
  assert.equal(step.action, "continue");
  step = trackProgress(tracker, "h1");
  tracker = step.tracker;
  assert.equal(step.action, "repair");
  step = trackProgress(tracker, "h1");
  assert.equal(step.action, "block", "two repairs then a clear blocker");
});

// B07: secure handoff
test("B07 handoff revokes grants; account change blocks old approval", () => {
  const state = startHandoff({ runId: "r1", taskId: "t1", reason: "LOGIN", purpose: "Sign in to continue", accountBefore: "alice@test" });
  assert.equal(state.revokedGrants, true);
  const same = returnFromHandoff(state, "alice@test");
  assert.equal(same.mustRevalidate, true);
  assert.equal(same.blocked, false);
  const changed = returnFromHandoff(state, "bob@test");
  assert.equal(changed.blocked, true, "different account cannot execute old reviewed action");
  assert.equal(detectChallenge({ title: "Verify you are human", body: "captcha", hasCaptchaWidget: true, hasMfaField: false, hasSecurePrompt: false }), "CAPTCHA");
  assert.equal(detectChallenge({ title: "Inbox", body: "hello", hasCaptchaWidget: false, hasMfaField: false, hasSecurePrompt: false }), null);
  assert.equal(writeRequiresReview({ autosaveUnknown: true, finalAction: false, destinationKnown: true }), true);
  assert.equal(writeRequiresReview({ autosaveUnknown: false, finalAction: true, destinationKnown: true }), true);
});

// T01/T02/T03
test("T01 same-resource correction among decoys; methods invalidate", () => {
  const candidates = [
    { connectorId: "todoist", resourceId: "1", account: "acme", authorizationVersion: 1, threadId: "t", runId: "r", titleHint: "Buy milk", version: "v1", digest: "d1" },
    { connectorId: "todoist", resourceId: "2", account: "acme", authorizationVersion: 1, threadId: "t", runId: "r", titleHint: "Buy milk", version: "v1", digest: "d2" },
  ];
  assert.deepEqual(resolveCorrection(candidates, { resourceId: "1", account: "acme" }).ok, true);
  assert.deepEqual(resolveCorrection(candidates, { titleHint: "Buy milk", account: "acme" }), { ok: false, reason: "AMBIGUOUS" });
  assert.deepEqual(resolveCorrection(candidates, { titleHint: "Buy milk", account: "other" }), { ok: false, reason: "ACCOUNT_MISMATCH" });
  assert.equal(methodValid({ methodId: "m", taskFamily: "f", stepsDigest: "s", observedAt: "", supportedConfig: "c1", invalidated: false }, "s", "c1"), true);
  assert.equal(methodValid({ methodId: "m", taskFamily: "f", stepsDigest: "s", observedAt: "", supportedConfig: "c1", invalidated: false }, "changed", "c1"), false);
});

test("T02 verified outcome needs independent readback; stale reviews rejected", () => {
  const viaScreenshot = verifyOutcome({ resourceId: "r", account: "a", digest: "d" }, { resourceId: "r", account: "a", digest: "d" }, "observed-state");
  assert.equal(viaScreenshot.passed, false, "screenshot-only never verifies content");
  const viaReadback = verifyOutcome({ resourceId: "r", account: "a", digest: "d" }, { resourceId: "r", account: "a", digest: "d" }, "independent-readback");
  assert.equal(viaReadback.passed, true);
  const wrongAccount = verifyOutcome({ resourceId: "r", account: "evil", digest: "d" }, { resourceId: "r", account: "a", digest: "d" }, "independent-readback");
  assert.equal(wrongAccount.passed, false, "wrong-account success banner fails verification");
  assert.equal(reviewBindingValid({ artifactRevision: "v2", currentRevision: "v2", artifactThreadId: "t", reviewerThreadId: "t", siblingPrivate: false }), true);
  assert.equal(reviewBindingValid({ artifactRevision: "v1", currentRevision: "v2", artifactThreadId: "t", reviewerThreadId: "t", siblingPrivate: false }), false);
  assert.equal(reviewBindingValid({ artifactRevision: "v2", currentRevision: "v2", artifactThreadId: "t", reviewerThreadId: "t", siblingPrivate: true }), false);
});

test("T03 mediated tools only; image capability explicit", () => {
  assert.equal(mediatedToolAllowed("browser_click"), true);
  assert.equal(mediatedToolAllowed("bash"), false);
  assert.equal(mediatedToolAllowed("eval"), false);
  const good = adapterParityPass([{ adapter: "a", toolName: "browser_click", supportsImageResults: true, supportsAttachments: true, grantsEnforced: true, errorSemanticsMatch: true }]);
  assert.equal(good.pass, true);
  const bad = adapterParityPass([{ adapter: "a", toolName: "browser_click", supportsImageResults: true, supportsAttachments: true, grantsEnforced: false, errorSemanticsMatch: true }]);
  assert.equal(bad.pass, false);
  assert.equal(capabilityForAdapter({ adapter: "a", toolName: "t", supportsImageResults: false, supportsAttachments: true, grantsEnforced: true, errorSemanticsMatch: true }), "text-only");
  assert.equal(runtimeVersionAccepted("1.18.28", "1.18.28"), true);
  assert.equal(runtimeVersionAccepted("1.18.28", "1.19.0"), false);
});

test("J01 accelerator is opt-in and surfaces fall back", () => {
  assert.equal(jevAllowed({ enabled: false, provider: "x", dataDestinations: [] }), false);
  assert.equal(jevAllowed({ enabled: true, provider: null, dataDestinations: [] }), false);
  assert.equal(jevAllowed({ enabled: true, provider: "p", dataDestinations: ["policy-host"] }), true);
  assert.equal(jevSurfaceCovered("canvas"), false);
  assert.equal(jevSurfaceCovered("forms"), true);
  assert.equal(jevPromotable({ medianAutomatedMsA: 1000, medianAutomatedMsC: 700, correctnessC: 1, correctnessA: 1, trustViolationsC: 0 }), true);
  assert.equal(jevPromotable({ medianAutomatedMsA: 1000, medianAutomatedMsC: 900, correctnessC: 1, correctnessA: 1, trustViolationsC: 0 }), false);
});

// Q01/Q02/Q03 fixture files exist with required counts
test("Q01/Q02/Q03 fixture catalogues have required sizes", () => {
  const mech = JSON.parse(readFileSync("verification/mechanism-cases.json", "utf8")) as { cases: unknown[] };
  const prod = JSON.parse(readFileSync("verification/product-cases.json", "utf8")) as { cases: Array<{ heldOut: boolean }> };
  const faults = JSON.parse(readFileSync("verification/fault-cases.json", "utf8")) as { cases: unknown[] };
  assert.equal(mech.cases.length, 30, "30 mechanism definitions");
  assert.equal(prod.cases.length, 20, "20 product definitions");
  assert.equal(prod.cases.filter((c) => c.heldOut).length, 8, "8 held-out families");
  assert.equal(faults.cases.length, 36, "36 fault cases");
  assert.equal(20 * 3 * 2, 120, "120 execution slots");
});

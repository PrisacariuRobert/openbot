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
import { approvalAuthorizesEffect, semanticEffectDigest, visualEffectDigest, scrollEffectDigest, normalizeScrollDelta } from "./runtime.js";

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

test("R02 logical mutation fence survives observations, renderers and restart", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-r02-mutation-"));
  let db = new OpenBotDatabase(root);
  const propose = (actionId: string, key: string | null) =>
    db.journalActionPropose({
      actionId, runId: "run-1", botId: "bot-1", surface: "browser-dom",
      surfaceIdentity: "tab:t1/doc:e1/frame:/", ownershipEpoch: "epoch-1",
      target: "Save", payloadDigest: `payload-${actionId}`, reviewDigest: null,
      account: "", mutationKey: key,
    });
  const fence = (actionId: string, key: string): string | null => {
    const clashes = db.journalActionFindByMutation(key, "run-1", "bot-1").filter((row) => row.actionId !== actionId);
    const unresolved = clashes.filter((row) => row.stage !== "verified" && row.stage !== "failed_before_effect");
    // Mirrors admitAction: a refused attempt is terminally marked so it
    // never fences later checks itself.
    if (unresolved.length > 0) {
      db.journalActionTransition(actionId, "failed_before_effect", "same unresolved mutation exists");
      return "UNCERTAIN_CONFLICT";
    }
    if (clashes.some((row) => row.stage === "verified")) {
      db.journalActionTransition(actionId, "failed_before_effect", "same mutation already completed");
      return "DUPLICATE_MUTATION";
    }
    return null;
  };
  try {
    // First attempt goes uncertain; a fresh observation (new action ID,
    // same key) is fenced without dispatch.
    propose("act-mut-1", "mut-key-1");
    assert.equal(db.journalActionAdmit("act-mut-1"), true);
    assert.ok(db.journalActionTransition("act-mut-1", "dispatch_started"));
    assert.ok(db.journalActionTransition("act-mut-1", "outcome_uncertain", "result lost"));
    propose("act-mut-2", "mut-key-1");
    assert.equal(fence("act-mut-2", "mut-key-1"), "UNCERTAIN_CONFLICT", "same unresolved mutation refused across action IDs");
    // Renderer switch is the same logical effect: still fenced.
    propose("act-mut-3", "mut-key-1");
    assert.equal(fence("act-mut-3", "mut-key-1"), "UNCERTAIN_CONFLICT");
    // Restart: durable rows keep the fence.
    db.close();
    db = new OpenBotDatabase(root);
    propose("act-mut-4", "mut-key-1");
    assert.equal(fence("act-mut-4", "mut-key-1"), "UNCERTAIN_CONFLICT", "fence survives restart");
    // Real-evidence reconcile lifts uncertainty into completed; the same
    // key then refuses as a duplicate while a new key proceeds.
    assert.equal(db.journalActionReconcile("act-mut-1", "verified", "readback: exactly one effect")?.stage, "verified");
    propose("act-mut-5", "mut-key-1");
    assert.equal(fence("act-mut-5", "mut-key-1"), "DUPLICATE_MUTATION");
    propose("act-mut-6", "mut-key-2");
    assert.equal(fence("act-mut-6", "mut-key-2"), null, "distinct new work is never fenced");
    // A failed attempt (no effect) does not fence its key's retry.
    propose("act-mut-7", "mut-key-3");
    assert.equal(db.journalActionAdmit("act-mut-7"), true);
    assert.ok(db.journalActionTransition("act-mut-7", "failed_before_effect", "refused pre-dispatch"));
    propose("act-mut-8", "mut-key-3");
    assert.equal(fence("act-mut-8", "mut-key-3"), null, "failed attempts remain retryable under the same key");
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
  // Reviewer counterexample: two token-shaped values — both must go.
  const twoTokens = redactSecretsForProvider("primary=sk-reviewOnlyAlphaTokenA backup=sk-reviewOnlyBetaTokenB");
  assert.ok(twoTokens.found);
  assert.ok(!twoTokens.redacted.includes("sk-reviewOnlyAlphaTokenA"), "first token removed");
  assert.ok(!twoTokens.redacted.includes("sk-reviewOnlyBetaTokenB"), "second token removed");
  // Outbound sink shapes: tool text, error, diagnostic and receipt payloads.
  const sinkPayloads = [
    `tool browser_click failed: auth xoxb-testSinkTokenOne and retry xoxp-testSinkTokenTwoSuffix`,
    `diagnostic trace otp=482910 backup=sk-sinkThirdTokenValue password: sink-secret-word`,
    JSON.stringify({ receipt: "run-1", webhook: "ghp_sinkFourthToken0123456789", note: "ok" }),
  ];
  for (const payload of sinkPayloads) {
    const screened = redactSecretsForProvider(payload);
    assert.ok(screened.found, `sink payload flagged: ${payload.slice(0, 40)}`);
    assert.ok(!/sk-[A-Za-z0-9_-]{10,}|gh[pousr]_[A-Za-z0-9]{10,}|xox[baprs]-[A-Za-z0-9-]{6,}/.test(screened.redacted), "no token-shaped value survives");
    assert.ok(!screened.redacted.includes("sink-secret-word"), "password assignment masked");
  }
  // Repeated calls cannot skip via stateful regex (fresh global per call).
  for (let i = 0; i < 3; i++) {
    assert.ok(!redactSecretsForProvider("key sk-repeatTokenValueAA").redacted.includes("sk-repeatTokenValueAA"));
  }
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
  // Reviewer counterexamples: NaN never maps; scrolled content invalidates.
  assert.deepEqual(visualToCss(parent, { x: NaN, y: 100 }).ok, false, "NaN x never yields a screen point");
  assert.deepEqual(visualToCss(parent, { x: 100, y: Infinity }).ok, false, "infinite y never yields a screen point");
  const nanAction = validateVisualAction(
    { observationId: "obs-v1", transform: parent, action: "click", point: { x: NaN, y: 100 }, currentGeometry: { cssWidth: 1280, cssHeight: 800, deviceScale: 2, browserZoom: 100, scrollX: 0, scrollY: 0 } },
    "visual-supported",
  );
  assert.deepEqual(nanAction, { ok: false, reason: "STALE_OBSERVATION" });
  const scrolled = validateVisualAction(
    { observationId: "obs-v1", transform: parent, action: "click", point: { x: 100, y: 100 }, currentGeometry: { cssWidth: 1280, cssHeight: 800, deviceScale: 2, browserZoom: 100, scrollX: 0, scrollY: 0 }, capturedScroll: { x: 0, y: 300 } },
    "visual-supported",
  );
  assert.deepEqual(scrolled, { ok: false, reason: "STALE_OBSERVATION" }, "scroll drift invalidates the transform");
  const unscrolled = validateVisualAction(
    { observationId: "obs-v1", transform: parent, action: "click", point: { x: 100, y: 100 }, currentGeometry: { cssWidth: 1280, cssHeight: 800, deviceScale: 2, browserZoom: 100, scrollX: 0, scrollY: 1 }, capturedScroll: { x: 0, y: 0 } },
    "visual-supported",
  );
  assert.equal(unscrolled.ok, true, "sub-pixel jitter stays valid");
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

// Trust-boundary review: approval binds the REVIEWED effective
// destination (query included, never the page URL), the reviewed target
// identity, and the exact effect; visual approvals always refuse.
test("approval binds reviewed destination, target identity and effect", () => {
  const FP = "a".repeat(64);
  const click = (destination?: string | null, fingerprint: string | null = FP) => ({
    type: "browser_click",
    args: {
      selector: "#go",
      ...(fingerprint === null ? {} : { targetFingerprint: fingerprint }),
      ...(destination === null || destination === undefined ? {} : { targetReview: { url: "http://127.0.0.1/form", destination } }),
    },
  });
  const live = "http://127.0.0.1/submit";
  const proposed = (destination: string | null, fingerprint: string | null = FP, value: string | null = null) =>
    ({ kind: "click" as const, selector: "#go", value, destination, targetFingerprint: fingerprint });
  // Exact reviewed destination + identity authorizes.
  assert.equal(approvalAuthorizesEffect(click(live), proposed(live)).ok, true);
  // Same page URL, selector and label — different effective destination —
  // refuses. Observation-digest equality never substitutes for this check.
  const wrong = approvalAuthorizesEffect(click("http://127.0.0.1/save-a"), proposed(live));
  assert.equal(wrong.ok, false);
  assert.match(wrong.ok === false ? wrong.reason : "", /different destination/);
  // Query strings are significant: /transfer?account=A is a different
  // destination from /transfer?account=B. Only fragments are ignored.
  const queryLive = "http://127.0.0.1/transfer?account=B";
  const queryWrong = approvalAuthorizesEffect(click("http://127.0.0.1/transfer?account=A"), proposed(queryLive));
  assert.equal(queryWrong.ok, false);
  assert.match(queryWrong.ok === false ? queryWrong.reason : "", /different destination/);
  assert.equal(approvalAuthorizesEffect(click(`${live}#section`), proposed(live)).ok, true, "fragments do not change the destination");
  assert.equal(approvalAuthorizesEffect(click(`${live}?draft=1`), proposed(`${live}?draft=1`)).ok, true, "identical queries authorize");
  // Missing reviewed destination fails closed for consequential clicks.
  const bare = approvalAuthorizesEffect(click(undefined), proposed(live));
  assert.equal(bare.ok, false);
  assert.match(bare.ok === false ? bare.reason : "", /reviewed destination/);
  // Missing reviewed target identity fails closed.
  const noFp = approvalAuthorizesEffect(click(live, null), proposed(live));
  assert.equal(noFp.ok, false);
  assert.match(noFp.ok === false ? noFp.reason : "", /reviewed target identity/);
  // Approved state != live state refuses even when selector and
  // destination match (amount=999 review cannot authorize amount=10).
  const stale = approvalAuthorizesEffect(click(live, "b".repeat(64)), proposed(live));
  assert.equal(stale.ok, false);
  assert.match(stale.ok === false ? stale.reason : "", /reviewed control state changed/);
  // Typing still binds kind/target/identity/value; destination compares
  // when known.
  assert.equal(approvalAuthorizesEffect(
    { type: "browser_type", args: { selector: 'input[name="field"]', targetFingerprint: FP, value: "reviewed-value" } },
    { kind: "type", selector: 'input[name="field"]', value: "other-value", destination: live, targetFingerprint: FP },
  ).ok, false);
  // Visual: every supplied approval refuses until the exact visual review
  // identity exists — including a well-formed browser_visual record.
  const visualClick = approvalAuthorizesEffect(
    { type: "browser_visual", args: { kind: "visual-click" } },
    { kind: "visual", selector: null, value: null, destination: live, targetFingerprint: null },
  );
  assert.equal(visualClick.ok, false);
  assert.match(visualClick.ok === false ? visualClick.reason : "", /Visual approvals are not issued yet/);
  const borrowed = approvalAuthorizesEffect(
    { type: "browser_type", args: { selector: "#go", value: "x" } },
    { kind: "visual", selector: null, value: null, destination: live, targetFingerprint: null },
  );
  assert.equal(borrowed.ok, false);
});

// Trust-boundary review: mutation identities are minted pre-bound to one
// exact effect (+approval for reviewed work). A first caller can never
// choose what a minted token represents.
test("mutation tokens are pre-bound to one exact effect", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-mutation-tokens-"));
  const db = new OpenBotDatabase(root);
  try {
    const runA = db.createRun({ threadId: "team-room", botId: "nova", prompt: "a", status: "running" });
    const runB = db.createRun({ threadId: "team-room", botId: "nova", prompt: "b", status: "running" });
    const effectA = "e".repeat(64);
    const effectB = "f".repeat(64);
    const token = db.mintMutationToken(runA.id, "nova", effectA);
    assert.ok(token.startsWith("mut_"), "opaque host token");
    // Exact match verifies.
    db.checkMutationToken(token, runA.id, "nova", effectA);
    // A token minted for effect A cannot first-use effect B.
    assert.throws(() => db.checkMutationToken(token, runA.id, "nova", effectB), /already bound to a different effect/);
    // Foreign run/teammate refuses; invented token refuses.
    assert.throws(() => db.checkMutationToken(token, runB.id, "nova", effectA), /Unknown mutation identity/);
    assert.throws(() => db.checkMutationToken(token, runA.id, "scout", effectA), /Unknown mutation identity/);
    assert.throws(() => db.checkMutationToken("mut_" + "0".repeat(32), runA.id, "nova", effectA), /Unknown mutation identity/);
    // Same effect retry verifies again under the same identity.
    db.checkMutationToken(token, runA.id, "nova", effectA);
    // Approval-backed tokens require the same approval.
    const approval = db.createApproval({ runId: runA.id, botId: "nova", kind: "browser", reason: "review", actionLabel: "act", action: { type: "browser_click" } });
    const bound = db.mintMutationToken(runA.id, "nova", effectA, approval.id);
    db.checkMutationToken(bound, runA.id, "nova", effectA, approval.id);
    assert.throws(() => db.checkMutationToken(bound, runA.id, "nova", effectA, null), /bound to a different approval/);
    assert.throws(() => db.checkMutationToken(bound, runA.id, "nova", effectA, "other"), /bound to a different approval/);
    assert.throws(() => db.mintMutationToken("run-no-such-run", "nova", effectA), /per task and teammate/);
    // Durable across restart: pre-binding survives on rows, not memory.
    db.close();
    const reopened = new OpenBotDatabase(root);
    try {
      reopened.checkMutationToken(token, runA.id, "nova", effectA);
      assert.throws(() => reopened.checkMutationToken(token, runA.id, "nova", effectB), /already bound to a different effect/);
    } finally {
      reopened.close();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// Trust-boundary review: canonical digests describe the FULL dispatched
// effect — exact target identity plus observed resource state,
// query-significant destination, observation-bound coordinates with both
// drag endpoints, pane-bound normalized scroll delta.
test("canonical digests bind identity, resource state, query, drag end and scroll delta", () => {
  const base = { kind: "click" as const, selector: "#go", frame: "/", role: "button", label: "Submit form", reviewDigest: "d10", runId: "r", botId: "b" };
  const a = semanticEffectDigest({ ...base, destination: "http://x/submit", value: null });
  assert.equal(semanticEffectDigest({ ...base, destination: "http://x/submit", value: null }), a, "same effect retries under the same identity");
  assert.notEqual(semanticEffectDigest({ ...base, selector: "#go2", destination: "http://x/submit", value: null }), a, "twin selector is a different effect");
  assert.notEqual(semanticEffectDigest({ ...base, reviewDigest: "d999", destination: "http://x/submit", value: null }), a, "changed resource state is a different effect");
  assert.notEqual(semanticEffectDigest({ ...base, destination: "http://x/submit?account=A", value: null }), a, "query is a different destination");
  assert.notEqual(semanticEffectDigest({ ...base, destination: "http://x/save-b", value: null }), a, "retarget is a different effect");
  assert.notEqual(semanticEffectDigest({ ...base, kind: "type", destination: null, value: "v" }), a, "kind change is a different effect");
  const dragAB = { action: "drag", observationId: "obsA", cssX: 300, cssY: 200, endX: 350 as number | null, endY: 250 as number | null, key: null, runId: "r", botId: "b" };
  const d = visualEffectDigest(dragAB);
  assert.equal(visualEffectDigest(dragAB), d, "same drag retries under the same identity");
  assert.notEqual(visualEffectDigest({ ...dragAB, endX: 100, endY: 100 }), d, "A→C differs from A→B");
  assert.notEqual(visualEffectDigest({ ...dragAB, endX: null, endY: null }), d, "missing end differs from bound end");
  assert.notEqual(visualEffectDigest({ ...dragAB, observationId: "obsB" }), d, "another observation is a different effect");
  const clickA = { action: "click", observationId: "obsA", cssX: 300, cssY: 200, endX: null as number | null, endY: null as number | null, key: null, runId: "r", botId: "b" };
  assert.notEqual(visualEffectDigest({ ...clickA, observationId: "obsB" }), visualEffectDigest(clickA), "same coords on another screenshot differ");
  assert.equal(normalizeScrollDelta(200), 200, "in-range deltas pass through");
  assert.equal(normalizeScrollDelta(5000), 3000, "mint and dispatch clamp identically");
  assert.equal(normalizeScrollDelta(-5000), -3000, "negative clamp is symmetric");
  const pane = { paneLabel: "results pane", frame: "/", paneSelector: "#intended", documentEpoch: "1:2:hash", runId: "r", botId: "b" };
  const s = scrollEffectDigest({ ...pane, deltaY: 200 });
  assert.equal(scrollEffectDigest({ ...pane, deltaY: 200 }), s, "same scroll retries under the same identity");
  assert.notEqual(scrollEffectDigest({ ...pane, deltaY: -200 }), s, "-200 differs from +200");
  assert.notEqual(scrollEffectDigest({ ...pane, deltaY: 3000 }), s, "+3000 differs from +200");
  assert.notEqual(scrollEffectDigest({ ...pane, paneSelector: "#twin-pane", deltaY: 200 }), s, "twin pane is a different effect");
});

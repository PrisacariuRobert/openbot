# Backend / computer-use status — Codex UI preserved

> REVIEW CANDIDATE, ROUND 2 (not a release). Branch
> backend/computer-use-gaps-20260919 awaits independent re-review against
> review findings R1–R6. No merge, no release, no paid/live spend.
>
> Infrastructure-only label: model-loop exposure stays unwired by design,
> native mode and Jev stay disabled. B02/B03/B06 are trust-boundary
> infrastructure with fixture proof — NOT general autonomous computer use,
> which remains unproven (no authorized model runs).

Base: origin/main 4a01381c4c79320cd5674aecc8aa8f3904922b9f (fetched 2026-09-19).
Branch: backend/computer-use-gaps-20260919 (clean worktree, owner tree untouched).
Client contracts: Codex Electron + studio UI preserved; protected-source diff
expected zero (src/studio/*, desktop/*, public/*, index.html, studio.html).

## Ticket assessment (round 3: authority and recovery repair)

Round-3 findings A–E status: R01 pending cross-thread collision FIXED
(HTTP H9); logical mutation fence NEW (F9a/unit); observed-state review
binding NEW (R1 regression covered in F1-form-change cases); tab/document
generations + pinned pages NEW (F4b/two-tab/reload/replacement cases);
cancellable input NEW (F10); approvalId validation NEW (unit + fixture
hooks). Model-loop exposure, native mode and Jev remain disabled; the
candidate remains infrastructure-only, not autonomous-complete.

- R01 submission replay: replay precedes eligibility (claimed attachments
  prove first admission; changed budget/provider govern new work only;
  thread 404 / 409 mismatch / 409 payload conflict preserved). Any pending
  ID is resolved before eligibility: foreign thread/digest conflicts and
  preserves the marker. Prune and repair are atomic and fail closed;
  staging failure refuses with 500 and nothing created; orphan tombstones
  answer request_uncertain and never claim nothing happened. Proven by
  scripts/run-r01-http-fixtures.ts (9/9 on the real endpoint) plus
  message-admission-replay.test.ts (route-order, fail-closed injection,
  source-order guard).
- R02 action journal: DB-backed action_journal table with the same
  conditional-update discipline as approved_actions (no FKs: the journal is
  the recovery record of last resort). admitOnce refuses admitted,
  in-flight, terminal and uncertain stages; propose rejects mismatched
  identity reuse; uncertainty is terminal until owner reconcile
  (verified-after-readback or failed, never re-admitted); startup recovery
  marks dispatch_started/effect_observed uncertain. Proven across restart,
  concurrent handles and ID-reuse conflicts; Stop/takeover/sign-in bump
  the durable input epoch and drop observations.
- B01 observations/privacy: host-captured registry (IDs only to callers);
  secure entry is explicit handoff state (real sign-in request minimizes
  capture and refuses pre/post-handoff acts); redaction removes every
  token-shaped value across tool/error/diagnostic/receipt shapes with
  per-call globals. Text redaction proven; image privacy rests on
  minimized/blocked capture, stated as such.
- B02/B03/B06 semantic/visual/routing: opaque host-issued targets and
  registry transforms; logical mutation keys fence unresolved/completed
  effects across observations, renderers and restarts; unique live
  re-resolution with stored review-digest equality (form changes force a
  new review); capability from the server adapter registry (unknown →
  VISION_UNAVAILABLE); pinned pages with tab/generation/content-hash
  enforcement; assertPageAccess before and after input; cancellable
  readiness waits with revocation checks between drag/key/scroll phases;
  final value/kind/mutation bound into the journal digest; NaN/non-finite
  rejected. Fixture-proven (F1–F4b, F8–F10); model-loop wiring
  intentionally absent.
- B04 upload/rich/download: upload live-proven with origin binding (F5);
  download helpers unit-tested BUT no BrowserManager download-capture API
  exists — documented follow-up, not claimed. Region scroll resolves the
  authorized pane token and reads back movement (F8: intended +200px,
  decoy untouched).
- B05 native: CONFIRMED_GAP → capability interface + gates (native-control.ts,
  macOS first, separate permissions, protected apps, secure-dialog owner
  rule). No global capture; gated off by default.
- B06 routing/recovery: NEW → FIXED. modality-router.ts (capability routing,
  fallback eligibility — denials/takeover/uncertain never fallback,
  bounded repair: 2 repairs then block) integrated in observeScoped().
- B07 handoff: PARTIAL → FIXED. secure-handoff.ts (atomic handoff, account
  revalidation, challenge detection, write-review classification). Grant
  revocation on takeover/sign-in already present on main; preserved.
- T01 lifecycles: PARTIAL → primitives FIXED (task-lifecycles.ts: same-resource
  correction, decoy disambiguation, method invalidation). Engine wired via
  existing browser methods; no dormant API activation.
- T02 verification: PARTIAL → primitives FIXED (outcome-verification.ts:
  independent-readback requirement, review binding, consultation
  accountability). Existing verification-evidence preserved.
- T03 adapters: PARTIAL → gates FIXED (adapter-parity.ts: transport checks,
  VISION reporting, mediated-tool allowlist, pinned-version acceptance).
- Q01 fixtures/telemetry: FIXED. verification/mechanism-cases.json (30),
  telemetry.ts (separate clocks/costs), combined tests green.
- Q02/Q03/P01/L01/J01: readiness only — product-cases.json (20, 8 held-out),
  fault-cases.json (36), package-readiness.ts, jev-experiment.ts (default off).
  Full 120-slot matrix, 7-day soak, 2-Mac install, pilot: NOT_RUN (no live/
  paid authorization; no fabrication).
- A00 audit: DONE (this file + branch + contract map).

## Evidence (review candidate round 2, executed 2026-09-19)

- `tsc --noEmit`: clean. `npm test`: 887 pass, 0 fail.
- `npm run check:acceptance`, `npm run build` (pre-existing chunk-size
  warning only), `npm run check:release`, `npm run test:desktop`,
  `npm run test:packaging`, `npm run test:browser-tabs|sessions|sign-in`:
  all pass (disposable data).
- `scripts/run-r01-http-fixtures.ts`: 9/9 PASS against the real server —
  file-bearing 202→200 replay with identical IDs, 409 payload/thread
  conflicts, one admission across ten concurrent sends and SIGKILL restart,
  convergence after an aborted send, 500 request_not_staged with zero
  writes under a held database lock (5.2s busy-timeout proof), working
  cancel/takeover routes, and pending-only cross-thread 409s with marker
  preservation pre/post-restart.
- `scripts/run-browser-integration-fixtures.ts`: 14/14 PASS on real
  headless system Chrome, disposable data dir, 127.0.0.1 fixture server —
  opaque-ID submit with server oracle, stale/ambiguous refusal with zero
  input and zero clicks, canvas-local (200,100) ±3px with unknown-adapter/
  stale-ID/tab-change refusal and zero input, reviewed upload with origin
  refusal, password + plain-text-OTP masking, real-handoff secure mode with
  pre/post-handoff refusal, revocation with zero input, journal-state
  recovery, intended-pane +200px and iframe-pane scroll with decoy
  untouched, mutation fence across obs/renderer/restart with real counter
  readback, real post-acceptance uncertain, and cancel-during-wait with
  zero later clicks.
- Failing-before (independent review on 26a988f, not re-fabricated here):
  fail-open prune/repair/staging catches; Map-backed journal re-admitting
  uncertain work, invisible across processes, reusing mismatched IDs;
  caller-minted targets and caller-built transforms; single-replace
  redaction leaving the second synthetic token; (640,700) canvas miss
  with URL-only assertion; discarded scroll region. Passing-after is the
  evidence above on the new candidate.
- Protected-client diff: zero (only src/server/*, scripts/*, verification/*,
  templates/, docs/).
- NOT_RUN (no authorization, no fabrication): 120-slot model matrix, 7-day
  soak, second-Mac clean install, pilot, any paid/provider spend, CI pieces
  needing global installs/network (pinned opencode runtime, playwright
  --with-deps, docker private-runner).

## Evidence matrix (code vs reachable vs fixtures vs model vs native vs release)

Round 2 — every row below was re-proven after the R1–R6 repair pass.

- R01 replay/tombstone/pending (`index.ts`, `database.ts`,
  `message-admission.ts`): reachable via POST /api/messages; proven on the
  real endpoint (run-r01-http-fixtures 8/8) + DB fail-closed cases +
  source-order guard; model NOT_RUN; release: pending re-review.
- R02 journal/leases (`action-journal.ts` DB-backed, `database.ts`
  action_journal, `runtime.ts` acts): direct-call reachable; model-loop
  wiring deliberately NOT added; restart/concurrent/ID-reuse unit proof +
  F6/F7 live-browser + H7 real cancel/takeover routes; pending re-review.
- B01 privacy (`observation-envelope.ts`, `observation-registry.ts`,
  `observeScoped`): direct-call; multi-secret sink tests + F5/F5b live
  PASS; pending re-review.
- B02 semantic (`semantic-targets.ts`, registry-bound `semanticAct`,
  `scrollPane`): direct-call; legacy click/type unchanged and live-proven
  (F1/F2/F8 + repo scripts); pending re-review.
- B03 visual (`visual-grounding.ts`, registry-bound `visualAct` with live
  tab/document/DPR/scroll/size enforcement): direct-call; F4/F4b live
  PASS on real screenshots with canvas-local oracles; unknown adapters get
  VISION_UNAVAILABLE; actual-model visual run NOT_RUN.
- B04 upload/rich/download (`rich-input.ts`, existing `uploadFile`):
  upload live-proven (F5); download helpers unit-tested BUT no
  BrowserManager download-capture API exists — documented follow-up, not
  claimed; pending re-review.
- B05 native (`native-control.ts`): DISABLED (default off, no bridge wired);
  unit gates PASS; native execution NOT_RUN; blocked.
- B06 router (`modality-router.ts` in `observeScoped`): direct-call; unit
  PASS; pending re-review.
- B07 handoff (`secure-handoff.ts` + existing revoke paths + input-epoch
  wiring in stopRun/takeover/sign-in): existing routes preserved and
  live-exercised (F5b real handoff, F6, H7, sign-in script); pending re-review.
- T01/T02/T03 (`task-lifecycles.ts`, `outcome-verification.ts`,
  `adapter-parity.ts`): primitives direct-call; existing evidence/routing
  suites green; pending re-review.
- Q01/Q02/Q03 (`mechanism-cases.json` 30, `product-cases.json` 20 with 8
  held-out, `fault-cases.json` 36, `telemetry.ts`): schema/count PASS;
  full-matrix/soak NOT_RUN (blocked on authorization).
- J01 (`jev-experiment.ts`): DISABLED default-off; unit PASS; 90-run
  experiment NOT_RUN (blocked).
- P01/L01 (`package-readiness.ts`): packaging tests PASS; clean-install,
  pilot, release decision NOT_RUN (blocked).

## Remaining work (code fixes first, then authorization-gated evidence)

Code owned by this branch: keep the deterministic suites above green and
await independent re-review of findings A–E before any exposure change.
Separately gated (require explicit owner authorization, not run here):
live-model smoke, 120-slot matrix, 7-day soak, second-Mac install, pilot,
and any paid/provider spend. No merge/release without explicit approval.
Known unfinished product work: BrowserManager download-capture API.

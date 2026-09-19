# Backend / computer-use status — Codex UI preserved

> REVIEW CANDIDATE (not a release). Branch backend/computer-use-gaps-20260919
> awaits independent review. No merge, no release, no paid/live spend.

Base: origin/main 4a01381c4c79320cd5674aecc8aa8f3904922b9f (fetched 2026-09-19).
Branch: backend/computer-use-gaps-20260919 (clean worktree, owner tree untouched).
Client contracts: Codex Electron + studio UI preserved; protected-source diff
expected zero (src/studio/*, desktop/*, public/*, index.html, studio.html).

## Ticket assessment (current main, executed evidence)

- R01 submission replay: PARTIAL → FIXED this slice. Base main ran the
  replay check AFTER new-admission eligibility, so a file-bearing retry hit
  the unclaimed-attachment 400 instead of replaying. The candidate moves the
  replay/tombstone/pending-collision check BEFORE eligibility (after thread
  visibility only): claimed attachments on retry prove the first admission;
  changed budget/provider no longer block recovery of original IDs (they
  govern new work, not receipt disclosure); thread mismatch stays 409;
  missing thread stays 404; same-key/different-payload stays 409 with
  nothing changed. Plus tombstone retention on prune, pending-intent staging
  with request_in_progress collision guard, staged inbox copies, startup
  repair. Tests: message-submissions.test.ts (existing) +
  message-admission-replay.test.ts (6 route-order cases + source-order guard).
- R02 action journal: PARTIAL → FIXED. Reused approved_actions; added
  action-journal.ts (journal + admit-once + desktop/target leases +
  revoke-on-stop/takeover) integrated into new semanticAct/visualAct paths.
- B01 observations/privacy: CONFIRMED_GAP → FIXED. observation-envelope.ts
  (envelope, TTL, geometry, privacy gate, secret redaction, credential-field
  detection incl. plain-text token boxes) + BrowserManager.observeScoped().
- B02 semantic driver: PARTIAL → FIXED. semantic-targets.ts (host-issued IDs,
  conservative re-resolution, frame eligibility, region scroll) +
  semanticAct()/scrollPane(). No bare model selectors; no force-click.
- B03 visual: CONFIRMED_GAP → FIXED. visual-grounding.ts (image-relative
  coordinates, inverse transform, crop/zoom IDs, VISION_UNAVAILABLE,
  stale-geometry rejection) + visualAct() with lease + journal. visualAct
  reads live devicePixelRatio/viewport before dispatch — zoom/window drift
  since the observation is STALE_OBSERVATION, not a guessed click.
- B04 rich/file: PARTIAL → FIXED. rich-input.ts (scoped edits, autosave vs
  submit, granted upload handles, download verify/sanitize).
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

## Evidence (review candidate, executed 2026-09-19)

- `tsc --noEmit`: clean. Note: a mid-task run failed on missing
  playwright-core/react-markdown types — cause was a pruned node_modules
  (lockfile untouched), recovered with `npm ci`; unrelated to the candidate.
- `npm test`: 881 pass, 0 fail.
- `npm run check:acceptance`: pass. `npm run build`: pass (pre-existing
  chunk-size warning only). `npm run check:release`: pass.
  `npm run test:desktop`: 5 pass. `npm run test:packaging`: 13 pass.
- `npm run test:browser-tabs|sessions|sign-in`: all PASS (disposable data).
- `scripts/run-browser-integration-fixtures.ts`: 8/8 PASS on real headless
  system Chrome, disposable data dir, 127.0.0.1 fixture server only —
  real submit oracle, stale-fingerprint refusal, ambiguous-target refusal,
  canvas image→CSS mapping with live-geometry enforcement, reviewed upload
  + origin-change refusal, password + plain-text-OTP masking, lease/grant
  revocation with owner takeover click, uncertain journaling without retry.
- Protected-client diff: zero (only src/server/*, scripts/run-browser-
  integration-fixtures.ts, verification/*, templates/, docs/).
- NOT_RUN (no authorization, no fabrication): 120-slot model matrix, 7-day
  soak, second-Mac clean install, pilot, any paid/provider spend, CI pieces
  needing global installs/network (pinned opencode runtime, playwright
  --with-deps, docker private-runner).

## Evidence matrix (code vs reachable vs fixtures vs model vs native vs release)

- R01 replay/tombstone/pending (`index.ts`, `database.ts`,
  `message-admission.ts`): reachable via POST /api/messages; proven at DB
  layer (6 tests) + source-order guard; model NOT_RUN; release: pending review.
- R02 journal/leases (`action-journal.ts`, `runtime.ts` semanticAct/visualAct):
  direct-call reachable; model-loop wiring deliberately NOT added (no new
  model authority without review); F6/F7 live-browser PASS; pending review.
- B01 privacy (`observation-envelope.ts`, `observeScoped`): direct-call;
  F5 live PASS; pending review.
- B02 semantic (`semantic-targets.ts`, `semanticAct`, `scrollPane`): direct-
  call; legacy click/type unchanged and live-proven (F1/F2 + repo scripts);
  pending review.
- B03 visual (`visual-grounding.ts`, `visualAct` with live DPR/geometry
  enforcement): direct-call; F4 live PASS on real screenshots; text-only
  configs get VISION_UNAVAILABLE; actual-model visual run NOT_RUN.
- B04 upload/rich/download (`rich-input.ts`, existing `uploadFile`):
  upload live-proven (F5); download helpers unit-tested BUT no
  BrowserManager download-capture API exists — documented follow-up, not
  claimed; pending review.
- B05 native (`native-control.ts`): DISABLED (default off, no bridge wired);
  unit gates PASS; native execution NOT_RUN; blocked.
- B06 router (`modality-router.ts` in `observeScoped`): direct-call; unit
  PASS; pending review.
- B07 handoff (`secure-handoff.ts` + existing revoke paths): existing
  takeover/sign-in routes preserved and live-exercised (F6, sign-in script);
  pending review.
- T01/T02/T03 (`task-lifecycles.ts`, `outcome-verification.ts`,
  `adapter-parity.ts`): primitives direct-call; existing evidence/routing
  suites green; pending review.
- Q01/Q02/Q03 (`mechanism-cases.json` 30, `product-cases.json` 20 with 8
  held-out, `fault-cases.json` 36, `telemetry.ts`): schema/count PASS;
  full-matrix/soak NOT_RUN (blocked on authorization).
- J01 (`jev-experiment.ts`): DISABLED default-off; unit PASS; 90-run
  experiment NOT_RUN (blocked).
- P01/L01 (`package-readiness.ts`): packaging tests PASS; clean-install,
  pilot, release decision NOT_RUN (blocked).

## Remaining blockers (need owner authorization, not code)

Live-model smoke, 120-slot matrix, 7-day soak, second-Mac install, pilot,
and any paid/provider spend. No merge/release without explicit approval.

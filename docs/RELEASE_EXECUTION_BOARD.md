# OpenBot release execution board

Status: working board for the next reviewed candidate. This translates the
[product contract](PRODUCT_EXPERIENCE_CONTRACT.md) and the dated
[12 September 2026 UX audit](UX_COMPETITIVE_AUDIT_2026-09-12.md). Audit and
competitor notes are observations, not fresh benchmarks or readiness claims.

## Release position

The next release target is a small, explicitly supervised design-partner pilot,
subject to the entry checks below—not a readiness claim today.
The audit does not establish a broad consumer launch, competitor superiority,
physical-phone/cellular certification, clean-install certification, or public
binary readiness. Keep the first release narrow, Mac-first, local-first and
honest about provider, browser, runner and account limits.

## P0 evidence gates

- [ ] Everyday teammate lifecycle: create with minimal setup, rename/edit,
  remove with clear retention semantics, and restore; every action gives
  useful busy/error/success feedback. See
  [component acceptance checklist](BASIC_EXPERIENCE_RELEASE_GATE.md).
- [ ] Exact artifact review: reviewer receives the intended revision/hash;
  stale same-name files cannot produce a false verdict.
- [ ] Consequential action review: exact destination/content is visible;
  decline, cancel, uncertainty, expiry and restart leave a durable outcome;
  no blind duplicate retry.
- [ ] Account-aware browser workflow: existing sign-in, missing permission,
  wrong account and expired session are distinguishable; ordinary navigation
  is not approval spam, while unknown/state-changing actions remain guarded.
- [ ] Candidate recovery: on one frozen candidate, quit/reopen and runner
  restart preserve messages, drafts, files, grants and pending decisions.
- [ ] One useful journey passes with an occupied, explicitly authorized test
  account; record actual result, intervention, limitation and usage.

## P1 evidence gates

- [ ] Three repeatable outcome packages: follow-through, a revised
  document/data deliverable, and a checked project change, each with retained
  evidence and honest partial states.
- [ ] New tester completes setup and a first useful task without developer
  repair on the supported path; keyboard, narrow viewport, loading/error and
  reconnect states are inspected in the rendered client.
- [ ] One accountable teammate returns the result; consultation, cancellation,
  review findings and correction remain inspectable without duplicate answers.
- [ ] README/release notes name the exact candidate, supported install path,
  platform limits, checksums/notices and source-versus-binary distinction.

## Next bounded task

Next: verify the repaired task lifecycle tool exposure through Pixel, then
check recovery on the integrated candidate. The basic disposable teammate
create/edit/remove/restore/cancel journey has passed locally; error feedback and
cross-client retirement are being hardened before the gate is closed. The navigation
allowance is now implemented, default-off and locally loaded; actual opt-in
consumption still needs an owner-approved live test. Unknown actions stay
guarded. Keep this separate from model-quality limitations.
After blocking fixes, select a frozen candidate and re-run all P0 gates through
the real UI. Do not freeze the owner's ongoing work or claim readiness from
build/tests alone.

## Current evidence ledger

- Normal runtime exposure repaired for existing remember/routine_create tools;
  report-only denial retained. Memory provenance/revision/expiry protections and
  schedule/connector validation are unchanged. Eighteen memory/schedule/retrieval
  tests and three availability tests pass. Live pilot uses only a synthetic
  preference and an explicitly disabled routine.
- Retry pilot: Pixel completed 68e9ea7c-2e8d-4bce-9841-dc7666172286, reported
  matching IDs from two exact routine calls. Parent confirmed one creation event,
  exactly one stored routine 65759702-80b9-486b-bad4-d2e47f79e9fc, paused with no
  next run. Durable same-run receipts preserve edits and refuse to recreate
  deleted originals. Cross-task semantic duplicates are not covered.
- iPhone conversation follow-up installed on the paired physical phone: preserve
  last-message previews with separate attention labels, hide retired direct-thread
  shells, move personal-preview limitations to Settings. Signed personal preview
  device build passed. Native simulator unit suite: 32 passed, one skipped.
  User visual recheck still needed; screenshot reported working connection but
  showed Wi-Fi, so cellular/reconnect acceptance remains unproven.
- Graceful routine restart regression passed with real runner + synthetic child:
  one occurrence, same durable run reclaimed once after DB reopen, one event.
  Parent scheduler suite 7/7. Hard-crash/long-soak remain separate.
- Clean Mac build passed, but packaging was stopped at a stalled dependency copy;
  no installed app modified, packaged-runtime smoke still unrun. See handoff.
- iPhone unsigned simulator build passed with installed Xcode 27.0. This does not
  establish physical-device operation, signing, installation or cellular access.
- Internal routine_create now defaults paused; only boolean enabled:true activates
  scheduling. Owner UI/API defaults are unchanged. Tool instructions require owner
  intent, but this flag is not independent proof of consent. Audit duplicate
  creation and unattended execution before broader scheduling claims.

- Live coordination passed: Pixel parent b06d53b2-2fd5-4cca-ab57-50aa79f957c8
  handed fictional quote checking to Scout child 2225f8c2-ff8a-4911-81fd-7d65f184e1fe.
  Scout independently rejected B's four-day deadline and selected A (€480/3d)
  over C (€490/2d). Pixel returned one combined answer; private Scout output
  did not become a second user-facing reply. Both runs completed. This proves
  one text coordination path, not all multi-agent workflows or competitor parity.

- Coordination repair: generated handoff/message_teammate wrappers were excluded
  by normal runtime availability. Enabled those existing host-mediated tools;
  report-only remains denied and host token checks unchanged. Eighteen focused
  availability/handoff/runner tests and TypeScript pass. Live Pixel→Scout test
  is checking one combined answer on a fictional constrained choice.

## Competitor-informed capability priorities

Hermes README checked 12 September 2026:
https://github.com/NousResearch/hermes-agent#readme
It documents delegation, persistent learning/memory, scheduled execution and
messaging-channel continuity. These are documented capabilities, not matched
benchmark results. For OpenBot, verify coordination first, then audit normal
runtime exposure of memory/routine tools before claiming those journeys work.
Do not enable unrelated tools blindly: retained host approval and scoped access
are part of the product promise. Grok parity has not been freshly benchmarked.

- Recovery checkpoint: 34 focused persistence/pairing/opening tests pass; a new
  production empty-profile reopen regression also passes. No implicit starter
  cast or task appears after reopening; draft and safe defaults persist.
- Release preflight: documentation check and 11 packaging tests pass. Native
  source checks are not native builds. Clean packaged installation, full-suite
  verification, signing/notarization and physical cellular evidence remain gates.

- Mobile/recovery, 12 September: tab-specific emulation confirmed innerWidth
  390 with no document overflow. Pixel chat, composer and action menu inspected.
  A unique unsent test draft survived browser reload and was then cleared without
  sending. This is browser recovery, not physical-iPhone or cellular evidence.
- Follow-up file resolution now requires same bot/thread/path and byte-identical
  latest captured artifact. Wrong bot/thread and changed-file cases have regression
  coverage. Unsupported/unmatched links remain unchanged rather than guessing.

- Repaired lifecycle tools retested through Pixel in run
  `73c939d5-8795-462c-886e-0a943bb08ad0`: host reopened release-note-test.md,
  verified 50 bytes and the required sentence. Parent inspected expanded host
  evidence in the UI. The earlier partial result remains honest history.
  Remaining follow-up: resolve existing-workspace-file links in later replies;
  avoid leaking hash details into normal conversational answers.

- Local file pilot `63ff97f1-6a7f-4657-904b-2154f455e7de`: Pixel returned a short
  answer and an attachment for release-note-test.md through the app. Host final
  checks remained unconfirmed. Follow-up reported task_verify unavailable.
  Source inspection confirmed normal runtime allowlist omitted task lifecycle
  tools despite generated instructions requiring them. Treat this as a product
  defect, not a reason to relabel unverified work as verified.
- UI infrastructure: toolbar styles now target named toolbar controls, not all
  descendant buttons; popover rows no longer need header-specific counter-rules.
  This is a bounded foundation repair, not a full UI rebuild certification.

- Todoist Inbox, 12 September: Pixel completed the read-only request through
  the OpenBot conversation using the saved session, returned a short empty-Inbox
  answer, and did not create a report. Run `650272dd-18fc-4fe5-90bf-268019bf5fbd`.
  This proves the empty-account navigation path only, not useful prioritization
  on an occupied account or universal menu navigation.
- Browser navigation policy: do not infer harmlessness from a website's label
  or ARIA attributes. A disclosure can execute arbitrary handlers. Keep exact
  control review when effects are unknown; improve its explanation rather than
  silently weakening approval requirements.
- Rendered feedback gap: Conversation details prioritized historical failed
  tasks over the latest result. Fix current/recent work selection while keeping
  older failures inspectable and every pending decision discoverable.
- Evidence-language gap: the default unverified receipt reports generic plan
  step counts after an answer is delivered. These are not a measured fraction
  of the user's outcome; do not mistake that count for completion evidence.
- Notion, 12 September: run `0296d034-de44-4919-ba98-91f907cc4e3e`
  reached an existing project page, then requested a Search click whose preview
  was unavailable. The test declined that click and confirmed the run became
  cancelled; no successful Notion outcome is claimed. The saved target review
  included 24 body-scoped fields and `complete=false`: an unrelated page editor
  made the navigation review oversized. The chat also lacked a visible terminal
  acknowledgement after decline. Both are release blockers for this journey.
- Follow-up Notion run `fe65adf5-b58f-476a-a145-a9fd7e4db565` completed on the
  updated host after exact owner approval for Open Notion. Pixel returned the
  visible project title, a page link and one next step using the signed-in
  workspace. The login URL was transitional, not evidence of expired sign-in.
  This validates that read path, not private page creation or all menu targets.
- Private Todoist create pilot `b4674d92-d8a5-4bcb-b670-eef82d6e4aaa`:
  exact fictional title/description reached the Inbox editor and save was
  approved through OpenBot. Reopen verification is still pending at this
  checkpoint. Do not recreate the task if interrupted. Repeated navigation
  reviews and identical "Approved action completed" chat notices made a simple
  workflow slow and noisy; this remains a usability gap even if saving succeeds.
- Todoist create pilot completed: Pixel reopened the task and reported matching
  title/description in personal Inbox. Saved item ID `6hVfvmpx8V7CrGc6`; the task
  row with both fields was also visible in OpenBot's review before reopening.
  No duplicate was reported; do not treat this one run as general certification.
  A correction of that same task is now under test, with no new task requested.
- Correction completed in run `4e043397-c3df-4ebb-8954-dc0b456ce761`: exact save
  preview showed original title and the replacement description; Pixel reported
  reopening and verifying the same task URL and Inbox. This is a real private
  create-and-correct browser workflow, with human-reviewed controls, not an
  unattended success claim. The test task remains for inspection.
  Recorded run duration (including intervention): creation 11.8 minutes with
  7 approved browser steps and 24,740 input/output tokens; correction 3 minutes
  with 2 approved browser steps and 22,377 input/output tokens. Task-start
  approvals are additional. These figures are specific to this model/session,
  not a competitor benchmark. Setup friction is a priority before expansion.

## Differentiation hypothesis

OpenBot can earn preference by making conversation the starting point while
keeping owner choice of teammates, models and approvals, then returning an
inspectable real outcome with a clear correction path. Mascots and a roster are
shared foundations; the differentiator must be dependable, understandable
work delivery under the owner's control. This hypothesis needs matched pilot
evidence, not a feature-count comparison.

## Private pilot entry and exit

Invite a small, explicitly supervised design-partner group with consent-safe
or synthetic data and clearly stated Mac/runner/model requirements. Before
expansion, each tester should install the supported path, choose a provider,
finish a representative task, understand a denied/uncertain action, and return
to the same conversation after recovery. Record confusion, interventions,
duplicate-effect risks, corrections and actual outcomes. Any data-loss,
access-boundary or duplicate-write defect blocks expansion.

## No-cost marketing preparation

Prepare three honest short demos: a corrected local deliverable, a reviewed
browser action with destination evidence, and a teammate consultation returning
one answer. Use permitted demo data, show one limitation and its fix, publish a
build log/source invitation, and use one clear design-partner CTA. Share
selectively in relevant open-source and founder communities; do not imply
managed availability, universal integrations, public binaries or competitor
superiority. Track first useful task, repeat use, interventions and unexplained
stops; views and stars are secondary.

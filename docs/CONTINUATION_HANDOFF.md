# OpenBot continuation handoff

Updated: 12 September 2026. Working checkpoint, not a release certification.

## Cost and authority

- User wants continuous in-scope progress without repeated requests to continue.
- Luna handles bounded implementation; Sol only safety-critical or difficult
  changes. Parent reviews the diff and rendered outcome, not duplicate research.
- Keep assignments small, reuse agents, run one shared final verification per
  batch, and avoid repeated builds, broad output dumps and status polling.
- Account-specific usage readings are kept out of the public repository.
- Recheck usage at meaningful batch boundaries. At 5% or less remaining in an
  available core window, update this handoff with exact state and stop starting
  new implementation. Finish a safe checkpoint; do not spend the reserve on
  broad research or another live pilot. Do not redeem credits automatically.
- Owner authorized pushing and merging this batch on 12 September. This does
  not authorize a public app release, broader account access, or external messages.
  Ask for sign-in when needed.

## Workspace and running app

Next batch: production-runner graceful shutdown/reopen regression added at
src/server/routine-restart-recovery.test.ts. Parent ran it with calendar-routines:
7/7 passed; same scheduled run recovered on attempt two with one event/run.
This is deterministic synthetic recovery, not an OS hard-crash or long soak.
Mac native Debug build passed at /tmp/openbot-mac-release-audit-20260912.
Packaging was stopped after several minutes stalled copying the existing
node_modules/zod/v4/locales/tk 2.js (observed open file, cause not established).
Temporary packaging stage and lock remain in that build's Debug directory;
installed apps were not modified. Do not claim packaged clean-install proof.
New scripts/smoke-packaged-runtime.mjs is ready to validate an actual completed
package with empty isolated data; it has not run yet.

Physical phone was paired and OpenBot 0.37.0 build42 installed. User confirms
it works but supplied screenshot showing message previews replaced by attention
and persistent personal-preview banner. Native fixes are now built and installed
on that phone (app.openbot.mobile, personal preview, build directory
/tmp/openbot-phone-conversations-20260912). Message previews stay visible beside
separate attention indicators; limitations moved to Settings; retired direct
shells are hidden. Source checks pass; simulator native tests passed 32 with one
skipped (33 total), no failures; log /tmp/openbot-ios-conversation-tests.log. User should
reopen and inspect. Installation is not independent visual or cellular proof
(the supplied screenshot showed Wi-Fi).

12 September next batch: internal routine creation now has durable same-run,
exact-normalized-payload receipts. Replays return the same routine without another
chat event; owner edits are retained and deleted routines are not recreated.
Different runs remain distinct: this is not cross-task semantic deduplication.
Parent targeted activation/idempotency tests passed, including a second DB
connection and reopen. Live Pixel retry test completed:
68e9ea7c-2e8d-4bce-9841-dc7666172286. Pixel reported matching IDs and replayed:true.
Parent saw one chat creation event and checked exactly one stored routine:
65759702-80b9-486b-bad4-d2e47f79e9fc, enabled=false, nextRunAt=null. Retain paused.

Full verify exposed seven failures: three stale UI expectations (basic rename
and two old settings-link paths), and four execution-runner timing failures.
The latter revealed a real async finalization ownership race. Ownership is now
retained through artifact resolution and shutdown awaits finalization. Focused
runner suite passed 30 tests including deferred and rejected resolver cases.
Final npm run verify passed (log /tmp/openbot-release-verify-final-20260912.log),
including release/platform source checks, packaging, desktop, production build,
application tests and both TypeScript configurations. No release or merge made.

iPhone simulator compile succeeded with Xcode 27.0 using the explicit
DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer, unsigned Debug
build. Log: /tmp/openbot-ios-release-build-20260912.log. This is not installation,
signing, native interaction, cellular, or App Store readiness evidence.

Latest memory/routine pilot: enabled only existing remember/routine_create in
normal availability; report-only remains denied. Pixel saved a scoped synthetic
note release_pilot_label and created one routine 79ae3a52-46df-4350-b6c1-f88e62d2a571
"DEMO release checklist": weekdays 09:00 Europe/Brussels, enabled=false,
nextRunAt=null. Parent saw Paused event in chat and checked stored record.
Retain as paused test data, do not silently activate. Memory follow-up completed
(1468b6f6-a54e-4f66-b317-d3cd1a8e18aa) with the correct scoped reply, but generic
tool activity does not independently prove memory_search or cross-session recall.
Safety fix changes omitted internal-tool enabled to paused; boolean true is
needed to schedule. Owner UI creation API is unchanged. This flag is not an
independent consent check; unattended execution and duplicate prevention remain.

Latest coordination batch: normal tool availability now exposes existing
handoff/message_teammate wrappers; report-only denial and host authorization
unchanged. Build/typecheck/diff check and 18 focused tests pass. Idle runner
reloaded. Live Pixel→Scout test passed (parent b06d53b2-2fd5-4cca-ab57-50aa79f957c8,
child 2225f8c2-ff8a-4911-81fd-7d65f184e1fe): fictional quotes independently checked,
A correctly selected as cheapest eligible, one combined Pixel reply. Scout's
finding remained private. One intermediate UI snapshot said working while later
DB showed waiting; investigate timing before calling this a confirmed UI bug.
Hermes README refreshed: delegation/memory/scheduling/channel continuity are
documented priorities, not measured parity. Next audit memory/routine tool
exposure with host boundaries intact; do not enable every generated tool blindly.

Latest validation batch: 34 database/draft/pairing/opening-recovery tests pass,
plus new production empty-profile reopen test (no seeded bots, draft survives,
no work starts, Mac access/YOLO remain off). Typecheck/diff check pass.
Release checker label matching now tolerates presentation-only casing; existing
requirements retained. Parent reran check:release and 11 packaging tests, passed.
Sol also reports 5 desktop tests and check:macos/check:ios passed (source checks,
NOT Xcode builds). No installed/staged app was found at the two paths inspected
by Sol; not an exhaustive filesystem inventory. Fresh packaged installation,
signing/notarization, full verify and physical-device evidence remain unproven.
Asked user asynchronously to open Pixel over cellular with Wi-Fi off; no answer
at this checkpoint. Do not claim away access from passing pairing unit tests.

Latest follow-up batch: existing artifact links resolve only for same bot/thread/
path with matching latest captured bytes. Live Pixel follow-up at 04:29 returned
/api/attachments/b7ba6a8b1ae8adcf937da9d79cbc1c85 instead of a raw relative link.
Build + 16 focused tests pass, runner reloaded idle. Reply still included "50
bytes" despite normal-language guidance: behavioral polish remains, not a proven
prompt fix. Tab-scoped CDP emulation succeeded at 390px (browser-wide override
had not); chat/composer/menu inspected, no horizontal document overflow. Unsent
draft survived reload, then cleared without sending. Device override cleared.
No physical phone/cellular, fresh-install, or frozen-candidate proof this batch.

Latest release batch: task_plan/progress/verify were absent from the normal
runtime allowlist. Fixed their exposure only, report-only and ambient tools
remain restricted. Live Pixel retest `73c939d5-8795-462c-886e-0a943bb08ad0`
passed host workspace_file verification on existing release-note-test.md
(50 bytes, required sentence checked). Parent expanded the evidence in the app.
Restore now has single-flight/pending/error feedback; backend retirement claims
the row before stopping work, duplicate requests get 409. Toolbar selectors are
scoped to named controls so they cannot leak sizing into popover rows.
Build, diff check and 18 focused tests pass; idle runner reloaded.
Remaining: follow-up reply uses relative release-note-test.md link (no current
attachment mapping observed), reply includes hash jargon, full phone recheck.
Viewport override returned 863px despite requesting 390; do not claim a new
phone-size pass for this batch. Desktop menu/result inspected. No public deploy.

Conversation-first follow-up: flatter bubbles and subtle context/drawer reveals
with reduced-motion support; header ellipsis offers direct edit, group edit,
details, workspace, creation and recoverable removal. Pixel Edit opened directly;
Remove confirmation was cancelled, no Pixel mutation. Parent caught/fixed mobile
header CSS leaking into menu rows and pending-removal reset. Final 390px render,
ArrowDown and Escape focus return verified. Production build and diff check pass;
three create/governance tests pass. Existing large client bundle warning remains.
Local tab 5 is the deliverable. This is not public deployment or release proof.
Next: brief outcome-first replies and remaining component/release gates.

- Repository: `/Users/robert/Documents/openbot`.
- Branch last observed: `pilot/consult-handoff-prompt`; verify before changes.
- Extensive uncommitted work exists. Preserve it; inspect current status/diffs.
- Local app: `http://127.0.0.1:4311/?thread=bot-pixel`.
- Public app: `https://app.openbots.foundation/`.
- Managed runner: `gui/501/com.openbot.runner`. Never restart while a task is
  running/queued/waiting for a teammate. Inspect fresh state before restarting.
- Browser workflow tests must be sent through OpenBot UI. Do not perform the
  bot's external task directly. YOLO was off in the latest checked state.

## Current batch

Implemented and parent-reviewed before this checkpoint:

- Compact Activity/routines, grouped old failures, group-detail spacing.
- Exact revision/hash-bound artifact review and clearer review evidence.
- Conversation Work panel merges current-thread and studio runs, prioritizes
  active work, and keeps earlier work in an expandable history. Two-line task
  labels retain accessible names. Desktop and 390px layout inspected.
- Receipt wording distinguishes recorded plan steps from outcome verification.
- Disclosure metadata improves browser approval explanation but never makes
  a click automatically safe.

Implemented and subsequently live-retested:

1. Luna: cancelled-run acknowledgement beside the matching request; prevent
   historic cancellations being dumped after the newest conversation.
2. Sol: bounded navigation-container review scope so unrelated page editors
   do not make Search unreviewable. Preserve form/dialog priority, explicit
   approval, stale-target checks, and fail-closed sensitive/oversized values.

Parent reviewed both changes and clarified the navigation warning: excluded
page content is not fingerprinted. Shared verification: 36 focused tests passed
and production build passed. Existing large-chunk warning remains. Backend was
reloaded while idle before the successful Notion retry, and again after both
Todoist write pilots. A frontend build alone is not backend deployment proof.

## Evidence and remaining gaps

- Todoist run `650272dd-18fc-4fe5-90bf-268019bf5fbd`: completed through Pixel,
  saved session, short empty-Inbox answer, no report. Empty-account proof only.
- Notion run `0296d034-de44-4919-ba98-91f907cc4e3e`: reached existing page,
  then Search approval was unavailable. Saved review included 24 body-scoped
  fields and `complete=false`. Decline cancelled the task; no successful
  Notion outcome claimed for that run. Chat lacked terminal feedback.
- Notion retry `fe65adf5-b58f-476a-a145-a9fd7e4db565` reached the existing
  signed-in workspace and read Project Charter v1.0 after exact navigation
  review. No manual sign-in or external change. The transient login URL was
  not evidence of a lost session.
- Last combined focused suite: 33 passed (safety, approval preview, context
  ordering). Build and diff check passed before the two in-progress fixes.
- Existing approximately 958KB client chunk warning remains.
- Physical iPhone/cellular, frozen-candidate recovery, fresh installation,
  occupied-account journeys and broad release checks remain unproven here.

## Next sequence and product direction

Latest basic-experience batch: see `BASIC_EXPERIENCE_RELEASE_GATE.md` for
component-wide acceptance and current live proof. CreateTeammate now keeps
required name/job/AI choice visible; detailed instructions optional with job
fallback, advanced/import/team setup retained. BotPanel supports name/job edits
independent of provider health, submits changed fields only, shows remove and
recovery link. Native confirmation replaced with inline confirmation after a
live browser stall. Create/edit/remove/restore/cancel then passed through UI
using `ui-lifecycle-test-4f698` (UI lifecycle checked), finally retired. No bot
task was run; no Pixel settings/accounts changed. Final build passed and backend
was loaded via idle reload before testing; final inline-confirmation change is
frontend-only and built. User confirmed pressing OK on the old native dialog;
the test retirement was user-confirmed. Parent IAB tab 5 is usable again; tab 6
is no longer available. Remaining
unsaved-change/error/active-routine removal and broader component gates stay open.

Current live write pilot: Pixel run `b4674d92-d8a5-4bcb-b670-eef82d6e4aaa`,
Todoist personal Inbox, unique title `OpenBot pilot — review sample launch checklist`.
User explicitly authorized private fictional write tests. Creation completed;
Pixel reported reopening and verifying title and description. The saved task is
`https://app.todoist.com/app/task/open-bot-pilot-review-sample-launch-checklist-6hVfvmpx8V7CrGc6`.
Correction completed through Pixel in run `4e043397-c3df-4ebb-8954-dc0b456ce761`.
Luna could not access the parent's IAB tab, so the parent performed the OpenBot
approval checks (never direct Todoist editing). Pixel reported reopening and
verifying the exact corrected description at the same task URL. The exact save
preview showed the unchanged title and replacement description before approval.
Exact replacement description: `Fictional product test. Checklist: verify private task creation; verify this correction; collect usability feedback. No external messages.`
Title, Inbox and settings were to remain unchanged. No new task, reminders,
assignees, sharing or deletion were authorized. Leave this test task in place;
inspect existing result before retrying to avoid duplicates.
Backend false-delete-warning change for a coordinated prohibition including
`touch` was loaded by an idle runner restart after both write pilots completed.
Slash-separated `complete/delete` caused a misleading task-start warning in the
correction pilot. A narrow coordinated-negation fix is now in source with
positive contrast-clause regressions; include it in the next build/reload.

Latest UI batch: one quiet disclosure for exact unverified text-only fallback;
real concerns remain visible, Request review remains inside details. Current
activity detail uses allowlisted host labels only. Old triggerless cancellations
are suppressed after a newer request. Approval surface has no decorative glow
or nested card border. Twelve focused tests and build passed; final fallback
fixture type correction and host-source assertion were separately checked.

Latest permission/messaging checkpoint:
- Optional task/site navigation allowance implemented and parent-reviewed.
  Off by default; explicit owner decision after an exact review issues it only
  after a successful click. Maximum 12 eligible clicks / 15 minutes, bound to
  run, bot and origin. Tight native-button navigation labels only; missing
  metadata, forms, custom roles, state controls and final-action labels fail
  closed. Current require-review rules win. Exact targets are rechecked.
- DB lifecycle listener revokes grants on terminal states and staging reset;
  fresh run status checked before issuance/use, preventing terminal/resume reuse.
- 44 focused tests passed before final hardening; 17 affected tests passed after
  hardening (including DB terminal/resume integration). Final production build
  and diff check passed. Existing client chunk warning about 962KB remains.
- Idle runner reloaded, root HTTP 200. New code loaded, but NO navigation
  allowance activated and NO live grant workflow claim yet. User was asked
  about one private test; do not infer consent from silence.
- Consecutive completed-action events now one 44px expandable reviewed-steps
  row; non-event/failed/uncertain/separated records are not grouped. Parent
  inspected actual Pixel history at normal width and 390px, expanded the latest
  two exact records, then collapsed and restored normal viewport. Composer
  controls remained aligned. This is responsive-web evidence, not physical iOS.
- Slash-separated prohibition fix included in the final build/reload.

1. If the owner explicitly confirms the navigation option, run one bounded
   private Pixel journey through OpenBot and measure interruptions. Do not
   activate softened approvals on the user's behalf without confirmation.
   Website handlers cannot be proven harmless from labels alone.
2. Validate the actual new approval checkbox and consumption path in the live
   workflow. Unit tests are not end-to-end proof. Avoid duplicate write pilots
   merely to check visual grouping, which is already inspected.
3. Select a candidate only after blocking fixes. Validate restart/cancel/resume,
   exact approvals, no duplicate external effects, setup and supported devices.
4. Use `RELEASE_EXECUTION_BOARD.md`, `PRODUCT_EXPERIENCE_CONTRACT.md` and the
   dated UX audit as the release criteria, not feature-count parity.

Positioning: a conversation-first home for user-chosen AI teammates that deliver
inspectable work and handle corrections clearly. Keep mascots and power-user
capabilities, but hide technical detail until useful. Do not claim superiority
to Grok/Hermes without matched workflow evidence.

Marketing preparation: three short honest demos (corrected deliverable,
reviewed browser action, one coordinated team answer), then a supervised
design-partner invitation. No public launch promise or invented download.

The product is not certified almost finished. The immediate batch is bounded;
remaining release distance depends on the above workflow and recovery evidence.

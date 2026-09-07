# Approved conversation-first native implementation — 2026-09-06

Latest follow-up: [7 September unlocked-Mac verification](QA_UNLOCKED_MAC_2026-09-07.md) inspected the new native build in light/dark and compact/wide states, fixed the compact constraint loop and inspector clipping, and added conversation-local failure review. Historical pending-unlock notes below describe their original checkpoint, not the latest inspection status.

Scope: the actual AppKit/SwiftUI Mac app and SwiftUI iPhone preview. This pass implements the conversation-first prototype approved by the owner, not the earlier gray, card-heavy experiment. Version remains the unreleased 0.37.0 candidate. The web client was not restyled in this pass.

## Implemented

- One continuous white/dark surface. Incoming messages are open text; outgoing messages use contrasting bubbles. Shared neutral colors and thin dividers replace the layered sidebar, header and card backgrounds. Characters are still code-drawn, animated, recolorable and motion-accessibility aware.
- Mac: a compact searchable conversation list, left-aligned conversation identity, matching composer width, grouped timestamps, and a conversation-specific inspector. The inspector's app-wide “Tools & settings” wall is removed. Current work, action history and shared files are scoped to the selected conversation.
- Settings keeps AI providers, connected apps, team, routines and devices prominent. Skills, teaching, projects, files and permissions remain accessible under More settings on Mac. Existing feature views still call the authenticated store; they were not replaced by demo controls.
- Provider and app lists use bundled service artwork, plain rows, one add action and progressive disclosure. Saved accounts and model assignments remain unchanged. The API/local-model and supported account sign-in paths are retained. No provider is silently selected.
- Routine creation starts with the task. Names are optional and derived from the task when omitted; teammate choice, alternate triggers, time zones, calendar and later run previews remain available. The real scheduler still validates run times. Run-now confirmations, approval rules and deletion confirmations remain in place.
- iPhone: start at the conversation list, open a chat, return without losing local draft/attachment state, and open contextual details or Settings. Native team/group creation, teammate editing and connected-app access controls call existing host endpoints. Host-specific projects and permissions remain managed on Mac.
- No sample people, sample tasks, mock completions or prototype accounts were inserted into the owner's studio.

## Verification

- Mac build and **29 native unit tests passed**. Coverage includes bundled logo availability, actual group-member identity, search/order/grouping, settings destination preservation, group request limits, account/model decoding and approval safeguards.
- iPhone build and **21 native unit tests passed**, including shared logo assets, mascot rendering in both appearances, scheduler encoding, connection safety and approval binding.
- A real SwiftUI **Simulator navigation test passed in light and dark appearances** on the disposable OpenBot Native Polish QA simulator. It opens a conversation, checks the message controls, returns to the list and verifies draft continuity, opens Details and Settings, enters provider selection, cancels routine creation, and searches conversations.
- Actual Simulator screenshots were exported from the XCTest result bundles and inspected. They are synthetic-data UI evidence, not evidence of a connected provider, a sent email or successful scheduled execution.
- Native source-contract checks and whitespace checks passed. Source-pattern checks are not runtime proof.
- The first Simulator UI attempt used an unsigned build, so Keychain refused storage. Rebuilding with normal ad-hoc Simulator signing resolved it. Production Keychain protection was not weakened.
- Fixture-only draft state is reset before each UI test. Tests do not erase owner data or call real service accounts.

## Live Mac follow-up after unlock

The 6 September release audit inspected the running native Mac preview against the approved prototype: direct/group conversations, attachments, contextual details, provider overview/selection, connected apps, team/group management and routine creation/cancellation. The continuous neutral layout and simplified navigation are present. No provider connection, group, routine or external action was saved during inspection.

This closes the locked-screen inspection blocker, not every visual or release gate. The audit found inconsistent failed-work attention between web and Mac, small secondary controls, unclear connection-readiness wording and remaining web/native visual differences. The running preview is ad-hoc signed and has no embedded runner. See the [release decision and prioritized findings](RELEASE_DECISION_2026-09-06.md).

## Still required before calling this visually finished

- Close the concrete follow-up findings above and inspect native Mac dark appearance, smaller-window behavior and keyboard/focus paths. The live follow-up covered light appearance, not every state.
- On-device iPhone installation, complete accessibility/large-text review, real account login and end-to-end work pilots remain separate checks.
- Deeper operational views retain their existing capabilities; this is not a sign-off that every advanced workflow has received a complete visual audit.
- Installed application bundles are not silently overwritten. A development build is not a signed/notarized public release.

## Reproduce

The later [outcome-first reply follow-up](QA_RESULT_FLOW.md) passed 36 Mac unit tests, 28 iPhone unit tests and the expanded synthetic iPhone workflow. It adds folded **Work updates** without changing existing message bodies. The fixture now advertises progress in its marker so the UI test verifies both expansion and collapse. Latest Mac rendered inspection is still pending unlock.

### Task-attention follow-up — 6 September, 22:46 CEST

- Latest Mac build: **35 unit tests passed**, including six shared attention/status tests (`/tmp/openbot-attention-mac-final.log`). The cases cover old host payloads, studio-wide failures, duplicate snapshots, pending versus resolved approvals, uncertain actions, unresolved routine alerts and honest connection labels.
- Latest iPhone build: **27 unit tests plus one synthetic UI test passed** (`/tmp/openbot-attention-ios-final.log`). The UI test opened **Needs you** from the conversation list, reviewed a failure in a different conversation, opened that conversation, and reached routine settings from an alert. It then rechecked conversation/draft continuity, settings, provider choice, routine cancellation and search. No external action was executed.
- `npm run verify` passed again: **459 application/service tests, five packaging transaction tests**, source contracts, typechecks and production build. The existing large web-chunk warning remains (`/tmp/openbot-attention-verify.log`).
- The Mac locked again before inspection of this newest compiled build. Prior live Mac inspection remains evidence of the earlier design, not of the new attention row. The installed app was not overwritten; no release was published.

To include these attention states in the existing visual test, start `node scripts/native-ui-fixture.mjs --attention`. The fixture advertises the optional scenario in its verified marker; the test exercises the recovery navigation only when that marker includes it. Default visual fixtures remain quiet.

Generate projects with XcodeGen, then run the Mac unit suite and the iPhone unit suite. For the synthetic UI test, start `node scripts/native-ui-fixture.mjs`, use the returned loopback URL as `OPENBOT_TEST_SERVER`, and target only `testSyntheticConversationVisualSmoke` on the disposable simulator named `OpenBot Native Polish QA`. The test verifies the fixture marker before resetting its in-memory draft. No real model, browser session, database or user files are used.

Simulator interaction tests need ad-hoc signing (`CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-`); disabling signing is suitable for a compile-only check, not Keychain-backed login QA. Use `simctl ui <disposable-device-id> appearance light|dark` to check both appearances, restoring light afterwards.

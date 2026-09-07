# Unlocked Mac: native reliability and Calendar delivery recovery

7 September 2026 · unreleased OpenBot 0.37.0 working-tree candidate.

This is a bounded follow-up to [result-flow verification](QA_RESULT_FLOW.md) and the [native design checks](QA_NATIVE_CONVERSATIONS.md). It closes the locked-screen inspection blocker for the states below. It does not certify every feature, prove competitor parity or authorize a public release.

## Problems reproduced and fixed

### Failed work was visible in Activity but missing from the conversation

Opening **Needs you → failed task → conversation** did not explain the failure in that conversation. Mac and iPhone now render a shared notice with the recorded error and **Review activity**. Failed runs are deduplicated and restricted to the selected conversation. Opening the notice does not retry, resolve or approve anything; completed or uncertain actions must not be repeated blindly.

### Compact Mac windows could crash or clip their details

At 1080 × 640 the native hosting/split-view layout could enter an AppKit constraint-update loop. After that was fixed, the native inspector could still squeeze the sidebar and cut off its own content.

- AppKit now owns the window minimum instead of repeatedly deriving competing limits from its SwiftUI hosting controller.
- At widths below 1200, conversation details open in a 380-point sheet. Wider windows show a 310-point side panel.
- Routine and teammate-preference navigation waits for the compact sheet's dismissal, without a timed delay or competing root sheets.
- Fixture-only appearance and compact-size launch flags are DEBUG-only, loopback-only, and do not overwrite the owner's window autosave preferences.

Actual native inspection passed for light conversation/result separation, failed-task review, dark compact conversation, dark compact details → Routines → return, and dark wide-window inline details. The retained animated/color-customizable mascots are native drawing, not replacement bitmap images. Advanced settings, every accessibility size and every browser/login state are not all visually certified by this pass.

### A lost Calendar create response needed safe reconciliation

An approved Calendar creation now derives its Google event ID from the saved **host approval identity**, not model input. It includes a private content fingerprint and checks event ID, confirmed status, content, times, exact attendees and conference-request identity.

If the create response is lost, malformed or incomplete, OpenBot performs one readback operation for that exact event under the same account binding. A complete unchanged event confirms the outcome. Not-found, changed, cancelled, missing fields, malformed data and unavailable reads leave the outcome uncertain. There is **no second insert** in this recovery flow. An account replacement stops readback; a pending Meet link is not described as ready.

Google documents client-provided IDs as a way to avoid duplicates after an ambiguous create result: [create events](https://developers.google.com/workspace/calendar/api/guides/create-events), [event insert fields](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert). The existing approval journal, reviewed-account guard and per-teammate write permission still govern dispatch.

Limits: this handles an ambiguous response while the host call is still alive. It does not automatically reconcile all journal entries after a process restart, guarantee guest notification delivery, or provide universal exactly-once execution. A new user approval is a distinct action. Authentication refresh may repeat a request after an explicit 401; it retains the same event ID.

## Evidence and boundaries

| Check | Observed result |
| --- | --- |
| Application verification | Final combined-tree `npm run verify`: **484 application/service tests and five packaging transaction tests passed**, plus native source contracts, application/acceptance typechecks and production web build. The existing large web-chunk warning remains. |
| Calendar failure cases | 30 focused Calendar/Google/approval tests passed, including lost-response success, one insert only, malformed/null results, conflict, cancellation, changed content, unavailable readback and account replacement. These use a disposable database and controlled HTTP transport, not Google writes. |
| Native Mac | Final combined-tree **37 unit tests passed** and Release build passed. Actual inspection covered the new failure notice, adaptive details, real Settings/provider logos and readiness labels. |
| iPhone Simulator | 29 unit tests passed and the actual synthetic UI workflow passed after waiting for keyboard input delivery before testing draft persistence. Failure → Activity, folded progress, retained draft, Settings, provider choice, routine cancellation and search were exercised. This is not physical-device evidence. |
| Browser sign-in | Host/Chromium synthetic handoff passed: saved request retained, stale controls rejected, private typed credentials kept out of chat, no external send executed. A simulated website is not proof that all Google/SSO/passkey logins work. |
| Free live model | Four `opencode/muse-spark-1.3-contributor-free` runs passed: morning plan, inbox follow-up, meeting preparation and weekly planning. All source references were valid. Inputs were synthetic; the inbox scenario created an unsent draft, not a real email. No paid fallback was selected. |
| Real account reads | Gmail and Drive each returned four items through the owner's existing connector. Content and credentials were not printed or copied into this report. No email, file or calendar event was created. |
| Google Calendar | The real agenda request failed because Google Calendar API is disabled/not enabled for the configured Google project. Saved OAuth credentials do not override that service requirement. No live create/readback pilot is claimed. |

The first iPhone UI attempt returned before the keyboard had delivered the last draft character. The harness now explicitly waits for the complete field value before navigating; the rerun passed. This is a harness correction, not evidence that a production draft bug was repaired.

The final Mac rebuild also encountered a new local Artifacts settings destination whose Xcode source list and existing exact-destination test were stale. The generated project was refreshed from `macos/project.yml`, the test retained all existing destinations and added Artifacts, and existing feature work was preserved. That integration check is not an end-to-end audit of the artifact feature.

Local logs (temporary, not committed): `/tmp/openbot-unlocked-verify.log`, `/tmp/openbot-unlocked-verify-final.log`, `/tmp/openbot-calendar-final-tests.log`, `/tmp/openbot-unlocked-mac-final-check.log`, `/tmp/openbot-unlocked-release.log`, `/tmp/openbot-unlocked-ios-tests.log`, `/tmp/openbot-unlocked-ios-ui-final.log`, `/tmp/openbot-unlocked-signin.log`, `/tmp/openbot-unlocked-spark-pilot.log`.

## Candidate and final checks

Current local artifact: `/tmp/openbot-unlocked-candidate.HfU6RL/OpenBot.app` (arm64, Release, ad-hoc development signature).

The app includes the private runner, production web assets, Node, OpenCode, required notices and runtime dependencies. Strict signature checks and `scripts/test-macos-package.mjs` passed against that exact package. The bundled runner started with disposable home/data and a system-only PATH, required explicit provider choice, served both production web entry points and exited cleanly with a live event connection open. No real model/account was used by this package smoke. Logs: `/tmp/openbot-unlocked-package.log`, `/tmp/openbot-unlocked-package-test.log`.

This exact native candidate was then opened against the owner's existing local studio. Conversations and the existing unsent draft remained present. Settings displayed the correct bundled provider logos, distinguished a saved sign-in from proven model access, and identified Drive as read access rather than permission to write. No account, grant, routine or outgoing task was changed through the UI. The running local service was healthy with no active tasks and no enabled routines; it did not need an additional restart by this pass.

Provenance fingerprints:

- Native executable SHA-256: `135d68889dc73430d41c1c03f5b9b697ead7f55d830f9184e5f0c0673da096e9`.
- Bundled `src/server/calendar-delivery.ts` SHA-256: `2b1ec35aa3ee8f851a2dbdb65d8f83c429eb1a139983a334427b6042cb518aea` (matched the checked source).
- Bundled lockfile SHA-256: `a51ea112168a902037cdf85aeb74788a4ff5d9dc811105e8d42a269927633ae4`.

The package uses the working-tree dependency installation, not a freshly installed/frozen release commit. No installed app was overwritten and no source was pushed, merged or released by this pass. Older conversation bodies are deliberately unchanged; the final/progress separation applies to newly structured task results, not retrospective rewriting of the owner's history.

## Remaining release gates

- Enable the Google Calendar API for the owner's configured project, then perform an explicitly approved, bounded real-calendar pilot. Read-only Gmail/Drive checks and synthetic model runs do not prove a combined email/calendar/task workflow.
- Exercise real browser sign-in, handoff and destination-bound delivery in representative services with the owner reviewing the actual outgoing action.
- Freeze/review the source candidate and verify matching clean-install CI; complete a second-Mac pilot and signed/notarized distribution before presenting a consumer-ready download.
- Finish physical iPhone, accessibility/large-text and hosted away-access/cellular/push checks. Local Simulator and relay protocol checks are not substitutes.

OpenBot is a development beta with meaningful tested capabilities, not yet a proven drop-in replacement for Grok Bot.

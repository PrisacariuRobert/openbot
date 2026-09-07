# Saved skills: supervised checks before scheduling

5 September 2026 · continuation on the 0.37 development branch. No version release, commit, merge, public deployment or replacement of the owner's installed native app is implied.

## Implemented

- Owner-only checks on web and native Mac/iPhone. Choose an input and expected outcome; explicitly confirm starting a real task on the selected teammate/provider under its ordinary budget, permissions and approval boundaries. No automatic model choice or paid fallback. Private check inputs are retained locally (encrypted check records and the owner's normal conversation); they are not exported in recipe files. Do not enter credentials in the form.
- A completed model response alone cannot certify a skill. Passing requires a completed run, recorded tool/file work, a nonempty result and the owner's explicit comparison with the expected outcome and sources. Model completion never sets the review. Inputs are distinct after case, whitespace and Unicode normalization; semantic equivalence is not detected.
- Two passed examples for the same current workflow/setup are required. A newer incomplete or failed check removes scheduling readiness. At most 20 check records per skill are kept. Evidence expires after 30 days. This is an owner-reviewed sample gate, not an automatic correctness judge or reliability percentage.
- Receipts bind to workflow ID/version/definition, both provider copies of its saved instructions, teammate model/configuration/context, connector grants and account-authorization generation. Renewed authorization invalidates checks; ordinary access-token refresh and new ungranted connector catalog rows do not. Revisions and rollback require fresh checks; another teammate's assigned/imported copy does not inherit them.
- Create, edit, re-enable, manual dispatch, scheduled/event dispatch and queued-run startup check the saved skill. Paused drafts remain possible. Durable routine bindings survive rename/deletion; old queued skill jobs without a revision receipt cannot bypass the gate. Internal hosted tool actions recheck the revision before proceeding. Approval and external-write guards remain in force.
- The teaching panel retains saved data across a host outage and catches failed background refreshes. It does not replay a check on reconnect.

## Scope and remaining work

The structural gate covers explicit saved `/skill` commands in routine prompts. It is not a semantic detector for arbitrary instructions that happen to resemble a taught skill, nor a universal restriction on general browser work. Fresh observations, login/unknown-state takeover and normal action checks still matter. Browser cookies themselves are not copied into or certified by the receipt; an expired site login can still need owner takeover.

Changing private-memory notes or live source content is not a new permission grant and does not invalidate the receipt. Those remain variable task inputs, not content certified by this sample check. This avoids a check invalidating itself when it saves a task note.

No real commercial account was read, no live model called, and no owner check was fabricated in the production studio. The automated owner reviews below use isolated synthetic completed runs and deterministic fixtures. Real support/social/Mac outcomes, broader provider capability checks, background startup, multi-day soak, signing and pilot remain open. The installed native preview is not refreshed merely by compiling the new native controls.

## Verification

- Seven focused tests cover two inputs, duplicate input normalization, owner-only review schema, pending/failed/chat-only/foreign checks, stale and unbound queued jobs, file/model changes, rename/rollback/deletion, restart, expiry, absent provider choice, ungranted catalog changes and same-account reauthorization versus token refresh.
- `npm run test:workflow-checks-ui` launches a separate production server/database and headless Chromium. It exercises real API rejection and paused drafts, actual mobile-sized review controls, enablement only after the second reviewed result, desktop/390px layout, restart persistence and rejection after an on-disk instruction edit before creating an event or job. No live model or real account is involved.
- Native Mac and iPhone simulator builds/tests passed. These are compile/model/unit checks, not visual inspection of the locked Mac or physical phone; the existing live-connection iPhone UI test remains skipped.
- Test development exposed and fixed two additional defects: irrelevant connector-inventory rows invalidated receipts, and teaching refreshes caused unhandled fetch errors during host restart.

Final results: `npm run verify` passed **322 tests**, release/native source checks, both TypeScript configurations and the production build. The existing frontend chunk-size warning remains. Headless `test:workflow-checks-ui`, calendar preview/save/restart regression and real BrowserManager session/capture regression passed. Native Mac tests: **20 passed**; iPhone simulator tests: **12 passed**, with the existing live-connection UI test skipped. `git diff --check` passed. These are development checks, not the full competitive evaluation.

Local logs: `/tmp/openbot-workflow-checks-final-verify.log`, `/tmp/openbot-workflow-checks-ui.log`, `/tmp/openbot-workflow-checks-calendar.log`, `/tmp/openbot-workflow-checks-browser.log`, `/tmp/openbot-workflow-checks-macos.log`, `/tmp/openbot-workflow-checks-ios.log`. Controlled UI screenshots: `/tmp/openbot-workflow-checks-desktop.png` and `/tmp/openbot-workflow-checks-mobile.png`. The latter was inspected for readable spacing; actual review/refresh controls were exercised at 390px.

The idle development server on port 4311 was gracefully refreshed after confirming no active jobs or enabled routines. Health and the new authenticated workflow-check API returned successfully afterward. No real check was started or certified in the owner's studio. The installed Mac app was not replaced, and no background-login or physical-device verification is claimed.

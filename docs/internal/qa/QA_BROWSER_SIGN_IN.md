# On-demand website sign-in — 2026-09-06

Scope: development checkout 0.37.0. A generic saved sign-in handoff, not a claim of universal website access or a public release. No owner account, inbox, calendar, personal file or model was used for these checks.

## Checked

- `npm run verify`: 432 application tests and 5 packaging tests passed; release/native source checks, application and acceptance typechecks, and production build passed.
- `npm run test:browser-sign-in`: the real host loads a persisted pending request, serves private Chromium controls, accepts a fixture password, reads back the fixture account and ticket using its HttpOnly session, and resumes the preserved request only with its bound review. No secret appears in saved chat/action/run or captured host logs. Stale input and duplicate continuation return 409; zero sends.
- `npm run test:browser-sessions`: real browser detection of signed-out versus signed-in pages; persistent teaching/task profile, browser-manager restart, separate teammate identity, logout, secret-safe recording, changed controls and denied-service navigation.
- `npm run test:run-controls`: 10 browser contracts, including the 390px sign-in view, masked private input cleared after submission, explicit completion checkbox, no automatic decision and reconfirmation after more browser input.
- Original evidence included 20 complete-review/browser contracts in the retired shell. These are superseded by `npm run test:app-approvals`: 30 checks against Studio at `/`, `/studio.html` and Activity, after the [single-interface migration](QA_UI_UNIFICATION.md).
- Native Mac Debug build and iPhone Simulator Debug build succeeded with Xcode beta and signing disabled. These are compile checks, not native interaction tests or installed/signed app updates.
- Local host refreshed only after confirming no queued/running tasks or pending approvals. Web at port 4310 and host at 4311 are healthy; existing 3 teammates and 4 conversations are preserved.

## Important limits

The model-facing sign-in tool is exposed in both provider harnesses, and obvious login gates trigger a host handoff. No live-model trial was run, so choosing the right site/account and completing the user's original work remain pilot checks. “I’ve finished signing in” is owner confirmation, not evidence of authenticated access; the resumed task is instructed to inspect the page/account first.

The real host acceptance test seeds a legitimate pending handoff before boot and exercises the owner routes; it does not call a model to generate that request. Browser detector checks use local fixtures, not Google or another commercial identity provider. SSO pop-ups, device-bound passkeys, CAPTCHA, site restrictions, session expiry and native phone interaction still need service-specific supervised testing. Unsupported browser writes remain blocked, and browser sign-in does not enable structured connector reports/triggers.

Browser automation initially exposed a `tsx` named-function helper inside the new DOM detector. The real-browser regression caught it; callbacks were made self-contained and both browser suites were rerun successfully.

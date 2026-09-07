# Browser sign-ins and app connections

OpenBot has two complementary ways to work with a website. Neither is a promise that every service or workflow will work.

## The simple choice

- **Connect an app** for supported, structured tasks such as searching Gmail, reading an agenda, or preparing an approval-safe reply. This is usually the more dependable route.
- **Use a teammate’s browser** when the connector is missing, does not support the task, or needs setup. With browser access enabled, the teammate can ask for your sign-in inside the task. Sign in privately and choose **Continue task**; no separate API setup or repeat of the original request is needed for this browser path.

## When a task needs your sign-in

1. The teammate reaches a sign-in or verification step on the requested website. Obvious login routes, password/one-time-code fields and sign-in headings trigger a handoff; the portable `browser_request_sign_in` tool also handles gates the detector misses. This is website-general, not a Google allowlist.
2. OpenBot saves a pending **Sign in to [website]** request and notifies the owner through its existing notification system. That teammate’s agent browser commands pause. Other teammates keep separate browser profiles; no login is copied to them.
3. Choose **Open sign-in** in the request, check the currently displayed origin, click/select the site’s fields and enter information privately. The owner-only screenshot controls are available in both web clients and the shared native Mac/iPhone approval view. Text is cleared after submission; it is not added to chat, saved in the approval, or returned to the model. SSO may move to a different origin, which is displayed before more input. Close password prompts before continuing.
4. Confirm you finished and choose **Continue task**. The original request resumes with explicit instructions to inspect the page and intended account. This is not automatic proof of authentication and does not enable API connectors, grant access to every Google service or approve external writes. If sign-in still fails or expires, the teammate should ask again.

The pending request survives host restart, can be declined, and has no artificial expiry. Browser/known-service permission changes are checked again; stale sign-in controls cannot type after the request is resolved. The owner routes serialize input with agent browser work for this profile. Only an HTTPS origin (or loopback test origin) is saved, never a login callback’s query, path or fragment. They use the normal local/paired-owner authentication and non-cached responses. This is not a separate encrypted credential vault: the website’s own browser profile keeps its session, and the owner-host connection must be trusted.

**Limits:** automatic detection is conservative and not comprehensive. CAPTCHA, device-bound passkeys, browser restrictions, pop-up-based identity flows and some SSO experiences may not work with these controls; do not bypass them or advertise universal compatibility. These builds add the handoff, not a signed/installed native update or real-account compatibility certification. Browser external writes without a complete review remain blocked.

A browser login is not an API connection. It will not make the connector card say Connected, unlock connector-only event triggers, or turn browser observations into a complete structured inbox report. Conversely, connecting Google through OAuth does not sign in the teammate’s browser.

Google documents OAuth as authorization for API access using scoped tokens. It also warns that supported browser/security requirements can prevent sign-in. We do not work around those checks. API refresh tokens can expire or be revoked too; for external OAuth apps in Testing, Google documents a seven-day expiry in most non-identity-only cases. [Google OAuth documentation](https://developers.google.com/identity/protocols/oauth2), [Google supported-browser help](https://support.google.com/accounts/answer/7675428?co=GENIE.Platform%3DDesktop&hl=en-GB).

## What persists, and what does not

Each teammate uses its own persistent Chromium profile under OpenBot’s data directory. Teaching/takeover and subsequent browser tasks use that same profile. Normal browser-manager restart preserves that profile. A site may still expire the session, ask for 2FA, or decline automated access.

OpenBot does not import your ordinary Chrome profile, extract its cookies, copy another teammate’s login, or automatically grant a new teammate access to connected accounts. No API currently claims to have verified website login merely because a profile exists. The owner must enter passwords, passkeys and verification codes through takeover, never ordinary chat.

This is a deliberate difference from Grok Bot’s documented account-wide computer: its bots share files and browser sessions. Its docs also distinguish persistent computer sign-ins from structured plugins and recommend human takeover for sensitive steps. OpenBot keeps per-teammate browser identities, trading some setup convenience for clearer separation. [Grok Bot: computer and apps](https://cursor.com/docs/grok-bot/work#the-computer-and-apps).

## Permission rules

1. Prefer an authorized structured connector when it supports the requested operation.
2. A missing/unconfigured connector is **not** an explicit website denial. An enabled browser may inspect the requested website; the actual page must establish the signed-in account and available content.
3. An existing read grant explicitly set to off **is** a denial. The agent must not bypass it using a website, Mac app, another account, or another teammate. Disconnecting an API does not erase that denial.
4. Browser access off stays off until the owner changes it. No fallback enables permissions.
5. External writes retain their approval requirements. Login, CAPTCHA, identity, and payment checks need owner takeover. Changed pages or expired sessions are reasons to stop and explain, not to invent success.

The runtime enforces known-service URL checks for Gmail, Calendar, Drive, GitHub, Slack, Notion, Todoist and Dropbox. Direct known-service requests are filtered, read tools recheck current grants, and recorded navigation chains are checked before returning page content. Service workers are disabled for these controlled browser profiles so they do not hide requests from routing.

**This is not a universal network sandbox.** Domain aliases, arbitrary proxies, browser extensions, unknown services, generic terminal access, and every possible navigation channel are not comprehensively controlled by this small policy layer. Playwright may only intercept the first request in a redirect chain; a redirect may contact a destination before OpenBot rejects the resulting page output. Do not market this as complete egress isolation or a replacement for enterprise network policy. Source text and website instructions never grant authority.

## Discovery contract for the interface

`GET /api/bots/:id/browser-access` is read-only and does not launch a browser or check private accounts. It returns:

- `browserEnabled`: the saved teammate permission.
- `runtimeAvailable`: whether a supported local Chrome/Chromium executable is present; not proof a site works.
- `profileScope: "teammate"` and `loginState: "unverified"`.
- `services[]`: `service`, `label`, `url`, `connectorState`, `browserState`, and `preferred` route.

Connector states: `ready`, `not-connected`, `not-shared`, `needs-attention`, `read-denied`. Here `ready` means saved connection/scopes/grants allow the route, not a new live API test. Browser states: `available-unverified`, `off`, `unavailable`, `read-denied`. Preferred route: `connector`, `browser`, or `none`.

Do not render `available-unverified` as “Gmail connected.” Suitable copy is **“Use this teammate’s browser — sign in if needed.”**

## Verification

Current handoff checks and explicit pilot limits: [On-demand sign-in QA](QA_BROWSER_SIGN_IN.md).

- `src/server/browser-sign-in.test.ts`: generic origins, saved task and private metadata, duplicate/profile isolation, reopened database, deny/revocation, serialized work, credential-free tool contracts and continuation without false login proof.
- `npm run test:browser-sign-in`: actual disposable host and Chromium; owner enters a fixture password, an HttpOnly session produces account/ticket readback, review-bound continuation preserves the task, repeated decisions and stale private input are rejected, and nothing is sent. No real website/account/model is used.
- `npm run test:run-controls`: includes sign-in UI at 390px, explicit confirmation, separate private text input cleared after submission, no automatic approval, and reconfirmation after browser interaction. Native Mac and iPhone Simulator builds compile this shared sign-in view; that is not a real-account or native interaction pilot.
- `src/server/browser-access.test.ts`: connector preference, browser-only path, missing scopes, explicit denial after API disconnect, independent teammate grants, no fake login, disabled runtime, known-domain and redirect-chain classification.
- `npm run test:browser-sessions`: real persistent Chromium on a disposable local fixture; teaching-to-task session retention, restart, per-teammate isolation, logout, changed-control rejection, secret-safe recording and denied direct navigation. This is not proof of Gmail/Slack compatibility or an owner-account test.
- `src/server/mac-productivity.test.ts`: connector-first local fallback and permission boundaries. Explicit disconnected-account read denial is additionally covered by the browser-access policy test.

No real owner inbox or calendar was read by these tests. Live provider login, expiry, account switching and a supervised read-only website workflow still need service-specific testing before stronger compatibility claims.

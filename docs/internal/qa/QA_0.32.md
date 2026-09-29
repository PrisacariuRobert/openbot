# OpenBot 0.32.0 — native Work evidence

Date: 5 September 2026  
Scope: native iPhone entry points for the source-backed Morning Brief, Meeting Prep, and Inbox Follow-up jobs.

## What changed

- Added a first-class **Work** destination to the real SwiftUI client.
- Reused one typed job definition for the visible title, required services, and exact prompt sent to the team room.
- Loaded the authenticated `/api/connectors` catalog so a job starts only when its required Gmail, Google Calendar, and Google Drive services are live.
- Added one-tap native Google recovery: missing OAuth access opens the server-created authorization URL, while a disabled Google API opens its exact HTTPS Cloud enable page. Connector readiness refreshes when the owner returns to the app.
- Kept the same bounded-source, explicit-coverage, local-draft, and no-external-write requirements used by the web starters.
- Kept code-drawn, runtime-colored, independently animated mascots; no mascot bitmap was added to this surface.
- Used Dynamic Type-aware text and an accessibility-size hero layout. Disconnected jobs remain readable and state which app is missing.
- Corrected the native UI test so local Mac and private always-on deployments are both valid Live Studio states.

## Executed evidence

- Full native build before the change: **passed** with Xcode 27.0 beta and the iOS 27.0 simulator SDK.
- Native unit tests: **6 passed, 0 failed** on an iPhone 17 Pro simulator. They cover connection-address safety, key-free deep links, exact starter safety requirements, and live-catalog readiness decoding.
- Live native UI test: **passed, 0 failed** against the running owner studio at loopback. It connected using the private test credential, found the native composer and voice action, opened Work, found all three starters, then opened the correct local-runner Live Studio state.
- Accessibility-size UI test: **passed, 0 failed** at iOS's `accessibility-extra-extra-extra-large` content size. The test scrolled through and found every starter before reaching Live Studio, then restored the simulator to its standard Large size.
- Visual review: the captured 402-point iPhone screen showed contained native cards, readable missing-connection guidance, and live Gmail readiness. A first capture exposed mascot overflow and excessive disabled opacity; both were corrected before the final gate.
- Model allowance used by this validation: **none**. Builds, unit checks, connector-state reads, and UI automation are deterministic and local.

## What this proves

The checked source builds as a native iOS application and the simulator can use the running OpenBot API to show real connector readiness and reach the same three job contracts as desktop. It proves neither the quality of a model's eventual answer nor the reliability of third-party provider consent.

## Still open

- A physical iPhone, Wi-Fi-to-cellular handoff, production APNs delivery, Apple signing, TestFlight, and App Store distribution were not exercised.
- Provider selection, connector setup, per-teammate connector permissions, routines, skills, and project administration are not yet complete native surfaces.
- Morning Brief and Inbox Follow-ups still need the M2 gate: ten fresh runs per workflow across two supported model classes with retained failures, latency, usage, and intervention counts.
- Host model-process credential isolation, private-network browser/tool egress controls, and crash reconciliation for uncertain external effects remain security work.
- A self-hoster must still configure Google client credentials on the host before native one-tap authorization can begin; release-managed credentials avoid that developer setup.

# Application polish verification — 0.37 working tree

This is a tested development change, not an App Store release, complete legacy-screen migration, or a claim of competitor superiority. The web entry point is `/studio.html`. The existing `/` app remains available for advanced tools. No owner account was signed in, no real approval was submitted and no model task was started by these tests.

## Delivered

- Semantic monochrome light/dark/system appearance; system typography, quiet surfaces, readable message/attachment contrasts and small-screen layouts.
- Six saved mascot IDs: Robot (`nova`), Bubble (`blob`), Sprout (`sprout`), Orbit (`orbit`), Pebble (`pebble`) and Sunny (`sunny`). SVG on web; one shared Canvas renderer on Mac/iPhone. Recolorable, independently animated, with reduced-motion behavior. This is a shared family, not pixel-identical rendering.
- Web creation and appearance editing use the real API without changing a teammate's job or account grants. Appearance-only changes work before provider setup. Failed saves retain choices and rapid taps cannot duplicate the request.
- Top-layer selection menus work inside dialogs, reposition within the viewport, support arrows/Home/End/type-ahead/Enter/Escape, and restore focus.
- Native conversation lists have search and latest-message previews. Menus are native SwiftUI controls, not web views. Captured send/draft destinations prevent a delayed request from changing the current conversation.
- Mac/iPhone approval sheets load a matching pending, allowlisted full-action preview. Unsupported, masked, empty or stale previews cannot be approved. A review acknowledgement and single-flight decision gate are required. An uncertain response is not automatically retried.
- Browser-only discovery separates missing connector setup from explicit read denial. It never equates a saved browser profile with a verified account. See [browser policy and limitations](BROWSER_AND_CONNECTORS.md).

## Executed checks

- `npm run verify`: **363 tests passed**, zero failures; release/source contracts, TypeScript application and acceptance checks, and production build passed.
- `npm run test:conversation-flow`: real browser fixture checks at **1440/390/320 pixels**; message/draft/file persistence and recovery, selected provider/model, approvals/run controls, empty studios, context pane, light/dark layouts, message contrast, actual mascot animation and reduced motion. HTTP write fixtures do not call models.
- `npm run test:studio-polish`: seven focused browser groups cover all shapes, editable colors, viewport overflow, keyboard/popover behavior, save failures, duplicate taps, exact appearance payloads, and access-state refresh after setup without stale cross-teammate results. These are component-fixture checks, not every application screen.
- `npm run test:browser-sessions`: actual Chromium profile reuse across teaching/task/restart, per-teammate isolation, logout, changed controls, secret-safe recording and denied direct navigation on a disposable local website. Not live Gmail or Calendar compatibility proof.
- Native Mac Xcode build passed with the shared renderer and full approval sheet.
- **19 iOS Simulator unit/render/controller tests passed**, including approval uncertainty, stale previews, single-flight decisions and credential-free relay URL handling. No physical iPhone was used.
- Actual **iOS Simulator UI smoke passed in light and dark appearance**, covering the synthetic conversation, native plus menu, searchable conversation roster and filtering. Ad-hoc Simulator signing exercises the real Keychain login; unsigned simulator builds could not save the test key. This check caught the root's forced-light override and an empty roster heading, both fixed. The isolated fixture rejects every execution route and does not contact a provider.
- Visual inspection also caught a dark library brand mark with insufficient visibility and faint native message metadata/placeholder text. Theme-aware monochrome icon treatment now has a real-pixel regression check; native metadata uses semantic contrast and a system text style.

Web screenshots: `/tmp/openbot-new-studio-qa`, `/tmp/openbot-first-teammate-qa`, `/tmp/openbot-studio-polish-qa`. Native render artifacts: `/tmp/openbot-native-polish-renders-final`. Unit results: `/tmp/openbot-native-final-19.xcresult`. Final whole-app results after readability fixes: `/tmp/openbot-native-ui-light-readable.xcresult` and `/tmp/openbot-native-ui-dark-readable.xcresult`. Latest screenshots are in `/tmp/openbot-native-ui-light-readable-renders` and `/tmp/openbot-native-ui-dark-readable-renders`. These local temporary artifacts are not bundled in a release.

The reusable native visual fixture is `scripts/native-ui-fixture.mjs`. It binds a random loopback port, exposes a test-only marker/key, serves invented conversations and in-memory drafts, and rejects execution. Run only `OpenBotMobileUITests/testSyntheticConversationVisualSmoke` against its printed `OPENBOT_TEST_SERVER` on a disposable simulator named `OpenBot Native Polish QA`; the test refuses other endpoints/devices. Use ad-hoc simulator signing so the real Keychain path works. This is separate from the explicitly configured owner-studio test. Stop the fixture and shut down the disposable simulator after QA.

The local development host was refreshed only after confirming no active work or pending approvals. A read-only post-refresh check confirmed the existing three teammates and four conversations, the new browser-discovery route, and the served production preview bundle. No production appearance, access or conversation was changed by that check.

## What this does not prove

- Existing installed Mac/iPhone builds have not been replaced by compiling source. Simulator visual checks use invented data; full real-account native UI, draft/send network-race testing, Mac whole-window interaction, screen-reader and larger-text coverage remain separate checks.
- Some secondary native screens and the legacy full web app retain earlier styling. All menus, panels and native windows are not certified as visually identical or fully accessible.
- Live third-party sign-in, account switching, expiry, browser compatibility, and unattended reliability require service-specific supervised tests. Browser identity is per teammate, not one automatically shared owner Chrome login.
- Known-service permission checks are not a universal network/process sandbox. Redirects, unknown aliases, terminal tools and other egress paths have the limitations described in the browser policy document.
- Public away-access relay hosting, cellular proof, signing/notarization, clean-install testing and long-running release reliability remain release gates.

Use [the design contract](DESIGN_LANGUAGE.md) for future work; do not add isolated cosmetic overrides or call a saved connection live-tested.

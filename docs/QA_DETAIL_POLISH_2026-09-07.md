# Native detail polish — build 42

7 September 2026 · unreleased OpenBot 0.37.0.

## Scope

This pass follows the approved conversation-first prototype rather than changing permissions or adding another feature dashboard.

- **Activity:** review items first, quiet separators, no mascot hero/count cards; teammate status/browser access and background-runner controls remain in disclosures. Opening an item does not retry or approve it.
- **Permissions:** one shared Mac gate, followed by expandable per-teammate rows. Real terminal/project and private-browser switches, errors and approval language remain. Saved values are unchanged.
- **Group details:** the mascot group keeps its full intrinsic width above a wrapping identity title; it is no longer squeezed into a 95-point slot beside overlapping text.
- **Routines:** task first, equal-width When/At controls, next-run summary, optional schedule details and Name/teammate. Other triggers, time zones, calendar preview, pause-on-create and validation remain. The host still calculates schedule previews.
- **Buttons:** shared 36-point outlined/black capsule style on the edited native surfaces, preserving keyboard shortcuts and disabled state.

## Observed verification

- 37 Mac unit tests passed; Debug and Release builds passed.
- 29 iPhone unit tests passed after compiling the shared schedule changes.
- The disposable iPhone Simulator workflow passed, including draft persistence, failure review, Settings/provider navigation and routine cancellation. The first invocation skipped the UI check because the fixture URL was omitted; the rerun supplied the verified loopback fixture and executed it.
- Mac/iPhone source-contract checks passed. These are structure checks, not end-to-end behavior proof.
- Actual Mac visual inspection passed for Activity and the compact routine editor in the new Debug binary. Activity → Routines → New → Cancel returned correctly without creating a routine. The visual fixture rejects action endpoints, so its schedule-preview line displayed a synthetic read-only warning; this is not a production scheduler failure.
- The Mac locked before the final permissions/group-details inspection. Those changes compile, but their final on-screen inspection, dark mode, larger text and all optional routine triggers are not visually certified by this pass.

Local logs: `/tmp/openbot-detail-polish-tests.log`, `/tmp/openbot-detail-polish-ios-tests.log`, `/tmp/openbot-detail-polish-ios-ui.log`, `/tmp/openbot-detail-polish-release.log`.

Build number 42 distinguishes the new native candidate from earlier 0.37.0 (41) previews. No installed app, owner permission, routine, message, provider or external account was overwritten. No GitHub push, merge, release or public announcement was performed.

## Packaged candidate

`/tmp/openbot-design-candidate.YEHZdo/OpenBot.app` is the new arm64 Release candidate, version 0.37.0 **(42)**. The native app and bundled runner passed strict ad-hoc signature verification and isolated package startup/shutdown checks, including the explicit provider gate and both web entry points. The test used disposable home/data and a system-only PATH, with no model request or owner-account access. Logs: `/tmp/openbot-design42-package.log` and `/tmp/openbot-design42-package-test.log`.

This temporary candidate does not replace an installed application and is not signed/notarized for public distribution. Package checks do not replace the remaining locked-screen visual checks above.

The exact build-42 candidate was launched successfully (process path verified). Its native executable SHA-256 is `db21e9a66209c8204036903cd532ffda86fc0310b8d40d6738a95c34fca234bb`. Only this pass's disposable Debug preview and loopback fixture were stopped; older owner app processes and their data were left untouched. Launch verification while locked does not certify the visible window.

The [introduction film](../marketing/intro-film/README.md) is a separate pre-launch creative asset, not a release test or a recording of the owner's workspace.

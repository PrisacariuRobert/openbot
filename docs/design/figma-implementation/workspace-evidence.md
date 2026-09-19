# Refined workspace implementation — 19 September 2026

This continues the first conversation implementation after the user asked to extend the refined design to settings and the remaining screens. The architecture remains Electron for desktop and the same responsive web UI for phones. No merge, push, signing or release was performed.

## Delivered

- Fixed the doubled conversation-search focus ring. The wrapper retains one visible keyboard focus indicator, in light and dark appearance.
- Adapted all 14 existing workspace destinations to the refined navigation, page hierarchy, cards, forms and phone navigation: team, AI, apps, automations, projects, results, memory/skills/MCP, permissions, usage, phone connection, activity/recovery, teammate settings, private files and computer.
- Added real team and usage overviews. Profile import first displays a preview; selecting or cancelling a file does not create a teammate. Restore uses the existing backend. Budgets and usage are host records, not inferred billing amounts.
- Restored the existing memory and MCP connection tabs alongside skills. Saving a memory note was verified through the UI and backend readback.
- Added a document pane for stored conversation results, with explicit revision ancestry, original-file download, and a revision request prepared in the existing draft. Attachments remain immutable; this is not a document editor.
- Applied the same language to welcome, creation, teammate profile, errors and approval surfaces. Existing task, permission, account, recovery and approval handlers remain authoritative.
- Fixed the profile edit link falling below the visible dialog, discovered by the full test suite. The existing snapshot-reference tests now pass without bypasses or altered assertions.

## Design comparison

All 12 Figma pages were inspected. Refined pages `69:37`, `99:37` and `130:7830` take precedence; the complete frame-to-surface inventory is in [screen-inventory.md](screen-inventory.md).

The team reference and actual Electron capture are [side by side](../../../qa/figma-implementation/workspace-comparison.png). The implementation preserves the rounded workspace frame, two-column teammate cards, neutral surfaces, mascot palette and page hierarchy. Search, extra settings destinations, explicit edit/conversation actions and real status copy are retained where the production app needs them. The exact existing mascot vectors and actual records are used; prototype success text is not treated as a backend result.

[Desktop contact sheet](../../../qa/figma-implementation/workspace-contact-sheet.png) · [Dark focus](../../../qa/figma-implementation/actual/electron-dark.png) · [Document](../../../qa/figma-implementation/actual/document-preview.png) · [Phone document](../../../qa/figma-implementation/actual/phone-document.png) · [Welcome](../../../qa/figma-implementation/actual/welcome.png) · [Profile](../../../qa/figma-implementation/actual/teammate-profile.png)

Desktop captures are 1440 × 940 CSS pixels from the actual unsigned Apple-silicon Electron app, without OS window decorations. Phone captures use Chromium emulation. The harness uses a disposable database with synthetic conversations, a stored Markdown attachment and version-bound review evidence. No live reviewer model or recurring task ran. Existing local project discovery can appear in the Projects screen; fixture isolation is not a claim that all discovered filesystem metadata is synthetic.

## Actual verification

| Check | Result |
| --- | --- |
| `npm run verify` | PASS: release contract, 13 packaging tests, 5 desktop tests, production build, 857/857 application tests, source and acceptance TypeScript checks. |
| Final production rebuild and unsigned `.app` packaging | PASS. Signing explicitly skipped; publication disabled. |
| Packaged `test:figma-conversation`, `OPENBOT_TEST_ALL_SCREENS=1` | PASS: all 14 desktop and phone routes, 390px and 320px overflow checks, mobile back navigation, profile edit, creation dialog/Escape, single search outline, no uncaught renderer errors. |
| Real host interactions in that harness | PASS: draft switching and reload, reaction persistence, stored document bytes and Electron download, revision request draft, memory save/readback, profile preview/cancel, 30-conversation search and layout. |
| OpenBot stdio MCP | PASS: 50 tools discovered; `studio_state` returned the fixture roster and conversation. |
| Run-controls browser contracts | PASS: 10 browser contracts; uses intercepted contract fixtures, not live external actions. |

The initial aggregate run found two profile navigation failures (855/857); the profile layout was corrected and the complete aggregate rerun passed 857/857. Latest raw local output is retained under ignored `qa/figma-implementation/logs/`: `screens-verify-final.log`, `screens-build.log`, `screens-package.log`, `screens-packaged-final.log`, and `screens-run-controls-final.log`.

Reproduce from a freshly staged desktop package:

```sh
OPENBOT_TEST_ALL_SCREENS=1 \
OPENBOT_TEST_EXECUTABLE="$PWD/desktop/release/mac-arm64/OpenBot.app/Contents/MacOS/OpenBot" \
OPENBOT_TEST_BUNDLE="$PWD/desktop/release/mac-arm64/OpenBot.app/Contents/Resources/openbot" \
npm run test:figma-conversation
```

This is implementation and local acceptance evidence, not certification of every conditional Figma frame. Live model dispatch, real account writes, physical-phone Safari/cellular behavior, Windows/Linux/Intel Mac execution, signing and notarization remain unverified here. The phone UI connects to an existing host; Electron itself does not run on phones.

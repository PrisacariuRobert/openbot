# D1 delivery evidence — 2026-09-19

Branch `codex/approved-figma-conversation` is based on fetched `origin/main` `acebd8b9f42fe71e5e13aa7cfc791ceead44b636`. Original checkout remains on its existing branch with its existing untracked work. No push, merge, tag or release was performed.

## Scope delivered

One UI in `src/studio/` for Electron and phone browsers. Retired `macos/` and `ios/` source/build paths, updated desktop packaging and workflows, retained existing backend compatibility/data routes. First conversation uses existing draft, submission, attachment, review, reaction, permission and recovery infrastructure. No backend authorization logic was replaced. The first-screen layout is ready for owner review; remaining Figma journeys are not implemented or accepted by this checkpoint.

## Executed checks

| Check | Observed result |
| --- | --- |
| `npm run build` | Pass; TypeScript + production Vite bundle. Existing large-chunk warning remains. |
| `npm run check:acceptance` | Pass, including the new Electron fixture. |
| `npm run verify` | Release contracts, 13 packaging tests, 5 desktop navigation tests, build passed. Latest application suite: 857 total, 855 pass, 1 failure and 1 timeout cancellation. Aggregate exit 1. |
| Isolated rerun of `task-token-workflow.test.ts` and `verification-evidence.test.ts` | 9/9 pass. Aggregate failures were a 45s token-approval timeout and fixture-host startup timeout; no assertions were relaxed. |
| `node scripts/check-static-assets.mjs` | 96 references pass. |
| Packaged Electron conversation harness | Pass: 1440×940 content capture, real host/API, per-conversation draft switching/reload, file controls, reaction persistence, search, review disclosure, Electron file download, exact stored file content. |
| OpenBot stdio MCP | 50 tools discovered; `studio_state` matched the isolated roster and conversation. |
| Chromium phone emulation | 390px and 320px; visible content, no horizontal overflow, readable narrow review byline. |
| Roster stress | 30 conversations; long names remain searchable without horizontal page overflow. |
| Packaged cold launch/reopen | Empty isolated data home: app started embedded Node/host, host stayed healthy after closing window, app reconnected on reopen. Test runners were stopped afterward. |
| Unsigned Apple-silicon package | Built `desktop/release/mac-arm64/OpenBot.app`; embedded Node 22.21.0 and OpenCode 1.18.31 probes passed. Replacement package explicitly skips signing. |
| `git diff --check` | Pass. |

Raw local output is retained in ignored `qa/figma-implementation/logs/` (`verify-final.log`, `recheck-timeouts.log`, `build-final.log`, `acceptance-final.log`, `packaged-conversation.log`, `packaged-cold-launch.log`, `electron-package.log`). Screenshots and this report are versioned. A passing focused rerun is not a clean aggregate verification result.

## Reproduce the first screen

After `npm ci`, `npm run package:desktop -- --dir`:

```sh
OPENBOT_TEST_EXECUTABLE="$PWD/desktop/release/mac-arm64/OpenBot.app/Contents/MacOS/OpenBot" \
OPENBOT_TEST_BUNDLE="$PWD/desktop/release/mac-arm64/OpenBot.app/Contents/Resources/openbot" \
npm run test:figma-conversation
```

The harness creates a disposable home and uses no live model credentials. Local phone emulation expects Google Chrome at its standard macOS path. The main screenshot is captured before interaction tests change messages/drafts/reactions; dark and stress captures follow those checks. Figma reference and comparison are in `qa/figma-implementation/`.

## Remaining acceptance

Review this first screen before adapting additional journeys/page `99:37` and completion states/page `130:7830`. No live model conversation, real connected-account workflow, physical phone/Safari, Windows/Linux/Intel-Mac interactive acceptance, signed installer, notarization or clean aggregate rerun is claimed. Desktop dependency audit reported two existing high-severity findings; dependency upgrades are outside this visual/consolidation change. Previous native data is preserved on disk; migration requires selecting the existing authoritative host/data home, not importing an unrelated database.

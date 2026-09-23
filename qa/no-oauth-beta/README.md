# Browser-first Apps & tools check

Captured on 2026-09-23 from the `codex/w16-no-oauth-beta` source in the locally packaged macOS arm64 OpenBot app. The Electron shell loaded the branch's bundled production server and disposable database; no live model, Google account, or external service was used.

- `desktop-apps.png`: 1440 × 940 Electron screen, optional direct connections closed.
- `phone-apps.png`: 390 × 844 phone web view of the same production UI.
- `desktop-local-ai.png` and `phone-local-ai.png`: local-model entry in Your AI.
- `local-model-setup.png`: one-click Ollama preset, with its localhost API address.
- `optional-direct-google.png` and `optional-direct-google-phone.png`: legacy direct Google setup remains reachable when explicitly chosen.
- `choose-ai-for-teammate.png`: new teammate has no silently selected connection or model.
- `model-choice.png`: switching Pixel's connection leaves the saved choice active until a model is selected; the alternate connection is a synthetic QA fixture.

Verification:

- `npm run build`: passed.
- `npm test`: 963 passed.
- `npm run check`, `npm run check:acceptance`, and `npm run check:release`: passed.
- `npm run test:desktop`: 9 passed.
- `npm run test:first-teammate`: passed at 1440, 390 and 320 px with one connected provider; verified no subscription or model is preselected, a model choice enables creation, refreshing preserves the draft, and the real creation API stores the selected teammate.
- `npm run test:packaging`: 17 passed.
- `npm run package:desktop`: passed; produced actual unsigned Apple Silicon DMG and ZIP, each with an arm64 Electron shell and arm64 Node/OpenCode runtime. The DMG checksum verified on read-only mount and contained the app and Applications link. The target-architecture regression guard prevents accidentally bundling a different runtime architecture.
- `OPENBOT_TEST_BUNDLE="$PWD/dist-release/openbot-0.37.0-beta.1-darwin-arm64" OPENBOT_TEST_EXECUTABLE="$PWD/desktop/release/mac-arm64/OpenBot.app/Contents/MacOS/OpenBot" OPENBOT_TEST_ALL_SCREENS=1 npm run test:figma-conversation`: passed against the final packaged app, including browser-access setup routing, optional API setup, 14 workspace routes at desktop and phone sizes, conversation actions, recovery, stored document bytes, explicit model switching, and a blank new-teammate connection choice.
- OpenBot's live provider probe using the local Ollama `qwen2.5-coder:7b` model and the same OpenCode configuration returned `OPENBOT_OK` in 29,117 ms, with `ok: true`. This used a downloaded local model and no paid API connection. It verifies a real model reply, not multi-step agent/tool quality.
- A disposable full OpenBot conversation exposed a release blocker: `qwen2.5-coder:7b` printed `{"name":"task_plan","arguments":...}` as its visible answer. The host originally marked that run completed. `ModelOutput` now rejects that exact unexecuted OpenBot tool-call shape and reports a failed run. The focused guard test passed; the full local-model task has not been rerun after the guard.
- Another disposable conversation using local `qwen3-coder:30b` completed but answered `2` to `2 + 2`. This is a user-acceptance failure despite the process finishing. Neither local model is qualified for advertised task quality by these checks.
- The installed OpenCode sign-in listed `opencode/muse-spark-1.3-contributor-free`. A live connection probe answered `OPENBOT_OK` twice, but a full disposable OpenBot teammate run failed with provider HTTP 403 before using tokens. A direct reproduction with the OpenBot agent configuration returned: `OpenCode's free tier can only be used from within OpenCode`. This is not a usable no-cost OpenBot default. The app now reports that restriction instead of suggesting a pointless sign-in retry.
- A manual cross-platform build-only workflow is configured to skip artifact upload by default. The repository already held 309 unexpired GitHub Actions artifacts totaling 866.5 MiB, above GitHub Free's 500 MiB included storage; no paid storage was requested for this check. Windows and Linux builds still need their own-host validation.

This check proves the packaged local client and UI flow, plus a Mac installer image and live provider responses. It does not prove a successful end-to-end free/local teammate, live browser task, Windows/Linux installer, clean-device installation, or signed Mac download.

# Internal packaged Mac candidate, 2026-09-23

Source commit `58431e2` (`codex/w15-macos-signing`), before this evidence-only commit. On the Apple-silicon development Mac, `npm run package:desktop -- --dir` built the shared UI and an unpacked Electron app with bundled Node 22.21.0 and OpenCode 1.18.31. The builder explicitly skipped signing because the normal development config has `mac.identity: null`.

The exact unpacked app started with a disposable data home and a local runner at `127.0.0.1:44913`. `/api/healthz` returned `{"ok":true,"runner":"online","deployment":"local","version":"0.37.0-beta.1"}`. The first-run UI was inspected in Electron and captured at 1154×768 in [packaged-first-run-1154x768.png](packaged-first-run-1154x768.png).

This is **not** a signed release candidate. `codesign --verify --deep --strict` and `spctl --assess --type exec` both exited 1 with `code has no resources but signature indicates they must be present`, consistent with the unsigned development path. No Developer ID signing or Apple notarization ran. The manual signed workflow, exact DMG/ZIP checks and second-Mac install/recovery gate remain open.

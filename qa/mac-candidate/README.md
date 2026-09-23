# Internal packaged Mac candidate, 2026-09-23

Source commit `58431e2` (`codex/w15-macos-signing`), before this evidence-only commit. On the Apple-silicon development Mac, `npm run package:desktop -- --dir` built the shared UI and an unpacked Electron app with bundled Node 22.21.0 and OpenCode 1.18.31. The builder explicitly skipped signing because the normal development config has `mac.identity: null`.

The exact unpacked app started with a disposable data home and a local runner at `127.0.0.1:44913`. `/api/healthz` returned `{"ok":true,"runner":"online","deployment":"local","version":"0.37.0-beta.1"}`. The first-run UI was inspected in Electron and captured at 1154×768 in [packaged-first-run-1154x768.png](packaged-first-run-1154x768.png).

The ordinary unsigned `npm run dist -- --arm64 --publish never` also produced a DMG and ZIP. The Apple-silicon DMG passed `hdiutil verify`; a read-only mount contained `OpenBot.app` with the expected executable, `0.37.0-beta.1` bundle version, and bundled Node/OpenCode runtime manifest. These are local package-integrity checks, not independent installation or Gatekeeper acceptance. SHA-256:

```text
b984dfa7f0abf5629a40db6d9ba5e9c237ef8c33f8da191d1aea77573dc6d168  OpenBot-0.37.0-beta.1-mac-arm64.dmg
4e6cfc27b7bb619614460b08ce9fa1c19b0c27157ca702da5a2284ea256ff051  OpenBot-0.37.0-beta.1-mac-arm64.zip
```

This is **not** a signed release candidate. `codesign --verify --deep --strict` and `spctl --assess --type exec` both exited 1 with `code has no resources but signature indicates they must be present`, consistent with the unsigned development path. No Developer ID signing or Apple notarization ran. The manual signed workflow, signed DMG/ZIP checks and second-Mac install/recovery gate remain open.

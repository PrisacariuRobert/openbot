# OpenBot desktop and phones

One React UI (`src/studio/`), one backend (`src/server/`). Electron is the desktop application for macOS, Windows and Linux. Phones use the responsive web client. The retired SwiftUI clients remain in Git history before this migration; historical QA documents describe those earlier candidates.

## Develop

From the repository root, install with `npm ci` and `npm --prefix desktop ci`. Run `npm run dev`, then in another terminal:

```sh
OPENBOT_DEV_URL=http://127.0.0.1:4310 npm run desktop
```

For a production-source preview, run `npm run build`, `npm start`, then `OPENBOT_DEV_URL=http://127.0.0.1:4311 npm run desktop`. Attach mode uses an explicitly running host. The renderer keeps context isolation and sandboxing, with no Node integration.

## Package

```sh
npm run package:desktop
```

This builds the shared UI, stages a platform-matched Node/OpenCode runtime with production dependencies and license notices, then runs electron-builder. Output is in `desktop/release/`: Mac DMG/ZIP, Windows NSIS, Linux AppImage/deb. Build on the matching platform and architecture; the CI matrix covers Apple silicon, Intel Mac, Windows x64 and Linux x64. `-- --dir` produces an unpacked local app for testing. Runtime versions can be explicitly selected with `OPENBOT_NODE_VERSION` and `OPENBOT_OPENCODE_VERSION`.

The pinned Electron 44 shell requires macOS 13 or newer. The current local packaged-app smoke was run on Apple silicon with macOS 27; other macOS versions and architectures still need independent install evidence before they are advertised as supported for this beta.

The ordinary package command and cross-platform CI produce unsigned development artifacts. They are not a public Mac installer. No credentials from the retired native signing workflow are used automatically.

## Signed Mac candidate

Public distribution needs an active Apple Developer Program membership, a **Developer ID Application** certificate and Apple notarization credentials. On a Mac, set `CSC_LINK` to the exported `.p12` path or its base64 content, `CSC_KEY_PASSWORD` to its password, and `CSC_NAME` to the exact Developer ID Application identity. Supply one complete notarization credential set: `APPLE_API_KEY` (path to `.p8`), `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`; or `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`; or a `notarytool` keychain profile via `APPLE_KEYCHAIN` and `APPLE_KEYCHAIN_PROFILE`. Keep all credentials outside the repository and logs.

After `npm ci`, run `npm run package:desktop:signed`. The signed path fails before packaging when credentials are missing, overrides the ordinary unsigned identity, enables hardened runtime and notarization, then requires `codesign --verify`, Gatekeeper assessment and stapled-ticket validation on the generated app. The manually triggered `Signed Mac candidate` workflow uses repository secrets with the `OPENBOT_` prefix, uploads only review artifacts and checksums, and never creates a release. A passing build still needs clean-install and recovery testing on a second physical Mac using the **exact** DMG/ZIP before public release. This signing path has not produced a verified artifact until real credentials are provided and the workflow passes.

The packaged shell starts the bundled local runner. Closing its window keeps the detached runner alive for routines. Teammates, permissions, files and recovery use the existing authenticated backend. Optional model accounts, browsers and Docker remain separately configured capabilities.

## Phones

Open the same Studio URL through an authenticated HTTPS connection to your host. The existing web manifest/service worker support home-screen installation where the browser offers it. The Mac or private runner must remain online. Electron does not run on iOS or Android. App Store/Play Store wrappers, native share extensions and native push parity are not included in this consolidation; browser notification support depends on the device/browser. Backend compatibility routes for previous native installations remain intact.

## Existing data

This source migration never moves or deletes a data home. Keep your existing server running and use `OPENBOT_DEV_URL` to attach. For a packaged runner, set `OPENBOT_DATA_DIR` to the existing absolute data-home path; the default for a new Electron home is `~/.openbot`. An earlier native Mac package may use `~/Library/Application Support/OpenBot/Data`, while source installations may use the checkout's `.openbot` directory. Do not assume those are interchangeable.

Before changing hosts or data locations, finish active work and stop the runner normally. Back up the complete data home, including the database with its WAL/SHM files, matching `keys/vault.key`, attachments, profiles and `.desktop-instance-id`. Restore into a separate folder and check it before replacing an existing home. Never copy only a live database or create a new vault key for existing encrypted data. There is no automatic data migration in this change.

## Check

`npm run test:desktop` checks navigation isolation. `npm run verify` validates shared source and backend contracts. Test the actual packaged application separately; a browser screenshot alone does not verify desktop startup or runtime bundling. Cross-platform CI artifacts are not evidence of physical phone or Windows/Linux interactive testing.

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

These are unsigned development artifacts. CI only creates a draft on a release tag; signing/notarization and release require a separately reviewed setup. No credentials from the retired native signing workflow are used automatically.

The packaged shell starts the bundled local runner. Closing its window keeps the detached runner alive for routines. Teammates, permissions, files and recovery use the existing authenticated backend. Optional model accounts, browsers and Docker remain separately configured capabilities.

## Phones

Open the same Studio URL through an authenticated HTTPS connection to your host. The existing web manifest/service worker support home-screen installation where the browser offers it. The Mac or private runner must remain online. Electron does not run on iOS or Android. App Store/Play Store wrappers, native share extensions and native push parity are not included in this consolidation; browser notification support depends on the device/browser. Backend compatibility routes for previous native installations remain intact.

## Existing data

This source migration never moves or deletes a data home. Keep your existing server running and use `OPENBOT_DEV_URL` to attach. For a packaged runner, set `OPENBOT_DATA_DIR` to the existing absolute data-home path; the default for a new Electron home is `~/.openbot`. An earlier native Mac package may use `~/Library/Application Support/OpenBot/Data`, while source installations may use the checkout's `.openbot` directory. Do not assume those are interchangeable.

Before changing hosts or data locations, finish active work and stop the runner normally. Back up the complete database together with its WAL/SHM files, matching `keys/vault.key`, attachments and profiles. Never copy only a live database or create a new vault key for existing encrypted data. There is no automatic data migration in this change.

## Check

`npm run test:desktop` checks navigation isolation. `npm run verify` validates shared source and backend contracts. Test the actual packaged application separately; a browser screenshot alone does not verify desktop startup or runtime bundling. Cross-platform CI artifacts are not evidence of physical phone or Windows/Linux interactive testing.

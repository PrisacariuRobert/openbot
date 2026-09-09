# OpenBot desktop shell

One Electron shell around the same web client the browser and relay serve, so the design stays identical on every platform. The shell's job is the machine around the studio: start (or attach to) the owner's local OpenBot server, then get out of the way — the same model as [T3 Code](https://github.com/pingdotgg/t3code): one server, thin clients.

## Run in development

With any OpenBot server already running (dev or the Mac app's background runner):

```sh
npm install
npm start                        # attaches to http://127.0.0.1:4311
OPENBOT_DEV_URL=http://127.0.0.1:4310 npm start   # or point it anywhere
```

## How the packaged app works

`electron-builder` packs `main.mjs` plus the runtime bundle as `extraResources` (`runtime/openbot` → `Resources/openbot`). On launch the shell:

1. Spawns the bundled runner (`bin/node scripts/background-runner.mjs`) detached, with `OPENBOT_DATA_DIR` defaulting to `~/.openbot` — the same studio the terminal bundle and relay use, so teammates, routines and history are shared, and only one server can own the data directory (the single-instance lock).
2. Waits for `/api/healthz`, then opens the window at `http://127.0.0.1:4311`.
3. If a server is already running for that data directory, the runner exits via the lock and the shell attaches to the existing studio instead.

External sites open in the system browser; same-origin links (files, previews) open inside the shell. Closing the window keeps the detached runner alive so routines continue; reopening reattaches.

## Packaging targets

Configured in `package.json` (`build`): NSIS for Windows x64, AppImage + deb for Linux x64, a directory build for macOS arm64 (the signed native app remains the premium Mac tier). Populate the runtime first:

```sh
node scripts/package-runtime-bundle.mjs --platform win-x64   # then stage into desktop/runtime/openbot
npm run dist
```

Cross-building from one host is limited; release builds run per-platform in CI (see `.github/workflows/release.yml`).

## QA

```sh
OPENBOT_DEV_URL=http://127.0.0.1:4311 OPENBOT_QA_SCREENSHOT=/tmp/shell.png npm start
```

QAP: the shell starts, renders the identical web client, and exits after the screenshot. Attach-mode and packaged first-run were both verified this way (screenshots in /tmp/openbot-desktop-qa/).

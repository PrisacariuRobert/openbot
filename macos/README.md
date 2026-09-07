# OpenBot for macOS

**0.37 approved design direction, native implementation candidate:** a single white/dark surface, open incoming messages, contrasting outgoing bubbles, a left-aligned teammate header and a compact conversation list. Settings is visible in the sidebar and available with ⌘,: providers, apps, teammates, routines and devices come first; skills, teaching, projects, files and permissions remain under More settings. The inspector is scoped to the conversation instead of repeating app-wide setup buttons. Provider artwork is bundled, and routines start with the task rather than a large configuration form. Existing accounts, drafts and approval boundaries are unchanged. [Build, Simulator evidence and pending Mac visual sign-off](../docs/QA_NATIVE_CONVERSATIONS.md).

This is a native SwiftUI client for the same private OpenBot home used by the iPhone app. It does not embed the web app or use WebKit. Conversations, replies/reactions, private search, workspace files, teammate administration, approvals, crash-recovery decisions, source-backed work starters, all supported automation triggers, isolated-browser takeover, visible skill teaching, subscription/API/local-model setup and assignment, app permissions, portable skills, code-project review/recovery, capability/background controls, live teammate status, and action history use the authenticated OpenBot API directly.

## Generate and build

This is a developer source-build path, not an installer. Start with the repository checkout, Git, Node.js 22.13+ and `npm ci`, plus Xcode and XcodeGen installed. The project targets macOS 14 or later; the current local build was verified with Xcode 27 beta, not on a clean minimum-version Mac. The command below uses this machine's `Xcode-beta.app` path; select the Xcode installation on your build Mac.

```sh
cd macos
xcodegen generate
DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer \
  xcodebuild -project OpenBotDesktop.xcodeproj -scheme OpenBotDesktop \
  -destination 'platform=macOS' build
```

An ordinary Xcode build has no embedded runner. To use that build without packaging, first run the source service (`npm run build` then `npm start` from the repository root). To create a self-starting development package, the packaging Mac additionally needs the official OpenCode executable, matching CPU architectures for the native app/Node/OpenCode, and internet access for exact-version license notices. It does not need a signed-in model account to package or smoke-test the app. Return to the repository root and build the production interface before packaging:

```sh
npm run build
npm run package:macos -- /absolute/path/to/OpenBot.app
npm run test:macos-package -- /absolute/path/to/OpenBot.app
```

An Xcode rebuild alone does **not** refresh an existing `OpenBotRuntime` directory. Always repackage after server or web changes. Packaging now rejects a native/app-version mismatch before replacing the embedded runtime; the smoke test compares native, manifest, package and live health versions. It also checks the current recipe and protected-memory APIs. The Mac client will not start an outdated embedded runner or silently reuse a differently versioned local runner. Finish active work before restarting a previous version; no automatic job interruption or data rollback is performed.

The packaging step embeds the packaging host's Node runtime, server, dependencies, built interface, and default skills in `OpenBot.app/Contents/Resources/OpenBotRuntime`, then re-signs and verifies the complete app. Package separately for each CPU architecture. A fresh local installation creates an owner-only data home under `~/Library/Application Support/OpenBot/Data`, starts a child runner, waits for health, and pairs locally. Existing configured service data locations are preserved; missing or unknown service homes fail with an explanation. An already-running studio is reused. Opening a remote studio does not start a local one. Login/crash protection is an explicit Live Studio action, not an automatic startup mutation. No automatic desktop update/data-rollback flow is implemented in this version.

When copying a packaged preview, preserve relative symlinks (`ditto`, or Node `cpSync` with `verbatimSymlinks: true`). Rewriting bundled `node_modules/.bin` links breaks the signed resource seal. Verify the **destination** with `codesign --verify --deep --strict`, then run `npm run test:macos-package -- /absolute/path/OpenBot.app` against that copied app. Keep the previous app and a consistent database/vault-key backup until the new runner is healthy; never replace an active job's runtime. Ad-hoc preview signing is not Developer ID signing or notarization.

The bundled server does not need a source checkout or separately installed Node or OpenCode. Packaging includes the installed OpenCode executable and version-matched OpenCode/Node licenses; the package smoke test exercises both executables with a system-only PATH. Optional Claude Code, model accounts, browser/computer dependencies, and host configuration are not bundled. Existing source-based studios may still depend on protected Documents access. The Mac must remain powered on and awake.

The app connects to `http://127.0.0.1:4311` by default. When the runner is on the same Mac, it pairs through the runner's loopback-only access endpoint and keeps that key in memory, fetching it again on the next launch—no copy and paste or new Keychain entry. Remote-host keys are stored in Keychain; a remote address must use HTTPS and its private access key.

For a local development launch without copying the key, start the built executable with `OPENBOT_LOCAL_ACCESS_KEY_FILE` pointing to the runner's `access.token` file. The app keeps that launch credential in memory only; it is never copied to Keychain or placed in a URL.

This development build is ad-hoc signed. Public distribution still needs a Developer ID, hardened runtime, notarization, update signing, and a clean second-Mac Gatekeeper test.

## Preserve an existing studio

Keep one authoritative data home. A running source studio is reused; a saved `com.openbot.runner` service identifies its existing data directory. If you used the source app without installing that service, keep its source runner running when connecting the native client: a stopped, unregistered source checkout is not automatically discovered or moved into Application Support. A missing configured service home fails rather than silently creating an empty replacement.

Before updating or moving data, finish active work and stop the runner and its browser processes through their normal controls. Back up the complete data directory together, including `openbot.sqlite`, any SQLite WAL files, `keys/vault.key`, attachments and browser profiles; model CLI credentials and projects outside that directory need separate backups. Treat these backups as sensitive account access, not shareable diagnostics. Do not copy only a live SQLite database or mix a database and key from different studios.

Startup now refuses an existing SQLite/WAL/SHM file when `keys/vault.key` is missing, without generating a replacement key or creating a new set of workspace folders. Restore the matching key and database from the same consistent backup before retrying. A lost encryption key cannot be reconstructed by regenerating one. Missing-key refusal and matching-key decryption are tested with disposable data; complete clean-Mac recovery remains a release gate. [Package checks and limits](../docs/QA_FIRST_RELEASE_PACKAGE.md).

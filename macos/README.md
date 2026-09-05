# OpenBot for macOS

This is a native SwiftUI client for the same private OpenBot home used by the iPhone app. It does not embed the web app or use WebKit. Conversations, attachments, approvals, crash-recovery decisions, source-backed work starters, automations, subscription/API/local-model setup and assignment, app permissions, portable skills, code-project review/recovery, capability/background controls, live teammate status, and action history use the authenticated OpenBot API directly.

## Generate and build

```sh
cd macos
xcodegen generate
DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer \
  xcodebuild -project OpenBotDesktop.xcodeproj -scheme OpenBotDesktop \
  -destination 'platform=macOS' build
```

The app connects to `http://127.0.0.1:4311` by default. When the runner is on the same Mac, it pairs through the runner's loopback-only access endpoint and stores the key in macOS Keychain—no copy and paste. A remote address must use HTTPS and its private access key.

For a local development launch without copying the key, start the built executable with `OPENBOT_LOCAL_ACCESS_KEY_FILE` pointing to the runner's `access.token` file. The app keeps that launch credential in memory only; it is never copied to Keychain or placed in a URL.

This development build is ad-hoc signed. Public distribution still needs a Developer ID, hardened runtime, notarization, update signing, and a fresh-Mac install test.

# OpenBot for iPhone — native SwiftUI

**0.37 conversation-first design candidate:** conversations are the starting screen; a chat opens with its own details, files and routines. Settings separates providers, connected apps, team, routines and devices. Incoming messages are open text, outgoing bubbles contrast against a single white/dark surface, and the animated characters remain editable. Team/group creation and app-access controls use the real host API. Builds, unit tests and a disposable-Simulator navigation check have been run; physical-device installation and real-account workflows remain separate. [Current evidence and limits](../docs/QA_NATIVE_CONVERSATIONS.md).

The iPhone app is a real SwiftUI client for an OpenBot studio that remains hosted by the owner's Mac. Chat, teammate selection, live progress, approvals, connection management, and animated mascots are native controls; the app does not embed the desktop website in a web view. Mascots are drawn from native shapes instead of static image files, so each teammate keeps the color and character chosen on the Mac while blinking, floating, working, waiting, celebrating, and reacting to errors. It does not bundle a model runtime or copy the OpenBot database to the phone.

## Open in Xcode

1. Install Xcode (the project is also verified with `/Applications/Xcode-beta.app`).
2. From `ios/`, run `xcodegen generate` after changing `project.yml`.
3. Open `OpenBotMobile.xcodeproj`.
4. Select the `OpenBotMobile` target and choose your Apple development team under Signing & Capabilities.
5. Register `group.app.openbot.shared` for both `OpenBotMobile` and `OpenBotShare`, and enable Push Notifications on the main app identifier.
6. Run on an iPhone with iOS 17 or newer.

The checked-in project is generated from `project.yml`. The native unit suite runs without owner credentials. A separate synthetic UI test verifies conversation navigation, drafts, Settings and routine cancellation on the disposable `OpenBot Native Polish QA` simulator; it requires the marker-checked loopback fixture described in the [native QA record](../docs/QA_NATIVE_CONVERSATIONS.md). The optional owner-account UI test still requires both `OPENBOT_TEST_SERVER` and `OPENBOT_TEST_ACCESS_KEY` and skips without them. A compile-only Simulator build may disable signing, but Keychain-backed UI tests need the normal ad-hoc Simulator signature.

Open **Away access** on the Mac and use its pairing QR code. Access over cellular or different Wi-Fi requires a reachable hosted OpenBot relay/private home, or a separately configured private network/HTTPS proxy; having a native app alone does not make away access ready. Tailscale remains an optional private-network route, not a requirement for the app. Never expose OpenBot's plain local port to the public internet. See the [away-access verification record](../docs/QA_AWAY_ACCESS.md) for setup limits and device checks.

For native notifications, create an APNs signing key in the Apple Developer portal and set `OPENBOT_APNS_TEAM_ID`, `OPENBOT_APNS_KEY_ID`, and `OPENBOT_APNS_PRIVATE_KEY_PATH` on the Mac host. The `.p8` private key stays on the Mac. Debug builds register as sandbox devices and Release builds register as production devices. The simulator can compile and exercise the UI but production APNs delivery requires an owner-signed physical-device build.

The embedded **OpenBot Share** extension accepts bounded text, links, images, and files from other iPhone apps. It writes them to the shared App Group container; the main app imports them into the currently selected conversation and removes each item only after a successful send.

In the connection form, the keyboard's **Next** action moves from the studio address to the access key, and **Go** connects. Teammate appearance is edited once in the Mac studio and automatically follows that teammate into the native app.

## Security behavior

- The access key is stored with `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` in the iPhone Keychain.
- Native API calls send the Keychain value as a bearer credential; the key is never added to a URL or written into source.
- Public hostnames require HTTPS. Plain HTTP is accepted only for localhost, private IPv4 ranges, link-local/private IPv6, `.local`, and Tailscale's carrier-grade NAT range.
- The app does not bypass certificate validation.
- The app and extension privacy manifests declare no tracking or collected data; the main app records the approved app-only UserDefaults reason used to remember the studio address.
- APNs device tokens are sent only through the authenticated studio API, remain in local SQLite on the Mac, and can be removed by forgetting the connection.
- Share-sheet payloads remain in the private App Group container until the authenticated main app sends them successfully.
- `openbot://connect?server=...` can prefill a server address, but deep links never accept an access key.
- Forgetting the connection removes the Keychain item and remembered address.

The native project currently provides secure connection, conversation switching, teammate targeting, deliberate speech-to-editable-text capture, message and file sending, live server events, streaming task state, approvals, cancellation, Markdown-style message text, authenticated artifact downloads, Quick Look previews, message/file sharing, APNs registration/deep links, Share-sheet ingestion, offline/reconnect state, connection management, runner health, recovery state, and a remote **Check now** control. Voice starts only after a tap, stops explicitly, prefers on-device recognition when Apple reports it available, never sends automatically, and is not retained as audio by OpenBot. Optional macOS background protection keeps the studio service available after the foreground app exits, provided the Mac remains powered on and awake. App Store distribution is not claimed yet. Secure installed web clients can use Web Push independently of the native app.
## Personal Team device preview

The release project retains its push notification and app-group entitlements. A free Apple Personal Team cannot provision those capabilities. For a clearly labelled personal test build, use `PersonalPreview.entitlements` (empty) for **both** targets and enable the preview notice in **Settings → You & devices**:

```sh
DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer xcodebuild \
  -project ios/OpenBotMobile.xcodeproj -scheme OpenBotMobile \
  -configuration Debug -destination 'id=YOUR_DEVICE_UDID' \
  -derivedDataPath /tmp/OpenBotPhonePreview DEVELOPMENT_TEAM=YOUR_TEAM_ID \
  CODE_SIGN_ENTITLEMENTS="$PWD/ios/PersonalPreview.entitlements" \
  SWIFT_ACTIVE_COMPILATION_CONDITIONS='DEBUG OPENBOT_PERSONAL_PREVIEW' \
  -allowProvisioningUpdates build
```

Install the resulting `Debug-iphoneos/OpenBot.app` with Xcode or `xcrun devicectl device install app`. Unlock the phone to launch it. This preview can test chat, provider selection, included skills, in-app file attachments and approval screens. APNs and delivery from the system Share sheet are **not available**; use the in-app attachment picker instead. A paid-team signed release still needs a real APNs/share-group acceptance run. Development provisioning is not App Store distribution and requires periodic renewal as indicated by Xcode's profile.

### Phone test checklist

1. On the Mac, open Away access. Wait for the HTTPS and privacy checks to pass, then show a QR code. In the native iPhone app, choose **Scan my Mac’s QR code** and confirm the studio address. Never post the code or private key publicly.
2. A configured HTTPS tunnel or hosted relay works without a VPN app on the phone. Keep the Mac awake and online. See [personal Mac away access](../docs/AWAY_ACCESS_PERSONAL_MAC.md). Do not forward the HTTP port to the public internet.
3. Open Tools, skills & memory → Skills: the seven included methods should already be there. You do not need to import or enable each one.
4. Paste short meeting notes and ask for an action list. Check that missing owners and dates stay unresolved and decisions are not confused with suggestions.
5. Ask one teammate to consult another: expect one consolidated final answer. Open an attachment and try an approval preview; decline any real external change you do not want.
6. Turn Wi-Fi off and use cellular data. Send a harmless message, background/reopen the app and check that the same conversation returns without duplicate sends. Report any error and which step triggered it. This is a user acceptance check, not automatically proven by a build or local transport test.

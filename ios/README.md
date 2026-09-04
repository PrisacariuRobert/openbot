# OpenBot for iPhone — native SwiftUI

The iPhone app is a real SwiftUI client for an OpenBot studio that remains hosted by the owner's Mac. Chat, teammate selection, live progress, approvals, connection management, and animated mascots are native controls; the app does not embed the desktop website in a web view. Mascots are drawn from native shapes instead of static image files, so each teammate keeps the color and character chosen on the Mac while blinking, floating, working, waiting, celebrating, and reacting to errors. It does not bundle a model runtime or copy the OpenBot database to the phone.

## Open in Xcode

1. Install Xcode (the project is also verified with `/Applications/Xcode-beta.app`).
2. From `ios/`, run `xcodegen generate` after changing `project.yml`.
3. Open `OpenBotMobile.xcodeproj`.
4. Select the `OpenBotMobile` target and choose your Apple development team under Signing & Capabilities.
5. Register `group.app.openbot.shared` for both `OpenBotMobile` and `OpenBotShare`, and enable Push Notifications on the main app identifier.
6. Run on an iPhone with iOS 17 or newer.

The checked-in project is generated from `project.yml`. On this Mac, the app is compiled and exercised on the iPhone 17 Pro simulator with Xcode Beta. Four connection tests run without secrets. The optional native UI test signs in to a running local studio and verifies the conversation header and composer when `OPENBOT_TEST_SERVER` and `OPENBOT_TEST_ACCESS_KEY` are supplied; it skips safely otherwise.

On the Mac, start OpenBot with `npm run remote`, open **Control center → Phone remote**, and use the shown private address and access key. For access on cellular or different Wi-Fi networks, turn on Tailscale on the Mac and iPhone with the same account; OpenBot automatically promotes the private `100.x` address and pairing link. An HTTPS reverse proxy is also supported. Never expose OpenBot's plain local port to the public internet.

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

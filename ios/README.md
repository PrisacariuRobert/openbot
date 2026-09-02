# OpenBot for iPhone

The native companion connects to an OpenBot studio that remains hosted by the owner's Mac. It does not bundle a model runtime or copy the OpenBot database to the phone.

## Open in Xcode

1. Install the full current Xcode release.
2. From `ios/`, run `xcodegen generate` after changing `project.yml`.
3. Open `OpenBotMobile.xcodeproj`.
4. Select the `OpenBotMobile` target and choose your Apple development team under Signing & Capabilities.
5. Run on an iPhone with iOS 17 or newer.

On the Mac, start OpenBot with `npm run remote`, open **Control center → Phone remote**, and use the shown private address and access key. A trusted private network, Tailscale, or an HTTPS reverse proxy is required. Never expose OpenBot's plain local port to the public internet.

## Security behavior

- The access key is stored with `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` in the iPhone Keychain.
- The key is exchanged for OpenBot's HttpOnly session cookie and is never added to the studio URL.
- Public hostnames require HTTPS. Plain HTTP is accepted only for localhost, private IPv4 ranges, link-local/private IPv6, `.local`, and Tailscale's carrier-grade NAT range.
- The app does not bypass certificate validation.
- The bundled privacy manifest declares no tracking or collected data and records the approved app-only UserDefaults reason used to remember the studio address.
- `openbot://connect?server=...` can prefill a server address, but deep links never accept an access key.
- Forgetting the connection removes the Keychain item and matching WebKit cookies.

The native project currently provides connection, chat, approvals, attachments, artifact viewing, and reconnect/offline behavior through the same responsive OpenBot interface. Native push delivery, share-sheet ingestion, and native speech transcription require the later always-on delivery service and are not claimed yet.

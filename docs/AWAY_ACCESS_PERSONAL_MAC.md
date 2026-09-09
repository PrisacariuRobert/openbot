# Personal Mac away access

OpenBot can serve its production web UI and native iPhone API through an outbound
HTTPS tunnel. The computer remains the host: this does not make work run while it
is shut down or offline. A locked Mac can serve conversations, but individual
computer-control tasks may need an unlocked desktop.

## Installed personal deployment — 9 September 2026

- Address: `https://app.openbots.foundation/`.
- Domain registration stays at Namecheap; authoritative DNS moved to Cloudflare's
  free plan (`javon.ns.cloudflare.com`, `june.ns.cloudflare.com`). Original MX,
  SPF and parking records were retained. The apex is not a new marketing site.
- Cloudflare Tunnel `openbot-mac` routes only this hostname to `127.0.0.1:4311`.
  The final ingress rule returns 404. Vite on 4310 is not exposed.
- `com.openbot.runner` starts the existing studio from this checkout at login;
  `com.openbot.tunnel` starts the tunnel. Both are user LaunchAgents and restart
  after a process failure. They do not run before the user logs into macOS.
- The tunnel's `caffeinate -s` assertion prevents system sleep on AC power. Keep
  the Mac plugged in, online and its lid open. This does not disable the lock screen.
- Configuration: `~/.cloudflared/openbot.yml`; credentials in the same protected
  directory, never in Git. Logs: `.openbot/logs/tunnel*.log`.
- The checkout's ignored `.env` sets the public URL and loopback bind address.
  The runner LaunchAgent also sets these, with **local** deployment mode retained.
  Restart the runner after changing server code; rebuild web assets after UI edits.
- With the owner's approval, this Mac's Wi-Fi DNS was changed from automatic to
  `1.1.1.1` / `1.0.0.1` because the ISP cached the old delegation. The existing
  Tailscale DNS integration was refreshed and restored enabled; the VPN was not
  disconnected. To restore automatic Wi-Fi DNS, use
  `networksetup -setdnsservers Wi-Fi Empty`.
- Cloudflare terminates HTTPS and transports traffic to this Mac. It is trusted
  infrastructure, not end-to-end encrypted application transport. No router port
  forwarding, paid Cloudflare plan or phone VPN is required.

## Access protection

The web shell is public, but private APIs, attachments and event streams require
an access key or paired device credential. Tunnel requests cannot use the local
owner bypass. Exact-origin browser write checks reject sibling-domain CSRF;
HTTPS sessions use Secure, HttpOnly, SameSite=Strict cookies. API responses are
not cacheable. Cloudflare redirects HTTP to HTTPS and requires TLS 1.2 or newer.

Pairing is managed on the Mac only. Each QR invitation expires after five minutes;
the phone generates its own credential and stores it in Keychain. Removing the
device also closes its existing event streams. Do not publish QR codes or keys.

## Verification gates

This installation passed the real public HTTPS identity/unauthenticated guard
checks after DNS propagated. A temporary paired device then accessed the studio,
received server events, was blocked from owner-only pairing controls, and lost
access (including its open stream) on revocation. The temporary device was revoked.
These tests did not send messages, invoke models or change connected accounts.
The application verification passed 620 tests plus 14 packaging/desktop tests;
signed iOS simulator tests passed 29 unit tests and the conversation/settings/
routine visual workflow. Physical iPhone installation and launch succeeded.
The owner's iPhone then appeared in the live paired-device list at 22:29:42 UTC
on 8 September (00:29:42 local on 9 September); the unused follow-up QR was
cancelled. A Wi-Fi-off cellular task remains the user's final field test.

- `npm run test:https-tunnel`: isolated real HTTP server checks proxy impersonation,
  native pairing, secure cookies, browser-origin rejection, owner-only controls,
  event streaming and revocation without model usage.
- `npm run verify`: source contracts, packaging tests, application tests,
  typechecks and production build.
- Native simulator QA needs code signing for Keychain, even with ad-hoc identity
  `CODE_SIGN_IDENTITY=-`. An unsigned simulator build can compile but cannot be
  counted as a successful connection test.
- The signed Personal Team iPhone preview was installed and launched. It has
  in-app conversations and approvals, but no APNs or system Share-sheet delivery.
  Its development profile expires and needs periodic renewal; it is not an App
  Store or TestFlight release.
- Do not call the setup fully accepted until public HTTPS passes the exact-studio
  identity and unauthenticated guard checks, and the phone has paired and completed
  a cellular-network test. A running tunnel alone is not enough.

## Stop or recover

From this Mac, remove a phone in Away access to revoke it immediately. To stop
all public access, unload `~/Library/LaunchAgents/com.openbot.tunnel.plist` using
`launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.openbot.tunnel.plist`.
Load it again with `launchctl bootstrap` after correcting configuration. Removing
the `app` DNS record also removes the domain route; do not delete unrelated DNS
records or tunnels. The former registrar nameservers were
`dns1.registrar-servers.com` and `dns2.registrar-servers.com`; switching back needs
DNS propagation and disables the Cloudflare domain route.

After reboot: log into macOS, keep AC power connected, open Away access, and wait
for a fresh check. If DNS is newly changed, a local resolver may temporarily retain
the old address even when authoritative DNS and other networks already work.
Never bypass a certificate warning or disable authentication to work around this.

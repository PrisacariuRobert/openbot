# Reach your Mac from your phone

Sidemates can serve its web studio through an outbound HTTPS tunnel that you set up, so the Home Screen web app on your phone reaches the studio on your Mac. The Mac stays the host: nothing runs while it is shut down, asleep or offline. A locked Mac can still serve conversations, but some computer-control tasks need an unlocked desktop.

This is an advanced setup. The simplest way to reach your team from a phone today is the Telegram channel in Settings. Pairing with one scan is on the roadmap.

## What you need

- A domain you control, for example `example.com`, with its DNS on a provider that offers tunnels. Cloudflare's free plan works; no paid plan, router port forwarding or phone VPN is needed.
- The tunnel client for that provider (for Cloudflare, `cloudflared`) on your Mac.
- Sidemates running on the Mac (the installed app serves the studio on `127.0.0.1:4311`).

## Set it up

1. Create a tunnel that routes **only** one hostname, for example `app.example.com`, to `http://127.0.0.1:4311`. End the ingress rules with a 404 so nothing else is exposed. Never expose the development server on port 4310.
2. Tell Sidemates its public address: set `OPENBOT_APP_URL=https://app.example.com/` for the studio, and keep it bound to loopback (`OPENBOT_HOST=127.0.0.1`, the default). Keep **local** deployment mode.
3. Start the tunnel at login with a user LaunchAgent of your own (for example `com.example.sidemates-tunnel`). Keep the tunnel's configuration and credentials in your home folder, never in Git.
4. Keep the Mac on power and online if you need it reachable. A closed lid still sleeps it.
5. On the Mac, open **Settings → Your phone** and pair your phone. Each invitation expires after five minutes.

## Access protection

The web shell is public, but private APIs, attachments and event streams need an access key or a paired device credential:
- Requests through the tunnel can't use the local owner bypass.
- Exact-origin checks reject cross-site writes.
- HTTPS sessions use Secure, HttpOnly, SameSite=Strict cookies, and API responses are not cacheable.
- Removing a device closes its open event streams at once.
- Never publish QR codes or keys.

The tunnel provider terminates HTTPS and carries traffic to your Mac. It is trusted infrastructure, not end-to-end encrypted application transport. The self-hosted relay in [`deploy/relay`](../deploy/relay/README.md) is the other option, with the same caveat.

## Check it

- `npm run test:https-tunnel` checks the security behavior on an isolated real HTTP server, without using any AI: proxy impersonation, pairing, secure cookies, browser-origin rejection, owner-only controls, event streaming and revocation.
- Before you rely on it, make sure that over the public address:
  - an unauthenticated request is refused;
  - a paired phone can open the studio;
  - removing that phone cuts it off;
  - it works over mobile data with Wi-Fi off.

  A running tunnel alone is not enough.

## Stop or recover

- **Remove a phone:** do it in **Settings → Your phone** to revoke it immediately.
- **Stop all public access:** unload your tunnel's LaunchAgent with `launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/<your-label>.plist`, or remove the hostname's DNS record. Don't touch unrelated DNS records or tunnels.
- **After a reboot:** log in to macOS, keep power connected, and wait for a fresh check in Settings.
- **If you just changed DNS:** a local resolver may briefly keep the old address. Never bypass a certificate warning or turn off authentication to work around it.

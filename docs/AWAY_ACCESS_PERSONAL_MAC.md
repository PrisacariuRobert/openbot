# Reach your Mac from your phone

Sidemates can serve its studio to your phone over the internet through an outbound HTTPS tunnel. Your Mac stays the host: this doesn't make work run while it is shut down, asleep or offline. A locked Mac can still serve conversations, but some computer-control tasks need an unlocked desktop.

This guide describes one way to set it up: a [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) on a domain you own, on Cloudflare's free plan. It needs no router port forwarding and no VPN on the phone. Replace every `<placeholder>` with your own value, and keep your real values out of Git.

## What you need

- A domain whose DNS is managed by Cloudflare. Keep any existing mail (MX, SPF) records when you move DNS there.
- `cloudflared` installed on the Mac.
- Sidemates installed and running on the Mac (it listens on `127.0.0.1:4311`).

## Set it up

1. Create a named tunnel and route one hostname to it:

   ```sh
   cloudflared tunnel login
   cloudflared tunnel create <tunnel-name>
   cloudflared tunnel route dns <tunnel-name> <studio.example.com>
   ```

2. Write `~/.cloudflared/<tunnel-name>.yml`. Send only that hostname to the studio, and end with a rule that answers 404 for everything else. Don't expose the development server on port 4310.

   ```yaml
   tunnel: <tunnel-name>
   credentials-file: /Users/<you>/.cloudflared/<tunnel-id>.json
   ingress:
     - hostname: <studio.example.com>
       service: http://127.0.0.1:4311
     - service: http_status:404
   ```

   The credentials file stays in that folder, readable only by you, and never goes into Git.

3. Tell Sidemates its public address. Set `OPENBOT_APP_URL=https://<studio.example.com>` in the environment of the Sidemates background service and restart it. Keep the bind address on loopback (`OPENBOT_HOST=127.0.0.1`); the tunnel connects from the Mac itself.

4. Keep the tunnel running. Start it at login with a user LaunchAgent (any label you like, for example `<com.example.sidemates-tunnel>`) that runs `cloudflared tunnel --config ~/.cloudflared/<tunnel-name>.yml run`. LaunchAgents only start after you log in to macOS.

5. Keep the Mac awake and online: plugged in, lid open, and something that prevents system sleep while the tunnel runs (for example `caffeinate -s` on AC power). This doesn't turn off the lock screen.

6. In Sidemates, open **Away access**. It checks that the public address reaches this exact studio and that private pages refuse a visitor without a key. Then choose **Connect my phone** and scan the code with the phone's camera.

If your own computer still sees the old address right after a DNS change, its resolver may be caching the previous answer. Wait, or test from another network. Never bypass a certificate warning or turn off sign-in to work around it.

## Access protection

- The web page itself is public, but private APIs, attachments and live updates need an access key or a paired device. Requests that come through the tunnel can't use the local owner shortcut.
- Browser writes are checked against the exact origin, so a sibling domain can't send requests on your behalf. Sessions use Secure, HttpOnly cookies, and API responses aren't cached.
- Pairing happens on the Mac only. Each QR code works once and expires after five minutes. The phone's browser gets its own device credential, and removing the phone in **Away access** signs it out and closes its open connections.
- Never publish a QR code or an access key.
- Cloudflare terminates HTTPS and carries the traffic to your Mac. That makes it trusted infrastructure: the connection is encrypted to Cloudflare and from Cloudflare to your Mac, not end to end.

## Check it before you rely on it

- `npm run test:https-tunnel` runs a real local HTTP server and checks proxy impersonation, pairing, secure cookies, browser-origin rejection, owner-only controls, live updates and revocation, without using a model.
- Call the setup accepted only when **Away access** shows the secure connection as checked and a paired phone has completed a task over mobile data with Wi-Fi off. A running tunnel alone isn't enough.

## Stop or recover

- To disconnect one phone, remove it in **Away access** on the Mac.
- To stop all outside access, unload the tunnel's LaunchAgent: `launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/<com.example.sidemates-tunnel>.plist`. Load it again with `launchctl bootstrap` once the configuration is right.
- Deleting the hostname's DNS record also removes the route. Don't delete unrelated DNS records or tunnels.
- After a restart: log in to macOS, plug in the Mac, open **Away access** and wait for a fresh check.

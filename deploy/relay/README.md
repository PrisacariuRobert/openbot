# OpenBot relay (private pilot)

This runs on the **operator's server**, not as another application installed by
Mac or iPhone users. End users install only OpenBot. It is a tested development
transport, not an operated public service or a security-certified release.

## Self-hosted with the private runner (simplest)

If you are deploying the studio itself with `deploy/private-runner/setup.sh`,
add `--relay relay.example.com` (after creating a second DNS record). The
runner setup starts the relay in the same image, generates the enrollment
secret, and wires the studio automatically — no separate Render service,
reverse-proxy setup or database configuration is needed. Use this section's
remaining notes for operator-level expectations; the Render Blueprint stays an
alternative for a separately hosted relay.

## Infrastructure needed

- A server with a supported Node runtime (`node:sqlite`) and this repository.
- One HTTPS hostname. The provider's included hostname, for example
  `your-relay.onrender.com`, works: **no bought domain or wildcard DNS required**.
- A TLS reverse proxy with WebSocket upgrade support,
  request buffering off for streams and an upstream
  timeout longer than 90 seconds. Do not expose the relay's plain HTTP port.
- A durable, owner-only directory for `hosts.sqlite`, backups and monitoring.

Install the repository dependencies using the lockfile. Set these server values:

```text
OPENBOT_RELAY_DATABASE=/absolute/private/path/hosts.sqlite
OPENBOT_RELAY_ENROLLMENT_TOKEN=<random operator secret, at least 32 characters>
```

Run `npm run relay:serve` under your server supervisor. By default it listens on
`127.0.0.1:8080`; the reverse proxy is the only public listener. Enforce upload,
connection and request-rate limits at the edge. Do not log Authorization headers
or request/response bodies. Bind the TLS certificate only to your actual domain.

For a privately provisioned studio, configure its OpenBot runner once:

```text
OPENBOT_RELAY_URL=https://your-relay.onrender.com
OPENBOT_RELAY_ENROLLMENT_TOKEN=<operator provisioning secret>
```

After initial enrollment, the enrollment token can be removed from the studio;
its private relay identity remains in its data directory. Restart OpenBot and open
Away access. It checks its stable HTTPS address before offering a phone QR code.
Do not distribute an operator enrollment token in a public app or public repo.

## Render pilot: use its included address now

The checked-in [Blueprint](render.yaml) prepares a single relay with a persistent
identity database, health check, generated provisioning secret and manual deploys.
It does **not** deploy anything merely by existing in this repository.

1. Publish the reviewed code to a branch you approve. In your Render account,
   create a Blueprint from that repository/branch and select
   `deploy/relay/render.yaml` as the Blueprint path. Keep the repository root as
   the service root; the commands need the root lockfile and package scripts.
2. Review the compute and disk charges before approving creation. This template
   uses **paid** compute and a 1 GB disk, not Render's sleeping free tier. Persistent
   identities are necessary for studios to reconnect after a relay restart.
3. Wait for the service to be healthy. Copy its assigned HTTPS service address,
   not a guessed name, into the Mac runner's `OPENBOT_RELAY_URL`. Configure the
   generated enrollment secret privately in `OPENBOT_RELAY_ENROLLMENT_TOKEN`.
   Never paste that secret into chat, the repository, or the iPhone.
4. Restart the Mac runner and open Away access. A studio address looks like
   `https://your-relay.onrender.com/s/<studio-id>`. The app checks that exact
   address and requires unauthorized access to remain blocked before making a QR.
5. Scan with the updated native iPhone app. Turn off phone Wi-Fi and verify live
   updates, an attachment and a harmless message; revoke the phone and verify
   rejection. These public TLS/cellular checks still require a real deployment.

The Mac still needs to stay awake. A healthy `/healthz` checks **the relay process**,
not whether a particular Mac is online. Keep one replica: this SQLite/live-tunnel
pilot is not horizontally distributed. Back up its durable database. Restarts
briefly disconnect phones; clients reconnect, but uncertain writes are not replayed.

This hostname is **native API only**, not a hosted browser version of OpenBot.
Cookie authentication, browser-origin requests, web assets and active HTML are
blocked/sandboxed on the shared origin. Use the native iPhone app; connect provider
accounts and complete browser OAuth flows on the Mac. Each studio's bearer keys
and QR invitations are checked by its own independent runner. IDs are routing
labels, never authorization. Arbitrary third-party WebSocket upgrades are not supported.

### When we rebrand

Add the chosen branded hostname to the same host with HTTPS and update the Mac's
relay URL. Keep the relay database and the Mac's `relay-identity.json` intact.
Generate a new QR to update the phone's saved address; revoke its old key after
the new connection works. Never redirect a pairing/login request: native clients
deliberately refuse credential redirects. A provider-to-provider migration also
requires moving the durable relay identity database.

References: [Render web services](https://render.com/docs/web-services),
[persistent disks](https://render.com/docs/disks),
[Blueprint configuration](https://render.com/docs/blueprint-spec).

## Trust and remaining release work

TLS terminates at the operator's proxy. **The operator can inspect traffic.** This
is not E2EE; retain owner-controlled hosting for the pilot. The relay persists
only host IDs and secret hashes, not files or conversations. It does not eliminate
the requirement to keep the studio Mac awake. Apple push has separate setup.

Before a general public service: provision per-owner accounts/invitations, build
operator revocation and secret rotation, validate the hosted deployment, establish
abuse/quota policies, perform independent security review, test TLS/cellular and
failure recovery, and implement E2EE if an untrusted operator must not see content.
No claim of free managed hosting, unlimited capacity or uptime is made.

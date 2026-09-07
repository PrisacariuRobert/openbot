# Built-in away access — 0.35.0 development

## User experience

Only OpenBot is installed on the Mac and iPhone. There is no Tailscale, VPN,
Cloudflare daemon, terminal command or networking-account requirement on either
device in the built-in flow. On the Mac, Settings → Away access prepares a QR
code. On iPhone, Scan my Mac’s QR code → confirm your studio connects it.
The website has the same Away access panel. Manual key entry is advanced only.

**Not live yet:** a hosted relay and HTTPS must be provisioned before this
installation works over cellular. The app deliberately says setup is needed.
The hosting provider's included address works; no custom domain or wildcard DNS
is required. The Render template prepares infrastructure but has not been deployed.
The Mac must remain awake; the relay does not run agents when the Mac is off.
We have not installed another networking app, enabled Funnel, exposed this
studio, purchased hosting or changed the owner's existing Tailscale settings.

## Implemented

- An outbound WebSocket transport runs inside OpenBot's bundled Node runner,
  using its own durable host identity. No incoming router ports are needed.
- One hostname supports independent studios at `/s/<24-hex-studio-id>`. Routing
  strips that prefix once and preserves API query strings. QR creation, readiness
  probes, native saved addresses, login, files and event requests retain the studio
  base path. Malformed/encoded/traversal routing paths are rejected.
- The open-source relay service forwards bounded requests and streamed responses,
  including live events. Host enrollment is authenticated and identities persist.
  Heartbeats and bounded backoff reconnect; interrupted HTTP writes are not replayed.
- Pairing uses a five-minute, single-use invitation. Only the short-lived invitation
  appears in the QR fragment; it contains no owner key. The iPhone generates its
  own random 256-bit credential, claims it, and saves it in Keychain.
- The host stores hashes of invitations/device credentials. A lost claim response
  can be retried by that same credential, not by a different phone. New invitations
  invalidate older unclaimed ones. Owners can cancel and revoke from Mac/web.
- Revocation rejects future API requests and closes the phone's existing live
  event streams. It does not cancel work already requested by that phone.
- Loopback sockets no longer suffice to bypass authentication: public authority,
  relay/proxy headers and cross-site origins are rejected as local-owner proof.
- A green state needs the correct studio response over HTTPS and an unauthorized
  response from a protected endpoint. A LAN or private VPN IP is never enough.
- Native connection/API clients refuse HTTP redirects rather than forwarding
  credentials to a new endpoint. Camera images are not saved or uploaded.

## Security and operation boundaries

The relay is **trusted infrastructure**. TLS protects each network hop; this is
not end-to-end encryption against the relay operator. The relay does not persist
chat/file bodies, but its operator can inspect traffic and credentials in transit.
Use an owner-controlled relay for this pilot. Independent security review and an
end-to-end encrypted transport remain public-service release gates.

The included operator enrollment token is for private pilots, not a secret to
ship in public binaries. Public onboarding needs per-owner provisioning, abuse
controls, operator credential rotation/revocation, monitoring and capacity work.
Request bodies are capped at 25 MiB, active requests at 16 per studio, and
simultaneous body uploads at four across the relay. Slow clients are bounded.
Event streams reconnect after the relay's bounded request lifetime.

The shared-host relay supports native HTTP APIs and event streams, not a browser
UI, browser OAuth callbacks or arbitrary WebSocket upgrades for third-party
remote-desktop protocols. Use the Mac for browser sign-in. Requests cannot use
cookies for authentication; browser-origin/context requests are refused, response
cookies are removed, and responses enforce a sandbox CSP and no-store caching.
Phone actions retain existing approvals.
No model/provider connection is required by this transport test.

## Verification

2026-09-05, hosted-address revision: `npm run verify` passed (255 TypeScript tests, release/source
contracts, application and acceptance typechecks, production web build).
Native XCTest passed on macOS (17 tests) and the iOS simulator (10 tests).
The current disposable API acceptance test uses two independent real OpenBot
processes on one relay hostname, with no test-only routing header or wildcard DNS.
It verifies cross-studio QR/key rejection, native-only cookie/browser boundaries,
query-preserving attachment upload/download, cross-studio file rejection,
live event revocation and independent offline/reconnect behavior. Unit tests cover
strict URL paths and readiness probes reaching the exact selected studio.

Earlier QR revision installation checks (not a claim that this newer build is
already on the physical phone):
The packaged Mac runner passed its cold-start and live-stream shutdown checks.
The QR-first iPhone screen was visually inspected in Device Hub; live camera
scanning is not simulated by those tests. The browser's relay-not-configured
screen was also inspected against the running production build.
The updated, signature-verified Mac Preview was installed and its native Away
access sheet was inspected. The previous Preview was retained in Applications
as `OpenBot Preview before QR pairing 2026-09-05.app`. A signed Personal Team
iPhone build was installed on the paired physical iPhone. Launching the app
on the physical phone was blocked because it was locked; physical
camera/cellular operation has not been verified. A synthetic pairing
deep link opened the simulator's explicit studio-confirmation sheet and was
cancelled without sending a connection request to the example address.

- `npm run test:away-access`: real disposable OpenBot server through the built-in
  client and relay; denies unauthenticated/spoofed-local access, claims and retries
  a pairing invitation, permits device login, denies owner-only settings, streams
  events, closes the stream on revocation, rejects the revoked key after reconnect,
  returns offline status when disconnected, and does not advertise LAN as away-ready.
- Unit tests: expired/replayed/replaced/cancelled invitations, no credential leaks
  in device lists, strict local-origin handling, malformed cookies, HTTPS pairing
  links and readiness identity/access checks.
- Native macOS and iOS simulator builds and tests run separately; this is not a
  physical-camera or cellular-network acceptance result.
- Final field test still required: scan on a physical iPhone, turn Wi-Fi off, send
  a harmless task, approve a test action, restart the Mac host, reconnect and revoke.

## Operator setup

See [the relay deployment guide](../deploy/relay/README.md) and Render Blueprint.
The YAML parses and its durable path, single-instance configuration and generated
secret were checked locally; it has not been validated by a deployed Render service.
The pilot can use Render's included address now, with a branded address later.
No hosting account/service has been provisioned for this workspace.

## Turnkey self-hosted relay (working tree)

`deploy/private-runner/setup.sh --relay` folds the relay into the private-runner
deployment instead of requiring a separately hosted service:

- A compose `relay` profile (enabled by `COMPOSE_PROFILES=relay` in `.env`) runs
  the relay from the same reviewed image on a durable host-owned database.
- A separate `Caddyfile.relay` serves the studio and relay hostnames from one
  TLS listener; WebSocket upgrades pass through unbuffered.
- `setup.sh` generates the enrollment secret, records `OPENBOT_RELAY_URL` for
  the studio, adds the relay data directory with owner-only permissions, and
  prints the DNS requirement for the second hostname.

Locally verified on Docker: the production image builds and starts the relay
service; inside the container the relay passed health check, rejected a bad
enrollment token (401), rejected a malformed secret (400), completed a verified
enrollment (204), and routed `/s/…` requests to 503 both for an enrolled offline
studio and an unknown studio. The studio container with a configured but
unreachable relay stayed healthy (`/api/healthz` kept returning ok), so a DNS or
relay outage degrades gracefully. Compose `config` renders correctly with and
without the profile, hiding the relay service entirely in the default mode.

Not verified here: Docker Desktop's file sharing forces host-owned mount
ownership, so container bind mounts could not be exercised on this Mac; a real
Linux host (where `setup.sh` creates `install -d -o 1000` directories) plus a
real domain and a physical phone remain the final acceptance gates. The
relay-to-relay HTTPS constraint means a same-container plaintext test can't
drive the client's enrollment; that path is covered by the protocol tests above.

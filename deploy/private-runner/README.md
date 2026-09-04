# OpenBot private runner

This optional deployment gives one owner an always-on OpenBot home on a Linux server they control. The local Mac mode remains the default. Nothing is copied to a server unless the owner chooses this mode and moves the data.

## What it provides

- OpenBot, OpenCode, Chromium, Git, and the Docker client in one reviewed image
- Caddy-managed HTTPS with secure proxy-aware login cookies
- Durable studio, model-login, browser-profile, attachment, and project directories
- The same single-leader job claims, recovery, approvals, budgets, and activity receipts as local mode
- A public health check that reveals only readiness and deployment mode
- Automatic restart after host or process restarts
- An optional empty outside heartbeat so an independent service can notice a complete host or network outage
- Authenticated passphrase-encrypted export/import for the complete studio, model-login state, browser profiles, and projects

## Before you start

Use a small Linux VPS or home server with Docker Engine and the Compose plugin. Point a domain at the server and allow inbound TCP 80/443 plus UDP 443. Keep SSH restricted and patched. The container talks to the host Docker socket so it can create isolated teammate computers; anyone who can modify the OpenBot container configuration can therefore control Docker on that host. Use a dedicated server, not a shared production Docker host.

## Start it

From a checked-out OpenBot release:

```bash
./deploy/private-runner/setup.sh studio.example.com
```

The setup creates owner-only folders at `/srv/openbot`, records the Docker socket group, builds the image, and starts Caddy plus OpenBot. When the container is healthy:

```bash
sudo cat /srv/openbot/data/access.token
```

Open `https://studio.example.com`, paste that key once, and connect the native iPhone app to the same HTTPS address. The key is never placed in a pairing URL.

## Connect a model

Use OpenBot's **Model connections** screen for an encrypted API-key connection. For an OpenCode account or supported subscription login, keep the interactive credentials on the private host:

```bash
docker compose --env-file deploy/private-runner/.env -f deploy/private-runner/docker-compose.yml exec openbot opencode auth login
```

OpenCode stores those credentials in the mounted `/srv/openbot/home` directory. `opencode auth list` shows what is ready. OpenBot never receives the account password.

## Connect apps

OAuth providers must register the HTTPS callbacks displayed by **Apps & Tools**. For example, Google uses `https://studio.example.com/api/connectors/google/callback`. Add the reviewed client id/secret to `.env`, recreate the service, and press **Connect** in OpenBot.

## Projects and private computers

Clone server-side code projects under `/srv/openbot/projects`, then add those exact paths in OpenBot. The same host path is mounted into the app container so Docker can create isolated task worktrees and test containers without touching a laptop checkout.

## Updates and backups

Use the guided updater from a clean checkout:

```bash
./deploy/private-runner/update.sh
```

The updater accepts `origin/main` by default or an explicit release tag such as `v0.27.0`. It refuses a dirty or diverged checkout, creates a consistent backup before changing source, builds while the current service remains available, waits for the replacement to become healthy, and restores the previous container image if that check fails. Successful updates appear in **Automations → Home check**.

Backups are stored under `/srv/openbot/backups` with owner-only permissions. The backup script records the successful time and size so Home check can warn when protection is missing or stale. The archive includes the encryption key, connector tokens, model logins, browser profiles, and studio history. Protect it like a password vault. Projects are intentionally not included because they can be large; back them up separately.

## Know if the whole home goes offline

Open **Automations → Home check** and paste the private HTTPS URL supplied by an external heartbeat service. OpenBot encrypts that URL and sends one empty check-in every five minutes. It never adds prompts, files, diagnostics, credentials, or an OpenBot identifier. The external service—not OpenBot—must alert you after check-ins stop, which is what lets it detect a complete host or network outage.

Only public HTTPS on port 443 is accepted. OpenBot rejects local/private/reserved addresses, checks every DNS answer, and pins the request to a validated public address. Treat the URL itself as a secret because most heartbeat services use it as the monitor credential.

## Move an existing studio safely

Create one encrypted transfer file from the source host:

```bash
./deploy/private-runner/export-home.sh
```

The script asks for a passphrase twice without echoing it, briefly stops OpenBot for a consistent snapshot, and writes an owner-only `.openbot-home` file under `/srv/openbot/transfers`. Move that file over a trusted channel to the destination host's `/srv/openbot/transfers`, then run:

```bash
./deploy/private-runner/import-home.sh your-transfer.openbot-home
```

Import authenticates the complete file before extraction, validates that it contains only the expected `data`, `home`, and `projects` roots, rejects links and special files, and stages the candidate while the current studio remains available. It then creates a fresh backup, swaps the complete home, waits for OpenBot health, and restores the previous roots if anything fails. The prior home is retained after success for deliberate cleanup.

The passphrase never enters the web or iPhone app. Keep the archive and passphrase separate and delete the transferred file only after verifying the new host. This is copy-and-switch, not live synchronization: keep one authoritative data location for OpenBot. Existing absolute Mac project paths may need reconnecting on Linux, while projects already below `/srv/openbot/projects` move with the archive.

# OpenBot private runner

This optional deployment gives one owner an always-on OpenBot home on a Linux server they control. The local Mac mode remains the default. Nothing is copied to a server unless the owner chooses this mode and moves the data.

## What it provides

- OpenBot, OpenCode, Chromium, Git, and the Docker client in one reviewed image
- Caddy-managed HTTPS with secure proxy-aware login cookies
- Durable studio, model-login, browser-profile, attachment, and project directories
- The same single-leader job claims, recovery, approvals, budgets, and activity receipts as local mode
- A public health check that reveals only readiness and deployment mode
- Automatic restart after host or process restarts

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

Create a consistent owner-only backup before updating:

```bash
./deploy/private-runner/backup.sh
git pull --ff-only
docker compose --env-file deploy/private-runner/.env -f deploy/private-runner/docker-compose.yml up -d --build
```

The archive includes the encryption key, connector tokens, model logins, browser profiles, and studio history. Protect it like a password vault. Projects are intentionally not included because they can be large; back them up separately.

## Move an existing local studio

Stop OpenBot on the Mac before copying `.openbot` to `/srv/openbot/data`. Copy the whole directory, including `keys/vault.key`; individual encrypted token files are not portable without that key. Existing absolute Mac project paths will not work on Linux, so re-add projects from `/srv/openbot/projects`. Do not run local and private copies against separate copies of the same studio and expect them to synchronize—0.24 has one authoritative data location, chosen by the owner.

# OpenBot 0.24.0

OpenBot is an open-source, owner-controlled home for persistent AI teammates. Run it locally on a Mac or choose an always-on private host you control. It combines a friendly messaging interface with private bot computers, browser work, durable routines, bounded teammate communication, teach-by-demonstration, and clear approval boundaries.

The preferred test model is **DeepSeek V4 Flash** through the user's own OpenCode Go account, with Muse Spark 1.2 Free as a no-cost fallback. OpenBot never pools or resells model access.

## What's new in 0.24.0

- Added an optional **private always-on runner** for a Linux VPS or home server, so schedules, connectors, browser work, and code jobs can continue when the owner's Mac is asleep or off.
- Added a reviewed Docker Compose package with Caddy-managed HTTPS, automatic restarts, persistent studio/model/browser storage, Chromium, OpenCode, and access to isolated teammate computers.
- Private-runner mode now fails closed unless it has a canonical HTTPS address and absolute durable data path. Every OAuth callback and signed webhook uses that public address.
- Added a minimal unauthenticated health check, proxy-aware secure login cookies, repeated-login throttling, HSTS/security headers, and no public plain-text app port.
- Added matching web and native status language that distinguishes **This Mac** from a **Private always-on home** and shows where data lives.
- Added owner-only setup and consistent backup scripts plus honest migration guidance. Moving a local studio is explicit; OpenBot never silently uploads or synchronizes it.
- Preserved native voice, proactive Todoist/Dropbox work, APNs, Share-sheet handoff, durable approvals, one-voice agent consultation, model choice, and the animated customizable character system from 0.23.

## What is included

- Named teammates with stable roles, personality, memory, files, model, connection, and token limit
- Direct chat plus a shared studio where up to three bots work in parallel
- A Live Studio that combines all teammate desks, durable attention items, task progress, browser previews, stop controls, and owner takeover
- Local search across conversations, files, routines, skills, and teammates, plus persistent reply context and reactions
- Sidebar pins and custom sections, reversible hide/restore, and setup-only teammate duplication without copying private history
- Natural `@name` and `@everyone` routing, automatic role-based ownership, and a `/` picker for learned skills
- Rich file attachments (up to six files, 25 MB each) with bounded PDF/Office/spreadsheet/text extraction, media handoff to compatible models, and copies in only the selected teammates' private inboxes
- Contained image/PDF previews, extracted-text previews, accurate file-kind icons, friendly unsupported-file recovery, and hardened downloads
- Automatic result cards for teammate-created files, including revision numbers and preserved earlier versions
- Browser voice typing plus deliberate native iPhone speech capture with an editable transcript; OpenBot stores the text, not the microphone recording
- Private bot-to-bot questions, findings, replies, and deduplicated handoffs, with one coordinator-owned final answer and an inspectable Team signals feed
- Three-hop/eight-task teamwork limits that prevent accidental agent loops
- Live streaming text, activity history, token/cache/cost usage, and a studio control center
- A persistent completion contract for real jobs: clear outcome, deliverable, live checklist, approval boundary, and recorded final checks
- Compact result receipts that show whether the work was checked and let the user expand the supporting steps and evidence
- One-click GitHub cloning or local code-project connections with separate read-only, code-and-test, or no-access choices for every teammate
- Project-aware code listing, search, reading, exact edits, atomic file creation, per-task Git worktrees, bounded diffs, scoped commits, and network-isolated checks
- A recoverable local code-change trail; restore points refuse to overwrite newer work, and disconnecting never deletes project files
- Independent teammate code review of the exact tested commit before approval-gated GitHub pull-request publishing
- A persistent, constrained Docker computer for every bot
- A persistent Chrome profile for every bot with open, read, click, type, and screenshot tools
- A versioned Skill Library with visible teach mode, editable instructions, starter templates, teammate assignment, portable integrity-checked import/export, secret scanning, rollback, chat discovery, and OpenCode/Claude Code generation
- Dependable automations with five-minute/hourly/daily schedules, signed generic and GitHub webhooks, Google Calendar triggers, narrow filters, editing, pause/resume, explicit test runs, event receipts, replay, result links, and safe deletion
- Proactive Todoist task and Dropbox folder-change triggers with durable cursors, fresh-start baselines, and connector-specific filters
- Duplicate-event protection, rate limits, loop headers, bounded retained inputs, visible failure guidance, approval-wait alerts, missed-schedule notices, and automatic pausing after three consecutive failures
- A durable single-leader runner with atomic job claims, renewable leases, graceful shutdown handoff, crash recovery, visible health, optional macOS login/crash protection, and an optional private always-on Linux home
- A durable notification outbox plus standards-based Web Push for installed secure web apps, including direct links to results and approval waits
- Native iPhone APNs registration and delivery with per-device retries, stale-token cleanup, and conversation/approval deep links
- Persistent approvals for destructive, publishing, communication, purchasing, credential, and system actions
- Provider instances owned by the local user and explicitly assigned per bot
- Provider-aware connections for OpenCode, Claude, ChatGPT/OpenAI, GitHub Copilot, GitLab Duo, and SuperGrok/xAI
- An official Claude Code runtime adapter with the same isolated workspace, browser, memory, approval, and teamwork tools
- AES-256-GCM encrypted API keys with a machine-local 0600 vault key
- Responsive desktop/phone UI, installable PWA shell, finish notifications, connection recovery state, and authenticated remote mode
- Native SwiftUI iPhone app with conversations, teammate targeting, voice-to-editable-text capture, message sending, live task/approval state, Keychain-backed API access, offline/reconnect state, and address-only deep linking
- Embedded iOS Share extension for securely handing text, links, images, and files into the active OpenBot conversation
- Customizable code-drawn mascots with independent blink/idle timing plus work, wait, laugh/celebrate, and failure expressions tied to real execution state
- One-click Google sign-in for release builds, plus a credentials-file flow for self-hosters with no manual ID copying
- Real Gmail search/read and approval-gated sending, Google Drive search/document reading, and Google Calendar agenda access
- Official GitHub CLI connection for notifications, issue search, and approval-gated issue creation
- Slack search, bounded conversation reading, and approval-gated channel messages or thread replies
- Notion page search, bounded page reading, and approval-gated content append for pages selected during connection
- Todoist active-task reading and approval-gated task creation, with runtime-created local OAuth credentials for one-click setup
- Read-only Dropbox search and bounded text/code reading with official offline OAuth refresh
- Per-teammate permissions for Inbox, sending, Drive, and Calendar—rather than exposing every connected app to every bot
- Per-teammate Slack read/post, Notion read/update, Todoist read/create, and Dropbox read permissions, backed by the same connector health and audit contract
- Natural connected-app suggestions plus useful starter workflows that combine calendar, tasks, cloud files, conversations, knowledge, and code activity
- Owner-controlled access to visible Mac home folders, with bounded text reading and approval-only file organization that cannot delete or overwrite
- Safe Markdown chat rendering for headings, lists, links, tables, quotes, and code instead of showing raw formatting characters
- Rebuilt connector cards with contained status labels and recognizable vector service marks at desktop and phone sizes

## Start

Requirements:

- Node.js 22.13 or newer
- [OpenCode](https://opencode.ai/docs/) installed and connected to your account
- Optional [Claude Code](https://docs.anthropic.com/en/docs/claude-code/getting-started) for Claude Pro, Max, Team, Enterprise, or Console access
- Google Chrome or Chromium for browser work
- Docker for private bot computers
- Optional [GitHub CLI](https://cli.github.com/) for GitHub activity, issues, and publishing pull requests
- Optional Slack, Notion, and Dropbox OAuth applications for self-hosted connector use; Todoist registers its local OAuth client automatically

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:4310](http://127.0.0.1:4310).

Run the full local verification suite with:

```bash
npm run verify
```

### Optional private always-on home

The default remains local. To keep OpenBot working while the Mac is off, use a dedicated Linux host with Docker, point a domain at it, and run:

```bash
./deploy/private-runner/setup.sh studio.example.com
```

Caddy exposes only HTTPS, OpenBot keeps its studio under `/srv/openbot`, and new devices still require the private access key. Read the complete threat model, setup, model-login, OAuth callback, project, migration, update, and backup instructions in [deploy/private-runner/README.md](deploy/private-runner/README.md).

## How model ownership works

Every provider connection belongs to the local owner. A bot stores only the ID of its assigned connection. OpenCode-backed accounts use OpenCode's official provider flows. Claude accounts use the official Claude Code login and runtime; OpenBot does not use the unofficial Claude subscription plug-ins prohibited by Anthropic. Optional API-key connections are encrypted before they reach SQLite and are materialized only into the selected bot process.

Claude subscription use is governed and metered by Anthropic. Depending on Anthropic's current policy and the account, third-party/print-mode use may draw from plan limits or usage credits. A Claude.ai chat plan and Anthropic API billing are not interchangeable.

Model runtimes receive a small allowlisted environment rather than the server's full environment. `HOME` is available so official CLI logins can be used, while unrelated host secrets are not forwarded. Claude receives only OpenBot's workspace-safe MCP tools; host Bash and unrestricted host file tools are disabled.

## Connect Google Workspace

Open **Apps & Tools**.

- A packaged release with `OPENBOT_GOOGLE_CLIENT_ID` configured shows one **Connect Google** button.
- A self-hosted copy asks for the downloaded Desktop OAuth JSON file, encrypts it locally, and opens Google sign-in immediately. Manual client-ID entry remains under Advanced.

For self-hosting, enable the Gmail, Drive, and Calendar APIs in [Google Cloud credentials](https://console.cloud.google.com/apis/credentials), configure an External consent screen, add your account as a test user, create a Desktop OAuth client, and download its JSON file. Release maintainers can copy [.env.example](.env.example) to `.env` and add their verified client details.

Each teammate gets separate Inbox, send, Drive, and Calendar controls. Every outgoing email creates a durable approval showing its recipient, subject, and body preview. OAuth tokens never enter model context.

For personal local use, Google's testing mode can be sufficient when the account is listed as a test user. Distributing Gmail access to the public requires Google's OAuth verification; restricted Gmail scopes may also require a security assessment. See Google's [OAuth web-server guidance](https://developers.google.com/identity/protocols/oauth2/web-server), [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes), and [Gmail REST reference](https://developers.google.com/workspace/gmail/api/reference/rest).

## Connect Slack, Notion, Todoist, and Dropbox

Open **Apps & Tools** and choose Slack or Notion. A packaged build with managed OAuth credentials shows one **Connect** button. A self-hosted copy can save its own client ID and secret from the same card; the exact callback address is shown beside the setup fields.

Slack uses the connected member only for searching and reading conversations they can already access. Posting uses the installed app bot and always pauses on a preview showing the destination and complete message. A workspace administrator may need to approve the app, and the bot must be allowed in the destination channel. See Slack's [OAuth v2 documentation](https://docs.slack.dev/authentication/installing-with-oauth) and [message API](https://docs.slack.dev/reference/methods/chat.postMessage).

Notion's connection picker is the authority boundary: OpenBot can search and read only the pages the owner selected or later shared with the integration. Appending a heading or text to a page always waits for an exact preview approval. See Notion's [OAuth guide](https://developers.notion.com/docs/authorization) and [integration capabilities](https://developers.notion.com/reference/capabilities).

Both connectors encrypt their OAuth credentials locally, expose separate read/write switches for every teammate, record a private activity trail, and invalidate active model sessions as soon as access is revoked. Managed public distribution still requires registering and reviewing each OAuth app with its provider.

Todoist is the simplest path: choose **Connect Todoist** and OpenBot registers a private local OAuth client through Todoist's official dynamic-registration endpoint. Teammates can read active tasks; creating a task always shows the exact title, notes, due phrase, and priority for approval first.

Dropbox uses an official read-only OAuth app with PKCE. A packaged release needs only `OPENBOT_DROPBOX_APP_KEY` for a one-click connection; a confidential client may also set `OPENBOT_DROPBOX_CLIENT_SECRET`. A self-hosted owner can enter the same values in OpenBot and add the displayed callback address to the Dropbox app. Teammates can search metadata and read bounded supported text or code files up to 1 MB; OpenBot cannot upload, move, share, or delete Dropbox content.

## Files on this Mac

Open **Control center** and enable **Files on this Mac** once for the studio. Every current and future teammate can then inspect visible folders inside the current user's home, including Desktop, Documents, and Downloads. Hidden entries, `Library`, aliases/symbolic links, and paths outside the home folder remain unavailable. Moving files still pauses for the owner to approve the exact plan.

Text reading is limited to supported files up to 500 KB. File organization can create destination folders and move regular files, but it cannot delete or overwrite. Every proposed batch move becomes a durable approval showing the number of files and destination folders before anything changes.

## Code projects

Open **Code projects** from the conversation header or Control center. Paste a GitHub repository link to clone it into `Documents/OpenBot Projects`, choose a suggested folder from `Documents/GitHub`, `Developer`, or `Projects`, or enter a specific project folder inside your home directory. Each teammate can be set to **Code + test**, **Read only**, or **No access**.

Coding teammates can inspect project instructions, create an isolated task branch, make focused atomic edits, inspect a bounded diff, run builds or tests in a disposable Docker container, and commit only explicitly named files. Every coding task receives its own Git worktree under OpenBot's private data directory, so multiple teammates can work on the same repository at once without switching branches or changing the user's main checkout. Commands run from that task workspace with networking disabled, a read-only container system, resource limits, dropped privileges, and masks over `.git`, `.env`, and other protected hidden paths.

After the task records passing checks, the coding teammate asks a different teammate to inspect the exact commit and bounded diff. The reviewer records either **Approved** or **Changes requested** with focused findings. OpenBot refuses to publish when independent approval is missing, changes were requested, or the branch changed after review. The branch is pushed and the GitHub pull request is opened only after the owner approves the exact publish action.

Every agent write creates a local restore point. Restore succeeds only while the file still matches that exact agent edit, so newer user or agent work is never overwritten. Disconnecting a project removes access but never deletes the user's files; managed clones also stay on disk.

## Bot computers and browsers

Terminal commands use a per-bot container with:

- only that bot's workspace mounted;
- the host user's unprivileged UID/GID;
- a read-only container root;
- all Linux capabilities dropped;
- `no-new-privileges`;
- PID, memory, and CPU limits; and
- an isolated temporary filesystem.

Web work uses a separate persistent Chrome profile per bot. Live Studio lets the owner watch and directly guide that browser when sign-in or judgment is needed. Password-like fields are masked from model snapshots, and takeover text is sent directly to the focused browser field rather than stored in chat or activity. Bot navigation rejects non-web schemes, credential-bearing URLs, cloud metadata endpoints, and private LAN addresses other than localhost test pages.

OpenBot does not silently fall back to running terminal commands on the host when Docker is unavailable.

## Automations

Open **Automations** to create scheduled work or choose a Calendar, Todoist, Dropbox, GitHub, or generic webhook trigger. Calendar triggers poll the connected primary calendar. Todoist triggers can react to added, updated, or completed tasks; Dropbox triggers watch changes below a selected folder. These connector triggers establish a fresh baseline when enabled, so connecting an account does not replay old history. They require the selected teammate's matching read permission and run while the chosen OpenBot host is online. GitHub and generic webhook cards show a signed endpoint plus a secret once; configure the sender with that secret, then rotate it from OpenBot whenever necessary.

Generic hooks use `X-OpenBot-Signature: sha256=<HMAC>` and an optional `X-OpenBot-Event-Id` for exact duplicate protection. GitHub hooks use GitHub's standard `X-Hub-Signature-256`, `X-GitHub-Delivery`, and `X-GitHub-Event` headers. An endpoint must be reachable by the sender, so a webhook from the public internet needs a trusted HTTPS tunnel or reverse proxy; never expose OpenBot's plain local HTTP port directly.

Every delivery is retained as a bounded, secret-redacted event receipt and treated as untrusted input. Duplicate IDs do not create a second run, bursts are limited, explicit tests warn that real tools and approvals are available, and three consecutive failures pause the automation. OpenBot also surfaces approval waits, missed schedules detected when it wakes, retryable failures, and linked results.

Each active job is claimed atomically and renews a short lease; a second OpenBot process cannot dispatch it. After a crash or update, an expired job returns to the queue with its task contract and approval state intact. On macOS, **Keep OpenBot running** installs an owner-visible LaunchAgent, but the Mac must remain awake. Version 0.24 adds a separate private-host mode with Docker restart policy and durable storage, allowing the same runner to continue when the Mac is unavailable.

## Remote and phone access

The default service binds only to `127.0.0.1`. To build and expose it to a trusted private network:

```bash
npm run remote
```

A private access key is created at `.openbot/access.token` locally or the configured private data path. Non-local clients must sign in with it; the resulting cookie is HTTP-only and SameSite Strict, and private-host cookies are Secure behind the trusted Caddy proxy. Open **Control center → Phone remote** on a Mac-hosted studio to copy the phone address, address-only iPhone link, and key. For away access, use Tailscale with the Mac or the private runner's HTTPS domain. Never expose the plain HTTP app port directly to the public internet.

Installed web apps served from a secure HTTPS address can enable background notifications from Control center. Subscriptions stay in local SQLite, VAPID signing keys stay in a mode-0600 local file, notification payloads are short, and clicking one returns to the relevant conversation or automation. Plain HTTP remote addresses can show live in-app updates but cannot use standards-based Web Push.

The native iPhone app can register directly with APNs and receives short result and approval notifications with deep links. Release maintainers must create an Apple APNs `.p8` key and set `OPENBOT_APNS_TEAM_ID`, `OPENBOT_APNS_KEY_ID`, and `OPENBOT_APNS_PRIVATE_KEY_PATH` on the Mac host; the private key never enters the iPhone app or model context. The app and Share extension also require the `group.app.openbot.shared` App Group on the selected Apple development team. These Apple-owned signing and credential steps are required for a physical-device build; the checked-in simulator build verifies compilation and embedding but cannot prove production push delivery.

The native SwiftUI app lives in [`ios/`](ios/README.md). Generate its Xcode project with XcodeGen, select your Apple development team, and run it on iOS 17 or newer. It uses native conversation, teammate, progress, approval, Quick Look artifact, sharing, and settings views—not a web view. The access key is stored only in the iPhone Keychain and is never placed in a deep link. The installable web experience remains available when a native build is not installed.

Voice typing uses the browser or operating system speech-recognition service. OpenBot does not upload or store the audio itself, but the browser vendor may process it under its own policy.

## Owner-controlled data

Runtime data is excluded from Git:

```text
.openbot/
  openbot.sqlite
  attachments/
  access.token
  web-push.json
  keys/vault.key
  logs/
  computers/<bot>/browser/
  workspaces/<bot>/
    AGENTS.md
    CLAUDE.md
    .claude/skills/
    .opencode/tools/
    .opencode/skills/
```

## Architecture

The React client receives live state over server-sent events. The local Express service owns scheduling, event dispatch, job leases, recovery, notifications, approvals, usage, provider bindings, connectors, file ingestion, bot computers, and browsers. SQLite in WAL mode keeps conversations, runs, approvals, runner leadership, per-job claims, notification outbox/subscriptions, automation definitions, event receipts, alerts, memories, attachment analysis and revisions, provider ownership, encrypted connector credentials, per-bot connector and code-project access, connector audit events, code edits, agent messages, taught workflows, and dedupe keys. OpenCode and Claude Code are runtime adapters; OpenBot supplies the common isolated workspace, permissioned code-project harness, browser, memory, Google Workspace, GitHub, Slack, Notion, teamwork, automation, and approval tools.

The design borrows the strongest ideas from [Hermes Agent's architecture](https://hermes-agent.nousresearch.com/docs/developer-guide/architecture), [agent loop](https://hermes-agent.nousresearch.com/docs/developer-guide/agent-loop), [Bot Mode](https://hermes-agent.nousresearch.com/docs/user-guide/bot-mode), and [security model](https://hermes-agent.nousresearch.com/docs/user-guide/security): isolated profiles, observable execution, parallel tools, interruptible work, stable prompts, and layered boundaries.

## Project reports

- [Milestones](docs/MILESTONES.md)
- [Security model](docs/SECURITY.md)
- [Workflow benchmark](docs/WORKFLOW_BENCHMARK.md)
- [Launch readiness and honest gaps](docs/LAUNCH_READINESS.md)
- [Product gap audit and next priorities](docs/PRODUCT_GAP_AUDIT.md)
- [Release roadmap](docs/RELEASE_ROADMAP.md)
- [Marketing capability catalog](docs/MARKETING_FEATURES.md)

## Current boundary

OpenBot controls its own private bot containers and Chrome profiles. Its code harness works only in project folders the owner explicitly connects; it is not unrestricted host shell access or a replacement for reviewing changes before shipping. Live takeover controls a teammate's isolated browser, not arbitrary macOS pixels. Skill import/export currently covers OpenBot's browser-oriented saved workflows; it is not a public third-party executable plugin marketplace. PDF and Office extraction is designed for understanding and preview—not fidelity-preserving editing—and image/audio/video understanding depends on the selected model accepting that medium. Scanned-document OCR and guaranteed offline voice transcription are not bundled; native speech capture prefers on-device recognition when Apple reports it available and otherwise uses the system speech service. Slack support is message search/read/post rather than a complete Slack marketplace app or event listener; Notion support is selected-page search/read/append rather than database automation or a general editor. Todoist support covers active-task reading, new-task creation, and activity-triggered routines rather than full project administration; Dropbox is deliberately read-only and supports bounded text/code reading plus change-triggered routines rather than arbitrary document conversion. On macOS, the owner can enable a bounded Accessibility bridge that lists apps, reads visible controls, opens apps, and pauses for approval before clicks, typing, or key presses; it is not unrestricted visual desktop control. A private runner provides powered-off execution and HTTPS ingress, but it is owner-operated infrastructure: the Docker socket is powerful, updates and backups remain the owner's responsibility, and 0.24 deliberately has one authoritative data location rather than live Mac/server synchronization. The native iPhone app still needs owner signing, an APNs key, and a physical-device check before App Store distribution. App Store distribution, organization administration, broad third-party connectors, and unrestricted visual desktop control remain future work.

## License

MIT

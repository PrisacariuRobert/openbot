# OpenBot 0.15.0

OpenBot is an open-source, local-first home for persistent AI teammates. It combines a friendly messaging interface with private bot computers, browser work, durable routines, bounded teammate communication, teach-by-demonstration, and clear approval boundaries.

The preferred test model is **DeepSeek V4 Flash** through the user's own OpenCode Go account, with Muse Spark 1.2 Free as a no-cost fallback. OpenBot never pools or resells model access.

## What's new in 0.15.0

- Automations can now start from a schedule, a signed generic webhook, a native GitHub webhook, or an upcoming Google Calendar event with narrow event, action, repository, and title filters.
- Every incoming event receives a durable receipt linked to its run. Repeated delivery IDs are stopped before a second action, bursts are rate-limited, and failed events can be safely replayed from retained bounded input.
- A new attention inbox explains approval waits, missed schedules, and failures in plain language. Three consecutive failures automatically pause the automation instead of repeating a broken action indefinitely.
- Webhook secrets are encrypted locally, shown only when created or rotated, and verified with timing-safe HMAC-SHA256. Payload secrets are redacted and all event content is marked as untrusted before reaching a model.
- The redesigned Automations screen keeps setup, health, activity, retry, testing, and repair guidance understandable and contained at both desktop and 390-pixel phone widths.

## What is included

- Named teammates with stable roles, personality, memory, files, model, connection, and token limit
- Direct chat plus a shared studio where up to three bots work in parallel
- Natural `@name` and `@everyone` routing, automatic role-based ownership, and a `/` picker for learned skills
- Rich file attachments (up to six files, 25 MB each) with bounded PDF/Office/spreadsheet/text extraction, media handoff to compatible models, and copies in only the selected teammates' private inboxes
- Contained image/PDF previews, extracted-text previews, accurate file-kind icons, friendly unsupported-file recovery, and hardened downloads
- Automatic result cards for teammate-created files, including revision numbers and preserved earlier versions
- Browser voice typing for quick phone tasks; OpenBot stores the transcript, not the microphone audio
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
- Visible teach mode that turns a demonstrated browser task into an editable OpenCode and Claude Code skill, with chat discovery and management
- Dependable automations with five-minute/hourly/daily schedules, signed generic and GitHub webhooks, Google Calendar triggers, narrow filters, editing, pause/resume, explicit test runs, event receipts, replay, result links, and safe deletion
- Duplicate-event protection, rate limits, loop headers, bounded retained inputs, visible failure guidance, approval-wait alerts, missed-schedule notices, and automatic pausing after three consecutive failures
- Persistent approvals for destructive, publishing, communication, purchasing, credential, and system actions
- Provider instances owned by the local user and explicitly assigned per bot
- Provider-aware connections for OpenCode, Claude, ChatGPT/OpenAI, GitHub Copilot, GitLab Duo, and SuperGrok/xAI
- An official Claude Code runtime adapter with the same isolated workspace, browser, memory, approval, and teamwork tools
- AES-256-GCM encrypted API keys with a machine-local 0600 vault key
- Responsive desktop/phone UI, installable PWA shell, finish notifications, connection recovery state, and authenticated remote mode
- Animated mascots with independent blink/idle timing plus work, wait, laugh/celebrate, and failure expressions tied to real execution state
- One-click Google sign-in for release builds, plus a credentials-file flow for self-hosters with no manual ID copying
- Real Gmail search/read and approval-gated sending, Google Drive search/document reading, and Google Calendar agenda access
- Official GitHub CLI connection for notifications, issue search, and approval-gated issue creation
- Per-teammate permissions for Inbox, sending, Drive, and Calendar—rather than exposing every connected app to every bot
- Natural `@gmail`, `@drive`, and `@calendar` suggestions plus useful starter workflows that combine current information
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

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:4310](http://127.0.0.1:4310).

Run the full local verification suite with:

```bash
npm run verify
```

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

Web work uses a separate persistent Chrome profile per bot. Bot navigation rejects non-web schemes, credential-bearing URLs, cloud metadata endpoints, and private LAN addresses other than localhost test pages.

OpenBot does not silently fall back to running terminal commands on the host when Docker is unavailable.

## Automations

Open **Automations** to create scheduled work or choose a Calendar, GitHub, or generic webhook trigger. Calendar triggers poll the connected primary calendar while OpenBot is running and require Calendar access for the selected teammate. GitHub and generic webhook cards show a signed endpoint plus a secret once; configure the sender with that secret, then rotate it from OpenBot whenever necessary.

Generic hooks use `X-OpenBot-Signature: sha256=<HMAC>` and an optional `X-OpenBot-Event-Id` for exact duplicate protection. GitHub hooks use GitHub's standard `X-Hub-Signature-256`, `X-GitHub-Delivery`, and `X-GitHub-Event` headers. An endpoint must be reachable by the sender, so a webhook from the public internet needs a trusted HTTPS tunnel or reverse proxy; never expose OpenBot's plain local HTTP port directly.

Every delivery is retained as a bounded, secret-redacted event receipt and treated as untrusted input. Duplicate IDs do not create a second run, bursts are limited, explicit tests warn that real tools and approvals are available, and three consecutive failures pause the automation. OpenBot also surfaces approval waits, missed schedules detected when it wakes, retryable failures, and linked results. Scheduled and Calendar work runs only while the local OpenBot service and Mac are awake; 0.15 does not claim an always-on hosted scheduler.

## Remote and phone access

The default service binds only to `127.0.0.1`. To build and expose it to a trusted private network:

```bash
npm run remote
```

A private access key is created at `.openbot/access.token`. Non-local clients must sign in with it; the resulting cookie is HTTP-only and SameSite Strict. Open **Control center → Phone remote** on the Mac to copy the phone address and key, then add OpenBot to the phone's Home Screen. Use a trusted encrypted tunnel such as Tailscale or an HTTPS reverse proxy—do not expose the plain HTTP port directly to the public internet.

Voice typing uses the browser or operating system speech-recognition service. OpenBot does not upload or store the audio itself, but the browser vendor may process it under its own policy.

## Local data

Runtime data is excluded from Git:

```text
.openbot/
  openbot.sqlite
  attachments/
  access.token
  keys/vault.key
  computers/<bot>/browser/
  workspaces/<bot>/
    AGENTS.md
    CLAUDE.md
    .claude/skills/
    .opencode/tools/
    .opencode/skills/
```

## Architecture

The React client receives live state over server-sent events. The local Express service owns scheduling, event dispatch, approvals, usage, provider bindings, connectors, file ingestion, bot computers, and browsers. SQLite in WAL mode keeps conversations, runs, approvals, automation definitions, event receipts, alerts, memories, attachment analysis and revisions, provider ownership, encrypted connector credentials, per-bot connector and code-project access, connector audit events, code edits, agent messages, taught workflows, and dedupe keys. OpenCode and Claude Code are runtime adapters; OpenBot supplies the common isolated workspace, permissioned code-project harness, browser, memory, Google Workspace, GitHub, teamwork, automation, and approval tools.

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

OpenBot controls its own private bot containers and Chrome profiles. Its code harness works only in project folders the owner explicitly connects; it is not unrestricted host shell access or a replacement for reviewing changes before shipping. PDF and Office extraction is designed for understanding and preview—not fidelity-preserving editing—and image/audio/video understanding depends on the selected model accepting that medium. Scanned-document OCR and guaranteed local voice transcription are not bundled yet. GitHub notifications, issue search, approval-gated issue creation, cloning, approval-gated pull-request publishing, and signed repository-event automation are included; Slack and Notion remain roadmap items. On macOS, the owner can enable a bounded Accessibility bridge that lists apps, reads visible controls, opens apps, and pauses for approval before clicks, typing, or key presses; it is not unrestricted visual desktop control. Calendar triggers use local polling, public webhooks require an owner-configured secure route to the local service, and automation stops when the Mac sleeps or OpenBot exits. A native phone app and an always-on hosted service remain future work.

## License

MIT

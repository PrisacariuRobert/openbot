# OpenBot Marketing Capability Catalog

Last verified: September 2, 2026
Release: 0.10 local-first beta

This is the marketing source of truth for what OpenBot can honestly claim today. Use **Available now** claims in launch copy. Keep **Setup-dependent** qualifiers close to the claim. Do not present **Roadmap** items as working features.

## Product in one sentence

OpenBot is the open-source, local-first studio where persistent AI teammates use your models, connected context, browsers, and approved code projects to finish work together—and show you how they checked it.

## Short launch pitch

Give every AI teammate a name, role, model, memory, private workspace, browser, and only the access it needs. Talk naturally in direct messages or a shared studio, hand off work between specialists, schedule recurring jobs, connect Google Workspace, and let approved teammates build and test real code. Important actions wait for you; substantial work ends with visible checks instead of an unexplained “done.”

## Best differentiators

1. **Bring your own AI.** Assign a different supported model connection to every teammate instead of buying model access from OpenBot.
2. **Review-first coding without a broad host shell.** Clone or share one project, let multiple teammates work safely in parallel, inspect every diff, restore an unchanged agent edit, and publish only after checks and an independent teammate review pass.
3. **Finished means checked.** Real jobs have a durable outcome, deliverable, checklist, approval boundary, and verification receipt.
4. **Agents can collaborate without spiraling.** Questions, findings, replies, and handoffs are visible, deduplicated, and limited to three hops and eight related runs.
5. **Local-first control.** Conversations, permissions, routines, encrypted connector credentials, and audit trails remain in the local OpenBot data store.
6. **Friendly on the surface, serious underneath.** Natural chat, voice input, playful animated mascots, and a restrained responsive interface sit above explicit security boundaries.

## Available now

### Persistent AI teammates

- Named teammates with a stable role, working style, mascot, model, connection, token budget, and durable memory
- Separate direct conversations plus one shared studio room
- Persistent private workspace and model session for every teammate
- Live ready, working, waiting, success, and failure states
- Independent mascot blink and idle timing with working, waiting, celebration/laugh, and failure expressions
- Add, edit, and remove teammates without recreating the whole studio

### Natural teamwork

- Natural `@name`, multiple-teammate, and `@everyone` mentions
- Automatic role-based task ownership when no teammate is tagged
- Up to three teammates working concurrently, with only one active run per teammate
- Focused teammate questions, replies, findings, and task handoffs
- Visible Team signals feed in Control center
- Durable deduplication plus three-hop/eight-related-run limits to prevent loops
- New user instructions queue safely while a teammate is working

### Verifiable completion

- Durable job outcome and reviewable deliverable for substantial requests
- Three-to-eight meaningful work steps with live progress
- Explicit connected-app and approval requirements
- Persistent state across restarts and approval pauses
- Final passed, partial, or blocked verification with concrete checks
- Compact “Finished and checked” receipt with expandable evidence
- Honest downgrade when a verification check fails
- Lightweight ordinary conversation without unnecessary project-management UI

### Review-first coding and GitHub delivery

- One-click suggestions for projects in `Documents/GitHub`, `Developer`, and `Projects`
- Manual connection for a specific existing folder inside the owner's home directory
- One-step cloning from a validated GitHub link into a clearly named local OpenBot projects folder
- Independent **Code + test**, **Read only**, and **No access** grants for every teammate/project pair
- Project discovery that identifies Git, JavaScript/TypeScript, Python, Rust, Go, and general code folders
- Bounded file and folder listing
- Fast fixed-string source search
- Text-file reading up to 1 MB
- Exact-block replacement with occurrence checks to prevent stale or ambiguous edits
- Atomic text-file creation and replacement
- A private Git worktree and branch for every coding task, leaving the owner's main checkout untouched
- Concurrent coding tasks on the same repository without branch switching or shared working-tree collisions
- Bounded staged, working-tree, and committed task diff review
- Exact-file commits that cannot run on the default branch or silently include unrelated paths
- Independent review by a different teammate, tied to the exact commit with approved/changes-requested findings
- Approval-gated branch push and GitHub pull-request creation only after checks and independent review pass
- Automatic per-edit restore points that refuse to overwrite newer content
- Disposable Docker checks for tests, builds, linting, and inspection
- No network inside project check containers
- Unprivileged execution, read-only container system, dropped capabilities, CPU/memory/PID limits, and isolated temporary storage
- Masks over Git internals, `.env` files, and protected hidden source paths during checks
- Approval interception for deletion, publishing, and risky Git rewrite commands
- Local recent-edit trail with teammate, path, operation, and time
- Immediate permission revocation through capability-aware session invalidation
- Disconnecting removes access without deleting project files
- The same code tools for OpenCode and Claude Code runtimes

### Models and subscriptions

- Owner-scoped provider connections explicitly assigned per teammate
- OpenCode account support, including free and Go models available through the user's OpenCode setup
- Official Claude Code runtime and login path for supported Claude accounts
- ChatGPT/OpenAI, GitHub Copilot, GitLab Duo, and SuperGrok/xAI connection paths through supported OpenCode provider flows
- Optional encrypted API-key connections with provider-specific model discovery
- Different teammates can use different connections and models
- Provider-reported input, output, reasoning, cache, and cost accounting when available
- Per-teammate weekly token budgets
- No pooled or resold model access

### Private computers and web work

- Persistent constrained Docker computer for every teammate
- Separate persistent Chrome profile for every teammate
- Terminal, page navigation, readable page snapshots, clicks, field entry, and screenshots
- No silent fallback from an unavailable container to the host shell
- Web navigation blocks unsafe schemes, credential-bearing URLs, cloud metadata endpoints, and private LAN targets other than local test pages
- Live computer and browser preview in the teammate panel
- Visible teach mode that records a demonstrated browser workflow
- Generated browser skills are readable and editable rather than opaque macros
- Password, token, key, and secret-like demonstrated inputs are redacted

### Google Workspace

- One Google connection covering Gmail, Google Drive, and Google Calendar
- One-click Google sign-in in a configured release build
- Downloaded Desktop OAuth credentials-file import for self-hosters
- Advanced manual client configuration when needed
- OAuth state checking, PKCE S256, offline refresh, and encrypted local token storage
- Clear recovery steps and direct API-enable links when a Google service is disabled
- Refresh-safe OAuth result pages that return the user to Apps & Tools
- Separate Inbox, sending, Drive, and Calendar permission switches for every teammate
- Gmail search and bounded message reading
- Plain-text Gmail sending only after a durable approval showing recipient, subject, and body preview
- Google Drive search and bounded reading for Google Docs, Sheets, and supported text formats
- Read-only Google Calendar agenda with times, location, attendee count, and links
- `@gmail`, `@drive`, and `@calendar` composer suggestions
- Morning brief, meeting preparation, and follow-up starter workflows
- Connected-account previews and a private local connector activity trail

### Files and visible Mac apps

- One owner-controlled **Files & apps on this Mac** switch for the studio
- Bounded listing of visible folders within the current user's home, including Desktop, Documents, and Downloads
- Supported text-file reading up to 500 KB
- Hidden paths, macOS `Library`, symbolic links, and paths outside the home remain blocked
- Approval-only batch organization of regular files
- Organization can create destination folders but cannot delete or overwrite files
- macOS Accessibility-based listing of visible apps and inspection of visible controls
- App focus/open plus approval-gated click, typing, and key presses
- Bounded scrolling without claiming unrestricted pixel-level computer control

### Routines and reusable work

- Natural recurring requests, including intervals as short as five minutes
- Persistent routine name, prompt, teammate, conversation, schedule, enabled state, next run, last run, last status, and run count
- Manual **Test now** action
- Pause and resume controls
- In-app recurring messages when the user says “text me” without naming an external service
- Demonstrated browser workflows saved as reusable local skills

### Messages, files, voice, and phone use

- Streaming replies and friendly live activity labels
- Safe GitHub-flavored Markdown for headings, lists, links, tables, quotes, inline code, and code blocks
- Six attachments per message, up to 25 MB each
- Attachments copied only into the routed teammates' private inboxes
- Authenticated artifact downloads with forced download behavior, content sniffing protection, and a sandbox content policy
- Browser/operating-system voice typing; OpenBot stores the transcript rather than microphone audio
- Installable responsive PWA for phone check-ins
- Guided private phone connection with live, reconnecting, and offline states
- Authenticated remote mode for a trusted private network or encrypted tunnel
- Finish and approval notifications where supported by the browser

### Safety, privacy, and accountability

- Loopback-only service by default
- Private access key and HTTP-only SameSite Strict cookie for non-local access
- SQLite WAL persistence for conversations, work, permissions, and audit records
- AES-256-GCM encryption for API keys and Google credentials
- Machine-local vault key stored with mode `0600`
- Small allowlisted environment passed to model processes instead of the full server environment
- Durable approvals that do not silently expire
- One-time continuation after an approved saved action
- Approval categories for destructive, publish, communication, purchase, credential, upload, and system actions
- Local activity, usage, connector, teammate-message, task-verification, and code-edit records
- Reduced-motion support and responsive overflow protection
- MIT-licensed source code

## Setup-dependent claims

These features are implemented, but marketing must explain their requirement.

| Capability | Requirement or qualifier |
|---|---|
| Model execution | A supported OpenCode or Claude Code setup, or a supported API key, must be connected by the owner. |
| Code and terminal checks | Docker must be installed and running; dependencies must already be available because project checks have no network. |
| GitHub pull requests | Git and the official GitHub CLI must be installed; the owner must sign the CLI into an account allowed to push the repository. |
| Browser work and teach mode | Google Chrome or Chromium must be installed. Logged-in third-party sessions belong to each teammate's browser profile. |
| Gmail, Drive, and Calendar | The owner must complete Google OAuth and enable the corresponding Google APIs. Public distribution may require Google verification and a security assessment. |
| Visible Mac app control | macOS Accessibility permission is required. Support is limited to the Accessibility tree, not arbitrary pixels or canvases. |
| Voice input | Browser/OS speech recognition support and microphone permission are required; the platform vendor may process audio. |
| Phone access | The Mac service must remain awake and reachable through a trusted private network, Tailscale, or HTTPS proxy. This is a PWA, not a native iOS app. |
| Notifications | Browser and operating-system notification support and permission are required. |

## Useful launch workflows

- **Fix and verify a bug:** connect a project, assign a coding teammate, ask for the fix, then inspect its steps, Git status, checks, and final receipt.
- **Morning brief:** combine today's Calendar events, relevant unread Gmail, and recent Drive context without sending anything.
- **Prepare for a meeting:** gather the event, attendees, recent messages, and supporting documents into one brief.
- **Review follow-ups:** identify promised actions from mail and meetings, then draft next steps without sending them.
- **Research in parallel:** ask several specialists in the studio, then let them share findings and hand off focused follow-ups.
- **Organize the Desktop:** inspect visible files, propose sensible folders, and approve the exact no-delete/no-overwrite move plan.
- **Teach a recurring browser task:** demonstrate the flow once, review the generated skill, and run it again from chat.
- **Check in from the gym:** open the installed phone experience, dictate a task, follow progress, and approve sensitive actions remotely over a trusted connection.

## Claims to avoid

Do not say OpenBot currently:

- runs continuously in the cloud when the owner's computer is off;
- is a native iOS or Android application;
- provides unrestricted visual computer control;
- supports a large production connector marketplace;
- connects Slack or Notion as working apps, or claims GitHub issue/notification support;
- creates or edits Calendar events;
- handles Gmail attachments, labels, or rich HTML sending;
- edits Office documents or spreadsheets with layout fidelity;
- guarantees that model-driven automation is risk-free;
- includes or resells Claude, ChatGPT, Copilot, SuperGrok, or other paid subscriptions.

## Roadmap, not launch copy

- Native phone shell and opt-in push notifications
- Optional always-on self-hosted daemon or private cloud deployment
- GitHub issues, notifications, event triggers, and repository allowlist management
- Slack, Notion, and broader connector SDK/marketplace
- Event-triggered routines and signed webhooks
- Document, PDF, and spreadsheet fidelity tools
- Optional bounded screenshot understanding for visual Mac interfaces
- Full-text search across conversations and projects
- Roster pinning, sections, templates, duplication, and sharing
- Threaded replies, reactions, and true mid-run interruption/steering
- Multi-user organizations, SSO, policy administration, and audit export

## Ready-to-use homepage copy

### Hero

**AI teammates that finish the work—and show their checks.**

OpenBot gives your agents memory, private computers, browsers, connected context, and carefully scoped access to real code projects. Bring your own models. Keep control of every sensitive action.

### Feature cards

- **Connect a project, not your whole Mac.** Choose who can read, who can code and test, and who stays out.
- **A studio, not a chatbot tab.** Specialists can work in parallel, ask each other questions, and hand off focused jobs.
- **Your subscriptions, your choice.** Mix supported OpenCode, Claude Code, and provider connections across teammates.
- **Progress you can trust.** See the outcome, steps, approvals, checks, and final result for every substantial job.
- **Useful context in one conversation.** Bring in Gmail, Drive, Calendar, files, browser work, and durable memory.
- **Local-first by default.** Your OpenBot data lives on your machine, with encrypted secrets and visible permission boundaries.

### Closing line

Friendly enough to use every day. Explicit enough to trust with real work.

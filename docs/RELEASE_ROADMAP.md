# OpenBot Release Roadmap

Updated September 4, 2026 for the 0.26 private-home maintenance release.

This order follows one rule: deepen real daily usefulness before adding a long list of shallow integrations. Cursor's current Grok Bot documentation emphasizes rich attachments, persistent computer work, skills and event-driven routines, structured plugins, mobile review, search, and reviewable artifacts. OpenBot already has a strong local permission model and should extend that same contract rather than trade it away for breadth.

## Shipped in 0.14 — Rich inputs and reviewable artifacts

Goal: make “read this and give me a finished file” dependable.

- Bounded local extraction for PDFs, Word, Excel/XLSM, CSV/TSV, PowerPoint, JSON, YAML, email, notebooks, text, and common source formats
- Original image, PDF, audio, and video handoff to compatible OpenCode models plus local media metadata
- Contained image/PDF and extracted-text cards with real file-kind icons, preview, download, and friendly recovery
- Teammate-created file capture with numbered revisions and preserved earlier copies
- Real type detection, untrusted-content boundaries, Office archive expansion caps, page/row/character limits, and workspace-containment checks

Verified with real screenshot understanding, real artifact creation/revision, parser fixtures for every format family, zero production dependency vulnerabilities, and desktop/phone overflow checks. Model-dependent media stays explicit: scanned-document OCR, guaranteed local voice transcription, and fidelity-preserving Office editing remain future work rather than 0.14 claims.

## Shipped in 0.15 — Dependable automations and event triggers

Goal: turn routines into something users can trust unattended.

- Failure and approval attention inbox with retry, pause, plain-language repair guidance, and retained bounded event input
- Signed generic webhook, native GitHub webhook, schedule, and primary-Google-Calendar triggers with narrow filters
- Seven-day delivery idempotency, duplicate counters, per-automation burst limits, origin-loop headers, and replay history
- Explicit test confirmation because tests can perform real work and create approvals
- Missed-schedule, repeated-failure, and approval-wait notifications, with automatic pause after three consecutive failures
- Encrypted webhook secrets shown only after creation or rotation, timing-safe HMAC verification, redacted payload storage, and untrusted-event prompt boundaries

Verified with 66 automated tests, one real signed webhook delivery and duplicate replay, a real Muse Spark 1.2 Free result artifact, and desktop/390×844 UI acceptance. The same delivery ID created exactly one event and one linked run; every retained event exposes an explainable state and supported failures can be replayed. Local schedule and Calendar availability still depends on OpenBot staying awake, and public delivery still needs an owner-managed secure route.

## Shipped in 0.16 — Connector platform, Slack, and Notion

Goal: add breadth without weakening per-teammate authority.

- Defined a versioned connector manifest and common read/write/approval interface
- Gave each teammate independent read/write grants, previews, health checks, reconnect state, and audit events
- Shipped Slack member-authority search/read with bot-authority messages and replies behind exact approval
- Shipped Notion selected-page search/read and bounded heading/text append behind exact approval
- Added managed one-click and self-hosted setup paths without exposing connector tokens to models

Verified that revoking one teammate's access invalidates its active session without removing another teammate's grant. Public OAuth app review and a third-party connector review process remain prerequisites for a marketplace claim.

## Shipped in 0.17.4 — Customizable living characters

- Replaced mascot image rendering with code-drawn layers on the web and native SwiftUI shapes on iPhone
- Restored independent float, blink, work, wait, celebration, and failure motion without synchronizing teammates
- Added six editable character shapes, six color presets, and a full custom color picker for existing teammates
- Persisted appearance edits so every conversation and connected iPhone sees the same character identity
- Added release guards that reject image-backed live mascots or lost color persistence

## Shipped in 0.17.3 — Native iPhone continuity and shared design

Goal: make phone check-ins feel like a real product without moving private studio data to a new cloud.

- Added a genuine SwiftUI conversation experience with native messages, animated teammates, routing, sending, progress, approvals, cancellation, and settings
- Stored the access key in the iPhone Keychain and used it only for authenticated native API requests
- Added address-only deep-link pairing, foreground reauthentication, server-sent event updates, and offline state
- Added native attachment intake and shared premium mascot artwork across the web and iPhone apps
- Matched the web and native studio presentation and added durable, live Mac/iPhone text-draft handoff
- Unified header, conversation, bubble, routing, composer, and icon geometry at the same phone width
- Composed the exact shared mascot art as three independently floating and blinking teammates with matching status and celebration moods
- Added detected Tailscale away access for use over cellular or different Wi-Fi networks
- Required HTTPS for public hosts while keeping private-network development practical and loopback-only hosting as the default
- Added native release structure, privacy and secret checks, a production mascot app icon, and a release guard that rejects a return to WebKit

Compiled with Xcode Beta and verified on an iPhone 17 Pro simulator with four native unit tests, a live sign-in UI test, and two-way draft persistence in the 78-test product suite. The authenticated API was also verified over the detected Tailscale address. Physical-device signing, unsent attachment handoff, rich artifact previews, push, share-sheet capture, dedicated voice capture, and App Store delivery are not claimed.

## Shipped in 0.18 — Find, organize, and supervise

Goal: keep a growing studio understandable.

- Added local search across conversations, result files, routines, learned skills, and teammates
- Added reply context and lightweight reactions
- Added sidebar pins, sections, reversible hide/restore, and setup-only teammate duplication
- Added a Live Studio with global run visibility, persistent attention, teammate desks, progress, browser previews, stop controls, and direct conversation links
- Added visible owner takeover of each teammate's private browser with private typing and common navigation keys
- Masked password-like fields in model-visible browser snapshots
- Kept copies free of conversation history, memory, credentials, browser profiles, and workspace files

Verified with 79 automated tests, the production build, native release checks, and responsive browser acceptance at 402×874 with zero horizontal overflow. Private skill import/export remains deliberately unclaimed until versioning, secret scanning, and rollback exist.

## Shipped in 0.19 — Reusable, portable skills

Goal: make successful browser work safely reusable instead of trapping it inside one teammate.

- Rebuilt taught workflows as a teammate-owned Skill Library with editable purpose, instructions, starting page, source, and version
- Added strict `.openbot-skill.json` packages with SHA-256 integrity verification
- Added bounded import with schema validation, supported-address checks, embedded-secret detection, placeholder support, and tamper rejection
- Added immutable version history and non-destructive rollback, where restoring an older version creates a new retained version
- Added one-click assignment between teammates without copying private conversation, memory, credentials, browser profile, or workspace data
- Added three transparent starter skills and a responsive library for teaching, installing, importing, exporting, editing, launching, and restoring
- Kept `/` chat invocation and the native iPhone skill picker aligned with the saved owner and current version

Verified with 83 automated tests, including real workspace file generation, package integrity, secret blocking, template bounds, import, assignment, versioning, and rollback. This remains a browser-oriented private skill format rather than a public executable plugin marketplace.

## Shipped in 0.20 — Dependable self-hosted work

Goal: make remote and mobile use reliable while preserving local-only mode.

- Added exclusive renewable runner leadership across overlapping OpenBot processes
- Added atomic per-job claims, short leases, durable attempt counts, crash recovery, and graceful shutdown handoff
- Preserved task contracts, approvals, conversation context, and recovery history when interrupted work resumes
- Added an optional macOS LaunchAgent with login start, crash restart, safe foreground-to-background handoff, private logs, and one-click removal
- Added visible runner health, queue/wait totals, recovery count, manual wake, and clear powered-on/awake boundaries
- Added a durable local notification outbox, standards-based Web Push, VAPID signing, stale-device cleanup, and deep links to the correct result or automation
- Added native iPhone runner health, recovery language, and manual wake through the authenticated owner connection
- Kept loopback-only local mode as the default and made background protection explicitly opt-in

Verified with 86 automated tests, production type/build checks, duplicate-runner exclusion, lease expiry/reclaim tests, private subscription-state tests, real macOS service installation/handoff checks, responsive browser QA, and native simulator tests. This is dependable self-hosting while the Mac is powered on and awake; it is not cloud execution during sleep or power-off.

## Shipped in 0.21 — Focused connector breadth and native artifacts

- Todoist through the existing manifest, encrypted OAuth, per-teammate permission, audit, and write-approval contract
- Read-only Dropbox search and bounded text/code reading through the same connector contract
- Calendar + task planning and cloud-file context starter workflows
- Authenticated native artifact download, Quick Look preview, and message/file sharing

## Shipped in source in 0.22 — Proactive work and native handoff

- Todoist activity and Dropbox folder changes start bounded work through durable baselines/cursors, receipts, dedupe, rate limits, permissions, and ordinary approvals
- Native APNs registration and host-side delivery use short private payloads, per-device retry records, sandbox/production separation, and result/approval deep links
- The embedded OpenBot Share extension queues bounded text, links, images, and files in a private App Group before authenticated conversation import
- Dropbox PKCE supports a managed public release client using only an app key while preserving self-hosted/confidential clients
- Simulator compilation verifies the complete native target graph; physical APNs and distribution remain owner signing/credential checks

## Shipped in 0.23 — Native voice and graceful recovery

- A deliberate native microphone session turns speech into an editable draft and never sends without the owner pressing Send
- The app prefers on-device Apple recognition when available, does not retain microphone audio, and provides clear permission/unavailable fallbacks
- Stale or disconnected web sessions now show a complete animated recovery state, retry automatically, and can return from the development address to the running background studio
- Invalid thread deep links recover to the shared studio instead of remaining on a loading surface
- Developer-only Slack, Notion, and Dropbox credentials stay collapsed until requested; essential connector copy and controls use readable type sizes
- Xcode Beta compiles the app and embedded Share extension for the iPhone 17 Pro simulator with the new Speech and microphone privacy declarations

## Shipped in 0.24 — Private always-on home

- Added an optional Docker Compose deployment for a dedicated Linux VPS or home server while preserving local Mac mode as the default
- Added Caddy-managed HTTPS, automatic service restart, a non-root OpenBot process, durable studio/model/browser/project mounts, Chromium, OpenCode, and isolated-computer Docker access
- Made deployment trust explicit: private mode requires a canonical HTTPS public address and absolute durable storage, trusts exactly one reverse proxy, and drives every OAuth callback and webhook from that address
- Added proxy-aware Secure cookies, a narrow no-secret health endpoint, repeated-login throttling, HSTS, anti-framing and MIME protections, and no published plain-HTTP app port
- Added web and native status that distinguishes **This Mac** from a **Private always-on home**, explains the selected data location, and avoids obsolete Mac-awake guidance
- Added owner-only setup and consistent backup scripts plus migration guidance that requires moving the complete vault and choosing one authoritative data location

Verified by 101 automated web/server tests, TypeScript and production builds, native release checks, deployment schema/shell checks, responsive browser acceptance, and a Linux container build/boot smoke test. A real VPS, public DNS/certificate issuance, live third-party OAuth callbacks, and physical iPhone/APNs distribution remain owner-environment checks rather than simulated claims.

## Shipped in 0.25 — Private-home setup and care

- Added a domain-aware local setup assistant with a valid, copyable one-command handoff to the reviewed host script
- Added an authenticated Home check for real free storage, backup freshness, OpenCode, Chromium, Docker, release, and uptime state
- Added the same concise health summary and attention list to native iPhone Live Studio
- Made successful backups create a bounded atomic maintenance receipt while keeping archives in an owner-only host directory
- Corrected shared headers and status surfaces so private deployments never claim to be live on the Mac
- Kept diagnostics read-only through fixed commands, bounded output, short timeouts, and no credential or environment disclosure

Verified by 103 automated tests, TypeScript and production builds, native simulator checks, shell syntax, live local/private server inspection, responsive desktop/phone browser acceptance, and a Linux private-runner build/boot/Home-check smoke test in CI.

## Shipped in 0.26 — Backup-first updates and health alerts

- Added a guarded private-runner updater that accepts only `origin/main` or explicit release tags and refuses dirty or diverged source
- Created a consistent owner-only backup before advancing source, while keeping the current service available during the replacement build
- Added replacement-container health verification and automatic recovery of the previously running image after failed startup
- Recorded successful update time, versions, and revision in a bounded private receipt shown by Home check
- Added opt-in 15-minute health checks with changed-state attention alerts, once-daily unchanged reminders, and one recovery alert
- Reused registered Web Push and APNs destinations, kept monitoring disabled by default, and exposed the same control on responsive web and native iPhone Live Studio

Verified by 105 automated tests, TypeScript and production builds, native simulator checks, shell syntax, guarded-script validation, live private-server behavior, responsive desktop/phone browser acceptance, and the Linux private-runner build/boot/Home-check CI gate.

## Next — Open connections and richer events

- Add Slack and Notion event sources on the same receipt, cursor, dedupe, replay, and rate-limit contract
- Define a reviewed custom MCP/connector install contract with visible permissions and revocation
- Add encrypted private-home export/import and an optional privacy-preserving outside-in reachability check
- Complete physical-device notification/Share-extension QA and TestFlight packaging with owner credentials

## Later, not implied by the beta

- Multi-user organizations, SSO, offboarding, policy inheritance, audit export, and managed network egress
- A broad third-party connector marketplace
- Unrestricted visual desktop control
- Hosted model access resold by OpenBot

These require separate security and operating models. They should not be presented as extensions of the single-owner local beta until those models exist and have been independently reviewed.

## Current research sources

- [Grok Bot overview](https://cursor.com/docs/grok-bot)
- [Work with Grok Bot](https://cursor.com/docs/grok-bot/work)
- [Grok Bot use cases](https://cursor.com/docs/grok-bot/use-cases)
- [Grok Bot for Teams and Enterprise](https://cursor.com/docs/grok-bot/teams)
- [Cursor agent computer use](https://cursor.com/blog/agent-computer-use)
- [Hermes Agent computer use](https://hermes-agent.nousresearch.com/docs/user-guide/features/computer-use)

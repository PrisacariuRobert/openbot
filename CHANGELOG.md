# Changelog

## Working tree

- Added **OpenBot-In-Motion**, a 64-second instrumental product-film revision based on the current native conversation UI and shared mascot shapes. It adds request close-ups, animated character handoffs, real-layout file and approval treatments and a desktop-to-phone pullback while keeping the complete work story. Previous cuts remain intact; this is staged marketing, not new runtime functionality or release proof.
- Rebuilt the film as **OpenBot-See-It-Work**, an 82-second continuous app walkthrough without narration. A single client-review request now carries the explanation, including the proposed/approved missing-tool build, failed checks, correction, successful use and reuse in a later routine. Local sample parsing tests ground the numbers; the sequence is staged and does not implement or certify the depicted autonomous loop. Previous films remain intact.
- Added **OpenBot-Pulse-No-Voice**, a separate 54-second music-led review cut with an original 120 BPM instrumental, shorter shots, perspective/camera choreography and the full product overview. No narration, voice services or paid generation are used. The rejected narrated and earlier visual cuts remain intact. This changes the film, not app capabilities or release status.
- Expanded the narrated introduction to a 103-second full-product overview with ten chapters. Self-extension is approximately 10% of the cut; the broader teammate/provider/browser/work/routine/approval/device experience is restored. Narration is locally generated, chapter duration is measured from the audio, and previous cuts remain separate. No publication or application-state change.
- Added Apple-film research and a separate 22-second narrated self-extension direction test using the existing local Aiden pipeline. Earlier full cuts are preserved, not labeled creatively approved; the exact self-extension proof and model-connection limits are recorded outside the staged film. No app capabilities, owner data, or release status changed in this creative pass.
- Recut the introduction around one request becoming usable work: the current 47-second, 60-fps film includes full-size deliverables, teammate responsibility, a quiet approval pause, a message-led device handoff and a new original score. The earlier 52-second motion cut and first cut remain available. This changes the marketing film, not application capabilities or release status.
- Native build 42 aligns Activity, permissions, group details and the routine editor with the approved conversation-first prototype. Activity prioritizes review items, permissions retain their real switches inside expandable rows, group identities reserve their full mascot width, and routine timing is a compact paired control. Shared primary/secondary capsule buttons replace mixed local styles on these surfaces; no stored grants or schedules are changed by the redesign.
- Added an original 80.4-second editable Remotion introduction: monochrome product scenes, six animated vector mascots, real bundled service marks, and an original deterministic stereo score. The film uses fictional content, contains no unfinished-feature badges or release-date/download claim, and keeps its pre-launch concept scope and capability verification notes in the accompanying README.
- Added conversation-local failed-task notices on native Mac and iPhone, showing the recorded error and opening Activity without repeating the task or treating uncertain actions as safe to retry.
- Fixed the Mac compact-window constraint loop and clipped inspector. AppKit owns the window minimum; wide windows show inline details, while compact windows use a dismissible sheet that hands off to routines/preferences without competing presentations. Debug-only loopback fixture appearance/size controls do not change owner window preferences or Release behavior.
- Added host-approval-bound Google Calendar event IDs, full event-content verification and one exact readback operation after an ambiguous create response. Missing, changed, cancelled, malformed or inaccessible events remain uncertain; there is no second insert. Account changes stop recovery, and an unconfirmed Meet link is reported separately. This is bounded same-process recovery, not automatic reconciliation of every interrupted action.
- Verified the unlocked native UI, real read-only Gmail/Drive access, simulated browser sign-in handoff and four free Spark 1.3 synthetic work scenarios. Google Calendar's API configuration still blocks its live pilot. See `docs/QA_UNLOCKED_MAC_2026-09-07.md`; no external write, publication or installed-app replacement was performed.

- Separated provider-delimited progress from completed replies across web, Mac and iPhone. Final text is used for conversation previews/copy/share; earlier updates are preserved in an expandable work log. Completed text parts are identity-deduplicated; Claude's explicit successful result is no longer discarded after earlier commentary. An unfinished tool turn or reported runtime error cannot publish a false finished reply.
- Built and checked a new self-contained arm64 Mac development candidate with the redesigned native client and embedded runner. Isolated package startup, explicit provider choice and clean shutdown passed; no installed application or owner data was replaced. See `docs/QA_RESULT_FLOW.md` for exact evidence and remaining release gates.

- Native Mac and iPhone now share studio-wide task attention: failed work in other conversations, pending approvals, uncertain actions and unresolved routine alerts remain visible. The **Needs you** entry opens Activity, which links back to the affected conversation or routine settings. Opening a task does not approve, retry or resolve it. iPhone Activity selection now opens the conversation rather than leaving the conversation list visible.
- Connection labels distinguish saved sign-in from demonstrated model execution and show read-only app connections without implying write access. Added six shared native regression tests and a synthetic iPhone navigation check for failed-task and routine-alert review.

- Redesigned the boot flow around the feeling of a messaging app: web, Mac and iPhone now open straight into the conversation. Choosing an AI connection is no longer a forced boot gate — the composer stays usable, and trying to send opens the explicit chooser with the draft kept. Nothing is pre-assigned; owners still pick their provider deliberately
- Premium conversation rhythm on all three surfaces: messages group like iMessage (tight spacing within a group, breathing room between speakers, identity at the head of each group), refined bubble shapes with hairline separation on web, calmer spacing on iPhone, and macOS keeps composing enabled with a quiet chooser affordance
- The playful mascot family is untouched: blinks, work moods and appearance editing still carry the personality

- Added owner-created group chats: name a group, pick one to six teammates, and message there with the same @mention routing, direct chat and approval boundaries as the all-hands room. Members join/leave with an explanatory system message; future tasks follow the current membership while work already running keeps going
- Groups support rename, pin, section and hide, list members everywhere threads do, and the conversation context pane shows the roster with an edit entry; the team room keeps its implicit everyone-membership and stays protected from rename/hide
- Added group thread storage, API (create and edit group membership/title), studio UI, and five unit tests covering validation, membership changes, routing through mentions, and safety guards

- Added stdio transport for custom MCP connectors: community MCP servers (official reference servers, Hermes optional MCPs and any other standard server) can now run as a local command on the host — plain executable path, line-per-argument list, and a small owner-named environment, with shell metacharacters rejected and a deliberately small inherited environment
- Same reviewed contract as HTTP connectors: discovery, per-teammate tool grants, argument-schema validation, digest-checked calls, receipts, and revoke-on-change; a starter picker links the open MCP catalog with pinned MIT-attributed presets
- Added a real stdio MCP fixture and a round-trip unit test (discover → per-bot grants → grant isolation → schema-checked call), plus a live server smoke test

- Added owner-authored Auto Review rules (Grok Bot-style, deterministic): Require-Approval rules always stop a matching task, terminal command or browser action for review; Always-Allow rules can skip one of OpenBot's own review prompts for a narrowly matched isolated-command pattern only — they never waive a detector, never apply to browser actions or tasks, and cannot allowlist deleting or system-changing command prefixes. A matching Require-Approval rule always wins over Always-Allow
- Rules live in the studio Settings drawer with pattern matching (`*`/`?` wildcards, case-insensitive) and are enforced at task start, for routines, and at every isolated command and browser click/type decision
- Added owner-authored Auto Review rule storage, API and unit tests for pattern matching, effect precedence, scope isolation and guardrails
- Made memory retrieval rank instead of filter: `memory_search` now returns relevance-ranked notes (rarity weighting, phrase bonus, deterministic ordering) so a note missing one query word is no longer hidden; empty and stopword-only queries return nothing
- Tasks now seed bounded background context from related past conversation (this teammate's answers and owner messages in the task's thread, keyword-ranked, labeled as background and to be verified against current state)
- Added consolidation pressure without silent merges: a task saving content that nearly duplicates an owner note under a different name is refused and pointed at the existing owner note; owner-controlled memory is unchanged
- All retrieval is local and deterministic (no model, no embeddings, no network); an owner-chosen embeddings connection remains an explicit future upgrade
- Made always-on away access turnkey: `./deploy/private-runner/setup.sh studio.example.com --relay relay.example.com` now also runs the built-in away-access relay in the same reviewed image behind the same Caddy TLS listener, generating the enrollment secret and wiring `OPENBOT_RELAY_URL` on the studio automatically
- Added an optional compose `relay` profile, a dedicated relay Caddyfile with WebSocket upgrade passthrough, and a durable owner-only relay database; a misconfigured or unreachable relay keeps the studio healthy
- Verified the relay image end to end at service level (health check, token-enforced enrollment, verified-secret enrollment, correct 503 routing for offline and unknown studios); real-domain TLS and cellular phone delivery still require an actual deployment
- Added live computer viewing: an authenticated server-sent event stream (`/api/bots/:id/computer/live`) feeds CDP screencast frames from a teammate's already-running browser to viewers, with a per-bot source shared across all watchers and stopped when the last one leaves
- Added a live watch view in the studio conversation pane and a Grok Bot-style "Agent Computer" takeover dialog: explicit Take control arming, click-to-act coordinate transfer, address opening, a private keyboard whose text is never stored in chat, and key controls over the existing reviewed takeover endpoints
- Added a native iPhone teammate computer screen with the same live stream, tap-to-act takeover, private SecureField typing, key buttons, and snapshot fallback when the stream is unavailable
- Watching never starts a browser and grants no access; slow viewers drop frames instead of accumulating an unbounded buffer, and the stream carries a 15-second heartbeat
- Added unit tests covering live-frame fan-out, subscriber lifecycle, viewer isolation and no leaked sources

## 0.34.0 — 2026-09-05

- Added a genuine SwiftUI/AppKit macOS app with a native window, navigation, menus, keyboard commands, settings, attachments, Keychain-backed remote sign-in, and loopback-only automatic local pairing
- Added native conversations, teammate targeting, durable draft continuity, reply context, reactions, private studio-wide search, active-run controls, Work starters, Live Studio, action history, and uncertain-action reconciliation
- Added opt-in native macOS alerts with deliberately generic, privacy-bounded attention text
- Added native automation create/edit/delete across schedules, Calendar, GitHub, signed webhook, Todoist, Dropbox, Slack, and Notion, with pause/resume, one-time secret rotation, and confirmation-gated run-now controls
- Added native provider readiness, supported subscription sign-in and code completion, plus hosted API and local OpenAI-compatible model setup, safe editing, and removal guarded against active teammate assignments
- Added native provider-to-teammate model assignment, code-project folder/GitHub connection, per-teammate project grants, worktree/diff review, guarded edit restoration, disconnect-without-delete, and computer/browser/Mac capability controls
- Added native Apps & Tools connection entry points, per-teammate read/write grants, portable Skill Library install/edit/history/non-destructive rollback/assign/import/export/delete, and local background-protection controls
- Added native isolated-browser preview/control and visible teach-by-demonstration with private typing and saved Skill Library output
- Added native teammate create/edit/duplicate controls for role, instructions, provider/model, tools, weekly budget, mascot shape, and custom colour, plus bounded read-only teammate workspace browsing
- Added bounded Google Drive text/Markdown creation and Google Calendar events, guests, notifications, and optional Meet links through the same per-teammate write grant, exact approval preview, one-time action receipt, and reconnect-aware OAuth scope boundary
- Added host-verified text-deliverable checks that reopen bounded workspace files, test required size/content, record a short SHA-256 fingerprint, and remain visibly distinct from teammate self-reporting
- Hardened workspace browsing so traversal, hidden entries, direct links, and folders linked outside a teammate's private workspace cannot be listed or previewed
- Fixed new-teammate persistence so intentionally disabled computer/browser access and a zero weekly token cap are no longer replaced by defaults
- Fixed native Mac draft handoff by accepting and preserving the `macos` source instead of rejecting it as an unknown client
- Fixed background-service upgrades so macOS stops the complete TypeScript runner process group instead of leaving an orphan behind, and removed a redundant protected-folder working directory from LaunchAgent startup
- Reused the authenticated mobile protocol while keeping a launch-only local development key in memory and requiring HTTPS for non-private hosts
- Added native, code-drawn animated mascots using saved teammate appearance and execution state
- Added thirteen macOS unit tests, a macOS release contract, Xcode build/test gates, disposable API lifecycle checks, and direct live-runner teaching/automation validation without a model request
- Kept signed/notarized distribution, automatic updates, Windows support, self-hosted OAuth/event setup, and fresh-user runner packaging as explicit future work

## 0.33.0 — 2026-09-05

- Added durable pre-execution receipts and immutable fingerprints for approved commands, messages, issues, browser/app interactions, and connected-app updates
- Added atomic single-process claims, first-writer-wins approval decisions, safe prepared-action restart, and denied-action cleanup
- Added conservative crash recovery: in-flight remote outcomes become uncertain and can never be blindly reclaimed or replayed
- Added matching web and native Live Studio reconciliation controls and recent action history without exposing saved request bodies in public state
- Added deterministic restart/race/privacy fixtures and a native receipt-decoding check
- Kept universal provider-level exactly-once delivery and automatic reconciliation as explicit future work

## 0.32.0 — 2026-09-05

- Added native SwiftUI Work starters for source-backed briefs, meeting preparation, and inbox follow-ups
- Added live Gmail/Calendar/Drive readiness, one-tap Google recovery, Dynamic Type layouts, and Simulator UI validation

## 0.31.0 — 2026-09-05

- Added encrypted source snapshots, source-linked productivity reports, unsent follow-up drafts, and commit-bound coding checks
- Added deterministic runtime fixtures without consuming a real model allowance

## 0.30.0 — 2026-09-05

- Added active-time, idle, model-step, reported-token, and output limits with checkpointed usage and forced stop escalation
- Added whole-consultation cancellation and deterministic stalled-process recovery tests

## 0.29.0 — 2026-09-04

- Added usable custom provider endpoints/models, safer environment handling, corrected usage accounting, and capability-aware tool exposure
- Removed misleading message rewriting and separated teammate-reported checks from independent verification

## 0.28.0 — 2026-09-04

- Added signed Slack Events API triggers for mentions, messages, and reactions, with optional channel filtering and bot-message loop prevention
- Added verified Notion webhook triggers for page, comment, and database activity, with optional entity filtering
- Added private rotating provider event addresses, encrypted event secrets, verification state, HMAC checks, Slack replay-window enforcement, bounded attempts, and the existing durable dedupe/rate/replay contract
- Added responsive Apps & Tools setup for copying event addresses, saving the Slack signing secret, completing Notion verification, and rotating compromised addresses
- Added Slack and Notion cards to the automation builder and extended natural in-chat routine creation across both OpenCode and Claude Code runtimes
- Upgraded built-in connector manifests to version 2 with explicit event capability and authenticity declarations, plus a documented reviewed connector admission contract
- Expanded the complete suite to 113 passing tests covering provider signatures, event matching, encrypted configuration, address rotation, manifest validation, and natural routine schemas
- Kept arbitrary executable connector installation, hosted ingress, provider account consent, and live third-party delivery as explicit owner-setup or future work

## 0.27.0 — 2026-09-04

- Added an opt-in five-minute external heartbeat so an owner-selected dead-man service can detect complete private-host or network loss
- Encrypted heartbeat URLs in the local vault, returned only the provider hostname to clients, rejected redirects, and blocked private, local, metadata, and mixed DNS destinations
- Added passphrase-encrypted `.openbot-home` export/import for studio state, subscription sessions, browser state, and projects using scrypt and authenticated AES-256-GCM
- Staged and authenticated imports before downtime, rejected unsafe archive paths and links, created a fresh pre-import backup, retained the previous home, and restored it automatically after failed health verification
- Added matching heartbeat and migration guidance to responsive web and native iPhone Live Studio
- Expanded the automated suite to 110 passing tests, including wrong-passphrase, tamper, DNS-rebinding, encryption-at-rest, and durable heartbeat-state coverage

## 0.26.0 — 2026-09-04

- Added opt-in private-home health monitoring with durable 15-minute checks, changed-state alerts, once-daily unchanged reminders, and a separate recovery notification
- Reused the existing Web Push and APNs outbox so health alerts reach registered browsers and signed iPhones without adding a third-party monitoring account
- Added matching web and native controls with real destination counts and clear notification-setup recovery
- Added a backup-first private-runner updater that refuses dirty/diverged checkouts and accepts only `origin/main` or explicit release tags
- Kept the current service available during builds, verified replacement-container health, and restored the prior image automatically on failed startup
- Added bounded update receipts and a sixth Home-check item showing the installed release and latest protected update
- Expanded the automated suite to 105 passing tests and strengthened Linux image CI to verify the new health-alert contract and maintenance scripts

## 0.25.0 — 2026-09-04

- Added authenticated private-home diagnostics for storage capacity, backup freshness, OpenCode, Chromium, Docker access, release version, and uptime
- Added a matching native iPhone Home check inside Live Studio
- Replaced generic private-host instructions with a domain-aware, copyable setup assistant and explicit no-automatic-migration guidance
- Moved private backups into the protected host root and added an atomic maintenance receipt with successful time, size, archive, and release
- Corrected global Mac/private location language across the conversation header, sidebar, Automations, and Live Studio
- Added fixed-command, bounded-output, timeout-protected diagnostics with friendly recovery guidance
- Expanded the automated suite to 103 passing tests while retaining the complete 0.24 private-runner container build and boot smoke gate

## 0.24.0 — 2026-09-04

- Added an optional owner-operated private Linux runner that continues schedules, connectors, browser work, and code jobs while the Mac is asleep or off
- Packaged Caddy HTTPS, automatic restart, durable studio/model/browser/project mounts, Chromium, OpenCode, and Docker-backed isolated teammate computers
- Made private mode fail closed without a canonical HTTPS origin and absolute durable data path, and used that origin for every OAuth callback and signed hook
- Added proxy-aware Secure cookies, repeated-login throttling, a narrow no-secret health check, HSTS/anti-framing headers, and no public plain OpenBot port
- Added matching web and native **Private always-on home** status, readiness, data-location language, and calmer setup guidance
- Added owner-only setup and consistent backup scripts with explicit whole-studio migration and one-authoritative-location rules
- Expanded the automated suite to 101 passing tests while preserving all 0.23 native voice, connectors, approvals, teamwork, coding, and animated-character contracts
- Kept managed hosting, encrypted live Mac/server synchronization, Slack/Notion events, physical-device APNs/TestFlight, broad connectors, and fidelity editing as honest future work

## 0.23.0 — 2026-09-04

- Added deliberate native iPhone voice capture with editable partial transcription, explicit start/stop controls, permission recovery, and no OpenBot audio retention
- Preferred on-device Apple speech recognition whenever the active device and language support it, while keeping system-service fallback honest
- Replaced the indefinite web startup spinner with an animated teammate recovery screen, automatic retry, actionable Mac/Tailscale guidance, and a local background-studio escape hatch
- Recovered invalid or stale conversation links to the shared studio instead of leaving the product on its loading surface
- Collapsed self-hosted OAuth credentials behind clear disclosures and increased connector typography for a calmer, more readable Apps & Tools experience
- Rebuilt and simulator-compiled the native app plus Share extension, and retained the 94-test web/server release suite
- Kept Slack/Notion event sources, powered-off private hosting, physical-device APNs verification, and TestFlight distribution as honest remaining work

## 0.22.0 — 2026-09-03

- Added proactive Todoist activity and Dropbox folder-change automations with explicit filters, fresh baselines, durable cursors, duplicate protection, rate limits, receipts, and ordinary approval boundaries
- Upgraded Dropbox OAuth to PKCE and public-client support so a packaged release can provide one-click connection with only its registered app key
- Added native APNs device registration, ES256 provider tokens, sandbox/production routing, bounded result/approval payloads, per-target retries, and stale-token cleanup
- Added an embedded iOS Share extension for bounded text, links, images, and files with atomic private App Group handoff into the selected conversation
- Added matching settings/status language, environment templates, privacy manifests, and Debug/Release notification entitlements
- Expanded the product suite to 94 automated tests and compiled the app plus Share extension for the iPhone 17 Pro simulator
- Kept physical APNs delivery and App Store distribution explicitly owner-dependent on Apple signing, App Group/Push capabilities, a physical device, and a host-side `.p8` key

## 0.21.0 — 2026-09-03

- Added one-click Todoist OAuth registration, active-task reading, approval-gated task creation, per-teammate access, health checks, and audit receipts
- Added Dropbox OAuth, encrypted refresh tokens, read-only file search, bounded text/code reading, per-teammate access, health checks, and audit receipts
- Added both connectors to the manifest, web setup, real service-icon system, natural activity language, OpenCode tools, and Claude Code MCP bridge
- Added Calendar + Todoist and Dropbox project-context starter workflows
- Added native authenticated artifact downloads, Quick Look previews, content summaries, and share actions for messages and downloaded files
- Expanded the automated suite to 88 passing tests and compiled the native app against the iPhone 17 Pro simulator

## 0.20.0 — 2026-09-03

- Added exclusive renewable runner leadership so overlapping foreground/background processes cannot dispatch the same work
- Added atomic per-job claims, heartbeat renewal, durable attempts, and visible working/queued/waiting health
- Added restart recovery that returns expired work to the queue with its task contract, approval state, and recovery activity intact
- Added graceful service handoff so app updates and shutdowns requeue active jobs instead of incorrectly cancelling them
- Added one-click macOS login/crash protection through a bounded LaunchAgent and a launcher that waits for the foreground app before taking over
- Added a polished runner-health card with protection state, recovery totals, manual check, clear host-awake limits, and responsive phone layout
- Added a durable notification outbox, local VAPID keys, device subscriptions, Web Push delivery, stale-subscription cleanup, and result/approval deep links
- Added matching native SwiftUI runner health, recovery language, and authenticated manual wake support
- Expanded the automated product suite to 86 passing tests and added release guards for every new reliability layer

## 0.19.0 — 2026-09-03

- Rebuilt learned browser workflows as a teammate-owned Skill Library with purpose, instructions, source, and visible version metadata
- Added portable `.openbot-skill.json` export packages with a strict format and SHA-256 integrity verification
- Added bounded import with web-address validation, credential and private-key detection, placeholder support, and tamper rejection
- Added immutable skill versions and non-destructive rollback; every edit or restore produces a new retained version
- Added setup-only skill assignment across teammates without copying conversations, memories, browser profiles, credentials, or workspace files
- Added three editable starter skills for website QA, current research, and approval-safe browser administration
- Added a polished responsive library for teammate switching, teaching, installing, importing, editing, sharing, exporting, launching, and restoring skills
- Kept native iPhone skill launch metadata aligned and expanded the automated product suite to 83 passing tests

## 0.18.0 — 2026-09-03

- Added a studio-wide Live Studio with teammate desks, current and recent work, durable attention items, progress, stop controls, browser previews, and direct conversation links
- Added a matching native SwiftUI Live Studio overview for checking every teammate, attention item, and recent job from iPhone
- Added owner browser takeover with click, private typing, common keys, fresh screenshots, and masking for password, token, secret, and one-time-code fields in model-visible snapshots
- Added local search across messages, result files, automations, learned skills, and teammates, opening every result in its original conversation
- Added persistent reply references and lightweight message reactions
- Added sidebar sections, pins, reversible hide/restore, and safe teammate duplication that excludes history, memory, credentials, and browser state
- Unified the new controls with the customizable animated mascot system and verified Live Studio, search, and takeover at a 402-point iPhone width with zero horizontal overflow
- Expanded the automated product suite to 79 passing tests and kept the full production and native release gates green

## 0.17.4 — 2026-09-03

- Replaced web and native mascot image rendering with code-drawn, runtime-colored characters
- Restored independent blinking, floating, work, wait, celebration, and failure expressions across both clients
- Added six shape choices, six color presets, and a custom color picker to every existing teammate's settings
- Fixed teammate color updates so they persist in the local database and immediately flow into conversations and the iPhone client
- Improved the native connection form with reliable Next-to-key and Go-to-connect keyboard actions
- Added release guards for recolorable web layers, native SwiftUI shapes, saved appearance changes, and reduced-motion behavior
- Rebuilt and visually verified the responsive web studio and native iPhone onboarding at matching dimensions

## 0.17.3 — 2026-09-03

- Unified web and native layout tokens for the studio header, live status, conversation, bubbles, composer, routing pill, and controls
- Replaced the static shared-room image with three independently animated production mascots in both clients
- Added deliberately offset float and blink timing instead of synchronized character movement
- Added matching ready, working, waiting, offline, failed, and celebration treatments with status dots, happy eyes, and sparkles
- Matched native and web message gradients, bot surfaces, icon colors, direct-chat mascot sizing, and composer language
- Preserved reduced-motion behavior and verified both clients at a 402-point iPhone layout width

## 0.17.2 — 2026-09-03

- Unified the web and native iPhone studio around one visual and conversational language
- Reused the exact same production mascot artwork across both clients instead of maintaining look-alike variants
- Added durable Mac-to-iPhone and iPhone-to-Mac draft handoff through the authenticated owner-hosted service
- Added live draft events and friendly handoff cues without exposing unfinished text in URLs
- Prevented unchanged handoff drafts from echoing back as edits from the receiving device
- Kept the updated iPhone client compatible with a Mac still running the previous state response
- Expanded the automated product suite to 78 tests and re-verified the native build and live sign-in flow

## 0.17.1 — 2026-09-03

- Replaced the iPhone web-view studio with a genuine SwiftUI conversation experience
- Added native conversation switching, animated teammate identity, teammate targeting, message sending, live run state, approvals, cancellation, and connection settings
- Added native file selection and bounded attachment upload before a message is sent
- Added one premium three-character mascot system shared by the web and native apps, with native status, blink, and movement overlays
- Added Tailscale detection, an away-access address, address-only iPhone pairing, and one-click Mac app launch in Phone Remote
- Added Keychain-backed bearer authentication and server-sent event refreshes without placing credentials in URLs or source
- Compiled and launched the app with Xcode Beta on an iPhone 17 Pro simulator
- Added a live native UI test that signs in to the running Mac studio and verifies the conversation header and message composer
- Fixed the generated unit-test host/module configuration and verified all native connection tests
- Kept native artifact previews, push, share-sheet input, and dedicated voice capture explicitly out of the current claim

## 0.17.0 — 2026-09-02

- Added a native SwiftUI iPhone companion with secure onboarding, animated mascots, offline state, pull-to-refresh, and the complete responsive studio experience
- Added Keychain-only private-key storage, HttpOnly cookie handoff, foreground session refresh, safe forget/reconnect behavior, and private-network transport rules
- Added address-only `openbot://connect` pairing links from the Mac; credentials are never added to a URL
- Added a new production mascot icon for native iOS and installed web experiences
- Added stale-service-worker prevention for the native shell plus automated mobile structure, privacy, secret, and Swift-syntax checks
- Kept availability honest: the native client still depends on an awake reachable Mac, and App Store signing, push, share-sheet input, and always-on hosting remain separate release work

## 0.16.0 — 2026-09-02

- Added a versioned connector manifest with explicit capabilities, data boundaries, approval policy, health, previews, and per-teammate authority
- Added real Slack OAuth, member-authority search and conversation reading, bot-authority posting, exact message approvals, friendly scope recovery, and private audits
- Added real Notion OAuth, selected-page search and bounded reading, approval-gated content append, pagination limits, refresh recovery, and private audits
- Added managed one-click and self-hosted setup paths, recognizable service marks, connected previews, natural mentions, and multi-app workflow starters
- Invalidated stale model sessions whenever connector access changes and kept healthy grants through repeated or expired OAuth callbacks
- Split Markdown rendering from the initial client bundle and expanded connector, runtime, bridge, encryption, revocation, and approval coverage to 74 automated tests


## 0.10.0 — 2026-09-02

- Added one-step GitHub repository cloning into a clearly managed local projects folder
- Added separate-branch creation, bounded diff review, and exact-file commits for OpenCode and Claude Code teammates
- Added GitHub pull-request publishing through the official GitHub CLI, gated by passing task checks and a durable owner approval
- Added automatic restore points for every agent file edit; restore refuses to overwrite a file that changed afterward
- Upgraded Code projects with real GitHub marks, source links, branch/change review, expandable diffs, and a responsive safety-net activity trail
- Fixed approval intent so phrases such as “do not publish” and “never delete” no longer create a misleading approval; the dedicated action remains approval-gated
- Expanded the automated suite to 50 tests covering clone-link validation, branch isolation, unrelated-file protection, diffs, commits, and conflict-safe restore


## 0.9.0 — 2026-09-02

- Added an owner-approved coding harness for existing projects inside the user's home directory
- Added one-click project suggestions plus manual folder connection in a polished responsive Code projects panel
- Added independent **Code + test**, **Read only**, and **No access** settings for every teammate and project
- Added bounded project listing, fixed-string search, text reading, exact replacement, atomic file writing, Git status, and local edit history tools for OpenCode and Claude Code teammates
- Added disposable network-isolated project checks with a read-only container system, unprivileged host identity, dropped capabilities, resource limits, and hidden-secret/Git masks
- Added project-root, traversal, hidden-path, symbolic-link, binary, size, and capability enforcement; access changes also invalidate stale model sessions
- Added an honest marketing capability catalog that separates launch-ready features, setup-dependent features, and roadmap claims
- Expanded the automated suite to 47 tests covering per-teammate grants, safe edits, disconnect-without-delete, alias escape prevention, protected command views, and runtime tool exposure

## 0.8.0 — 2026-09-02

- Added a persistent completion contract to every substantial run: outcome, deliverable, required apps, approval boundary, three-to-eight meaningful steps, and a final verification record
- Added model tools for planning, milestone updates, and evidence-based verification in both OpenCode and Claude Code
- Added a compact live-job card with real checklist progress and a collapsible “Finished and checked” result receipt
- Preserved the existing job plan across approvals and resumed the same model session without resetting completed steps
- Kept greetings and casual conversation lightweight; a run becomes visibly tracked only when it is a real job or the model creates a plan
- Upgraded morning brief, meeting preparation, and follow-up starters with explicit deliverables, source checks, and no-send boundaries
- Replaced raw Google service errors in recent activity with clear recovery wording and contained the connections illustration at phone sizes
- Expanded the automated suite to 44 tests and verified the entire plan → work → reopen → check → receipt loop with a real model run

## 0.7.0 — 2026-09-02

- Added a per-teammate **Files on this Mac** permission for visible home folders
- Added bounded Mac folder listing and text reading for both OpenCode and Claude Code teammates
- Added approval-only batch organization that moves regular files into folders without deleting, overwriting, following aliases, or exposing hidden/system folders
- Replaced plain chat text with safe GitHub-flavored Markdown rendering for headings, lists, links, code, quotes, and tables
- Rebuilt connector card layout so long names, descriptions, status labels, and capability pills remain inside their borders
- Refined Google Calendar and Slack vector brand marks
- Organized 30 loose Desktop files into reversible Screenshots, Videos, Screen Recordings, Documents, and Archives folders
- Expanded the automated suite to 27 tests and verified a real Muse run could inspect the Desktop naturally

## 0.6.0 — 2026-09-01

- Added release-managed Google OAuth: packaged builds can expose a single Connect Google button through environment configuration
- Added a self-hosted JSON credentials-file flow that saves the client privately and opens Google sign-in without manual copying
- Expanded the Google connection to Gmail, Google Drive, and Google Calendar in one consent flow
- Added Drive search and supported document reading plus upcoming Calendar agenda tools for OpenCode and Claude Code teammates
- Added separate Inbox, sending, Drive, and Calendar access controls for every teammate
- Added real connection smoke buttons and previews for mail, recent Drive files, and upcoming Calendar events
- Added natural `@gmail`, `@drive`, and `@calendar` composer suggestions
- Added useful one-click starter workflows for morning briefs, meeting preparation, and follow-up drafts
- Expanded the automated suite to cover Workspace scopes, Drive search/read, Calendar events, tool exposure, and friendly progress

## 0.5.0 — 2026-09-01

- Added a real local Google OAuth connection using state, PKCE, offline refresh, and encrypted credentials
- Added Gmail inbox search, message reading, and plain-text sending for both OpenCode and Claude Code teammates
- Added per-teammate Gmail read/send permissions and server enforcement for browser/computer capability switches
- Made Gmail sending approval-only, with recipient, subject, and message preview visible before allowing once
- Fixed the task-card approval path so saved terminal, browser, and Gmail actions execute exactly once before the bot continues
- Added a premium responsive Apps & Tools surface with recognizable service marks, guided setup, inbox preview, honest availability, and private activity history
- Added connector persistence, audit records, mocked Google/Gmail coverage, and expanded launch documentation
- Kept Drive, Calendar, Slack, Notion, and GitHub clearly labeled as upcoming rather than presenting placeholders as working integrations

## 0.4.0 — 2026-09-01

- Added server-enforced `@name`, multi-bot, and `@everyone` routing
- Added automatic role-based owner selection for untagged studio messages
- Added six-file/25 MB attachments with private bot inbox materialization and hardened downloads
- Added browser voice typing and a guided installable phone-remote experience
- Added live/reconnecting/offline connection state
- Added independent mascot timing and laugh expressions
- Hardened dynamic mobile viewport, safe-area, touch-target, and overflow behavior
- Made message ordering deterministic for identical timestamps
- Added constant-time remote access-key checks
- Expanded the automated suite to 21 tests and added launch-readiness reporting
- Replaced provider placeholders with recognizable brand marks and changed AI/tool receipts into natural user-facing language

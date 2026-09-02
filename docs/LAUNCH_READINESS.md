# OpenBot 0.17.1 Launch Readiness

OpenBot 0.17.1 is ready for an open-source local-first beta launch with a compiled native iPhone experience. It is not yet an honest drop-in replacement for Grok Bot's always-on hosted service, push delivery, App Store distribution, guaranteed transcription/OCR, fidelity-preserving Office editing, organization controls, or wider plugin catalog.

## What is launch-ready

- Persistent named teammates with owned model connections, budgets, memory, files, browser sessions, routines, and observable work
- Official OpenCode and Claude Code runtime paths plus encrypted API-key connections
- Direct chat, natural mentions, automatic ownership, parallel room work, bounded private bot-to-bot communication, one coordinator-owned answer, and duplicate protection
- Chat-native `/` discovery for learned skills, with use, rename, starting-page edit, and delete controls plus OpenCode and Claude Code skill generation
- Natural follow-up steering for active non-code jobs, with immediate cancellation and safe session continuation; coding jobs stay pinned to their isolated task branch
- Rich PDF, Word, workbook, CSV/TSV, PowerPoint, text, JSON/YAML/notebook/email/source, image, audio, and video ingestion with format-specific bounds
- Original media forwarded to compatible OpenCode models, contained image/PDF and extracted-text previews, friendly unsupported-format recovery, and hardened downloads
- Teammate-created files surfaced automatically beside the answer, with numbered revisions and preserved earlier copies
- Voice typing, an installable PWA, authenticated remote access, and a native SwiftUI iPhone app with Keychain-backed API access, conversations, teammate routing, live work, and approvals
- Durable approval cards, isolated bot computers, private browser profiles, workspace path checks, and attachment download hardening
- Responsive desktop and phone layouts, reduced-motion support, live connection state, and expressive asynchronous mascots
- Repeatable verification through the automated suite, production build, real DeepSeek workflow, and desktop/phone browser QA
- One-click release-managed Google OAuth or a self-hosted credentials-file flow, encrypted local tokens, per-teammate app access, previews, and a private activity trail
- Gmail search/read and approval-only sending, Drive search/document reading, and Calendar agenda reading
- Official GitHub CLI connection with notifications, issue search, per-teammate read/create permissions, and approval-only issue creation
- Slack OAuth with member-visible search/read, bot posting, separate per-teammate read/post grants, exact write approvals, connected preview, health, and private audits
- Notion OAuth with selected/shared-page search/read, separate per-teammate read/update grants, exact append approvals, connected preview, health, and private audits
- Scheduled, Calendar, signed GitHub, and signed generic-webhook automations with narrow filters, explicit tests, pause/resume/edit/delete, encrypted rotating secrets, event receipts, linked results, and safe replay
- Failure and approval attention inbox, missed-schedule notices, seven-day event deduplication, burst limits, loop headers, bounded redacted input, and automatic pause after three consecutive failures
- Studio-wide visible Mac-file access, protected hidden/system paths, and approval-only organization without deletion or overwriting
- Safe Markdown messages and connector cards that keep status and capability text inside their borders
- Durable job outcomes, deliverables, checklists, approval boundaries, and evidence-based final receipts across both supported agent runtimes
- One-click GitHub clone and local project connections, per-teammate grants, isolated per-task worktrees, concurrent branches, bounded diffs, exact-file commits, independent teammate review, conflict-safe restore points, disposable no-network checks, and approval-gated pull requests

## Where OpenBot is better by design

| Area | OpenBot advantage |
|---|---|
| Ownership | The user selects and owns the model/subscription connection assigned to each bot. |
| Privacy | Loopback-only by default, local database, isolated per-bot workspaces/computers, and inspectable encrypted secrets. |
| Team safety | Consultations are privately inspectable, deduplicated, capped at three hops/eight related runs, and synthesized by one coordinator instead of producing noisy duplicate replies. |
| Approval durability | Approval decisions persist without short expiry windows. |
| Email authority | Reading and sending are separate per teammate; every send shows a durable one-time approval before execution. |
| App least privilege | Gmail, Drive, Calendar, Slack, and Notion read/write capabilities can be enabled independently for each teammate even when the studio shares one connected account. |
| GitHub authority | Reading activity and creating issues are separate per teammate; every issue creation shows a durable one-time approval. |
| Reusable work | Learned skills stay local and reviewable, while automation edits, event receipts, retries, and results preserve their history. |
| Automation safety | Signed event delivery, duplicate prevention before run creation, failure auto-pause, explicit tests, and explainable replay make unattended work inspectable. |
| Cost control | Per-bot weekly token limits and provider-reported token/cache/cost data are visible. |
| Completion trust | A claimed success is visibly distinguished from a checked result, and the supporting steps and checks can be inspected. |
| Project authority | Each teammate gets explicit per-project read, edit, and test rights; no broad host filesystem permission is needed for coding. |
| Change recovery | Every agent write has a local restore point that refuses to overwrite newer work. |
| Artifact clarity | Inputs and teammate-created outputs stay beside the conversation with safe previews, useful metadata, and preserved revisions. |
| Portability | The product is MIT-licensed and does not require one hosted model vendor. |

## What Grok Bot still has that OpenBot does not

| Gap | Honest status | Best next move |
|---|---|---|
| Always-on cloud work | OpenBot stops when the host Mac sleeps or the service exits. | Add an optional self-hosted daemon/VPS deployment with encrypted backup and health checks. |
| Native distribution and push | The SwiftUI app builds, sends attachments, and passes live simulator QA, but still needs physical-device QA, App Store signing/delivery, rich artifact previews, and a push provider/always-on host. | Complete device QA and signing, then add previews and opt-in push only with an always-on runner. |
| Large connector marketplace | Gmail, Drive, Calendar, GitHub, Slack, and Notion have real bounded tools; this is still a focused built-in set, not a marketplace. | Publish a connector security/review contract, then add task management and cloud storage through the same manifest. |
| Full visual desktop takeover | The macOS Accessibility bridge can inspect controls and approval-gate interactions, but it cannot reason over arbitrary pixels, canvases, or video. | Add an optional Screen Recording helper with bounded screenshots and the same per-action approval policy. |
| Fidelity-preserving Office editing | OpenBot can extract and reason over PDF, Word, spreadsheet, and presentation content, but it does not yet edit complex layouts or formulas through a native document engine. | Add format-aware editing with rendered before/after review. |
| Hosted remote dev environments | The local harness now isolates every coding task in its own Git worktree and supports parallel agents, but work still stops when the host is unavailable. | Add an encrypted always-on runner without weakening local mode. |
| Hosted event ingress and execution | Schedule and Calendar triggers run only while the Mac and OpenBot are awake. Public webhook delivery requires an owner-managed HTTPS route to the local endpoint. | Add an optional always-on runner with encrypted leases, recovery, health checks, and hosted ingress without weakening local mode. |
| Broader event sources | Signed GitHub and generic hooks plus primary-Calendar polling are included; Slack/Notion events and configurable retry backoff are not. | Build them on the same event receipt, permission, approval, dedupe, and replay contract. |
| Organization administration | No SSO, team policy dashboard, audit export, or shared setup images. | Keep 0.17 single-owner; design multi-user tenancy separately instead of weakening local assumptions. |
| Roster organization and global search | No pin/section/hide/duplicate/share-template workflow or cross-chat search yet. | Add local full-text search and roster sections before expanding to 50 bots. |
| Reply/reaction ergonomics | Active non-code work can now be redirected naturally, but messages still lack explicit reply references and reactions. | Add lightweight reply context and reactions without turning the chat into a project-management interface. |

## Release decision

Ship 0.17.1 as a **local-first beta**, with the limitations above visible in the README. The native iPhone app is simulator-verified and ready for owner-signed device testing, not yet an App Store claim. Do not market OpenBot as always-on or imply that universal media understanding, OCR, or native Office editing work.

## Verified acceptance criteria

- Automated tests: 77 passing
- iOS project: generated by XcodeGen; compiled with Xcode Beta on an iPhone 17 Pro simulator; four unit tests and one live sign-in UI test pass; no `WKWebView` remains in the app source
- Type safety: passing
- Production build: passing
- Real model: DeepSeek V4 Flash Vision interpreted the supplied screenshot through the new media path; DeepSeek V4 Flash then created, linked, verified, revised, and re-linked one result as versions 1 and 2
- Rich-input fixtures: real PDF text plus Word, spreadsheet, slide, image, audio, type-detection, prompt-boundary, model-forwarding, workspace-escape, artifact, and revision cases pass
- Desktop viewport: 1280×720 rich image card is fully contained with preview and download actions
- Phone viewport: 390×844 without page or card overflow; the rich card survives refresh
- Security smoke: preview MIME allowlist, inline sandbox policy, `nosniff`, private caching, forced ordinary downloads, parser bounds, and artifact workspace containment are covered
- Idle state after verification: zero active runs and zero pending approvals
- Google integration: mocked OAuth/PKCE, encrypted storage, Gmail, Drive, Calendar, safe message construction, tool exposure, and per-bot access passing; real account consent intentionally left to the owner
- Slack and Notion integrations: official response shapes, OAuth state/replay behavior, encrypted storage, token refresh/rotation paths, provider-version headers, bounded reads, approval-only writes, session revocation, and cross-runtime tool exposure passing; live account consent intentionally left to the owner
- GitHub integration: official CLI account health, live notification preview, live issue search, response normalization, URL safety, per-teammate read/create separation, approval-gated creation, and connector activity records passing. A real DeepSeek V4 Flash teammate read the newest notification with read-only access and returned its title/repository; no test issue was created and all temporary test state was removed.
- Skills and automations: slash parsing, unique skill slugs, cross-runtime skill files, trigger parsing, signed webhook verification, filters, encrypted secrets, event deduplication, rate limiting, lifecycle linkage, three-failure pausing, alerts, replay input, and preserved history passing
- Real automation: one signed event was accepted, ran with Muse Spark 1.2 Free, produced `build-event-confirmation.md`, and a repeated delivery returned the original event without creating another run
- 0.16 UI: Slack and Notion managed/self-hosted setup, real service marks, health/status, connected previews, per-teammate grants, callback states, activity, and workflow cards inspected at desktop and 390×844 with zero page-level overflow or console errors
- Automation security smoke: invalid/valid signatures, narrow matching, secret redaction, payload bounds, dedupe-before-dispatch, and three-failure pause are covered; the manual workflow confirmed one event, one run, and one duplicate stopped
- Mac files: traversal, hidden/system paths, aliases, bounded reads, no-overwrite organization, database permission, tool exposure, and a real Desktop-listing run passing
- Code projects: a real DeepSeek V4 Flash teammate created a separate branch, made one exact source edit, reviewed the diff, passed `npm test` in the no-network container, committed only the named file, reopened it, left the tree clean, and recorded five successful checks; the temporary grant was removed and the disposable fixture was moved to Trash afterward
- Code projects UI: empty, GitHub clone, connected, and expanded review states verified at 1440×900 and 390×844; the document, sheet, fields, and review card had no horizontal overflow

# OpenBot 0.11.0 Launch Readiness

OpenBot 0.11.0 is ready for an open-source local-first beta launch. Its completion engine, natural mid-job steering, and review-first coding harness make substantial work plan-driven, observable, editable, verifiable, and publishable with approval, but it is not yet an honest drop-in replacement for Grok Bot's hosted service, native iOS client, or wider plugin catalog.

## What is launch-ready

- Persistent named teammates with owned model connections, budgets, memory, files, browser sessions, routines, and observable work
- Official OpenCode and Claude Code runtime paths plus encrypted API-key connections
- Direct chat, natural mentions, automatic ownership, parallel room work, bounded bot-to-bot communication, and duplicate protection
- Natural follow-up steering for active non-code jobs, with immediate cancellation and safe session continuation; coding jobs stay pinned to their isolated task branch
- Real attachments, artifact downloads, voice typing, an installable phone UI, and authenticated remote access
- Durable approval cards, isolated bot computers, private browser profiles, workspace path checks, and attachment download hardening
- Responsive desktop and phone layouts, reduced-motion support, live connection state, and expressive asynchronous mascots
- Repeatable verification through the automated suite, production build, real DeepSeek workflow, and desktop/phone browser QA
- One-click release-managed Google OAuth or a self-hosted credentials-file flow, encrypted local tokens, per-teammate app access, previews, and a private activity trail
- Gmail search/read and approval-only sending, Drive search/document reading, and Calendar agenda reading
- Studio-wide visible Mac-file access, protected hidden/system paths, and approval-only organization without deletion or overwriting
- Safe Markdown messages and connector cards that keep status and capability text inside their borders
- Durable job outcomes, deliverables, checklists, approval boundaries, and evidence-based final receipts across both supported agent runtimes
- One-click GitHub clone and local project connections, per-teammate grants, isolated per-task worktrees, concurrent branches, bounded diffs, exact-file commits, independent teammate review, conflict-safe restore points, disposable no-network checks, and approval-gated pull requests

## Where OpenBot is better by design

| Area | OpenBot advantage |
|---|---|
| Ownership | The user selects and owns the model/subscription connection assigned to each bot. |
| Privacy | Loopback-only by default, local database, isolated per-bot workspaces/computers, and inspectable encrypted secrets. |
| Team safety | Bot messages and handoffs are visible, deduplicated, and capped at three hops/eight related runs. |
| Approval durability | Approval decisions persist without short expiry windows. |
| Email authority | Reading and sending are separate per teammate; every send shows a durable one-time approval before execution. |
| App least privilege | Gmail, Drive, and Calendar can be enabled independently for each teammate even though they share one Google account. |
| Cost control | Per-bot weekly token limits and provider-reported token/cache/cost data are visible. |
| Completion trust | A claimed success is visibly distinguished from a checked result, and the supporting steps and checks can be inspected. |
| Project authority | Each teammate gets explicit per-project read, edit, and test rights; no broad host filesystem permission is needed for coding. |
| Change recovery | Every agent write has a local restore point that refuses to overwrite newer work. |
| Portability | The product is MIT-licensed and does not require one hosted model vendor. |

## What Grok Bot still has that OpenBot does not

| Gap | Honest status | Best next move |
|---|---|---|
| Always-on cloud work | OpenBot stops when the host Mac sleeps or the service exits. | Add an optional self-hosted daemon/VPS deployment with encrypted backup and health checks. |
| Native iPhone app and push | OpenBot is an installable PWA; background push delivery is browser/platform dependent. | Package a thin native shell and add opt-in push infrastructure. |
| Large connector marketplace | Gmail, Drive, and Calendar are real. GitHub clone/PR delivery is real but issues and notifications are not a general app connector; Slack and Notion remain upcoming. | Extract the Google boundary into a connector SDK, then implement Slack with the same read/write separation. |
| Full visual desktop takeover | The macOS Accessibility bridge can inspect controls and approval-gate interactions, but it cannot reason over arbitrary pixels, canvases, or video. | Add an optional Screen Recording helper with bounded screenshots and the same per-action approval policy. |
| Rich Office/spreadsheet editing | Files persist, but there is no workbook-aware editor or fidelity engine. | Add document and spreadsheet tools with rendered before/after review. |
| Hosted remote dev environments | The local harness now isolates every coding task in its own Git worktree and supports parallel agents, but work still stops when the host is unavailable. | Add an encrypted always-on runner without weakening local mode. |
| Event-triggered routines | 0.11 provides interval schedules, not Slack/GitHub/webhook triggers. | Add signed webhook triggers with filters, rate limits, dedupe keys, and replay history. |
| Organization administration | No SSO, team policy dashboard, audit export, or shared setup images. | Keep 0.11 single-owner; design multi-user tenancy separately instead of weakening local assumptions. |
| Roster organization and global search | No pin/section/hide/duplicate/share-template workflow or cross-chat search yet. | Add local full-text search and roster sections before expanding to 50 bots. |
| Reply/reaction ergonomics | Active non-code work can now be redirected naturally, but messages still lack explicit reply references and reactions. | Add lightweight reply context and reactions without turning the chat into a project-management interface. |

## Release decision

Ship 0.11.0 as a **local-first beta**, with the limitations above visible in the README. Do not market it as a hosted virtual-assistant replacement or imply that roadmap connectors work. The strongest launch story is: private persistent AI teammates that can plan, code, review, publish, use connected context, accept new direction while working, collaborate, and verify work while the owner keeps control of projects, models, and sensitive actions.

## Verified acceptance criteria

- Automated tests: 52 passing
- Type safety: passing
- Production build: passing
- Real model: Nova completed a three-step file workflow, reopened the artifact, recorded four passing checks, and returned one verified result receipt
- Desktop viewport: 1440×900 without document overflow
- Phone viewport: 390×844 without document overflow; composer and sheet respect the visible edge
- Security smoke: attachment download returns 200 with forced disposition, sandbox CSP, `nosniff`, and exact content length
- Idle state after verification: zero active runs and zero pending approvals
- Google integration: mocked OAuth/PKCE, encrypted storage, Gmail, Drive, Calendar, safe message construction, tool exposure, and per-bot access passing; real account consent intentionally left to the owner
- Mac files: traversal, hidden/system paths, aliases, bounded reads, no-overwrite organization, database permission, tool exposure, and a real Desktop-listing run passing
- Code projects: a real DeepSeek V4 Flash teammate created a separate branch, made one exact source edit, reviewed the diff, passed `npm test` in the no-network container, committed only the named file, reopened it, left the tree clean, and recorded five successful checks; the temporary grant was removed and the disposable fixture was moved to Trash afterward
- Code projects UI: empty, GitHub clone, connected, and expanded review states verified at 1440×900 and 390×844; the document, sheet, fields, and review card had no horizontal overflow

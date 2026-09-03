# Workflow Benchmark

This benchmark uses workflows repeatedly highlighted in Grok Bot's official use cases and community feedback: async one-shot work, engineering review, persistent browser/admin work, routines, team handoffs, and document/file reconciliation.

## Results

| Workflow | OpenBot result | Evidence | Current comparison |
|---|---|---|---|
| Persistent specialist | Pass | Nova, Pixel, and Scout retained separate role, session, memory, files, model, provider, browser, and budget | Close, with stronger local ownership visibility |
| Parallel one-shot tasks | Pass | Nova and Pixel ran simultaneously and each created/verified a different workspace file | Close for local file/research tasks |
| Team handoff | Pass | A coordinator can hand a focused part to another bot, wait for it, and resume only when the private result is ready; a repeated dedupe key produces exactly one consultant run | Adds explicit duplicate protection and one coordinator-owned answer |
| Teammate communication | Pass | Private questions, replies, code reviews, failures, and nested consultations converge on the requesting bot; consultant runs stay out of chat while Control center preserves each route, kind, and finding | Less noisy, more transparent, with hard loop limits |
| Studio supervision | Pass | Live Studio combines active work, waiting approvals, failures, progress, browser previews, runner health, recovery state, and direct stop/message controls on desktop and iPhone | Stronger local observability and intervention; powered-off cloud availability remains a gap |
| Find and resume work | Pass | Global search finds conversations, files, routines, workflows, and teammates; a result opens its source instead of creating a disconnected copy | Close for local history, with transparent source boundaries |
| Conversation organization | Pass | Threads can be pinned, grouped into named sections, hidden and restored; a teammate setup can be duplicated without copying its private history or browser profile | More explicit privacy when reusing a teammate configuration |
| Natural group routing | Pass | `@name`, multiple mentions, and `@everyone` are enforced on the server; untagged requests choose one owner by role fit and availability | Close for core routing; Grok also mentions groups, routines, skills, and plugins |
| Mid-job steering | Pass for active non-code jobs | A natural follow-up immediately stops the prior run, preserves its session link, and starts a continuation with the new direction; the composer explains this before send | Close for the common chat flow; active code work deliberately queues to preserve its isolated branch |
| Rich file handoff | Pass for supported local formats | PDF, Word, workbook, CSV/TSV, PowerPoint, text, image, and audio fixtures are identified and prepared with bounded private context; originals go only to selected teammates | Close for common knowledge-work inputs, with smaller limits and no scanned-document OCR yet |
| Screenshot understanding | Pass with a compatible model | A real DeepSeek V4 Flash Vision run received the supplied screenshot through OpenBot and correctly identified the duplicate-answer UX problem from its visual content | Close for chat-attached screenshots; general Mac pixel takeover remains intentionally separate |
| Reviewable result and revision | Pass | A real DeepSeek V4 Flash workflow created a Markdown result, surfaced it as a card, updated the same workspace file, and surfaced version 2 linked to preserved version 1 | Stronger local revision transparency; no fidelity-preserving Office editor yet |
| Browser workflow | Pass | Open/type/click/read/screenshot succeeded against a real local page in Nova's persistent profile | Close for supported web actions; third-party login breadth remains untested |
| Human browser takeover | Pass in the isolated teammate browser | Live Studio shows the current page, accepts coordinate clicks, typing and common keys, then returns control to the teammate; password-like values are masked before snapshots are stored | Better recovery from CAPTCHAs, sign-ins, and ambiguous UI without exposing arbitrary Mac apps |
| Teach, share, and restore a task | Pass | A visible demonstration becomes readable OpenCode and Claude Code skill files plus a teammate-owned library record. The same skill exports with integrity, rejects changed or secret-bearing imports, assigns as an independent copy, keeps every edit, and restores an earlier snapshot as a new version | Stronger local portability and recovery for browser workflows; this is not an executable plugin marketplace |
| Automation reliability | Pass in resilient local-first scope | Schedule, Calendar, GitHub, and generic hooks share one inbox, replay, rate, failure-pause, and approval path. A single runner lease prevents overlapping processes from dispatching twice; jobs are atomically claimed and an expired job resumes with its checklist intact | Stronger duplicate prevention, restart recovery, and owner-visible health; unlike Grok's hosted service, work pauses when the Mac sleeps or powers off |
| Background result delivery | Pass for secure installed web apps | A durable local outbox signs Web Push with machine-local VAPID keys, cleans stale endpoints, bounds payloads, and opens the relevant result or approval | Better local ownership visibility; native APNs and powered-off delivery still require separate infrastructure |
| Outcome completion and verification | Pass | A real model created a three-step contract, wrote an artifact, reopened it, recorded four concrete checks, and returned one expandable verified receipt | More explicit than an opaque “done”; plan and evidence persist through restarts and approvals |
| Review-first engineering | Pass in bounded local scope | Each run receives an isolated Git worktree; parallel tasks cannot switch or dirty the owner's checkout. A real DeepSeek V4 Flash run previously completed the edit/test/commit loop, and 0.11 adds an exact-commit review verdict from a different teammate before owner-approved publishing | Stronger local concurrency, project authority, restore safety, and explicit two-agent review; hosted remote computers remain a gap |
| Approval reliability | Pass | Pending approval persisted through database restart and never auto-expired | Directly addresses expiry/stale-state complaints |
| Usage control | Pass | Real run stopped before model execution after the token budget was exceeded | More explicit per-bot limits |
| Provider ownership | Pass | Provider is owner-scoped, assigned per bot, and optional key is encrypted | More local and inspectable |
| Subscription portability | Pass for available accounts | OpenCode and ChatGPT/OpenAI were detected; Claude Code was detected and offered its official login; Copilot, GitLab Duo, and SuperGrok OAuth flows are available | Broader bring-your-own-account choice without credential pooling |
| Workspace research and meeting preparation | Pass in mocked integration; owner sign-in pending | Gmail search/read, Drive search/text export, Calendar agenda, bounded payloads, per-bot access, and friendly progress are automated; the Apps & Tools panel includes live smoke checks and three useful starters | Close for core Google Workspace context; Grok also creates/organizes Drive items and changes Calendar events |
| Approval-safe email | Pass in mocked integration | Header injection is rejected, recipient count/body size are bounded, every send becomes a persistent approval, and the shared approval path performs the saved action once | Stronger explicit per-bot read/send policy; real account delivery still needs owner authorization |
| GitHub triage, issues, and event reaction | Pass | A real DeepSeek V4 Flash teammate used a temporary read-only grant to return the newest notification's title and repository. Live issue search passed; issue creation remains approval-gated, and signed GitHub event delivery now supports repository/event/action filters and duplicate IDs | Stronger local credential ownership, per-teammate write authority, and event receipts; public event ingress is owner-operated |
| Slack catch-up and approved reply | Pass in mocked integration; owner sign-in pending | Official OAuth/search/conversation/message shapes, member versus bot authority, bounded results, per-teammate grants, exact post previews, scope recovery, and cross-runtime tools are automated | Close for focused Slack knowledge work, with stronger local permission visibility; Slack events and broad administration remain gaps |
| Notion knowledge brief and approved append | Pass in mocked integration; owner sign-in pending | Official OAuth/search/page/block/append shapes, selected-page boundary, pagination caps, API versioning, per-teammate grants, exact update previews, rate-limit recovery, and cross-runtime tools are automated | Close for selected-page research and additive updates; database automation and general editing remain gaps |
| Mobile check-in | Pass for resilient local-first use | Compiled native SwiftUI conversation UI, Keychain credential storage, Tailscale pairing, live events, teammate targeting, attachment sending, run/approval controls, runner health, recovery state, and manual wake; secure installed web clients also support Web Push | Strong native foreground core plus web push; Grok still has powered-off hosting, native APNs, richer previews, dedicated voice sessions, and store distribution |
| Mac file organization | Pass | One studio-wide permission, visible-home listing, bounded text reading, approval-only no-overwrite moves, and a real Desktop inspection completed | Safer and more explicit for file cleanup; Grok/Hermes remain broader for general computer control |
| Spreadsheet understanding | Pass for bounded XLSX/XLSM/CSV/TSV reading; editing partial | Sheet names, rows, values, and formula results are prepared for the teammate and shown in a text preview; result files persist with revisions | Dependable analysis is present; layout/formula-preserving workbook editing still needs a dedicated tool |
| General macOS app control | Partial in 0.20 | The Accessibility bridge can list apps, inspect visible controls, focus apps, scroll, and approval-gate clicks/typing/keys; arbitrary pixel and canvas understanding remains unavailable | Grok/Hermes currently broader for visual computer use |
| Large plugin catalog | Partial in 0.21 | Gmail, Drive, Calendar, GitHub, Slack, Notion, Todoist, and Dropbox are real bounded connectors; portable browser skills are data-only and there is no third-party executable marketplace yet | Grok remains broader |
| Always-on hosted cloud computer | Partial by design in 0.20 | The macOS service survives login, app exits, and crashes, while computers persist when the awake host/Docker are available | Stronger self-hosted recovery; Grok retains powered-off cloud availability |

## Complaint-focused changes

- **Approvals expire or badges get stuck:** approval rows have no expiry; the UI derives its badge from pending database rows and approved/denied decisions clear it.
- **Bots forget schedules:** automations are explicit database records with trigger configuration, next/last run, health, event receipts, linked results, edit/delete controls, and safe retry.
- **OpenBot closes and leaves a task stuck on “working”:** the active process holds a renewable lease; graceful exits requeue owned jobs, crashes expire automatically, and the next leader visibly resumes the saved task instead of duplicating or abandoning it.
- **I miss a finished task while away:** secure installed web apps can subscribe to the durable Web Push outbox and open the exact result or approval from the notification.
- **Duplicate sends/actions:** signed event deliveries are deduplicated before run creation and counted on the original receipt. Teammate messages and handoffs use separate durable dedupe keys plus three-hop/eight-run limits. Gmail approvals are marked decided before delivery and cannot be approved twice.
- **A failed automation repeats forever:** failures enter an attention inbox with repair guidance and retained safe input; supported events can be replayed, while three consecutive failures pause the automation automatically.
- **Two bots answer one question:** consultant results now remain private, the coordinator waits for every requested result, and only that coordinator publishes one synthesized response and completion notification.
- **Spreadsheet progress is lost:** persistent per-bot workspaces and sessions reduce restart loss; native workbook-aware editing remains a gap.
- **An attachment is only a filename:** 0.14 detects the actual type, prepares bounded PDF/Office/sheet/text context, forwards supported media originals, and shows a useful preview before the teammate replies.
- **Finished files disappear into a workspace path:** linked teammate files now become in-chat cards; revising the same file creates a numbered version without erasing the earlier copy.
- **Tone drifts:** role and working style live in stable generated `AGENTS.md`; durable memories are included on every run.
- **Slow or opaque usage:** three bots can run concurrently, live partial text and tools are visible, and OpenCode token/cache/cost events are recorded per run.
- **Messages feel mechanical:** people can route tasks naturally with mentions or dictate from a phone; mascot expressions are independent rather than synchronized.
- **A connection demo is not a useful outcome:** connected users can start a morning brief, meeting preparation, or follow-up review immediately; missing permissions disable the affected starter instead of creating a doomed task.
- **Bots stop after an update instead of finishing:** substantial work has a durable outcome, deliverable, checklist, and verification state. The system marks an unverified completion as partial rather than silently presenting it as fully checked.
- **Agent code changes are hard to trust:** every task uses an isolated worktree, the owner can inspect a bounded diff, commits name exact files, a different teammate reviews the unchanged commit, publishing requires owner approval, and unchanged agent edits have conflict-safe restore points.
- **A follow-up becomes a disconnected second task:** active non-code work now stops and resumes as one continuation using the newest direction. Code work queues rather than risking its isolated branch.
- **Learned automations disappear into settings:** typing `/` reveals relevant learned skills in chat; the Skill Library keeps owner, purpose, instructions, source, generated files, every version, import/export, assignment, rollback, and deletion under user control.
- **A shared workflow leaks credentials or cannot be trusted:** exported skills omit private teammate data, carry an integrity hash, and are rejected when changed or when bounded scanning finds embedded credentials; explicit placeholders survive safely.
- **GitHub writes feel too broad:** notification and issue reading is separate from issue creation for every teammate, and the write still waits for a durable preview approval.
- **Connected apps expose too much:** Slack and Notion now separate read from write per teammate, explain the provider-side visibility boundary, invalidate stale sessions on revocation, and keep every write behind an exact preview.
- **It is hard to see what the whole team is doing:** Live Studio now puts active work, blocked work, recent results, browser state, and intervention controls in one place on desktop and iPhone.
- **Old work is hard to find:** one search covers conversations, files, routines, workflows, and teammates, and opens the original source.
- **A login or visual browser step blocks the agent:** the owner can take over the teammate's isolated browser, interact privately, and hand it back without granting general Mac-screen access.

## Provider-policy references

- [OpenCode provider authentication](https://opencode.ai/docs/providers)
- [Claude Code authentication options](https://docs.anthropic.com/en/docs/claude-code/getting-started)
- [Anthropic guidance for third-party tools](https://support.claude.com/en/articles/13189465-log-in-to-your-claude-account)
- [Claude.ai plans and API billing are separate](https://support.anthropic.com/en/articles/9876003-i-subscribe-to-a-paid-claude-ai-plan-why-do-i-have-to-pay-separately-for-api-usage-on-console)

## Research references

- [Grok Bot — Work](https://cursor.com/docs/grok-bot/work)
- [Grok Bot — Use cases](https://cursor.com/docs/grok-bot/use-cases)
- [Grok Bot — Settings and notifications](https://cursor.com/docs/grok-bot/settings)
- [Grok Bot — Connect plugins](https://cursor.com/help/grok-bot/connect-plugins)
- [Cursor — Google Workspace plugins](https://cursor.com/en-US/changelog)
- [Google — OAuth 2.0 for web server applications](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Google — Gmail API scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)
- [Grok Bot — Teams and Enterprise](https://cursor.com/docs/grok-bot/teams)
- [Cursor — Agent computer use](https://cursor.com/blog/agent-computer-use)
- [Cursor 3 engineering workflows](https://cursor.com/blog/cursor-3)
- [GitHub CLI — Create a pull request](https://cli.github.com/manual/gh_pr_create)
- [GitHub CLI — API](https://cli.github.com/manual/gh_api)
- [GitHub REST — Notifications](https://docs.github.com/en/rest/activity/notifications)
- [GitHub REST — Issues](https://docs.github.com/en/rest/issues/issues)
- [Slack — Installing with OAuth](https://docs.slack.dev/authentication/installing-with-oauth)
- [Slack — Search messages](https://docs.slack.dev/reference/methods/search.messages)
- [Slack — Post a message](https://docs.slack.dev/reference/methods/chat.postMessage)
- [Notion — Authorization](https://developers.notion.com/docs/authorization)
- [Notion — Search](https://developers.notion.com/reference/post-search)
- [Notion — Append block children](https://developers.notion.com/reference/patch-block-children)
- [Hermes Agent — Architecture](https://hermes-agent.nousresearch.com/docs/developer-guide/architecture)
- [Hermes Agent — Agent loop](https://hermes-agent.nousresearch.com/docs/developer-guide/agent-loop)
- [Hermes Agent — Bot Mode](https://hermes-agent.nousresearch.com/docs/user-guide/bot-mode)
- [Hermes Agent — Computer use](https://hermes-agent.nousresearch.com/docs/user-guide/features/computer-use)
- [Hermes Agent — Security](https://hermes-agent.nousresearch.com/docs/user-guide/security)
- [Community review and complaints](https://www.reddit.com/r/cursor/comments/1vxjipg/grok_bot_review/)
- [Community discussion of useful workflows](https://www.reddit.com/r/cursor/comments/1vvx2fg/is_grok_bot_worth_it/)
- [Cursor forum approval-state report](https://forum.cursor.com/t/grok-bot-approval-needed-stays-on-agent-view-homepage-when-coder-has-nothing-to-approve/170127)

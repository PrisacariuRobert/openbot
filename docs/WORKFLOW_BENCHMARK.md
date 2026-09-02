# Workflow Benchmark

This benchmark uses workflows repeatedly highlighted in Grok Bot's official use cases and community feedback: async one-shot work, engineering review, persistent browser/admin work, routines, team handoffs, and document/file reconciliation.

## Results

| Workflow | OpenBot result | Evidence | Current comparison |
|---|---|---|---|
| Persistent specialist | Pass | Nova, Pixel, and Scout retained separate role, session, memory, files, model, provider, browser, and budget | Close, with stronger local ownership visibility |
| Parallel one-shot tasks | Pass | Nova and Pixel ran simultaneously and each created/verified a different workspace file | Close for local file/research tasks |
| Team handoff | Pass | Nova handed a four-item checklist to Scout; a repeated dedupe key produced exactly one Scout run | Adds explicit duplicate protection |
| Teammate communication | Pass | DeepSeek V4 Flash made Pixel share a finding, ask Scout a question, and receive exactly one no-reply response; the control center displayed each route, kind, and content | More transparent, with hard loop limits |
| Natural group routing | Pass | `@name`, multiple mentions, and `@everyone` are enforced on the server; untagged requests choose one owner by role fit and availability | Close for core routing; Grok also mentions groups, routines, skills, and plugins |
| File handoff | Pass | A real Markdown attachment was stored, displayed in chat, copied only into Pixel's inbox, read by DeepSeek, and returned exactly one verified answer | Useful core support; Grok accepts more media sizes and richer artifact previews |
| Browser workflow | Pass | Open/type/click/read/screenshot succeeded against a real local page in Nova's persistent profile | Close for supported web actions; third-party login breadth remains untested |
| Teach a task | Pass | Visible demonstration produced a three-step editable OpenCode skill with secret rules | Close for browser demonstrations |
| Routine reliability | Pass | Manual test created an artifact, reread it, and saved completed/run-count state | Improves visibility and testability |
| Outcome completion and verification | Pass | A real model created a three-step contract, wrote an artifact, reopened it, recorded four concrete checks, and returned one expandable verified receipt | More explicit than an opaque “done”; plan and evidence persist through restarts and approvals |
| Review-first engineering | Pass in bounded local scope | A real DeepSeek V4 Flash run created a separate branch, edited one file, inspected the diff, passed an isolated test, committed only that file, reopened it, and recorded five checks; GitHub clone and approval-gated pull requests use the same narrow harness | Close to Grok Bot's engineering loop, with clearer per-project authority and conflict-safe local restore points; hosted remote computers remain a gap |
| Approval reliability | Pass | Pending approval persisted through database restart and never auto-expired | Directly addresses expiry/stale-state complaints |
| Usage control | Pass | Real run stopped before model execution after the token budget was exceeded | More explicit per-bot limits |
| Provider ownership | Pass | Provider is owner-scoped, assigned per bot, and optional key is encrypted | More local and inspectable |
| Subscription portability | Pass for available accounts | OpenCode and ChatGPT/OpenAI were detected; Claude Code was detected and offered its official login; Copilot, GitLab Duo, and SuperGrok OAuth flows are available | Broader bring-your-own-account choice without credential pooling |
| Workspace research and meeting preparation | Pass in mocked integration; owner sign-in pending | Gmail search/read, Drive search/text export, Calendar agenda, bounded payloads, per-bot access, and friendly progress are automated; the Apps & Tools panel includes live smoke checks and three useful starters | Close for core Google Workspace context; Grok also creates/organizes Drive items and changes Calendar events |
| Approval-safe email | Pass in mocked integration | Header injection is rejected, recipient count/body size are bounded, every send becomes a persistent approval, and the shared approval path performs the saved action once | Stronger explicit per-bot read/send policy; real account delivery still needs owner authorization |
| Mobile check-in | Pass | 390×844 responsive UI, installable PWA, guided private connection, dictation, approvals, and live connection state verified | OpenBot is installable web software; Grok has a native iOS app and cloud push |
| Mac file organization | Pass | One studio-wide permission, visible-home listing, bounded text reading, approval-only no-overwrite moves, and a real Desktop inspection completed | Safer and more explicit for file cleanup; Grok/Hermes remain broader for general computer control |
| Spreadsheet fidelity | Partial | Persistent workspaces prevent rebuilding from scratch, but no native spreadsheet editor is included | Grok-style spreadsheet work needs a dedicated tool |
| General macOS app control | Partial in 0.10 | The Accessibility bridge can list apps, inspect visible controls, focus apps, scroll, and approval-gate clicks/typing/keys; arbitrary pixel and canvas understanding remains unavailable | Grok/Hermes currently broader for visual computer use |
| Large plugin catalog | Partial in 0.10 | Gmail, Drive, and Calendar are bundled; GitHub code delivery works, while GitHub issues, Slack, and Notion remain honest roadmap items | Grok currently broader |
| Always-on hosted cloud computer | Not in 0.10 | Computers are persistent while the local host/Docker are available | Different privacy/availability tradeoff |

## Complaint-focused changes

- **Approvals expire or badges get stuck:** approval rows have no expiry; the UI derives its badge from pending database rows and approved/denied decisions clear it.
- **Bots forget schedules:** routines are explicit database records with next run, last run, last status, and count, plus a manual test button.
- **Duplicate sends/actions:** teammate messages and handoffs use durable dedupe keys plus three-hop/eight-run limits. Gmail approvals are marked decided before delivery and cannot be approved twice; the bot is resumed only after the saved action succeeds or fails.
- **Spreadsheet progress is lost:** persistent per-bot workspaces and sessions reduce restart loss; native workbook-aware editing remains a gap.
- **Tone drifts:** role and working style live in stable generated `AGENTS.md`; durable memories are included on every run.
- **Slow or opaque usage:** three bots can run concurrently, live partial text and tools are visible, and OpenCode token/cache/cost events are recorded per run.
- **Messages feel mechanical:** people can route tasks naturally with mentions or dictate from a phone; mascot expressions are independent rather than synchronized.
- **A connection demo is not a useful outcome:** connected users can start a morning brief, meeting preparation, or follow-up review immediately; missing permissions disable the affected starter instead of creating a doomed task.
- **Bots stop after an update instead of finishing:** substantial work has a durable outcome, deliverable, checklist, and verification state. The system marks an unverified completion as partial rather than silently presenting it as fully checked.
- **Agent code changes are hard to trust:** work happens on a separate branch, the owner can inspect a bounded diff, commits name exact files, publishing requires passed checks plus approval, and unchanged agent edits have conflict-safe restore points.

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
- [Hermes Agent — Architecture](https://hermes-agent.nousresearch.com/docs/developer-guide/architecture)
- [Hermes Agent — Agent loop](https://hermes-agent.nousresearch.com/docs/developer-guide/agent-loop)
- [Hermes Agent — Bot Mode](https://hermes-agent.nousresearch.com/docs/user-guide/bot-mode)
- [Hermes Agent — Computer use](https://hermes-agent.nousresearch.com/docs/user-guide/features/computer-use)
- [Hermes Agent — Security](https://hermes-agent.nousresearch.com/docs/user-guide/security)
- [Community review and complaints](https://www.reddit.com/r/cursor/comments/1vxjipg/grok_bot_review/)
- [Community discussion of useful workflows](https://www.reddit.com/r/cursor/comments/1vvx2fg/is_grok_bot_worth_it/)
- [Cursor forum approval-state report](https://forum.cursor.com/t/grok-bot-approval-needed-stays-on-agent-view-homepage-when-coder-has-nothing-to-approve/170127)

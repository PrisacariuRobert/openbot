# OpenBot 0.10 Milestones

All milestones below are implemented in the current repository and were verified on September 2, 2026.

## M0 — Working local teammate studio

Status: complete

- Persistent bots, conversations, group studio, files, background runs, and SQLite storage
- OpenCode connection using Muse Spark 1.2 Free
- Responsive chat UI

Verification: real Muse task created and inspected `hello.txt` in Nova's workspace.

## M1 — Ownership, security, and accountability

Status: complete

- Local user and explicitly owned provider instances
- Per-bot provider assignment
- AES-256-GCM secret vault with a private 0600 machine key
- Allowlists for model-process environment variables
- Persistent approvals with explicit approved/denied decisions and no timeout
- Per-bot weekly token budgets
- Input/output/reasoning/cache/cost accounting
- Access-token authentication when the service binds beyond loopback

Verification: vault tamper tests pass; an approval survived a full database close/reopen; a one-token budget blocked a real queued run; remote access returned 401 without a key and 200 after login with an HTTP-only SameSite Strict cookie.

## M2 — Persistent bot computers and browsers

Status: complete

- One Docker computer per bot
- One persistent Chrome profile per bot
- Terminal, navigate, snapshot, click, fill, and screenshot tools
- Private-network/metadata URL guard
- Live computer preview in the UI

Verification: the container wrote to its workspace as host UID 501 while its root remained read-only; inspection confirmed `CapDrop=ALL`, `no-new-privileges`, PID 128, memory 768 MiB, and CPU limits. The browser opened a local fixture, filled a field, clicked preview, read the changed status, and returned a screenshot.

## M3 — Fast team execution

Status: complete

- Up to three concurrent bots with one active run per bot
- Streaming partial responses and tool activity
- Stable per-bot OpenCode sessions and generated `AGENTS.md`
- Durable memory tool
- Bot-to-bot handoff with dedupe keys
- Prompt-size reduction on continued sessions

Verification: Nova and Pixel completed independent file tasks concurrently. Nova invoked the handoff tool twice with the same key; exactly one Scout run was created and Scout delivered the file. OpenCode reported 16,034 cached tokens across the parallel test and zero model cost.

## M4 — Routines, teaching, notifications, and phone access

Status: complete

- Hourly/daily persisted routines
- Manual test-now control and last status/run count
- Visible browser demonstration recorder
- Password/secret redaction and editable generated skills
- Finish/approval notifications
- PWA shell and responsive phone navigation
- Optional authenticated remote binding

Verification: a disabled daily routine was manually tested, created and reread its artifact, and recorded `completed` with run count 1. Teach mode captured navigate, input, and click steps and generated `preview-project-note/SKILL.md`.

## M5 — Professional playful product design

Status: complete

- Six code-native mascot shapes
- Real idle, working, waiting, celebration, and failure motion states
- Studio control center, usage cards, attention queue, bot computer, teach mode, and private provider UI
- Apple-like restrained surfaces, spacing, typography, blur, and motion-reduction support
- Desktop and mobile interaction paths

Verification: visual QA at 1280×800 and 390×844 passed with no browser console warnings or errors.

## M6 — Grok Bot workflow benchmark

Status: complete for the locally testable release scope

See [WORKFLOW_BENCHMARK.md](WORKFLOW_BENCHMARK.md) for the scenario matrix and remaining gaps.

## M7 — Bring-your-own subscriptions and real agent teamwork

Status: complete for locally available accounts

- Provider-aware connection catalog for OpenCode, Claude, ChatGPT/OpenAI, GitHub Copilot, GitLab Duo, and SuperGrok/xAI
- Official browser/CLI authentication paths with no password collection
- Separate encrypted API-key path with provider-specific model discovery
- Official Claude Code runtime adapter with path-checked workspace MCP tools, isolated shell/browser access, memory, approvals, and teamwork
- Durable teammate questions, findings, replies, and handoffs in a visible Team signals feed
- Dedupe keys plus a maximum of three hops and eight related runs per root task
- Provider-specific model lists and per-teammate account/model assignment

Verification: the app detected real OpenCode Go and OpenAI connections, distinguished an installed-but-signed-out Claude Code client, and rendered the provider catalog at compact and desktop sizes without overflow. Real DeepSeek V4 Flash runs made Pixel share durable findings, ask Scout a question, and receive exactly one reply with `expectsReply=false`; the final runs, activity trails, recipients, kinds, hop counts, and control-center feed were verified. Claude stream parsing, usage accounting, MCP tool exposure, provider runtime persistence, message dedupe, and task-depth calculations are covered by the automated suite. Completing a Claude subscription login still requires the account owner in Anthropic's official flow.

## M8 — Natural messaging and phone remote

Status: complete (introduced in the local-first 0.4 release)

- `@name`, multiple mentions, and `@everyone` are real server-enforced routes rather than decorative text
- Untagged studio messages choose one owner from role fit and current availability
- The composer provides mention suggestions, compact routing controls, attachments, and browser voice typing
- Up to six 25 MB files can be attached; each is copied only into the routed bots' private inbox and displayed as a message artifact
- File downloads are authenticated, forced as attachments, protected by `nosniff` and a sandbox content policy
- The installable PWA has a guided phone-remote panel, local address discovery, access-key handling, and iPhone install guidance
- Mobile layout uses dynamic viewport and safe-area sizing, avoids page-level overflow, and exposes live/reconnecting/offline state
- Mascot instances have independent blink and idle rhythms plus an actual laugh expression
- Message ordering is deterministic even when several records share the same timestamp

Verification: 21 automated tests passed. At 390×844, the document and viewport were both exactly 390 px wide, the composer ended at the 844 px safe edge, and the live reply and attachment card each appeared once. At 1440×900, sidebar, message viewport, and composer occupied non-overlapping regions without document overflow. A real `@pixel` DeepSeek V4 Flash run received one attached Markdown file, copied it into Pixel's private inbox, read the expected phrase, and created exactly one reply with zero pending approvals.

## M9 — Permissioned apps and Gmail

Status: complete for local Gmail accounts in 0.5; superseded by M10 for broader Google Workspace access

- Google OAuth uses state, PKCE S256, offline refresh tokens, and the official Google consent page
- Client secret, access token, and refresh token use the same AES-256-GCM local vault as provider secrets
- Gmail search, message reading, and plain-text sending are available to both OpenCode and Claude Code teammates
- Every teammate has separate inbox and sending switches; the server enforces them even if a model calls a hidden tool
- Outgoing email always becomes a durable approval with recipient, subject, and message preview
- The two approval endpoints share one completion path, so approving from the visible task card performs the saved action before the teammate continues
- Apps & Tools includes real service marks, guided setup, inbox preview, connection health, recent private activity, and honest availability labels
- Drive and Calendar are marked Next; Slack, Notion, and GitHub are marked Planned

Verification: the automated suite covers encrypted connector persistence, independent teammate access, audit history, RFC-style message building and header-injection rejection, Gmail payload decoding, OAuth state/PKCE/scopes, authenticated Gmail calls, Claude tool exposure, and friendly activity wording. Desktop and 390×844 UI checks confirmed the unconfigured setup and catalog render without horizontal overflow. A real inbox/send was not performed because no Google account was authorized during unattended verification.

## M10 — One connection, useful Workspace context

Status: complete for the local-first 0.6 release

- Release builds can supply a verified Google client and present one Connect Google button
- Self-hosters choose one downloaded Desktop OAuth JSON file; OpenBot imports, encrypts, and immediately opens the official sign-in
- One consent flow covers Gmail, Drive, and Calendar with OAuth state, PKCE, offline refresh, and explicit scopes
- Drive search and supported Google Docs/Sheets/text reading work in both OpenCode and Claude Code
- Calendar can return a bounded agenda with event times, location, attendee count, and links
- Every teammate has independent Inbox, Gmail send, Drive, and Calendar switches
- `@gmail`, `@drive`, and `@calendar` appear as natural composer suggestions when connected
- Morning brief, meeting preparation, and follow-up starters turn the connections into immediate workflows
- Older Gmail-only connections are detected and offered one reconnect to add new scopes

Verification: 26 automated tests pass, including Drive search/read, Calendar normalization, full Workspace scope detection, per-service access rows, Claude tool exposure, and friendly activity labels. A managed-client production smoke confirms the API reports one-click availability without exposing the secret. Real Google consent remains an owner-completed launch step.

## M11 — Natural chat and owner-approved Mac files

Status: complete for the local-first 0.7 release

- Bot replies render safe GitHub-flavored Markdown instead of showing raw asterisks, backticks, or list markers
- Long messages, links, tables, and code stay within the conversation bubble with dedicated horizontal scrolling where necessary
- Connector cards use a contained title/status row, flexible descriptions, and recognizable vector service marks
- One **Files on this Mac** switch covers every current and future teammate
- Enabled teammates can list visible home folders and read text files up to 500 KB
- Hidden paths, the macOS Library folder, symbolic links, external paths, and non-text reading remain blocked
- Mac organization moves regular files only, never overwrites, and always waits for a durable approval showing the file count and destination folders

Verification: 27 automated tests pass, including Mac path traversal, hidden-file, alias, text-limit, move, overwrite, database-permission, Claude exposure, and friendly-progress coverage. A real Muse Spark run inspected the actual Desktop and naturally confirmed the `Organized` folder without claiming workspace isolation. Desktop cleanup moved 30 loose files into five reversible folders without deleting anything.

## M12 — Completion engine and verifiable productivity

Status: complete for the local-first 0.8 release

- Substantial requests become durable job contracts with an outcome, reviewable deliverable, required apps, approval boundary, and three-to-eight meaningful steps
- OpenCode and Claude Code teammates can set the plan, advance individual steps, and record concrete pass/fail checks
- Live job cards show meaningful checklist progress without streaming the model's internal chatter
- Finished messages include a compact verification receipt; users can expand it to see completed work and supporting checks
- Plans, progress, and verification survive restarts, wait safely through approvals, and resume without losing completed steps
- Greetings and quick conversation stay lightweight until the model identifies a real multi-step job
- Morning brief, meeting preparation, and follow-up starters now require sourced, checked deliverables rather than generic summaries

Verification: 44 automated tests pass, including database restart persistence, plan advancement, casual-chat behavior, approval resume state, failed-check downgrading, and friendly tool labels. In a real model run, Nova created `completion-engine-check.md`, updated a three-step plan, reopened the file, verified the requested title and headings with four checks, and produced one “Finished and checked” receipt. Desktop and 390×844 phone checks confirmed the live card and completed receipt stay inside the conversation, and the connections panel no longer exposes raw Google API errors.

## M13 — Permissioned coding harness

Status: complete for the local-first 0.9 release

- Existing folders can be connected from one-click local suggestions or a manual absolute path
- Every teammate/project pair has a durable **Code + test**, **Read only**, or **No access** grant
- OpenCode and Claude Code teammates receive the same project list, source search, bounded reading, atomic writing, exact replacement, Git status, and check-running tools
- All file inputs are project-relative; traversal, hidden paths, project-root aliases, nested symbolic links, binary files, and files above 1 MB are blocked
- Builds and tests run in disposable Docker containers with no network, an unprivileged user, a read-only system, dropped capabilities, resource limits, and masks over protected hidden source paths
- Risky deletion, publishing, and Git rewrite commands go through the durable approval path
- Every agent file creation/update produces a local activity record; disconnecting a project deletes only the access record and never the project files
- Project grants are part of the model-session capability fingerprint, so revoking access prevents a stale session from retaining the old permission context
- The responsive Code projects panel includes real vector icons, contained paths, per-agent selectors, recent edits, explicit safety language, and a clear empty state

Verification: 47 automated tests pass, including independent read/write/run grants, traversal and hidden-file denial, alias escape denial, exact edits, edit history, disconnect-without-delete, protected command masks, Claude tool parity, and risky Git-command interception. In a disposable real OpenCode run, Nova discovered the granted project, read its `AGENTS.md`, changed `src/greeting.js`, ran `npm test` in the isolated project container with one passing test, reopened the file, reviewed project status, and recorded four passing verification checks plus one local edit event. The temporary grant and project were removed afterward. Type checking, the production build, and desktop/phone UI acceptance all pass.

## M14 — Review-first GitHub delivery

Status: complete for the local-first 0.10 release

- A GitHub link or `owner/project` can be cloned without shell interpolation into `Documents/OpenBot Projects`
- Clone links reject embedded credentials, query strings, fragments, non-GitHub hosts, and extra URL paths
- Coding teammates can create a valid separate branch only from a clean working tree
- Bounded review returns the current branch, visible changed files, staged changes, and tracked working diff without exposing protected hidden paths
- Commits are prohibited on `main`, `master`, or the detected default branch and contain only explicitly named paths
- Pull-request publishing requires a clean committed branch, a recognized GitHub origin, recorded passing task checks, an authenticated official GitHub CLI, and a durable owner approval
- Every agent write stores a restore point; restoring verifies the exact post-edit hash first and leaves newer work untouched on mismatch
- The Code projects sheet now includes GitHub cloning, real service marks, source links, review state, expandable diffs, and reversible edit actions at desktop and phone widths

Verification: 50 automated tests pass. The Git integration test initializes a real repository, rejects a default-branch commit, creates `openbot/fix-answer`, shows the changed line in review, commits only `app.ts`, and leaves unrelated `notes.md` work uncommitted. Restore coverage proves newer user content is refused, an unchanged update returns to its prior content, and an unchanged newly created file can be removed. In a disposable real DeepSeek V4 Flash run, Nova created `openbot/agent-harness-qa`, changed only `value.js`, reviewed the 41→42 diff, passed the isolated Node test, committed only that file as `6314a7a`, reopened it, and recorded five passing checks. Type checking, the production build, and desktop/phone review UI pass.

## M15 — Parallel coding workspaces and independent review

Status: complete on the 0.11 development branch

- Every coding run creates a dedicated Git worktree and task branch under OpenBot's private data directory
- The original project checkout remains on its current branch and is never dirtied by agent edits
- File reads, searches, atomic edits, diffs, checks, commits, restores, and approved publishing stay pinned to the same run workspace
- Multiple teammates can work on the same repository concurrently without switching each other's branch or sharing uncommitted state
- Committed task changes remain visible in the review panel relative to the configured default branch
- A coding teammate can request an independent review from another teammate with project read access
- Review input is pinned to the exact tested commit; the reviewer records an approved or changes-requested verdict and focused findings
- Publishing is blocked unless the latest independent review approved the current unchanged commit
- The Code projects panel shows active task branches, assigned mascots, review status, and whether a task was published

Verification: 51 automated tests pass. The worktree integration test starts two concurrent runs from one repository, creates two independent branches and roots, writes different content to the same file, proves both are isolated from each other and from `main`, commits one task without moving the source checkout, renders its committed diff, records a second-teammate approval tied to the exact commit, and restores a file inside the other task's workspace. Type checking and the production build pass.

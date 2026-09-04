# OpenBot Milestones

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

## M16 — Natural steering and release confidence

Status: complete on the 0.11 development branch

- A follow-up message to a teammate who is actively working stops the old model process and starts a continuation with both the original request and the user's newest direction
- The composer says in plain language when the next message will update work in progress and names the affected teammate
- Cancelled runs are marked immediately, and internal tool requests are rejected after a run stops or when a run/bot identity does not match
- Active coding jobs are not automatically redirected, because moving away from their run-scoped worktree could hide unfinished code; the follow-up queues safely instead
- GitHub Actions use the current Node 24 action runtimes, removing the Node 20 deprecation warning
- Release verification fails when `package.json`, `package-lock.json`, the README title, and its matching “What's new” section disagree

Verification: 52 automated tests pass, including persistence of the steering relationship. Release-document checks, type checking, and the production build pass.

## M17 — Chat-native skills, trusted routines, and GitHub productivity

Status: complete on the 0.12 development branch

- Typing `/` in the composer opens a searchable picker of learned skills available to the current conversation
- Choosing a skill inserts its stable command, selects the owning teammate, and routes the request to that teammate without affecting ordinary path text
- Learned browser workflows generate compatible skill folders for both OpenCode and Claude Code and can be used, renamed, revised, or deleted from the Teach panel
- Routine operations now include full editing, pause/resume, deletion, saved run history, result links, manual retry, and preserved history after schedule deletion
- The official GitHub CLI provides a one-click account connection, live notifications, issue search, and approval-gated issue creation without placing access tokens in OpenBot or model context
- Every teammate receives separate GitHub **Read activity** and **Create issues** permissions; every issue write is previewed, approved, performed once, and added to the private connector activity trail
- GitHub, routines, skills, and provider panels remain contained and usable at desktop and 390×844 phone widths
- Release documentation names the exact 0.12.0 package version and separates shipped GitHub capabilities from event triggers, Slack, Notion, and other roadmap work

Verification: 57 automated tests pass, including skill parsing, unique skill persistence, routine history and deletion safety, GitHub response normalization, connector URL handling, and safe read-only release phrasing. Type checking and the production build pass. A real DeepSeek V4 Flash teammate read the newest GitHub notification through the permissioned tool and returned its title and repository without write access. Live notification previews, issue search, slash selection, routine operations, skill management, and desktop/phone layouts were inspected against the running app; the temporary model, permission, run, and messages were removed afterward.

## M18 — One-voice teammate consultation

Status: complete on the 0.13 development branch

- The bot that receives the user's request remains the coordinator when it asks another teammate for an opinion, handoff, or independent code review
- Consultant work and results stay private to the team instead of creating a second bot bubble in the main conversation
- A coordinator pauses in a durable **consulting the team** state and resumes only after every direct child consultation has completed, failed, or been cancelled
- The resumed coordinator sees the latest private findings, resolves differences, and gives the user one combined answer in its own voice
- Nested consultations converge recursively without bypassing the existing three-hop/eight-related-run limits
- Internal consultant completions do not produce duplicate desktop notifications or clutter the active-run list; the Control center still exposes the bounded Team signals trail
- Failed consultant work returns a private failure finding so the coordinator can answer honestly instead of waiting forever
- Token, cache, reasoning, and cost usage accumulates across approval and consultation continuation turns
- New user direction can stop a coordinator while it is waiting on the team
- Release documentation names the exact 0.13.0 package version and records the next five product releases with honest acceptance boundaries

Verification: 58 automated tests pass, including persisted consultation state, child readiness, coordinator resumption, active-run steering, and the coordinator-only publish rule. Type checking and the production build pass. The exact Pixel-to-Nova consultation flow and desktop/phone UI are verified against the running application before release.

## M19 — Rich inputs and reviewable artifacts

Status: complete for the local-first 0.14 release

- A single bounded ingestion layer identifies the actual file type and prepares private context for PDF, DOCX, XLSX/XLSM, CSV/TSV, PPTX, text, JSON, YAML, notebooks, email, common source, images, audio, and video
- PDF pages, Word text, workbook sheets/rows, presentation slides, and plain text are extracted locally with explicit page, row, archive-expansion, and character limits
- Images, PDFs, audio, and video are attached to compatible OpenCode models as original media; useful dimensions, duration, codec, sheet, page, and slide metadata remains available independently
- Extracted file content is clearly delimited as untrusted data so a document cannot silently rewrite the user's or system's instructions
- Contained cards use real file-kind icons, safe image/PDF previews, expandable text previews, friendly status language, and distinct preview/download actions
- Files linked by a teammate from its private workspace are copied into OpenBot's attachment store and shown as result cards in the same answer
- Re-linking the same workspace file creates a numbered revision that points back to the previous result while preserving both copies
- Preview responses use an allowlist, inline disposition, MIME sniffing protection, a private cache policy, and a sandbox content policy; ordinary downloads remain forced
- Uploaded originals still enter only the selected teammates' private inboxes, with six-file and 25 MB-per-file limits

Verification: 61 automated tests pass, including real PDF text extraction plus Word, spreadsheet, slide, image, and audio fixtures; database persistence; type detection; prompt-injection boundaries; media forwarding; workspace escape denial; artifact capture; and revision history. The production dependency audit reports zero vulnerabilities. A real DeepSeek V4 Flash Vision run interpreted the supplied screenshot through OpenBot, and a real DeepSeek V4 Flash workflow created, surfaced, updated, and re-surfaced the same Markdown artifact as versions 1 and 2. Desktop and 390×844 checks confirmed the new card is contained, survives refresh, opens its preview, and introduces no horizontal overflow.

## M20 — Dependable automations and event triggers

Status: complete for the local-first 0.15 release

- Automations start from a local schedule, a matching upcoming primary-Calendar event, a signed GitHub webhook, or a signed generic webhook
- GitHub filters can restrict event, action, and repository; Calendar filters can restrict title and minutes before; generic hooks can require one event name
- Every delivery receives a durable event receipt linked to its run, outcome, attempt, summary, and retained bounded payload
- Repeated delivery IDs are stopped before run creation for seven days, counted on the original receipt, and returned as successful duplicates to make sender retries safe
- Per-automation burst limits, explicit origin-loop headers, narrow filters, and bounded redacted payloads reduce accidental storms and hostile input
- HMAC-SHA256 secrets are encrypted at rest, shown only when created or rotated, and verified using timing-safe comparison
- Incoming event content is recursively secret-redacted, size/depth bounded, and clearly delimited as untrusted before it reaches a model
- Test runs require an explicit warning, approval waits enter the attention inbox, supported failed events can be replayed, and three consecutive failures pause the automation automatically
- Schedule/Calendar missed-work and failure alerts use friendly repair guidance; browser notifications can surface new attention items when the app is hidden
- The redesigned Automations screen keeps triggers, health, secret setup, receipts, replay, and repair actions contained at desktop and 390×844 phone widths

Verification: 66 automated tests pass, including signature validation, filters, summaries, secret redaction, prompt boundaries, encrypted hook secrets, event persistence, duplicate delivery, linked run lifecycle, alerts, per-automation rate limits, and automatic pause after three failures. A real signed delivery created one durable event and one linked run, Muse Spark 1.2 Free completed it and produced `build-event-confirmation.md`, and replaying the same delivery ID returned the existing event without a second run. Type checking and the production build pass. Desktop and 390×844 browser QA confirmed contained layout, correct trigger-specific fields, no console errors, and no horizontal overflow. Availability remains honest: local schedules and Calendar polling stop when OpenBot or the Mac sleeps, and an internet sender needs an owner-managed HTTPS tunnel or reverse proxy.

## M21 — Permissioned Slack and Notion connectors

Status: complete for the local-first 0.16 release

- Every connector publishes a versioned capability manifest with an explicit data boundary, read/write operations, approval rule, setup documentation, and managed or self-hosted availability
- Slack OAuth keeps member search/read authority separate from bot posting authority; teammates receive independent **Read Slack** and **Post to Slack** grants
- Slack search and conversation reads are bounded, and every channel message or thread reply waits for an exact destination-and-content approval
- Notion OAuth preserves its page-picker boundary; teammates receive independent **Read Notion** and **Add to Notion** grants for selected or shared pages
- Notion search and page reading are bounded and paginated, while appended headings and paragraphs wait for an exact approval and safely split long text
- OAuth credentials remain encrypted, connection health is visible, stale teammate sessions are invalidated on revocation, and repeated callbacks cannot erase a healthy grant
- Apps & Tools supports managed one-click connection and a contained self-host setup path with recognizable service marks, natural copy, connected previews, mentions, and useful workflow starters
- Markdown rendering is lazy-loaded so rich conversation formatting no longer inflates the initial application bundle

Verification: 74 automated tests pass, including official Slack and Notion response shapes, OAuth replay recovery, encryption, session revocation, per-teammate read/write separation, message/page boundaries, approval previews, rate-limit recovery, OpenCode tools, and Claude Code bridge exposure. Type checking and the production build pass. The Apps & Tools experience is visually verified at desktop and 390×844 with no page-level overflow or console errors. Live third-party account consent remains owner setup rather than a release-test claim.

## M22 — Native iPhone companion

Status: complete for the local-first 0.17.2 native beta

- A real SwiftUI iPhone app connects to the owner-hosted OpenBot studio with native conversations, message bubbles, teammate selection, sending, live work, approvals, cancellation, and settings
- Native onboarding explains the Mac-hosted boundary, uses independently blinking playful mascots, and handles offline, reconnect, live server events, and connection settings
- The access key is stored with device-only-when-unlocked Keychain protection and used only as an authenticated API header
- Public plain-HTTP hosts and URL credentials are rejected; certificate validation is never bypassed
- Mac-generated `openbot://connect` links prefill only the normalized studio origin and never contain the access key
- The iPhone app no longer embeds the responsive website or depends on service-worker state; the installable PWA remains a separate fallback
- A premium three-teammate mascot set is shared by the native and web experiences, with independent status movement and blink timing
- Native attachment selection uploads bounded files to the Mac before sending the message
- Phone Remote detects a Tailscale address, prioritizes it for pairing, and can open Tailscale on the Mac for use across cellular or different Wi-Fi networks
- Web and native use the same studio naming, presence language, conversation hierarchy, composer proportions, and exact mascot artwork
- Unfinished text moves between Mac and iPhone through an authenticated durable draft, updates live, and identifies the originating device without echoing unchanged text back

Verification: 78 automated web/server tests pass, including two-way durable draft handoff. The Xcode project is deterministically generated with XcodeGen and compiled using Xcode Beta. Four native unit tests pass on an iPhone 17 Pro simulator. A live UI test enters the address and private key, signs in to the running Mac studio, and verifies the native conversation header and composer. The live Tailscale address returns 401 without the private key and 200 with it. Phone-sized web QA confirms the matching room header, hero, messages, and composer. Release checks reject a return to `WKWebView`, embedded access keys, missing privacy declarations, or missing native API/event coverage. Physical-device/App Store distribution, unsent attachment handoff, rich native artifact previews, push, share-sheet input, dedicated voice capture, and an always-on host are not claimed.

## M23 — One studio design across web and iPhone

Status: complete for the local-first 0.17.3 native beta

- Web and SwiftUI share the same paper, ink, bot bubble, message gradient, presence, and accent colors
- The room header matches at 402 points: menu, 78-point teammate group, title, live dot and subtitle, flexible space, and settings action
- Message typography, bubble radii, horizontal insets, sender spacing, and avatar sizes use the same values on phone-sized web and native screens
- Routing and composer controls share the same capsule, 56-point input surface, attachment/mention/skill/voice order, icon colors, and circular send action
- The studio trio is composed from the exact same three production image files rather than a static web/native group approximation
- Every mascot floats and blinks on its own offset timing, changes its presence color with work state, and briefly celebrates successful work with happy eyes and sparkles
- Web media queries and native Accessibility settings both honor reduced motion without removing readable status cues

Verification: type checking and production builds pass for the shared web client, and the native SwiftUI target compiles with Xcode Beta. Browser QA at 402×874 verifies the aligned header, studio hero, messages, routing pill, and composer without horizontal overflow; two captured frames differ while the conversation is otherwise idle, confirming live mascot motion. Native simulator QA uses the same 402-point viewport and production assets. The full 78-test product suite plus native unit and live UI tests remain the final release gate.

## Milestone 18 — Customizable code-drawn mascots

Status: complete for the local-first 0.17.4 native beta

- Live mascots are built from HTML/CSS layers and SwiftUI shapes instead of fixed character images
- Six shapes, six color presets, and a full custom color picker are available for new and existing teammates
- Shape and color updates persist in the local database and automatically flow into every chat surface and the iPhone client
- Each teammate keeps independent blink and float timing plus working, waiting, celebration, failure, and offline state cues
- Web reduced-motion CSS and native Reduce Motion behavior remain supported

Verification: the live browser reports zero image elements inside mascots, separately captured frames differ during idle motion, the appearance preview updates before saving, the database test covers shape and color persistence, and the native SwiftUI target compiles and renders the same three-character studio on the iPhone simulator.

## M24 — Find, organize, and supervise

Status: complete for the local-first 0.18.0 beta

- Live Studio shows every teammate's active or recent job, real checklist progress, persistent failure/approval attention, browser preview, stop control, and direct conversation link
- The owner can enter a teammate's browser, click its visible screenshot, type through a private non-chat keyboard, send common keys, and return to the full studio
- Password-, token-, secret-, and one-time-code-like inputs are masked before browser snapshots are exposed to a model
- Local studio search covers messages, result attachments, automations, learned skills, and teammates, and opens the durable source conversation
- Messages support durable reply references and lightweight reactions
- Direct conversations support custom sidebar sections, pinning, reversible hide/restore, and setup-only teammate duplication
- Duplicated teammates inherit role, working style, model, budget, appearance, capability switches, connector permissions, and code-project grants without inheriting history, memory, credentials, browser state, or workspaces
- The new surfaces reuse the same code-drawn, independently animated character system on desktop and phone
- The native iPhone client adds a matching Live Studio overview for every teammate, attention item, and recent job

Verification: 79 automated tests pass, including durable organization, search, reply, reaction, global run visibility, duplication boundaries, and restore behavior. Type checking and the production build pass. Live browser QA verified the complete Live Studio, search results, and private takeover controls at 402×874 with no page-level horizontal overflow; a second responsive width also remained contained. The native Xcode build and release checks remain part of the final gate. Always-on hosting, push delivery, arbitrary-pixel macOS takeover, private skill export/import, and a broad connector marketplace are not claimed.

## M25 — Portable Skill Library

Status: complete for the local-first 0.19.0 beta

- Every learned browser skill has a visible owner, purpose, instructions, starting page, source, and current version
- Every edit creates an immutable version snapshot; restoring an older snapshot creates another version instead of deleting newer history
- Exported `.openbot-skill.json` packages contain the reusable definition without teammate IDs, conversation history, memory, credentials, browser profiles, or workspace files
- SHA-256 integrity verification rejects packages changed after export
- Import applies strict field, length, step-count, action-type, and web-address limits before any teammate files are written
- Private keys, common provider credentials, bearer tokens, credential-like values, URL credentials, and sensitive query parameters are rejected; explicit placeholders such as `{{secret}}` remain allowed
- Any skill can be assigned to another teammate as a new independently owned copy
- Three readable starter skills cover website QA, current research, and approval-safe browser administration
- The desktop library supports teammate switching, teaching, starter installation, import, edit, history, rollback, export, launch, and deletion without losing the animated character system
- The native iPhone skill picker continues to launch the same saved commands and now shows their version

Verification: 83 automated tests pass, including export/import round trips, integrity tampering, embedded secrets, placeholders, bounded templates, real OpenCode and Claude skill-file generation, assignment, immutable version history, and non-destructive rollback. Type checking and the production build pass. Browser QA verifies the live library at desktop and 402×874 phone widths with zero page-level horizontal overflow and no console errors. This milestone does not claim a public executable plugin marketplace or safe third-party code installation.

## M26 — Dependable background runner and remote notifications

Status: complete for the local-first 0.20.0 beta

- One renewable SQLite lease elects a single active studio runner across overlapping OpenBot processes
- Every job is atomically claimed with its own short lease and durable attempt count, preventing two workers from taking the same queued task
- Expired running jobs return to the queue after a crash with their original task contract, approvals, conversation, and recovery timestamp intact
- Graceful shutdown returns active work to the queue before ending child model processes
- An optional macOS LaunchAgent starts at login, restarts after unexpected exits, keeps private logs, and waits for a foreground OpenBot session before taking over
- Runner health exposes online/background mode, heartbeat, queue, working, waiting, recovery, and next-schedule state without exposing machine credentials
- A durable notification outbox feeds standards-based Web Push for results, approvals, failures, missed schedules, and rate limiting
- VAPID keys stay in a local mode-0600 file; device subscriptions remain out of public app state, stale endpoints are removed, and payloads are bounded
- Notification clicks deep-link to the relevant conversation or Automations screen
- Web, phone-sized web, and native SwiftUI share the same awake/protected/recovered language and authenticated **Check now** control

Verification: 86 automated tests pass, including competing-runner exclusion, atomic claims, lease expiry, safe recovery, graceful requeue primitives, LaunchAgent shell-avoidance, durable outbox state, and subscription privacy. Type checking, production build, responsive browser QA, real macOS service handoff, and native simulator tests form the final gate. The guarantee is explicit: OpenBot survives process exits and resumes after wake, but a powered-off or sleeping Mac does not execute work.

## M27 — Task, cloud-file, and native artifact delivery

Status: complete for the local-first 0.21.0 beta

- Todoist uses official dynamic client registration for one-click local OAuth, encrypted tokens, active-task reading, and approval-gated task creation
- Dropbox uses official offline OAuth, encrypted refresh credentials, read-only metadata/search scopes, and bounded supported text/code reading
- Both connectors share the versioned manifest, per-teammate permission, health, audit, friendly recovery, OpenCode, and Claude Code contracts
- Calendar + Todoist planning and Dropbox project-context starters turn the new sources into practical multi-app workflows
- The native SwiftUI app downloads artifacts with the private bearer credential, opens them in Quick Look, shows bounded summaries, and shares messages or downloaded files through native controls
- Todoist and Dropbox use recognizable code-drawn service marks without adding static mascot artwork or weakening customizable character motion

Verification: 88 automated tests pass, including live-shaped Todoist registration/token/task responses, Dropbox offline OAuth/search/download responses, rejection of unsupported Dropbox files, connector manifests, encrypted storage, and existing security boundaries. Type checking and the production build pass, and Xcode Beta compiles the native target for an iPhone 17 Pro simulator. Live third-party consent remains owner setup; native APNs, share-sheet ingestion from other apps, Slack/Notion event sources, and execution while the Mac is asleep remain explicit future work.

## M28 — Proactive connector work and native handoff

Status: complete in source for the local-first 0.22.0 beta

- Todoist added, updated, and completed activity can start a selected teammate routine with an explicit activity filter
- Dropbox delta polling can start work for changed or deleted items below one selected folder
- Fresh enable-time baselines prevent historic connector data from unexpectedly starting jobs
- Durable Dropbox cursors and Todoist timestamps survive restarts; existing receipts, dedupe, rate limits, approvals, alerts, and failure auto-pause remain in force
- Dropbox OAuth now uses PKCE and supports a managed public client using only the release app key, while confidential and self-hosted clients remain compatible
- The iPhone app registers authenticated sandbox/production APNs device tokens and opens notification deep links to the relevant conversation or approval
- Notification delivery is recorded per web/native target, so retrying one device does not duplicate a delivery that already succeeded elsewhere
- The embedded OpenBot Share extension accepts bounded text, links, images, and files, stores them atomically in the private App Group inbox, and removes them only after the main app sends them
- Debug and Release configurations select the correct APNs environment; the extension ships its own privacy manifest

Verification: 94 automated tests cover connector activity/delta contracts, duplicate-safe Todoist windows, public-client PKCE, durable cursor baselines, APNs JWT/payload/error handling, native token storage, and per-target delivery. Type checking and the production web build pass. XcodeGen regenerates the checked-in project and Xcode Beta compiles the native app with the OpenBot Share extension embedded for the iPhone 17 Pro simulator. Production APNs delivery and App Store distribution remain owner steps because they require a registered Apple App Group, Push capability, signing profile, physical device, and private `.p8` key.

## M29 — Native voice and recovery polish

Status: complete in source for the local-first 0.23.0 beta

- The native iPhone composer now has an explicit start/stop microphone session with live editable transcription and a visible listening state
- Transcribed text is never sent automatically; the owner can edit it, add files or a teammate, and choose Send normally
- OpenBot does not retain microphone audio, prefers Apple's on-device recognition when available, and shows calm recovery guidance when Speech or Microphone permission is unavailable
- The web startup experience now retries automatically, explains an unreachable Mac without technical noise, and links a stale local development page back to the running background studio
- Invalid conversation deep links fall back to the shared studio instead of leaving a permanent loading screen
- Apps & Tools keeps self-hosted OAuth credentials behind deliberate disclosures and raises essential connector typography while preserving real service marks and animated code-drawn mascots

Verification: the 94-test web/server suite, TypeScript check, production build, and release checks pass. XcodeGen regenerates the project, Xcode Beta compiles the native app and embedded Share extension for an iPhone 17 Pro simulator, and the native UI contract includes the new voice action. Browser QA at 390×844 confirms a full-width sheet, zero document overflow, seven contained connector cards, three collapsed developer setup disclosures, and readable connection copy. Physical speech recognition, APNs delivery, and TestFlight remain owner-signed device checks.

## M30 — Private always-on runner

Status: complete in source for the owner-operated 0.24.0 release

- Local Mac hosting remains the default; private hosting is an explicit owner choice and never silently uploads a studio
- A reviewed Docker Compose bundle packages OpenBot, OpenCode, Chromium, Git, the Docker client, and Caddy for a dedicated Linux host
- Caddy is the only public entry point and provides HTTPS, HSTS, compression, anti-framing, and MIME protections; the plain OpenBot port remains internal
- Private mode refuses to start without a canonical HTTPS domain and an absolute durable data directory, then uses that origin for every OAuth callback and signed webhook
- Studio data, the vault key, provider login state, browser profiles, and server-side projects persist across image or host restarts
- Existing runner leadership, job claims, lease recovery, approvals, budgets, event dedupe, and one-voice teamwork work unchanged on the always-on host
- Login attempts are throttled, cookies become Secure through one trusted proxy, and a public health endpoint reveals readiness without credentials, data, or URLs
- Web and native iPhone surfaces use the same **Private always-on home** language and show the data-location/readiness boundary
- Setup, model sign-in, project paths, migration, updates, and consistent owner-only backup procedures are documented beside the deployment

Verification: 101 automated tests cover private-mode validation, canonical callback URLs, readiness, and login throttling alongside all earlier product contracts. TypeScript, production web build, release checks, iOS source checks, shell syntax, Compose structure, and a Linux container build/boot smoke test pass. Public DNS/TLS issuance, a real VPS restart, live provider/OAuth consent, and physical iPhone distribution remain owner-environment checks.

## M31 — Private-home setup and care

Status: complete in source for the owner-operated 0.25.0 release

- Local onboarding accepts one private domain, validates it, and produces one copyable setup command without implying that studio data moves automatically
- The authenticated Home check reports actual free storage, backup freshness, OpenCode, Chromium, Docker access, version, uptime, public address, and private data location
- Fixed diagnostics commands use short timeouts, bounded output, and a minimal environment; failures become specific non-technical recovery items
- Successful host backups are stored outside the source checkout with owner-only permissions and leave an atomic bounded receipt for the running studio
- Native iPhone Live Studio displays the same Home check summary and real attention list as the web app
- Sidebar, conversation, Live Studio, and Automations location language stays consistent between Mac and private-host modes

Verification: 103 automated tests cover healthy and degraded Home checks alongside every earlier product contract. TypeScript, production build, release checks, iOS simulator checks, shell syntax, live local/private server behavior, desktop/phone browser QA, and a Linux private-runner build/boot/Home-check smoke test form the release gate.

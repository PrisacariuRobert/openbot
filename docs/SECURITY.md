# Security Model

OpenBot is local-first software that runs models and automation tools. It reduces risk through layered boundaries; it does not claim that model-driven automation can be made risk-free.

## Boundaries

1. **Network boundary** — loopback-only by default. Non-loopback clients require the private access key. Public-internet exposure is unsupported without HTTPS or an encrypted tunnel.
2. **Owner boundary** — provider instances have an owner and bots reference a specific provider instance.
3. **Secret boundary** — API keys are AES-256-GCM ciphertext in SQLite. The key is a random 32-byte local file with mode 0600.
4. **Process boundary** — model CLIs receive a small environment allowlist plus only the assigned provider variable and short-lived internal tool credentials.
5. **File boundary** — each bot has a dedicated workspace. OpenCode external-directory access is denied. Claude host file/Bash tools are disabled and replaced with path-checked tools. The optional Mac-file broker is a separate owner-controlled path limited to visible home-folder entries; it blocks hidden paths, `Library`, symbolic links, paths outside the home folder, oversized/non-text reads, deletion, and overwriting.
6. **Command boundary** — bot shell commands run in a constrained container. There is no host fallback.
7. **Browser boundary** — each bot has a different Chrome profile. URL validation blocks unsafe schemes, credential-bearing URLs, cloud metadata, and private LAN targets except localhost test pages.
8. **Authority boundary** — destructive, publishing, external communication, purchasing, credential, upload, and system actions create a durable approval and interrupt the run.
9. **Resource boundary** — the scheduler limits concurrency; bot containers have PID, memory, CPU, privilege, and filesystem limits; bots have configurable weekly token limits; teammate conversations stop after three hops or eight related runs.
10. **Attachment boundary** — uploads use server-generated paths, sanitized names, actual type detection, a six-file/25 MB message limit, authenticated downloads, and routed copies only in selected bots' inboxes. Extracted text is size-bounded and delimited as untrusted model input. PDF pages, workbook rows, presentation slides, Office archive entries, entry expansion, media inspection time, and preview length have separate caps. Only allowlisted images and PDFs receive inline previews with `nosniff`, private caching, and a sandbox content policy; every ordinary download is still forced. Teammate result capture resolves real paths, refuses workspace escapes and inbox copies, caps count/size, and preserves earlier revisions.
11. **Audit boundary** — messages, attachments, runs, task contracts, verification checks, tool activities, usage, approvals, teammate signals, handoffs, automation events/alerts/outcomes, and taught workflows persist in SQLite.
12. **Authentication boundary** — subscription logins are completed in the provider's official browser/CLI flow. The temporary OpenCode OAuth bridge binds to a random loopback port and is protected with a random Basic-auth password. Remote access-key comparisons are constant-time.
13. **Connector boundary** — Google sign-in uses state plus PKCE S256 and the official OAuth page. Slack and Notion use official OAuth authorization-code flows with random expiring state; Notion refresh tokens and Slack token rotation are supported when returned. Client secrets and OAuth tokens are encrypted locally and never placed in model prompts. GitHub uses the official CLI's own credential store and exposes only account health and bounded results to OpenBot. Each connector also publishes a versioned capability and data-boundary manifest.
14. **Communication boundary** — Gmail, Slack, Notion, and GitHub reads require explicit per-teammate read access. Slack searching uses the connected member's visibility while posting uses the installed app bot. Notion is limited to pages selected or shared with the integration. Every email, Slack post, Notion append, and GitHub issue creation is stored as a durable approval with an exact useful preview before one-time execution. Read and write authority are stored separately for every bot. Revocation changes the bot session fingerprint immediately. Models cannot call provider APIs directly or receive connector tokens.
15. **Code-project boundary** — a user must connect one specific real folder and grant each teammate read, write, and run capabilities. Project tools require relative paths and block traversal, hidden files, symbolic links, binary content, and oversized files. Every coding run receives a private Git worktree, keeping concurrent tasks isolated from one another and from the user's main checkout. Project checks run against that worktree in disposable no-network containers with protected hidden paths masked. Dedicated Git tools show only bounded visible diffs and commit only named paths. Pull requests require recorded passing checks, an approval from a different teammate tied to the unchanged commit, and a durable owner approval before `git push` or `gh pr create`; Git hooks and interactive prompting are disabled. Revoking a grant changes the model-session capability fingerprint immediately.
16. **Conflict-safe edit recovery** — every agent write stores the prior text and a hash of the exact resulting file. Restore proceeds only when the current file still matches that hash, preventing a stale restore from overwriting newer user or agent work.
17. **Automation-event boundary** — generic and GitHub hooks require HMAC-SHA256 signatures verified with timing-safe comparison. Hook secrets are encrypted locally and returned only when created or rotated. Source delivery IDs are deduplicated before a run exists, per-automation burst limits reject storms, and an explicit origin header blocks direct self-loops. Retained payloads are recursively secret-redacted and bounded by depth, collection size, string size, and total storage size. Event content is delimited as untrusted model input. Calendar events use the selected bot's read permission and local polling; automation events never bypass the ordinary tool permissions or durable approval path.

## Approval semantics

Approvals do not expire. Denying cancels the associated run. Approving an intercepted terminal/browser action performs exactly the saved action once, records the result, and continues the existing bot session with that result. Prompt-level approvals queue the original request.

Gmail follows the same path. OpenBot marks the approval decided before calling Gmail, temporarily keeps the run out of the queue, records success or failure, and then resumes the bot with the result. This prioritizes avoiding duplicate sends if the service is interrupted after Gmail accepts a message.

GitHub issue creation also follows the durable approval path. The repository, title, and body preview are stored with the proposed action; creation is unavailable unless the teammate has the separate write grant and occurs only after approval.

Slack posts and Notion appends use the same durable path. OpenBot stores the complete bounded destination and content preview, decides the approval before the provider call, executes it once with the connector's protected token, records the outcome, and resumes the same teammate session. Search/read permission never implies write permission.

Mac organization also follows the durable approval path. The proposal stores exact source/destination pairs, validates every path again after approval, creates destination folders, and moves regular files only. Existing targets fail the whole preflight instead of being overwritten.

Automations use the same durable approval path as direct chat. An incoming event can start a run, but it cannot approve a sensitive tool action. An event waiting for approval is marked visibly and produces an attention item. Three consecutive failed runs pause the automation; manual tests require an explicit confirmation because they use the same real tools and approvals. Replaying an eligible event creates a new attempt while preserving the earlier receipt.

## Teach mode

Teach mode opens a visible, bot-specific Chrome profile and records navigation, click, changed-field, and submit events. Password inputs are always replaced with `{{secret}}`. Labels suggesting tokens, passwords, keys, or secrets also trigger redaction. The output is readable Markdown, not an opaque macro.

## Known limitations

- Prompt and command risk detection is defense in depth, not a formal proof of intent.
- Browser selector text cannot always reveal that a click has a side effect. Users should keep external accounts scoped and review approval cards.
- A compromised model process can modify files inside its own workspace.
- A teammate with **Code + test** access can modify non-hidden text files inside that connected project. Atomic writes and an edit trail reduce accidental damage, but users should keep projects under version control and review the working tree before publishing.
- Project checks use the configured Docker image and have no network. A project that needs to download dependencies must install them separately before the check, use vendored dependencies, or opt into a future reviewed dependency-fetch workflow.
- Chrome itself is outside the Docker container; isolation is by browser profile and service API.
- macOS app control is limited to the Accessibility tree: visible app/control inspection is bounded, and clicks, typing, and key presses require per-action approval. It does not provide unrestricted pixel-level vision or bypass macOS permissions.
- Browser voice typing is not a local speech model. OpenBot stores only resulting text, but the browser or operating-system vendor may process the microphone audio.
- Claude Code subscription and usage-credit metering is controlled by Anthropic and may change independently of OpenBot.
- Gmail read and Drive read scopes are classified by Google as restricted. Personal test-user setup can run locally, but public distribution requires OAuth verification and may require an independent security assessment.
- OAuth access is broad at the connected Google account level. Per-bot switches are OpenBot policy controls, not separate Google grants; anyone with full access to the local OpenBot data and vault key can act as the owner.
- Gmail sending currently supports plain-text messages and up to ten recipients. Attachments, drafts, and labels are not included.
- Drive reading is intentionally bounded to supported text and Google-native exports. A user can attach binary Office files and PDFs directly for bounded extraction, but Google Drive does not yet download arbitrary binary files into the attachment pipeline.
- PDF/Office extraction is intended for understanding, not layout-faithful editing. Scanned PDFs need OCR, and audio/video understanding depends on the selected model accepting the original medium; guaranteed local transcription is not bundled.
- Calendar is read-only. Event creation or changes should be added later behind the same durable approval path as email sending.
- Slack support is limited to search, bounded conversation reading, and approval-gated messages or thread replies. Search results reflect only the connected member's existing access; bot posting can also depend on channel membership and workspace policy. Slack event subscriptions are not included.
- Notion support is limited to search, bounded page/block reading, and approval-gated heading/text append. The integration sees only pages the owner selected or shared, and database-specific editing is not included.
- GitHub access inherits the repositories and organizations available to the signed-in official CLI account. OpenBot's per-bot switches are local policy controls, so owners should keep that CLI account scoped appropriately.
- Webhook signatures authenticate possession of the automation secret; they do not establish the real-world identity or trustworthiness of every field in the payload. Keep narrow filters enabled and rotate a secret if it may have leaked.
- Generic and GitHub webhook endpoints are local by default. Internet delivery requires an owner-managed HTTPS tunnel or reverse proxy; exposing OpenBot's plain HTTP port publicly is unsupported.
- Schedules and Calendar polling run only while the local OpenBot service and Mac are awake. Missed work can be noticed when the service returns, but 0.16 does not provide a hosted lease or guaranteed offline catch-up.
- Event deduplication depends on a stable sender delivery ID and uses a seven-day window. A sender that intentionally changes the ID creates a new event; side effects still rely on the normal approval and tool boundaries.
- Availability depends on the local OpenBot service, OpenCode/provider, Docker, and Chrome.

Please report security issues privately to the repository owner rather than opening a public exploit report.

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
10. **Attachment boundary** — uploads use server-generated paths, sanitized names, a six-file/25 MB message limit, authenticated downloads, forced attachment disposition, MIME sniffing protection, and a sandbox content policy. Routed copies go only to the selected bots' inboxes.
11. **Audit boundary** — messages, attachments, runs, task contracts, verification checks, tool activities, usage, approvals, teammate signals, handoffs, routine outcomes, and taught workflows persist in SQLite.
12. **Authentication boundary** — subscription logins are completed in the provider's official browser/CLI flow. The temporary OpenCode OAuth bridge binds to a random loopback port and is protected with a random Basic-auth password. Remote access-key comparisons are constant-time.
13. **Connector boundary** — Google sign-in uses state plus PKCE S256 and the official OAuth page. Client secret, access token, and refresh token are encrypted locally and never placed in model prompts. Inbox, send, Drive, and Calendar authority are stored separately for each bot.
14. **Communication boundary** — Gmail search/read calls require explicit inbox access. Every send is stored as a durable approval; recipient, subject, and a body preview are shown before one-time execution. The model cannot call Google APIs directly or receive OAuth tokens.
15. **Code-project boundary** — a user must connect one specific real folder and grant each teammate read, write, and run capabilities. Project tools require relative paths and block traversal, hidden files, symbolic links, binary content, and oversized files. Project checks run in disposable no-network containers with protected hidden paths masked. Dedicated Git tools require clean separate branches, show only bounded visible diffs, and commit only named paths. Pull requests require recorded passing checks and a durable approval before `git push` or `gh pr create`; Git hooks and interactive prompting are disabled. Revoking a grant changes the model-session capability fingerprint immediately.
16. **Conflict-safe edit recovery** — every agent write stores the prior text and a hash of the exact resulting file. Restore proceeds only when the current file still matches that hash, preventing a stale restore from overwriting newer user or agent work.

## Approval semantics

Approvals do not expire. Denying cancels the associated run. Approving an intercepted terminal/browser action performs exactly the saved action once, records the result, and continues the existing bot session with that result. Prompt-level approvals queue the original request.

Gmail follows the same path. OpenBot marks the approval decided before calling Gmail, temporarily keeps the run out of the queue, records success or failure, and then resumes the bot with the result. This prioritizes avoiding duplicate sends if the service is interrupted after Gmail accepts a message.

Mac organization also follows the durable approval path. The proposal stores exact source/destination pairs, validates every path again after approval, creates destination folders, and moves regular files only. Existing targets fail the whole preflight instead of being overwritten.

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
- Gmail sending currently supports plain-text messages and up to ten recipients. Attachments, drafts, and labels are not included in 0.10.
- Drive reading is intentionally bounded to supported text, Google Docs, and Google Sheets exports. Binary Office files and PDFs need a dedicated fidelity-preserving viewer.
- Calendar is read-only in 0.10. Event creation or changes should be added later behind the same durable approval path as email sending.
- Availability depends on the local OpenBot service, OpenCode/provider, Docker, and Chrome.

Please report security issues privately to the repository owner rather than opening a public exploit report.

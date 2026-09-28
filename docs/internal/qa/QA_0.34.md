# OpenBot 0.34 native macOS validation

Date: 5 September 2026
Scope: native macOS client, shared native protocol changes, release contracts, and live local-runner connection
Model usage: none

## Result

The 0.34 source contains a genuine SwiftUI/AppKit Mac application. It launches as an ordinary macOS app, owns an `NSWindow`, and talks to the authenticated OpenBot API directly. No WebKit or embedded copy of the web interface is present.

The signed development Release build was copied to `~/Applications/OpenBot.app`, launched without a development key environment variable, paired through the runner's loopback-only `/api/access` route, saved its credential under the dedicated `app.openbot.desktop` Keychain service, and populated the real studio on port 4311. The temporary launch credential used during earlier development was removed.

## Verified behavior

- Native three-column conversation navigation populated the team room plus Nova, Pixel, and Scout from the live runner.
- Existing messages and teammate appearance loaded from the shared studio state.
- The composer exposes native teammate targeting, file import, saved draft continuity, reply context, reactions, and Command-Return sending.
- Command-F search queries the private runner across messages, result files, automations, skills, and teammates, then opens the original conversation instead of creating a detached copy.
- Workspace Files lists only relative paths from one teammate's private workspace and provides a bounded read-only text preview. Hidden entries, oversized files, traversal, direct symlinks, nested symlink escapes, and host paths are not exposed by this view.
- Work exposes Morning Brief, Meeting Prep, and Inbox Follow-ups through the same connector-aware source contracts as iPhone and web.
- Automations creates and edits schedules, Calendar, GitHub, signed webhook, Todoist, Dropbox, Slack, and Notion triggers; it also pauses/resumes, deletes, rotates one-time hook secrets, and requires a second confirmation before a manual run that may perform real work.
- AI Connections reads real runtime/provider readiness, starts supported account/subscription sign-in, supports code-based completion, and saves, edits, or removes hosted API and localhost model endpoints without exposing saved secrets back to the client. Leaving the key empty while editing preserves the encrypted key already held by the runner; removal is refused while a teammate still uses that connection.
- AI Connections also assigns an available provider/model to each teammate. Code Projects connects a same-Mac folder or clones a GitHub repository on the runner, updates explicit read/coding grants per teammate, inspects base/task-worktree diffs, restores eligible recorded edits only through the server's newer-work guard, and disconnects without deleting project files.
- Access & Capabilities controls each teammate's private terminal and browser plus the bounded studio-wide Mac-files/apps gate.
- Apps & Tools starts supported Google, GitHub, Slack, Notion, Todoist, and Dropbox connection flows and keeps read access separate from approval-safe acting for each teammate. Self-hosted OAuth client and event-secret configuration remains a web/host setup path.
- Drive text/Markdown creation and Calendar events, invitations, guest notifications, and optional Meet links require the new narrow creation scopes, a separate teammate write grant, an exact approval preview, and the existing crash-safe one-time action receipt. Older Google connections remain readable and show a reconnect action before creation can be enabled.
- Skill Library lists saved skills, installs transparent starters, creates retained versions through editing, browses immutable history, restores an earlier setup as a new non-destructive version, assigns clean copies to another teammate, imports bounded packages through the runner's integrity/secret checks, exports without overwriting an existing download, and confirms deletion.
- Teach opens a teammate's isolated browser visibly, maps clicks into its preview, accepts sensitive text through a private non-chat field, records the demonstration, and saves the resulting readable workflow into Skill Library.
- Live Studio can open the same bounded browser takeover outside teaching so the owner can navigate, click, type privately, and send common keys while supervising work.
- Teammates creates and edits role, instructions, provider/model assignment, computer/browser switches, weekly token budget, mascot shape, preset colour, and custom colour. Duplication keeps setup and grants but starts a separate conversation, workspace, memory, browser profile, and future usage history.
- A server persistence defect found during this pass was fixed: creating a teammate with computer/browser disabled or with a zero weekly cap now retains those explicit values instead of substituting the defaults.
- Text deliverables can attach workspace-file evidence to the final check. OpenBot reopens the bounded relative path itself, refuses symlink escapes and oversized files, computes the pass/fail result from requested size/content markers, stores a short SHA-256 fingerprint, and labels this host evidence separately from teammate self-reporting.
- Live Studio exposes the existing login/crash LaunchAgent protection to the local native owner, with confirmation before it is removed.
- Background-service restarts now terminate the complete TypeScript runner process group, preventing an orphaned loader from surviving an upgrade and delaying the protected replacement. The LaunchAgent no longer declares a protected Documents working directory, but its source-based launcher still lives in that checkout and remains a packaging blocker for locked-login startup.
- Native drafts now use an accepted `macos` source in the shared server contract, fixing an otherwise hidden 400 response during desktop-to-phone/web handoff.
- Live Studio exposes active work, approvals, action receipts, stop controls, and conservative uncertain-action reconciliation.
- A same-Mac runner pairs automatically only through a loopback address. Private or public remote hosts still require an explicit access key; plain HTTP remote origins are rejected.
- A launch-only development key is retained in memory, not copied to Keychain. Normal local pairing and manually entered remote keys use the dedicated macOS Keychain identity.
- Address-only `openbot://connect` links reject key/token query parameters.
- Native attention alerts are opt-in, suppressed while the app is active, and contain only a generic count rather than prompt, file, or approval contents.
- Mascots are native SwiftUI shapes driven by saved shape, colour, and execution state, with reduced-motion handling.
- The installed window remained readable at its enforced 1080-point minimum width; the prior narrow three-column clipping was removed.

## Automated evidence

`npm run verify` passed:

- release, iOS, and macOS source-contract checks
- 171 TypeScript tests, 0 failures
- TypeScript type checking
- production Vite build

Native macOS Xcode validation passed on the local arm64 Mac:

- Release build: succeeded
- ad-hoc code-signature verification: valid on disk and satisfies its designated requirement
- `OpenBotDesktopTests`: 13 tests, 0 failures

The thirteen native tests cover secure address normalization and loopback recognition, credential-free deep links, in-memory launch credentials, crash-safe public action receipts without private payloads, provider/account/API status without returned secrets, explicit code-project grants/workspaces/recovery entries, separate connector read/write grants, portable skills/starters, interactive teaching and private browser preview, event filters and one-time automation secrets, relative workspace files and bounded preview, original-destination search, and message reply/reaction decoding.

Shared iOS code was rebuilt and tested on the booted iPhone 17 Pro Simulator:

- `ConnectionAddressTests`: 7 tests, 0 failures
- UI suite: 1 live test skipped because optional private launch variables were not supplied, 0 failures
- overall Xcode test action: succeeded

The app was also inspected using a direct WindowServer capture of the installed Release build. That live check used existing local state and did not send a message, start a model, or consume provider allowance.

The live `/api/provider` response was checked through the same authenticated local runner: catalog, saved-instance, and login-attempt collections were present, and no provider instance returned a `secret` field. No connection flow or model request was started for this check.

Live and disposable API checks used no provider/model request:

- The live runner opened `https://example.com` in Nova's isolated browser, reported a valid JPEG preview and title, recorded one visible teaching step, saved the skill, and then removed the test skill.
- A paused signed-webhook automation was created, edited with an event filter, issued a one-time secret, rotated that secret, and was removed; no routine run was started.
- A disposable isolated runner created a teammate with browser/computer disabled and zero weekly cap, duplicated it into an independent thread/workspace, updated its role and budget, listed a copied fixture by relative workspace path, and returned its bounded preview. The entire disposable data directory was then removed.
- A second disposable HTTP-level boundary check listed and previewed a normal file while excluding direct and directory symlinks; attempts to preview both escape paths returned 404. Its temporary runner and data were removed.

Google creation used deterministic provider fixtures rather than the owner's account: OAuth includes `drive.file` and `calendar.events.owned`; multipart Drive content, Calendar times, deduplicated guests, guest-notification query values, optional Meet request data, scope-aware tool exposure, and both-runtime schemas passed. The implementation follows Google's current [Drive scope guidance](https://developers.google.com/workspace/drive/api/guides/api-specific-auth), [Drive file-create contract](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/create), and [Calendar event-insert contract](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert). No real file, event, invitation, or notification was created.

After the verified source replaced a legacy orphaned process group, the authenticated live connector catalog exposed `writeConnected` and `writeRequiresApproval` from the current server. Gmail remained ready; Drive and Calendar correctly reported that their new creation scopes require reconnecting. The existing studio stayed intact, and no active job or pending approval was interrupted before the controlled restart. Because the Mac was locked, the current server was kept available through a detached user-session process; this is continuity evidence, not proof of locked-login LaunchAgent recovery.

## Harmless build-host warnings

Xcode's App Intents metadata processor reported that no AppIntents dependency exists; OpenBot does not currently declare App Intents. Test hosting also logged unavailable `linkd.autoShortcut` registration on this beta macOS/Xcode environment. Neither warning failed the build or tests.

## Explicitly not proven

- Developer ID signing, hardened runtime, notarization, automatic updates, and clean-Mac Gatekeeper installation
- bundling or installing the Node/OpenCode runner from the Mac app itself
- locked-login restart from a source checkout stored under macOS-protected Documents; the current session was restored from an already-authorized process, while a clean distributable still needs to place its runner outside protected source folders
- Windows desktop support
- self-hosted OAuth client/event-secret setup in the Mac client
- physical iPhone, cellular, production APNs, TestFlight, or App Store delivery
- public DNS/TLS and restart validation on a real private Linux host
- repeated real-model head-to-head workflow success, quality, latency, or cost against Grok Bot
- provider-specific automatic reconciliation or universal exactly-once external effects
- complete process, plugin, credential, network, or arbitrary-pixel desktop isolation

0.34 therefore closes a concrete native desktop-client gap. It does not establish full Grok Bot parity or broad unattended-production readiness.

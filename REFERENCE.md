# OpenBot 0.37.0-beta.1

### Your AI team. Your models. Your computer.

Give specialists real work. They research, build, review and coordinate with each other — while you control their models, tools, permissions and data. Every substantial job ends with evidence of what actually happened: sources, checks, approvals, usage and what — if anything — is still uncertain.

| | |
|---|---|
| **A real team** | Different roles, different models per teammate, private collaboration with handoffs and group chats. |
| **Work you can trust** | Sensitive actions wait for your review with a complete, fingerprint-bound preview. Results carry sources, host-verified checks, independent teammate review and per-job usage. |
| **Yours by design** | Open source. Runs on your Mac or private host. Bring any AI account, API key or local model — OpenBot supplies no subscription and resells no tokens. |

**Mac-first development beta.** Native Mac is the primary release target; iPhone is a companion preview, and the web client uses the same owner-hosted service. This is not yet a signed public installer, hosted cloud service or proven drop-in Grok Bot replacement. [First public release checklist](docs/FIRST_PUBLIC_RELEASE.md) · [Latest candidate evidence](docs/QA_BETA_CANDIDATE.md) · [Contribute](CONTRIBUTING.md) · [Report a vulnerability](SECURITY.md).

### Try the source preview

With Node.js 22.13+ and Git installed:

```sh
git clone https://github.com/PrisacariuRobert/openbot.git
cd openbot
npm ci
npm run dev
```

Open [OpenBot](http://127.0.0.1:4310/), create a teammate and choose its provider and model. Install the selected execution runtime when needed; no subscription or model allowance is supplied by OpenBot. Browser work needs Chrome/Chromium; isolated computer/code checks need Docker. These are capability-specific dependencies, not requirements for opening the interface. [Full setup](#start) · [Build the native Mac app](macos/README.md) · [iPhone preview](ios/README.md).

## What's new in 0.37.0-beta.1

- **Native detail polish — build 42:** Activity is a focused review list, permissions use expandable teammate rows, group identities no longer squeeze the mascot stack into the title, and the compact routine editor keeps “When / At” together with matching outlined/primary buttons. Existing controls and approval boundaries remain. [Check details](docs/QA_DETAIL_POLISH_2026-09-07.md).
- **Introduction film:** the new 64-second **In motion** cut follows the native conversation layout and shared animated mascot shapes, with close-ups, teammate handoffs and desktop-to-phone choreography. One client-review request covers sign-in, teamwork, an approved tool plan, checks, delivered files, email review and reuse. This staged film is not proof of autonomous execution or release readiness. Editable source, checks and earlier cuts remain in [marketing/intro-film](marketing/intro-film/README.md); capability notes stay outside the film.
- **Unlocked-Mac reliability follow-up:** failed tasks now explain what stopped inside their own Mac/iPhone conversation, with a link to Activity and no automatic retry. The Mac window no longer fights SwiftUI size constraints; conversation details become a compact sheet when there is not room for a side panel. Approved Google Calendar creation uses a stable event ID and checks an exact readback after a lost response instead of blindly creating another event. Real Gmail/Drive reads and four free Spark 1.3 synthetic productivity runs passed; live Google Calendar remains blocked by its API configuration. [Checks, evidence and remaining limits](docs/QA_UNLOCKED_MAC_2026-09-07.md).

- **The result, separate from the work:** new task replies use the provider's final turn instead of joining every progress update into the answer. Earlier updates remain expandable on web, Mac and iPhone. Runtime errors and unfinished tool steps cannot reuse progress text as a successful result. A fresh self-contained Mac development package passed isolated startup checks; it is not yet a notarized public download. [Result flow and candidate evidence](docs/QA_RESULT_FLOW.md).

- **Work that needs you stays visible:** native Mac and iPhone now include failed tasks, pending approvals, uncertain actions and unresolved routine alerts in one attention count, including work in other conversations. Open the affected conversation or review its routine; an uncertain action is never automatically retried by this flow. Connection labels distinguish saved sign-in and read access from proven model execution or write permission. This is candidate functionality, not a claim of completed real-account or release certification.

- **The approved conversation-first native direction:** one continuous monochrome surface, open incoming messages, dark outgoing bubbles, a compact composer, and animated, recolorable teammates. Mac Settings keeps providers, connected apps, team, routines and devices up front, with advanced tools under More settings; app-wide controls no longer crowd the conversation inspector. iPhone starts with conversations and adds native team/group editing, contextual details and app-access management. Provider logos are bundled for offline use. Routine setup starts with the task; names, teammate choices and calendar details are progressively disclosed. Existing accounts and permissions are retained, and no prototype sample data is installed. [Verification and remaining visual checks](docs/QA_NATIVE_CONVERSATIONS.md).

- **One Studio, no old interface:** `/` and `/studio.html` now load the same conversation-first application. Providers, app connections, permissions, automations, files, projects and phone setup open inside its shared light/dark shell. The retired app and styles are removed; conversations, drafts and account permissions are kept. Private sign-in uses the application’s real styles, with keyboard controls tucked away. Result receipts still distinguish host verification from teammate-reported checks. [Migration and checks](docs/QA_UI_UNIFICATION.md).

- **Sign in when a task needs it:** an enabled teammate browser can now pause a task and show a private sign-in request for any website, not just Google. Open its screen, sign in yourself and continue the saved request. Web, native Mac and iPhone preview have the same handoff; the teammate must check the page/account afterward. Sessions stay separate per teammate, and signing in never approves sending or other external changes. Some sites, SSO and passkeys still need compatibility testing. [Sign-in flow and evidence](docs/BROWSER_AND_CONNECTORS.md#when-a-task-needs-your-sign-in).

- **From advice to delivered work:** a requested code fix can now progress from a reproduced failure to checked code, independent teammate review and an owner-approved new GitHub pull request. The complete outgoing change and publishing account are reviewed together; a confirmed result gets a host-written delivery receipt in the conversation. This is one tested delivery path, not a claim that every app workflow is verified. [Work delivery and pilot evidence](docs/QA_WORK_DELIVERY.md).

- **Safer personal-file organization:** a destination created during a move cannot be overwritten. An interrupted batch reports what moved and what remains, then stops for inspection instead of replaying completed moves. Cross-disk moves remain manual.

- **Preparing a focused first beta:** documented Mac-first scope, source setup, contribution and security reporting; added indexed-source privacy checks and browser acceptance to CI. Release gates distinguish local evidence, clean-machine installation, real-account tests and signed distribution. No tag or public binary is created by these checks.

- **Safer first setup and recovery:** keep your teammate draft while connecting an AI service; return to refreshed connection choices without a forced model. Reconnecting Todoist or Dropbox preserves teammate access decisions. Mac packaging validates a staged replacement before publication, and an incomplete database restore stops with recovery guidance instead of generating a different encryption key. [Candidate checks and current action-review limits](docs/QA_BETA_CANDIDATE.md).

- **A more considered app experience:** the conversation preview now has saved light/dark/system appearance, keyboard-friendly selection menus, and six editable, independently animated vector characters. Native Mac and iPhone share the same character renderer and adaptive conversation palette, with searchable conversation previews and simpler composer menus. Native approvals now load the full supported action, require review, and prevent duplicate decisions. [Design contract](docs/DESIGN_LANGUAGE.md) · [Polish verification and limits](docs/QA_APP_POLISH.md).

- **A browser login is another way in:** teammates with browser permission can use their own saved website sessions for supported tasks without an API connector. Missing setup is distinguished from denied access; explicit read denials still apply. The interface distinguishes browser availability from a verified sign-in. Connectors remain useful for structured searches and scheduled workflows. [How browser sign-ins and connectors work](docs/BROWSER_AND_CONNECTORS.md).

- **A more complete conversation workflow:** the preview now leads with teammates and message previews. Text drafts and selected files survive refresh; a contextual pane brings together work, routines and computer snapshots. Supported approvals and task stopping stay in the conversation. [Independent product audit](docs/CONVERSATION_PRODUCT_AUDIT.md) · [Verification and remaining proof gates](docs/QA_CONVERSATION_WORKFLOW.md).

- **A conversation-first application:** Chats, Activity, Schedule and Library live in one Studio. New studios start without a preset cast: create a teammate, define its job, shape and color, then explicitly choose its AI connection and model. Returning studios keep their teammates and history. No model job or canned first reply is created during setup; a new teammate does not inherit existing Google-account grants. Monochrome surfaces and animated vector characters give OpenBot its own identity. Advanced setup opens in Studio, without switching applications. Native clients use SwiftUI; source changes do not replace previously installed native builds or certify complete visual parity. [Scope, design and verification](docs/STUDIO_REBUILD.md).

- **A calmer, monochrome studio:** conversations have a quieter reading surface; everyday navigation is separated from advanced settings; Apps & tools has search and direct setup shortcuts; Activity leads with current work; the skill library is searchable and teaching explains the Show → Review → Check flow. Animated, recolorable mascots keep their personality. The main web/Mac/iPhone surfaces share neutral colors and system typography; this is not yet a complete native visual-parity sign-off.
- **A visual schedule editor:** browse a month, select a one-time date, or see the weekdays a task repeats. Time-zone controls and later run previews stay available without crowding the default view. The existing host scheduler still validates actual run times and daylight-saving behavior. [Design choices, checks and remaining limits](docs/QUIET_STUDIO_DESIGN.md).

- **Check a saved skill before scheduling:** web, Mac and iPhone now offer real supervised checks with an expected result and explicit owner review. Routines that invoke a saved `/skill` require two different passed inputs for the current skill/setup. Edits, model/grant changes, renewed account authorization and 30-day expiry require fresh checks; queued jobs retain their exact skill revision. Normal task approvals still apply. [Evidence and precise limits](docs/QA_WORKFLOW_CHECKS.md).

- **Try a useful workflow before connecting anything:** six built-in recipes cover morning briefs, inbox follow-ups, meeting preparation, page changes, bug fixes and weekly reviews. Web, native Mac and iPhone share the same catalog, prerequisites and output expectations. Safe examples run the real workflow machinery against synthetic data; they do not call a model or test its reasoning. Starting a real task uses the teammate and provider you chose.
- **Share settings, not your data:** versioned recipe files contain only a known recipe ID and answer/draft preferences. Import previews the recipe, then saves it for your chosen teammate without granting access or starting work. Private IDs, account bindings, URLs, browser state, history, attachments and memory are excluded by a strict schema. This format is separate from older taught-skill exports, which may contain private page details.
- **Memory you can correct:** owner-written preferences resist bot overwrites. Task notes retain their source run and expire after 30 days by default; expired or conflicting legacy notes do not enter new task context. Web/Mac/iPhone let you review, edit, expire or remove notes, with protection against stale edits from another device. Conflict detection covers normalized note names, not semantic contradictions under different names.
- **Quieter follow-ups:** opt into an in-app digest of up to five source-backed suggestions, at most once per 24 hours after a new brief. Exact normalized repeats are remembered for 90 days. No push, send, reminder, routine or automatic tracking is created.
- **Teaching keeps the right login:** demonstrations and resumed tasks now share the same teammate's browser profile. New recordings replace typed values with reusable placeholders, omit query/fragment state, and require owner takeover for secret fields. Existing browser profiles are preserved; old separate teaching profiles are not silently copied. A demonstration remains a draft, not proof of unattended reliability.
- **A stronger project experiment check:** the browser acceptance suite exercises real DOM behavior, keyboard/label invariants and exact-commit timings. It accepts a deliberately improvable fixture, reports no reliable gain on an unchanged fixture, and rejects a faster broken candidate. This is controlled browser evidence, not a general website optimizer, Web Vitals score or accessibility certification.

- **Matching app and runner versions:** packaging now checks that the native app and embedded server agree. The Mac client refuses to silently start an outdated bundled runner or reuse a differently versioned local runner; it never stops active work to update it. Provider cards distinguish a found sign-in from verified model capability.

**Development beta, not completion of the whole competitive plan.** [0.37 verification and remaining gates](docs/QA_0.37.md) separate automated evidence from the native-window checks waiting for an unlocked Mac, real-account/provider coverage, seven-day soak, signed distribution and pilot work. Relay hosting remains deferred. No competitor-superiority claim is made.

## Earlier additions in 0.36.0

- **Your work, in one brief:** choose specific Slack channels, Notion pages and Todoist projects per teammate. Daily briefs and the new weekly review keep dated sources, account context and explicit missing/partial coverage. These are bounded reads, not a complete account history.
- **Follow-ups you can keep:** track a suggestion from a saved report, mark it done or reopen it on web, native Mac and iPhone. Tracking stays local; it does not send messages, schedule reminders or change Todoist.
- **Sign in to compatible custom tools:** MCP services with public-client registration can use their own browser sign-in. Tokens stay encrypted; reconnecting clears tool permissions. Local studios complete sign-in on the host Mac. Pre-registered-client services and executable servers need separate support.
- **Show the usage, including what is unknown:** new result files include a provider usage receipt across recorded attempts and private consultations. Missing fields say unavailable, not zero; provider cost is not your subscription bill or remaining allowance.
- **Measure code changes:** the isolated coding tool can compare five baseline and candidate command timings against exact commits, a pinned container image and guarded files. Failed checks or noisy timings produce an unverified/inconclusive result. This is a command-benchmark foundation, not browser performance or accessibility certification.
- **Stronger connection boundaries:** stale in-flight token refreshes cannot restore a disconnected/replaced account, and old brief selections must be reconfirmed after reconnecting.

**Development beta, not a completed competitor-parity release.** Four live Spark 1.3 runs passed against synthetic source fixtures; those do not prove live account compatibility, broad browser reliability or superiority. [Full verification record and remaining plan gates](docs/QA_0.36.md).

**New in this working tree: calendar-time routines.** Schedule weekdays at 08:00 in a saved time zone, choose specific days or run just once. Preview upcoming runs on web, Mac and iPhone. Existing intervals are preserved; interrupted scheduling rolls back safely and downtime catches up once. The execution host must be awake. [Verification and remaining limits](docs/QA_CALENDAR_ROUTINES.md).

**New in this working tree:** [change-aware page monitoring](docs/QA_PAGE_WATCH.md). Use Automations → Page changes to watch a public page or feed. The first check saves a baseline; unchanged checks use no model; changed text queues a source-linked job. Native Mac and web share the same host. [Research behind this addition](docs/SOCIAL_WORKFLOW_RESEARCH_2026-09-05.md).

**New in this working tree:** [live computer view and explicit takeover](docs/QA_LIVE_VIEW.md). A teammate's open browser now streams live into the conversation pane, a studio Agent Computer dialog, and the iPhone app. Watching is read-only, never starts a browser and grants no access; a separate Take control step enables click-to-act and the private keyboard for sign-ins and checks. Verified with hub unit tests and a two-viewer live smoke test.

**New in this working tree:** memory retrieval that ranks instead of filters. `memory_search` returns relevance-ranked saved notes; new tasks carry bounded, keyword-ranked background context from related past conversation, and a task cannot quietly save a near-duplicate of a protected owner note under another name. Retrieval is local and deterministic; if the owner connects an embeddings endpoint in Control center, matches blend meaning similarity with the keyword score and fall back to keyword ranking automatically. See [the turnkey relay deploy](deploy/private-runner/README.md) for `setup.sh --relay` away access.

**New in this working tree:** [owner-authored Auto Review rules](docs/QA_AUTO_REVIEW.md). In Settings, write Require-Approval rules that always stop a matching task, command or browser action for your decision, or narrow Always-Allow rules that trim repeat review prompts for isolated commands. Deterministic rule matching with Require-Approval precedence; no model is involved and unmatched behavior is unchanged.

**New in this working tree:** [owner-created group chats](docs/QA_GROUP_CHATS.md). Name a group, pick one to six teammates, and work there with the same mention routing, approvals and Auto Review boundaries as every conversation. Members join or leave with an explained change; future tasks follow the current roster while running work keeps going.

OpenBot is an open-source, owner-controlled home for persistent AI teammates. Run it locally on a Mac or choose an always-on private host you control. It combines a friendly messaging interface with private bot computers, browser work, durable routines, bounded teammate communication, teach-by-demonstration, and clear approval boundaries.

**Your AI is your choice from the first launch.** Choose an eligible account/subscription, an API connection, or a local model before running a task. OpenBot does not assign OpenCode or silently switch providers. OpenCode is a bundled execution runtime for several connections, not a required model provider. Existing teammates keep their configured models. OpenBot never pools or resells model access.

## Earlier additions in 0.35.0

- **Away access without companion networking apps:** OpenBot now contains an outbound relay client; neither the Mac nor iPhone needs Tailscale or another tunnel app. Native/web setup uses an expiring QR invitation and individually revocable phone keys, with native iPhone scanning and Mac pairing controls. A disposable end-to-end test verifies authentication, streaming, revocation and reconnect. **The public relay is not deployed yet**, so cellular access is not ready on this installation. [Implementation, hosting requirements and evidence](docs/QA_AWAY_ACCESS.md).
- **No domain purchase for the pilot:** the relay now uses one hosting-provider address with a separate path for each studio. QR pairing and the native app preserve that path; independent studios cannot use each other's phone keys or invitations. A [Render setup template](deploy/relay/README.md#render-pilot-use-its-included-address-now) includes durable storage and a health check. Hosting still needs account setup and cost approval; a branded address can be added during rebranding. The shared relay is native-API-only, not a hosted browser app.

This development version improves finished work, installation, open extensions, and whole-job usage control. See [the validation record and remaining limits](docs/QA_0.35.md), [the open-extension checks](docs/QA_OPEN_EXTENSIONS.md), and [included skills plus physical iPhone testing](docs/QA_INCLUDED_SKILLS.md).

- **Useful skills, already included:** seven methods are ready for existing and new teammates: meeting actions, document actions, weekly planning, grounded research, systematic debugging, checked spreadsheets, and private team review. Five are reviewed Hermes adaptations with pinned sources and MIT attribution. No manual import or extra account is needed for the method itself. Skills load on demand; disabling one persists across restart, and account/file permissions remain unchanged. Find them in Skill Library on desktop/web or Tools, skills & memory on iPhone.
- **Code-security guidance without another model call:** shared-project writes and replacements return a bounded advisory check for selected injection, deserialization, YAML, encryption and TLS patterns. This is a TypeScript adaptation of selected Hermes/Anthropic security-guidance concepts, not the full Python plugin or a security certification. Source and license notices ship in the desktop package.
- **Physical iPhone personal preview:** a development build can be signed with a free Personal Team using the documented preview entitlement override. Chat and in-app attachments remain available; push notifications and shared Share-sheet delivery are explicitly unavailable in this build. The normal release entitlements remain intact. [Setup and test checklist](ios/README.md#personal-team-device-preview).
- **Local Mac pairing no longer gets stuck saving an unnecessary key:** the desktop client keeps automatically paired loopback keys in memory and fetches them again from the local runner on launch. Remote-host keys still require secure Keychain storage.

- **Connect tools beyond our built-ins:** web, native Mac, and iPhone share a custom MCP connection manager. Connect an independently accessible HTTPS service or an explicitly allowed, already-running local HTTP service. Tokens stay encrypted on the host. Discover tools, then grant each teammate only the tools it needs; nothing is enabled automatically. This first version supports public/token-authenticated Streamable HTTP, not OAuth-only services or command-based servers.
- **Bring a community's methods, not its private credentials:** review and import portable `SKILL.md` instructions plus text references from a raw URL or a self-contained paste. Source fingerprints pin the exact reviewed content. Unsupported scripts, runtime-specific configuration, and tool policies block installation rather than being silently ignored. This is a documented subset, not the entire Hermes or Grok Bot marketplace. [Compatibility matrix](docs/PLUGIN_INTEROPERABILITY.md).
- **Correct what a teammate remembers:** inspect, add, edit, search, and forget private memory notes from all three clients. Corrections prevent new tasks from resuming an old session with stale notes; prompt memory has a size budget. Past conversations and already-running tasks are not erased.
- **Connections that fail honestly:** fresh tool definitions and access are checked before calls, results have saved source receipts, and an unacknowledged approved write stays uncertain rather than being retried. A live Spark test exposed a search miss being mistaken for missing access; discovery now returns the available tools with a clear no-match explanation.
- **Cleaner host updates:** live event connections are closed on shutdown, and missing API endpoints return a useful JSON error instead of a successful-looking web page.

- **Provider-first onboarding:** fresh studios ask for an explicit provider and model on web, native Mac, and iPhone. New teammates no longer inherit an OpenCode default. iPhone supports account sign-in, private API/local connection setup, and teammate assignments. A saved connection is not a completed model-access test.
- **Tables with checked arithmetic:** ask for CSV totals grouped by currency, owner, or another column. OpenBot computes exact decimal sums from the full bounded source, reports included/excluded rows, and fingerprints the input. No Docker, Excel, currency conversion, or formula execution is required.
- **Editable workbooks, preserved originals:** teammates can turn workspace CSVs into a new multi-sheet `.xlsx` with numeric columns, literal IDs, frozen headers, and filters. Existing files are never replaced. This is new-workbook export, not lossless editing of arbitrary Excel files. [Limits and real-model evidence](docs/QA_CHECKED_OUTCOMES.md).
- **Review the same sources together:** private consultants receive the exact current attachments in their own workspace, with source fingerprints and explicit version context. Missing or modified copies fail visibly instead of silently substituting old inbox files.
- **Fewer unnecessary approval prompts:** a clear “do not push, publish, or change the originals” list is recognized as a prohibition. Actual external/destructive tool actions still require approval.
- **More faithful spreadsheet reading:** CSV previews count all records while marking omitted rows/columns. Excel previews retain original cell addresses and relationship-mapped sheet names, flag formula caches and omitted content, and never execute macros or external links. This is a bounded data preview, not layout-preserving workbook editing or recalculation.
- **Research-led priorities:** the [current competitive assessment](docs/COMPETITOR_RECHECK_2026-09-05.md) separates documented Grok Bot capabilities, reported user problems, tested OpenBot behavior, and remaining release gates. We do not claim blanket parity or superiority.

- **The app owns its runner:** a release package contains Node, OpenCode, their version-matched licenses, the built interface, server, dependencies, skills, and launch helper. On startup, the native app checks the local studio and starts that packaged runtime when needed. Model sign-in remains yours.
- **Reports must actually exist:** Morning Brief, Inbox Follow-ups, and Meeting Prep carry a persisted completion requirement across web, Mac, and iPhone. A missing report gets one bounded repair attempt; a second miss fails visibly instead of presenting an invented success.
- **Use the apps already on your Mac:** daily reports prefer connected Google services, then can read Apple Mail or Calendar when studio Mac access is enabled and macOS allows Automation. Reports identify the real source and partial coverage; explicit connected-account read restrictions are not bypassed. Meeting Prep can proceed without Drive and show the missing context. This path does not send mail, change events, or infer unanswered threads from individual Mail messages. [Fallback validation and limits](docs/QA_MAC_FALLBACK.md).
- **Read other open apps too:** `mac_app_read` collects bounded Accessibility text, including document text, messages and table cells, without focusing, clicking or typing. It saves an encrypted, timestamped source snapshot with references for the answer. This applies to apps that expose readable Accessibility content—not every app or every part of a document. Password/authentication apps and recognized sensitive fields are excluded. Generic key-based navigation now requires approval.
- **Source-backed meeting preparation:** select the next timed meeting and collect bounded, title-matched mail and Drive context. Missing access, shortened documents, and unverified relevance remain explicit. No meeting means no unrelated inbox search.
- **Less unnecessary model context:** report starters expose only collection and report-saving tools. Ordinary teammates receive tools according to their enabled capabilities; internal tool credentials are scoped to one teammate and run. This is not a complete process sandbox.
- **Real code-check environments:** JavaScript and Python checks run without network access in disposable Linux check views. Check receipts detect tracked-source changes, and generated output does not overwrite the owner's checkout. Project dependencies still need to be available.
- **Keep the same studio:** startup reuses an already-running local studio. When the configured local service is offline, it preserves that service's data location and refuses an unreadable home rather than silently creating a replacement. A fresh installation uses `~/Library/Application Support/OpenBot/Data`. No automatic data migration is performed.
- **Shared job allowance:** the coordinator, its consultants, and steered follow-ups share one reported-token limit. Reaching it stops unfinished work and pending approvals without cancelling unrelated jobs. The allowance survives restarts; existing per-run and weekly limits still apply. Configure it with `OPENBOT_JOB_MAX_TOKENS` (default 100,000). Reporting delays mean this is not an exact billing cap.
- **Explicit background protection:** opening the app starts a local child runner only when needed; login/crash protection remains an explicit Live Studio action. Remote connections do not start a local studio.
- **Reproducible packaging:** `npm run package:macos -- /path/to/OpenBot.app` embeds the runner and verifies the final code signature. The native source contract rejects releases that lose self-startup.

The Mac must still remain powered on and awake for local work. This is an ad-hoc-signed, host-architecture development package—not a notarized public installer. OpenCode is bundled; optional Claude Code, browser/isolated-computer dependencies, and account consent remain separate setup steps. Developer ID signing, hardened runtime, notarization, automatic updates, safe source-data migration, clean second-Mac installation, Windows support, and repeated real-model competitor benchmarks remain open.

### Previously in 0.34.0

This milestone adds a real native macOS application for everyday OpenBot work. It is a SwiftUI/AppKit client of the same owner-controlled local or private runner used by the iPhone app; it does not embed the website or use WebKit. See [the native desktop validation record](docs/QA_0.34.md).

- **A real Mac app:** native window lifecycle, menus, keyboard commands, three-column navigation, settings, file picker, attachment opening, and Keychain-backed sign-in. A local runner pairs automatically through a loopback-only endpoint.
- **The complete daily loop:** switch conversations, target a teammate, send messages and files, reply or react in context, search the whole private studio, continue saved drafts, follow live runs, approve or stop work, inspect recent action receipts, and optionally receive a private native attention alert.
- **Dependable work from desktop:** Morning Brief, Meeting Prep, and Inbox Follow-ups use the same source and connector gates as the web and iPhone surfaces.
- **Native automations:** create and edit schedules, Calendar, GitHub, signed webhook, Todoist, Dropbox, Slack, and Notion triggers; pause, resume, delete, rotate one-time signing secrets, or start a confirmed run. Real actions still follow the ordinary approval boundary.
- **Your models from the Mac app:** inspect provider readiness, connect supported subscription accounts, complete code-based sign-in, and add, edit, or safely remove hosted APIs and local OpenAI-compatible models without falling back to a browser settings screen.
- **Native project and access control:** connect a folder on the runner Mac or clone a GitHub repository, choose read-only or coding access per teammate, inspect task worktrees and diffs, safely restore recorded edits, and manage private computer, browser, and bounded Mac access from the app.
- **Native apps and skills:** connect supported services, separate read from approval-safe write access for every teammate, and manage portable skills through starter install, edit/version history, non-destructive rollback, assignment, guarded import, export, and deletion.
- **Native browser work:** open and control a teammate's isolated browser from Live Studio, type through a private non-chat field, or visibly teach a repeatable skill and save it to the Skill Library.
- **Native teammate setup and files:** create, edit, and safely duplicate teammates with their own role, instructions, model, tools, token budget, recolorable living mascot, and clean private workspace; browse bounded workspace text without exposing host paths.
- **Stay running:** Live Studio can turn the existing login/crash LaunchAgent protection on or off from the local native app; the Mac still has to remain awake.
- **Crash recovery stays visible:** uncertain approved actions can be reconciled from the native inspector or Live Studio and are never silently replayed.
- **Evidence, not just confidence:** when a teammate delivers a text file, OpenBot can reopen it inside the bounded workspace, check its size and required text, record a short SHA-256 fingerprint, and label the result as host-verified instead of teammate-reported.
- **Native, living teammates:** mascots are drawn and animated in SwiftUI using each teammate's saved shape, colour, and real work state, with reduced-motion support.
- **One private home across devices:** the Mac app defaults to the local runner and accepts HTTPS private-runner addresses for use away from home. A launch-only development credential stays in memory rather than being copied to Keychain.

This closes the missing native desktop-client gap, not the entire managed-service gap. The development build is ad-hoc signed. Developer ID signing, hardened runtime, notarization, automatic updates, Windows support, fresh-Mac runner packaging, self-hosted OAuth client/event-secret configuration, managed hosting, and repeated real-model competitor benchmarks remain open.

### Previously in 0.33.0

This reliability beta adds a durable action ledger for every approved command, email, post, issue, and connected-app update. Its purpose is simple: a restart must never make OpenBot blindly repeat an action whose remote result is unknown. See [the crash-recovery validation record](docs/QA_0.33.md).

- **Prepared before execution:** the exact approved payload is fingerprinted and a durable receipt is created before OpenBot calls the destination.
- **One local dispatch:** only one process can claim the receipt. Concurrent or repeated approval requests cannot dispatch the same saved action twice.
- **No blind replay after a crash:** an action interrupted while its destination may be processing it becomes **Needs confirmation**. OpenBot blocks the task and does not try again automatically.
- **Human reconciliation:** web and native Live Studio ask whether the action happened. Confirming success continues without repeating it; confirming failure requires a newly prepared approval before another attempt.
- **Inspectable history:** recent approved actions show a calm, readable status trail on desktop and iPhone without exposing the private request body in the public state payload.
- **Restart-safe queue:** an approved action that was durably prepared but never started is recovered and executed before model work resumes.

This is stronger failure handling, not a mathematical exactly-once guarantee from third-party services. If a remote provider accepts a request immediately before the OpenBot process stops, the result remains uncertain until the owner or a future provider-specific reconciliation check confirms it. Full network/process isolation, managed hosting, physical-device validation, and the repeated two-model workflow gate remain open.

### Previously in 0.32.0

This native-continuity beta brings OpenBot's three dependable starting points to the real SwiftUI iPhone app. It keeps the existing source and approval boundaries; it does not claim physical-device, cellular, APNs, App Store, or full native-settings completion. See [the iPhone Simulator validation record](docs/QA_0.32.md).

- **Work from iPhone:** a first-class **Work** destination starts Morning Brief, Meeting Prep, or Inbox Follow-ups without making the owner remember a prompt.
- **One job on both surfaces:** iPhone sends the same source, coverage, time-zone, draft, and no-write requirements as the web app, then opens the shared team room for live progress and results.
- **Honest live readiness and recovery:** the native screen reads the authenticated connector catalog. Each job starts only when its required Gmail, Calendar, and Drive connections are live. Missing OAuth access can be added from iPhone in one tap; a disabled Google API opens its exact Cloud enable page instead of pretending another sign-in will fix it.
- **Readable, playful native UI:** the screen uses native controls, Dynamic Type-aware text, restrained surfaces, and the same code-drawn, recolorable teammates with independent blink and motion timing. Missing connections stay readable instead of fading into disabled-card noise.
- **Simulator-verified:** the iPhone 17 Pro simulator connected to the running local studio, loaded live connector state, opened all three job cards, and preserved Live Studio. Six native unit tests and the live native UI test pass without a model request.

This closes an important daily-use parity gap, not the whole competitor gap. Connector setup and provider administration remain desktop-first, and the repeated two-model workflow gate, process/egress isolation, physical-device continuity, signed distribution, and fresh-user onboarding are still open.

### Previously in 0.31.0

This functional beta strengthens three everyday jobs: morning briefs, inbox follow-ups, and checked code changes. It preserves the existing animated, recolorable mascots. It is **not yet a verified drop-in Grok Bot replacement**; see [the validation record](docs/QA_0.31.md).

- **Source-backed briefs:** a bounded Gmail/primary-calendar snapshot, a stated time zone and 24-hour window, direct source links, and explicit missing/shortened coverage. Start from **Apps & Tools → Morning brief**, or ask naturally in chat.
- **Inbox follow-ups:** suggested priorities and local reply drafts, saved for review. Already-answered, ambiguous and shortened conversations cannot receive a draft through this path. Recipients come from the source headers, not the model. Nothing is sent or saved to Gmail Drafts.
- **Durable results:** source snapshots and reports are encrypted in the host database. Completed jobs attach a Markdown report automatically, even if the model forgets a file link; authenticated report downloads remain available from database storage. Downloadable files and chat are private local data, not end-to-end encrypted.
- **Less repeated work:** one collection batches up to eight mail conversations and twenty calendar events. A task can reuse its snapshot for fifteen minutes; at most three collections are saved per task. Partial reads are never presented as an empty inbox.
- **Coding checks with evidence:** actual command results are recorded against a clean Git commit. Review and publishing reject missing checks, failed reruns and changed code. Publishing rechecks the approved commit and pushes that exact object. A successful command is not proof of meaningful test coverage; the independent reviewer must assess it.
- **Background GitHub discovery:** standard CLI installations are found even when OpenBot starts outside your login shell. Completed coding jobs attach a readable command/commit check record.

Google setup and per-teammate read permission are still required. Briefs cover a bounded seven-day inbox search and the primary calendar only; attachments and long conversations need separate review. Source matching does not independently verify AI advice. Coding checks still require a working code computer and installed project dependencies. [Current gaps and release gates](docs/PRODUCT_GAP_AUDIT.md) remain explicit.

### Previously in 0.30.0

This development beta focuses on finishing or stopping work predictably, without changing the visual design. It does not establish Grok Bot parity or unattended-production readiness.

- Stop now cancels the whole consultation tree, including queued subtasks and their pending approvals.
- Model runs have active-time, idle, step, reported-token and output limits. Unresponsive local model processes receive a stop request followed by forced termination if necessary.
- Provider-reported usage is saved during a run, not only when it ends. Resumes carry forward recorded tokens, steps and active time without double counting.
- Shutdown waits for model-process termination before making unfinished jobs available to another runner. Recorded progress, files and pending decisions are retained.
- Runtime diagnostic text is no longer treated as a successful model answer.
- New deterministic tests launch real local processes that hang, ignore stops or exceed limits. These tests use no model account or allowance.

Default limits: **30 active minutes, 5 idle minutes, 64 model steps, 100,000 reported tokens per run**, plus a 4 MiB output ceiling per model invocation. Approval/consultation waiting time outside a running model process is not counted. Host administrators can set `OPENBOT_RUN_MAX_MINUTES`, `OPENBOT_RUN_IDLE_MINUTES`, `OPENBOT_RUN_MAX_STEPS` and `OPENBOT_RUN_MAX_TOKENS` before starting OpenBot; invalid values fail startup. A teammate's smaller weekly allowance also applies.

These are execution safeguards, **not exact provider billing caps**: in-flight requests can exceed a threshold before usage is reported; a hard crash can lose unreported usage; stopping cannot undo an external action already accepted. Each teammate's child task has its own per-run allowance, not a shared whole-job spending cap. See [execution validation and limits](docs/QA_0.30.md).

### Previously in 0.29.0

This development version focuses on trustworthy foundations, not a larger feature checklist. OpenBot remains an **owner-operated beta**, not yet a drop-in Grok Bot replacement. See the [product audit and delivery plan](docs/PRODUCT_GAP_AUDIT.md) and [validation record](docs/QA_0.29.md).

- Connect a compatible API using its actual address, API format and model IDs. Local Ollama/LM Studio endpoints can omit a key; custom model choices are scoped to the saved connection.
- A calmer AI-connections panel separates accounts from API/local models, keeps the animated characters, and says **saved, not tested** instead of treating a key as proof of access.
- Historical replies are no longer rewritten into new promises. Completion receipts identify checks as teammate-reported, not independently certified.
- Fixed multi-step token/cost accounting, background runtime discovery, repeated status-probe churn, OAuth method selection and automatic sign-in callback completion.
- Teammate startup failures now report back privately so the coordinating bot receives the failure instead of proceeding without an explanation.
- Disconnected app tools and disabled computer/browser tools no longer need to appear in the model’s tool context. Server-side permission checks still apply.
- Browser approvals inspect the actual control and reject changed page/control targets. This hardens a boundary; it is not a complete network or process sandbox.
- Settings sheets now have dialog semantics, keyboard focus containment, Escape dismissal and focus restoration.
- Added a real OpenCode transport contract test and opt-in live-model workflow checks with independent artifact and consultation assertions.

### Previously in 0.28.0

- Slack mentions, messages, and reactions can now wake a selected teammate through Slack's signed Events API requests.
- Notion page, comment, and database activity can now start a teammate routine through verified, signed webhook delivery.
- Live Slack and Notion events use private rotating addresses, encrypted verification secrets, bounded inputs, duplicate protection, rate limits, durable receipts, safe replay, and the ordinary approval boundary.
- Apps & Tools now guides the complete live-event setup with copyable provider addresses, verification state, and one-click address rotation.
- Automations adds clear Slack and Notion trigger cards with event, channel, and page filters, and teammates can create the same app-event routines naturally in chat.
- Connector manifest v2 makes event capability and authenticity requirements explicit for every built-in connector. The reviewed admission contract is documented; arbitrary third-party code loading is intentionally not enabled yet.
- Preserved the 0.27 private-host heartbeat and encrypted home transfer, plus all owner-controlled permissions, isolated coding, native iPhone continuity, and animated customizable characters.

## What is included

- Named teammates with stable roles, personality, memory, files, model, connection, and token limit
- Direct chat plus a shared studio where up to three bots work in parallel
- A Live Studio that combines all teammate desks, durable attention items, task progress, browser previews, stop controls, and owner takeover
- Local search across conversations, files, routines, skills, and teammates, plus persistent reply context and reactions
- Sidebar pins and custom sections, reversible hide/restore, and setup-only teammate duplication without copying private history
- Natural `@name` and `@everyone` routing, automatic role-based ownership, and a `/` picker for learned skills
- Rich file attachments (up to six files, 25 MB each) with bounded PDF/Office/spreadsheet/text extraction, media handoff to compatible models, and copies in only the selected teammates' private inboxes
- Contained image/PDF previews, extracted-text previews, accurate file-kind icons, friendly unsupported-file recovery, and hardened downloads
- Automatic result cards for teammate-created files, including revision numbers and preserved earlier versions
- Browser voice typing plus deliberate native iPhone speech capture with an editable transcript; OpenBot stores the text, not the microphone recording
- Private bot-to-bot questions, findings, replies, and deduplicated handoffs, with one coordinator-owned final answer and an inspectable Team signals feed
- Three-hop/eight-task teamwork limits that prevent accidental agent loops
- Live streaming text, activity history, token/cache/cost usage, and a studio control center
- A persistent completion contract for real jobs: clear outcome, deliverable, live checklist, approval boundary, and recorded final checks
- Compact result receipts distinguish teammate-reported checks from bounded host verification of delivered workspace text, with expandable steps and evidence details; other claims still depend on workflow-specific oracles
- One-click GitHub cloning or local code-project connections with separate read-only, code-and-test, or no-access choices for every teammate
- Project-aware code listing, search, reading, exact edits, atomic file creation, per-task Git worktrees, bounded diffs, scoped commits, and network-isolated checks
- A recoverable local code-change trail; restore points refuse to overwrite newer work, and disconnecting never deletes project files
- Independent teammate code review of the exact tested commit before approval-gated GitHub pull-request publishing
- A persistent, constrained Docker computer for every bot
- A persistent Chrome profile for every bot with open, read, click, type, and screenshot tools
- A versioned Skill Library with visible teach mode, editable instructions, starter templates, teammate assignment, portable integrity-checked import/export, secret scanning, rollback, chat discovery, and OpenCode/Claude Code generation
- Durable automations with five-minute/hourly/daily schedules, signed generic, GitHub, Slack, and Notion events, Google Calendar triggers, narrow filters, editing, pause/resume, explicit test runs, event receipts, replay, result links, and safe deletion
- Proactive Todoist task and Dropbox folder-change triggers with durable cursors, fresh-start baselines, and connector-specific filters
- Duplicate-event protection, rate limits, loop headers, bounded retained inputs, visible failure guidance, approval-wait alerts, missed-schedule notices, and automatic pausing after three consecutive failures
- A durable single-leader runner with atomic job claims, renewable leases, graceful shutdown handoff, crash recovery, visible health, optional macOS login/crash protection, and an optional private always-on Linux home with backup-first updates and opt-in internal and outside health signals
- Passphrase-encrypted whole-home export/import for studio state, subscription sessions, browser profiles, and server projects, with authenticated staging, health verification, and rollback
- A durable notification outbox plus standards-based Web Push for installed secure web apps, including direct links to results and approval waits
- Native iPhone APNs registration and delivery with per-device retries, stale-token cleanup, and conversation/approval deep links
- Persistent approvals for destructive, publishing, communication, purchasing, credential, and system actions
- Provider instances owned by the local user and explicitly assigned per bot
- Provider-aware connections for OpenCode, Claude, ChatGPT/OpenAI, GitHub Copilot, GitLab Duo, and SuperGrok/xAI
- An official Claude Code runtime adapter with the same isolated workspace, browser, memory, approval, and teamwork tools
- AES-256-GCM encrypted API keys with a machine-local 0600 vault key
- Responsive desktop/phone UI, installable PWA shell, finish notifications, connection recovery state, and authenticated remote mode
- Native SwiftUI iPhone app with conversations, teammate targeting, voice-to-editable-text capture, message sending, live task/approval state, connector-aware ready-made Work jobs, Keychain-backed API access, offline/reconnect state, and address-only deep linking
- Native SwiftUI/AppKit macOS app with conversation navigation, replies/reactions, private search, bounded symlink-safe workspace files, saved drafts, teammate creation/editing/duplication, Work starters, all supported automation triggers, live browser control and teaching, subscription/API/local-model connections and assignment, code-project grants, capability controls, Live Studio, approvals, crash-recovery decisions, action history, native menus, and keyboard commands—without WebKit
- Embedded iOS Share extension for securely handing text, links, images, and files into the active OpenBot conversation
- Customizable code-drawn mascots with independent blink/idle timing plus work, wait, laugh/celebrate, and failure expressions tied to real execution state
- One-click Google sign-in for release builds, plus a credentials-file flow for self-hosters with no manual ID copying
- Real Gmail search/read and approval-gated sending, Google Drive search/document reading plus approval-gated text-file creation, and Google Calendar agenda access plus approval-gated events, invitations, and optional Meet links
- Official GitHub CLI connection for notifications, issue search, and approval-gated issue creation
- Slack search, bounded conversation reading, and approval-gated channel messages or thread replies
- Notion page search, bounded page reading, and approval-gated content append for pages selected during connection
- Todoist active-task reading and approval-gated task creation, with runtime-created local OAuth credentials for one-click setup
- Read-only Dropbox search and bounded text/code reading with official offline OAuth refresh
- Separate per-teammate read/create permissions for Gmail, Drive, and Calendar—rather than exposing every connected app to every bot
- Per-teammate Slack read/post, Notion read/update, Todoist read/create, and Dropbox read permissions, backed by the same connector health and audit contract
- Natural connected-app suggestions plus useful starter workflows that combine calendar, tasks, cloud files, conversations, knowledge, and code activity
- Owner-controlled access to visible Mac home folders, with bounded text reading and approval-only file organization that cannot delete or overwrite
- Safe Markdown chat rendering for headings, lists, links, tables, quotes, and code instead of showing raw formatting characters
- Rebuilt connector cards with contained status labels and recognizable vector service marks at desktop and phone sizes

## Start

Requirements:

- Node.js 22.13 or newer
- Git and npm; use `npm ci` for the checked-in dependency versions
- For the chosen execution path: [OpenCode](https://opencode.ai/docs/) for OpenCode-backed accounts/API/local models, or [Claude Code](https://docs.anthropic.com/en/docs/claude-code/getting-started) for its official runtime. Choosing a provider is explicit; connecting an API endpoint does not remove the need for its execution adapter.
- Optional Google Chrome or Chromium for browser work
- Optional Docker for private bot computers and isolated code checks
- Optional [GitHub CLI](https://cli.github.com/) for GitHub activity, issues, and publishing pull requests
- Optional Slack, Notion, and Dropbox OAuth applications for self-hosted connector use; Todoist registers its local OAuth client automatically

```bash
npm ci
npm run dev
```

Open [OpenBot](http://127.0.0.1:4310/). Older `/studio.html` links open the same interface; settings no longer return to a separate old application. For the native Mac build/package path, see [macos/README.md](macos/README.md). Start with a read-only task and enable tools only as needed.

Settings and their subpages share a consistent drawer with a way back; phone settings use the full screen. Providers, apps, teammates, routines, permissions, projects, skills, files, results and recovery are directly accessible from Settings. Expanded forms share the same neutral palette and controls. The Skills page uses one teammate selector for both included skills and teaching.

`npm run test:unified-studio` checks routes, light/dark themes, phone/desktop containment and draft preservation with a disposable host. Run `OPENBOT_EXPANDED_SETTINGS=1 npm run test:unified-studio` to also check disclosures, all routine triggers, schedule variants, API/local-model forms, project forms, community connections and file previews. See [settings UI verification](docs/QA_SETTINGS_SUBPAGES.md) for scope and limits.

`npx tsx scripts/capture-marketing-ui.ts` captures the real shared interface with sample data for the website, without contacting your accounts or running a model. The current 60-second introduction animates the same conversation-first layout and vector mascots; it is a staged product story, not a real-account recording or a Settings tour. See [film direction and checks](marketing/intro-film/LAUNCH_REVIEW.md).

Run the full local verification suite with:

```bash
npm run verify
```

### Optional private always-on home

The default remains local. To keep OpenBot working while the Mac is off, use a dedicated Linux host with Docker, point a domain at it, and run:

```bash
./deploy/private-runner/setup.sh studio.example.com
```

Caddy exposes only HTTPS, OpenBot keeps its studio under `/srv/openbot`, and new devices still require the private access key. Read the complete threat model, setup, model-login, OAuth callback, project, migration, update, and backup instructions in [deploy/private-runner/README.md](deploy/private-runner/README.md).

## How model ownership works

Every provider connection belongs to the local owner. A bot stores only the ID of its assigned connection. OpenCode-backed accounts use OpenCode's official provider flows. Claude accounts use the official Claude Code login and runtime; OpenBot does not use the unofficial Claude subscription plug-ins prohibited by Anthropic. Optional API-key connections are encrypted before they reach SQLite and are materialized only into the selected bot process.

Claude subscription use is governed and metered by Anthropic. Depending on Anthropic's current policy and the account, third-party/print-mode use may draw from plan limits or usage credits. A Claude.ai chat plan and Anthropic API billing are not interchangeable.

Model runtimes receive a small allowlisted environment rather than the server's full environment. `HOME` is available so official CLI logins can be used, while unrelated host secrets are not forwarded. Claude receives only OpenBot's workspace-safe MCP tools; host Bash and unrestricted host file tools are disabled.

## Connect Google Workspace

Open **Apps & Tools**.

- A packaged release with `OPENBOT_GOOGLE_CLIENT_ID` configured shows one **Connect Google** button.
- A self-hosted copy asks for the downloaded Desktop OAuth JSON file, encrypts it locally, and opens Google sign-in immediately. Manual client-ID entry remains under Advanced.

For self-hosting, enable the Gmail, Drive, and Calendar APIs in [Google Cloud credentials](https://console.cloud.google.com/apis/credentials), configure an External consent screen, add your account as a test user, create a Desktop OAuth client, and download its JSON file. Release maintainers can copy [.env.example](.env.example) to `.env` and add their verified client details.

Each teammate gets separate Inbox, send, Drive, and Calendar controls. Every outgoing email creates a durable approval showing its recipient, subject, and body preview. OAuth tokens never enter model context.

For personal local use, Google's testing mode can be sufficient when the account is listed as a test user. Distributing Gmail access to the public requires Google's OAuth verification; restricted Gmail scopes may also require a security assessment. See Google's [OAuth web-server guidance](https://developers.google.com/identity/protocols/oauth2/web-server), [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes), and [Gmail REST reference](https://developers.google.com/workspace/gmail/api/reference/rest).

## Connect Slack, Notion, Todoist, and Dropbox

Open **Apps & Tools** and choose Slack or Notion. A packaged build with managed OAuth credentials shows one **Connect** button. A self-hosted copy can save its own client ID and secret from the same card; the exact callback address is shown beside the setup fields.

Slack uses the connected member only for searching and reading conversations they can already access. Posting uses the installed app bot and always pauses on a preview showing the destination and complete message. A workspace administrator may need to approve the app, and the bot must be allowed in the destination channel. After connecting, the same card can enable live Events API delivery: copy OpenBot's private request address into Slack, paste the app signing secret, and wait for Slack's signed challenge. See Slack's [OAuth v2 documentation](https://docs.slack.dev/authentication/installing-with-oauth), [message API](https://docs.slack.dev/reference/methods/chat.postMessage), and [Events API request URL guidance](https://docs.slack.dev/apis/events-api/using-http-request-urls/).

Notion's connection picker is the authority boundary: OpenBot can search and read only the pages the owner selected or later shared with the integration. Appending a heading or text to a page always waits for an exact preview approval. For live activity, copy OpenBot's private event address into a Notion webhook subscription, then copy Notion's received verification token back into the provider setup. See Notion's [OAuth guide](https://developers.notion.com/docs/authorization), [integration capabilities](https://developers.notion.com/reference/capabilities), and [webhook documentation](https://developers.notion.com/reference/webhooks).

Both connectors encrypt their OAuth credentials locally, expose separate read/write switches for every teammate, record a private activity trail, and invalidate active model sessions as soon as access is revoked. Managed public distribution still requires registering and reviewing each OAuth app with its provider.

Todoist is the simplest path: choose **Connect Todoist** and OpenBot registers a private local OAuth client through Todoist's official dynamic-registration endpoint. Teammates can read active tasks; creating a task always shows the exact title, notes, due phrase, and priority for approval first.

Dropbox uses an official read-only OAuth app with PKCE. A packaged release needs only `OPENBOT_DROPBOX_APP_KEY` for a one-click connection; a confidential client may also set `OPENBOT_DROPBOX_CLIENT_SECRET`. A self-hosted owner can enter the same values in OpenBot and add the displayed callback address to the Dropbox app. Teammates can search metadata and read bounded supported text or code files up to 1 MB; OpenBot cannot upload, move, share, or delete Dropbox content.

## Files on this Mac

Open **Control center** and enable **Files on this Mac** once for the studio. Every current and future teammate can then inspect visible folders inside the current user's home, including Desktop, Documents, and Downloads. Hidden entries, `Library`, aliases/symbolic links, and paths outside the home folder remain unavailable. Moving files still pauses for the owner to approve the exact plan.

Text reading is limited to supported files up to 500 KB. File organization can create destination folders and move regular files, but it cannot delete or overwrite. Every proposed batch move becomes a durable approval showing the number of files and destination folders before anything changes.

## Code projects

Open **Code projects** from the conversation header or Control center. Paste a GitHub repository link to clone it into `Documents/OpenBot Projects`, choose a suggested folder from `Documents/GitHub`, `Developer`, or `Projects`, or enter a specific project folder inside your home directory. Each teammate can be set to **Code + test**, **Read only**, or **No access**.

Coding teammates can inspect project instructions, create an isolated task branch, make focused atomic edits, inspect a bounded diff, run builds or tests in a disposable Docker container, and commit only explicitly named files. Every coding task receives its own Git worktree under OpenBot's private data directory, so multiple teammates can work on the same repository at once without switching branches or changing the user's main checkout. Commands run from that task workspace with networking disabled, a read-only container system, resource limits, dropped privileges, and masks over `.git`, `.env`, and other protected hidden paths.

After the task records passing checks, the coding teammate asks a different teammate to inspect the exact commit and bounded diff. The reviewer records either **Approved** or **Changes requested** with focused findings. OpenBot refuses to publish when independent approval is missing, changes were requested, or the branch changed after review. The branch is pushed and the GitHub pull request is opened only after the owner approves the exact publish action.

Every agent write creates a local restore point. Restore succeeds only while the file still matches that exact agent edit, so newer user or agent work is never overwritten. Disconnecting a project removes access but never deletes the user's files; managed clones also stay on disk.

## Bot computers and browsers

Terminal commands use a per-bot container with:

- only that bot's workspace mounted;
- the host user's unprivileged UID/GID;
- a read-only container root;
- all Linux capabilities dropped;
- `no-new-privileges`;
- PID, memory, and CPU limits; and
- an isolated temporary filesystem.

Web work uses a separate persistent Chrome profile per bot. Live Studio lets the owner watch and directly guide that browser when sign-in or judgment is needed. Password-like fields are masked from model snapshots, and takeover text is sent directly to the focused browser field rather than stored in chat or activity. Bot navigation rejects non-web schemes, credential-bearing URLs, cloud metadata endpoints, and private LAN addresses other than localhost test pages.

OpenBot does not silently fall back to running terminal commands on the host when Docker is unavailable.

## Automations

Open **Automations** to create scheduled work or choose a Calendar, Todoist, Dropbox, Slack, Notion, GitHub, or generic webhook trigger. Calendar triggers poll the connected primary calendar. Todoist triggers can react to added, updated, or completed tasks; Dropbox triggers watch changes below a selected folder. Slack triggers can filter mentions, messages, or reactions and one channel; Notion triggers can filter page, comment, or database activity and one entity ID. Connected-app triggers require the selected teammate's matching read permission and run while the chosen OpenBot host is online. Slack and Notion must also show **Live events ready** in Apps & Tools. GitHub and generic webhook cards show a signed endpoint plus a secret once; configure the sender with that secret, then rotate it from OpenBot whenever necessary.

Generic hooks use `X-OpenBot-Signature: sha256=<HMAC>` and an optional `X-OpenBot-Event-Id` for exact duplicate protection. GitHub hooks use GitHub's standard `X-Hub-Signature-256`, `X-GitHub-Delivery`, and `X-GitHub-Event` headers. An endpoint must be reachable by the sender, so a webhook from the public internet needs a trusted HTTPS tunnel or reverse proxy; never expose OpenBot's plain local HTTP port directly.

Every delivery is retained as a bounded, secret-redacted event receipt and treated as untrusted input. Duplicate IDs do not create a second run, bursts are limited, explicit tests warn that real tools and approvals are available, and three consecutive failures pause the automation. OpenBot also surfaces approval waits, missed schedules detected when it wakes, retryable failures, and linked results.

Each active job is claimed atomically and renews a short lease; a second OpenBot process cannot dispatch it. After a crash or update, an expired job returns to the queue with its task contract and approval state intact. On macOS, **Keep OpenBot running** installs an owner-visible LaunchAgent, but the Mac must remain awake. Private-host mode adds Docker restart policy and durable storage, allowing the same runner to continue when the Mac is unavailable. Its Home check can send opt-in alerts through registered Web Push or iPhone destinations, while the guided updater creates a backup and preserves a recoverable running image before replacement.

## Remote and phone access

The default service binds only to `127.0.0.1`. To build and expose it to a trusted private network:

```bash
npm run remote
```

A private access key is created at `.openbot/access.token` locally or the configured private data path. Non-local clients must sign in with it; the resulting cookie is HTTP-only and SameSite Strict, and private-host cookies are Secure behind the trusted Caddy proxy. Open **Control center → Phone remote** on a Mac-hosted studio to configure pairing. The built-in no-extra-app relay path requires an operator-hosted relay; it is not publicly deployed yet. An owner-managed private runner with HTTPS is a separate alternative. Pairing on local Wi-Fi does not prove cellular access. Never expose the plain HTTP app port directly to the public internet. [Away-access implementation and prerequisites](docs/QA_AWAY_ACCESS.md).

Installed web apps served from a secure HTTPS address can enable background notifications from Control center. Subscriptions stay in local SQLite, VAPID signing keys stay in a mode-0600 local file, notification payloads are short, and clicking one returns to the relevant conversation or automation. Plain HTTP remote addresses can show live in-app updates but cannot use standards-based Web Push.

The native iPhone app can register directly with APNs and receives short result and approval notifications with deep links. Release maintainers must create an Apple APNs `.p8` key and set `OPENBOT_APNS_TEAM_ID`, `OPENBOT_APNS_KEY_ID`, and `OPENBOT_APNS_PRIVATE_KEY_PATH` on the Mac host; the private key never enters the iPhone app or model context. The app and Share extension also require the `group.app.openbot.shared` App Group on the selected Apple development team. These Apple-owned signing and credential steps are required for a physical-device build; the checked-in simulator build verifies compilation and embedding but cannot prove production push delivery.

The native SwiftUI app lives in [`ios/`](ios/README.md). Generate its Xcode project with XcodeGen, select your Apple development team, and run it on iOS 17 or newer. It uses native conversation, teammate, progress, approval, Quick Look artifact, sharing, and settings views—not a web view. The access key is stored only in the iPhone Keychain and is never placed in a deep link. The installable web experience remains available when a native build is not installed.

Voice typing uses the browser or operating system speech-recognition service. OpenBot does not upload or store the audio itself, but the browser vendor may process it under its own policy.

## Owner-controlled data

Runtime data is excluded from Git:

```text
.openbot/
  openbot.sqlite
  attachments/
  access.token
  web-push.json
  keys/vault.key
  logs/
  computers/<bot>/browser/
  workspaces/<bot>/
    AGENTS.md
    CLAUDE.md
    .claude/skills/
    .opencode/tools/
    .opencode/skills/
```

## Architecture

The React client receives live state over server-sent events. The local Express service owns scheduling, event dispatch, job leases, recovery, notifications, approvals, usage, provider bindings, connectors, file ingestion, bot computers, and browsers. SQLite in WAL mode keeps conversations, runs, approvals, runner leadership, per-job claims, notification outbox/subscriptions, automation definitions, event receipts, alerts, memories, attachment analysis and revisions, provider ownership, encrypted connector credentials, per-bot connector and code-project access, connector audit events, code edits, agent messages, taught workflows, and dedupe keys. OpenCode and Claude Code are runtime adapters; OpenBot supplies the common isolated workspace, permissioned code-project harness, browser, memory, Google Workspace, GitHub, Slack, Notion, teamwork, automation, and approval tools.

The design borrows the strongest ideas from [Hermes Agent's architecture](https://hermes-agent.nousresearch.com/docs/developer-guide/architecture), [agent loop](https://hermes-agent.nousresearch.com/docs/developer-guide/agent-loop), [Bot Mode](https://hermes-agent.nousresearch.com/docs/user-guide/bot-mode), and [security model](https://hermes-agent.nousresearch.com/docs/user-guide/security): isolated profiles, observable execution, parallel tools, interruptible work, stable prompts, and layered boundaries.

## Project reports

- [First public beta checklist](docs/FIRST_PUBLIC_RELEASE.md)
- [Contributing and verification](CONTRIBUTING.md)
- [Private security reporting](SECURITY.md)
- [Milestones](docs/MILESTONES.md)
- [Security model](docs/SECURITY.md)
- [Workflow benchmark](docs/WORKFLOW_BENCHMARK.md)
- [Launch readiness and honest gaps](docs/LAUNCH_READINESS.md)
- [Product gap audit and next priorities](docs/PRODUCT_GAP_AUDIT.md)
- [Release roadmap](docs/RELEASE_ROADMAP.md)
- [Marketing capability catalog](docs/MARKETING_FEATURES.md)

## Current boundary

OpenBot controls its own private bot containers and Chrome profiles. Its code harness works only in project folders the owner explicitly connects; it is not unrestricted host shell access or a replacement for reviewing changes before shipping. Live takeover controls a teammate's isolated browser, not arbitrary macOS pixels. Skill import/export currently covers OpenBot's browser-oriented saved workflows; connector manifest v2 is an admission contract for reviewed integrations, not a public third-party executable marketplace. PDF and Office extraction is designed for understanding and preview—not fidelity-preserving editing—and image/audio/video understanding depends on the selected model accepting that medium. Scanned-document OCR and guaranteed offline voice transcription are not bundled; native speech capture prefers on-device recognition when Apple reports it available and otherwise uses the system speech service. Slack events cover subscribed mentions, messages, and reactions rather than complete Slack administration; Notion events cover page, comment, and database notifications rather than database editing or a general editor. Todoist support covers active-task reading, new-task creation, and activity-triggered routines rather than full project administration; Dropbox is deliberately read-only and supports bounded text/code reading plus change-triggered routines rather than arbitrary document conversion. On macOS, the owner can enable a bounded Accessibility bridge that lists apps, reads visible controls, opens apps, and pauses for approval before clicks, typing, or key presses; it is not unrestricted visual desktop control. A private runner provides powered-off execution and HTTPS ingress, but it is owner-operated infrastructure: the Docker socket is powerful, updates and backups remain the owner's responsibility, and there is one authoritative data location rather than live Mac/server synchronization. The native iPhone app still needs owner signing, an APNs key, and a physical-device check before App Store distribution. App Store distribution, organization administration, broad third-party connectors, and unrestricted visual desktop control remain future work.

## License

[MIT](LICENSE), with preserved [third-party notices](THIRD_PARTY_NOTICES.md). Provider accounts, tools and service marks retain their own terms. OpenBot is an independent project, not endorsed by Grok Bot, Cursor, Apple or the connected services.

# Release decision — 6 September 2026

## Decision

**Worth developing and showing to contributors: yes. Ready to announce this candidate as a finished Grok Bot replacement or a consumer Mac download: no.**

The native conversation-first direction is worth keeping. Do not start another redesign or add a new feature catalog. Close the release-provenance, task-attention and first-success gaps, then invite a small developer pilot. A supported beta and a public notarized Mac download are later, separate decisions.

This is a bounded product/release audit of the local 0.37.0 working tree, not a penetration test, full-history secret audit, clean-machine certification or head-to-head model benchmark. No release, announcement, account login, model task, permission change or external write was performed. Native forms were opened and cancelled without saving. Existing conversation content was inspected locally; private transcripts/screenshots are not included in this report.

## What the live UI comparison showed

Compared the running native Mac preview with the owner-approved conversation-first prototype after the Mac was unlocked. Inspected individual/group conversations, attachments, the contextual inspector, provider overview/selection, connected apps, team management, new-group cancellation, routines and new-routine cancellation. Also inspected the web UI served by the active 0.37.0 runner. This was a light-appearance Mac inspection; prior same-day iPhone light/dark Simulator evidence is separate.

**Keep:** the continuous neutral surface, colorful code-drawn mascots, simple searchable conversation list, open incoming text, dark outgoing bubbles, plain settings rows, real bundled service artwork and progressive routine editor. The former app-wide inspector button wall is gone. The inspected routes opened correctly and cancelled without creating records.

**Not an exact or complete polish sign-off:**

1. **Task attention is inconsistent (high priority).** The web UI displayed one item needing attention. A read-only host snapshot confirmed one failed run, zero pending approvals and zero uncertain actions. The native main sidebar offered no equivalent persistent failed-work signal. `DesktopStudioView.swift:97` counts only approvals/uncertain actions for notifications, and the sidebar row uses active runs before falling back to the latest message (`:173`). Web attention explicitly includes failures and routine alerts (`src/studio/Studio.tsx:451`). Fix the shared attention model and show a quiet, actionable failure state; do not add another dashboard. No claim is made that approvals were missing in this observed state.
2. **The result experience still reads like an agent log.** The actual transcripts contain progress narration mixed with the final answer, raw tool names in failure explanations and separate technical usage files. The prototype communicates a result and its next decision much more directly. Preserve an inspectable work log, but make the main transcript lead with the outcome, uncertainty and one next action. Historical messages alone do not establish current model quality.
3. **Connection labels overstate what the screen proves.** Native provider rows say “Available to your teammates” based on `connection.connected`; connector rows say “Ready” when connected, even when write access needs reconnection. Neither screen proves a successful model task or every supported action. Distinguish saved sign-in, last successful check, read-only access and expired permission. Do not remove the underlying permission checks.
4. **Secondary UI is still too small and inconsistent.** Several captions/actions use 10–12-point type, compact add buttons and stacked disclosures. Group creation still uses a gray input and outlined selectable cards. Settings is fixed at 980 × 660 while the root minimum is 900 × 600; smaller-window and accessibility testing remain open, not an observed clipping claim. Increase legibility and test keyboard/focus/large-text behavior without expanding the main navigation. The xAI entry currently uses an initial fallback rather than an authenticated brand asset.
5. **Web/native continuity is unfinished.** The active web app still uses different navigation, gray incoming-message surfaces and a different composer. The native pass did not migrate this client. The old development URL on port 4310 was not serving; the active runner on 4311 was healthy. That port observation is not a backend outage.

## Fresh checks and their limits

### Later local follow-up: outcome-first replies and packaged runner

The concatenated-progress defect is now corrected for provider-delimited new runs, with expandable work updates in all three clients and regression coverage for unfinished/error responses. A fresh native Release build has also been packaged with its runner and passed an isolated launch/shutdown check. Neither change retroactively changes historical messages or replaces the earlier preview being inspected. See [the exact result-flow and package evidence](QA_RESULT_FLOW.md). Source publication, independent clean-machine setup, visual Mac inspection, signing/distribution, hosted access and real-account pilots remain open.

The private security-report configuration gate below was subsequently closed: GitHub private vulnerability reporting was enabled and its API confirmed `enabled: true`. No test report was submitted, and release/merge permissions were unchanged. The original audit observations below remain dated evidence.

### Candidate follow-up: task attention and connection clarity

The local native code now shares one attention model across Mac and iPhone, combining selected-conversation and studio-wide runs without duplicate run IDs. Failed work, pending approvals (including approvals outside the run snapshot), uncertain actions and unresolved routine alerts are included. Both conversation lists expose **Needs you**; Activity opens the relevant conversation or routine settings. This navigation does not approve, retry or resolve anything. iPhone Activity navigation also opens the conversation, rather than returning to the list after selection. Notification changes only announce newly appearing items, not the removal of an older one.

Provider labels now distinguish saved credentials/sign-in from a tested model request; connected apps with missing write scope show **Read access connected**. No live-check timestamp or successful model execution is fabricated. The remaining result-log presentation, web/native visual continuity, packaging, publishing and pilot gates above remain open.

This follow-up is in the local candidate only, not an installed-app update or GitHub release. Mac build/unit checks pass; the latest rendered Mac follow-up is blocked because the desktop locked again. See the current verification entry in [native QA](QA_NATIVE_CONVERSATIONS.md).

| Check | Observed result | What it does not prove |
| --- | --- | --- |
| `npm run verify` | 459 application tests and five packaging transaction tests passed; native/source contracts, application and acceptance typechecks, production build passed | Real third-party accounts, native UI workflows, clean installation or competitor parity |
| `npm run test:provider-runtime` | Real OpenCode process reached a controlled endpoint and streamed the configured response; model ID and scoped key checked | Independent model reasoning, subscription eligibility or every advertised provider |
| Production dependency audit | `npm audit --omit=dev --audit-level=high`: zero reported vulnerabilities | No unknown vulnerabilities or complete dependency-license review |
| Public-source guard | Three guard tests and 231 indexed-file checks passed; the same bounded guard found no findings in 521 current nonignored files | Full Git history, every credential format, ignored owner data or a finalized source archive |
| Native evidence | Earlier same-day 29 Mac and 21 iPhone unit tests plus light/dark iPhone navigation tests passed; live Mac inspection completed now | Second-Mac install, physical-device delivery, every advanced view or complete accessibility coverage |
| Active runner | Local health reported online, version 0.37.0 | Always-on hosting, sleep recovery, end-to-end task success or cellular access |

The web build also reports an approximately 601 kB main JavaScript chunk (about 180 kB gzip). That warning is not a failed build, but startup should be measured on a modest device before a mobile-web performance claim.

Logs for this audit are local: `/tmp/openbot-release-audit-verify.log` and `/tmp/openbot-release-audit-runtime.log`. The native test evidence is recorded in [native QA](QA_NATIVE_CONVERSATIONS.md). Older clean-package, provider and workflow reports are dated observations, not fresh certification of this changed candidate. In particular, [provider QA](QA_PROVIDER_CHOICE.md) records four earlier live-model artifact/consultation examples, and [candidate QA](QA_BETA_CANDIDATE.md) records four live Spark runs against synthetic sources. These are useful small samples, not repeated real-account or head-to-head trials.

## Release blockers verified now

### Before promoting this candidate to contributors

- **Publish the actual reviewed candidate.** The public repository is already MIT-licensed and public, but `main` is commit `8dd62b0e139ca6cfbea66ef0129963b8b605cb70`, whose README says **0.27.0**. Local HEAD is `9550578` with 128 changed tracked paths and 216 untracked entries before this report. A plain clone does not reproduce the UI being demonstrated. Review and freeze the intended changes; do not blindly stage the accumulated tree.
- **Get candidate-specific CI.** The latest successful Verify run inspected was for `88b8de99eeb0f8afcda53a550177dc61ee1177dc`, not the current local candidate. Require both verification and browser acceptance on the chosen commit before tagging. Local source-pattern checks are not a successful GitHub run.
- **Provide a functioning private security-report channel.** GitHub reports private vulnerability reporting disabled. The public security document acknowledges this, but it must be resolved before inviting people to grant sensitive accounts.
- **Clarify merge authority.** Main protection requires `verify` and applies to admins. It requires zero approving reviews; push restrictions are null; the ruleset list is empty. The owner is the only collaborator returned now, but that is not an owner-only merge rule that survives adding write collaborators. Do not describe CODEOWNERS or the existing protection as that guarantee. Repository settings were not changed.
- **Use exact, current setup instructions and a scrubbed demo.** Show synthetic or explicitly approved demo data. Label this a Mac-first developer/source preview with iPhone preview status and a tested-provider matrix. Remove conflicting historical instructions from the supported path rather than presenting all historical QA as current.

### Before a supported beta or consumer download

- Close the failed-work visibility issue and make the primary result/recovery path consistent across clients.
- Repackage the final candidate. **The running redesigned preview has no embedded `OpenBotRuntime` and an ad-hoc signature with no Team Identifier.** It works with the existing local runner; sending this app alone to a new user is not a self-contained installation. Earlier packaged artifacts do not contain this final UI by implication.
- Validate setup, provider choice, a useful task, quit/reopen and backup/restore on a clean second Mac/user account. A clean-dependency install on the development Mac is useful but insufficient.
- Run supervised, explicitly authorized real-account pilots: browser sign-in and account verification; a two-source job; one quiet teammate consultation; decline with no side effect; one approved action with destination readback; one restart/recovery. Do not use personal production writes merely to get a green demo.
- Run a modest multi-day reliability pilot. Record successful outcomes, mistakes, user interventions, elapsed time and complete reported usage, including consultations. There is no measured basis for “better,” “cheaper,” or a parity percentage yet.
- For downloadable binaries, complete Developer ID/hardened-runtime/notarization/stapling and clean-Mac Gatekeeper checks. Source preview can precede this if clearly labeled. Production update delivery, public relay/cellular access and iPhone distribution remain separately scoped.

## What actually matters against Grok Bot

This comparison uses current official documentation checked on 6 September, not a hands-on Grok Bot benchmark. Vendor-described capabilities are not an independent reliability measurement. There is also an inconsistency in overview wording about per-Bot computers; the specific FAQ/computer documentation explicitly says one shared computer per user, so that is the comparison used here.

| User expectation | Grok Bot, as documented | OpenBot position and decision |
| --- | --- | --- |
| Hand off work and leave | Cloud execution persists when the laptop closes; clients sync | Local work needs an awake host; private hosting exists but is operator-managed. Do not advertise local OpenBot as equivalent always-on service. [FAQ](https://docs.x.ai/grok-bot/faq) |
| Install and get a first result | Packaged desktop clients, account sign-in and background computer setup | Mac-first source/development candidate with runtime and capability prerequisites. Reduce setup and certify one supported path before widening the matrix. [Getting started](https://docs.x.ai/grok-bot/get-started) |
| Work inside existing tools | Persistent shared browser sessions, takeover and structured connectors | Persistent per-teammate sessions, manual sign-in handoff, connectors and bounded Mac tools are implemented. Real site/account reliability remains a pilot gate; do not claim every website works. Isolation is an architectural choice with extra sign-in/handoff friction, not blanket security superiority. [Computer and apps](https://docs.x.ai/grok-bot/computer-and-apps) |
| Coordinate without supervising every message | Durable named Bots, group chats and asynchronous handoffs | Named teammates, groups and bounded private consultation exist; earlier small live trials are encouraging but slow. Show one clear final owner, preserve cancellation and measure repeat success. [Collaboration](https://docs.x.ai/grok-bot/chat-and-collaboration) |
| Repeat a successful process | Skills, demonstration and scheduled/event routines on cloud execution | Calendar/time-zone scheduling, event paths and portable/bundled skills exist. Soak, failure recovery and observed learning quality remain unproven at broad-release scale. [Skills and routines](https://docs.x.ai/grok-bot/skills-routines-and-automations) |
| Receive work ready to use | Documents, spreadsheets, decks and other previewable results | OpenBot has checked text/code and bounded document/spreadsheet paths, but not demonstrated broad output fidelity or repeated end-to-end delivery. Invest in three credible workflows, not more feature labels. [Files and results](https://docs.x.ai/grok-bot/files-and-results) |
| Control risk and ownership | Per-action decisions, model-based Auto Review and enterprise controls | OpenBot's owner rules are deterministic, not an equivalent independent review model; sensitive-action previews and host evidence are valuable bounded controls. MIT source, owner-selected hosting/providers and inspectable state are the differentiators—not an unsupported claim of stronger overall security. [Security](https://docs.x.ai/grok-bot/security) |

Community reports give useful hypotheses, not population statistics: one business user praised contextual follow-through while reporting browser/session and usage friction; another criticized usage/routing visibility. These support testing persistent sessions, predictable costs and completed outcomes. They do not prove Grok Bot is generally unreliable or OpenBot is cheaper. [Business user report](https://www.reddit.com/r/grok/comments/1vob5q2/grok_bot/), [usage report](https://www.reddit.com/r/grok/comments/1vv53op/grok_bot_usage/).

## Recommended first launch

Aim first at Mac-based developers and technically comfortable small teams who value controlling their source, host and AI connection. Do not initially promise frictionless setup for every nontechnical user or enterprise deployment parity.

1. Close candidate/CI/security-report gates and the main task-attention defect.
2. Ask 3–5 pilot users to complete the same three acceptance jobs: a source-backed document handoff, a tested repository repair with human review, and a supervised recurring workflow with recovery. Measure the result, not a “done” message.
3. Publish one short honest demo, exact prerequisites, known limits and the release commit. Expand the announcement only after pilot evidence supports the promise. Keep iPhone clearly preview-only.

### Announcement draft — not published

Use only after the candidate is actually published and the contributor gates above are closed:

> We're opening a developer preview of OpenBot: open-source AI teammates on a computer you control.
>
> Start with a conversation, choose a supported AI connection, and give teammates access to the tools their work needs. OpenBot brings together private browser sessions, routines, project work and review before supported sensitive actions—with a native Mac interface and playful, customizable characters.
>
> This is an early Mac-first preview, not a finished replacement for Grok Bot. Setup currently requires technical steps; local jobs need an awake host. iPhone is a companion preview. Providers have their own eligibility, costs and limits.
>
> We're looking for a small group of testers and contributors to help prove real workflows. The release notes will identify the tested commit, setup steps and known limitations.

The strongest positioning is **owner-controlled, provider-flexible teammates that return inspectable work**. Avoid “any subscription,” “free unlimited AI,” “works with every app,” “always on without setup,” “production ready,” or “better than Grok Bot” until those claims have specific evidence.

# OpenBot: a credible alternative, not a feature-count clone

Decision plan · 5 September 2026 · baseline: development checkout 0.35.0

**Status: proposed execution order, not completed milestones or a release claim.** This plan builds on the [current audit](COMPETITOR_RECHECK_2026-09-05.md), [public user-workflow research](SOCIAL_WORKFLOW_RESEARCH_2026-09-05.md), and recorded acceptance evidence. No authenticated Grok Bot head-to-head has been performed. Dates and test counts in older QA files describe those particular runs, not a fresh certification of the whole checkout.

**Implementation progress — 5 September:** delivery A's first slice is implemented: calendar/one-time schedules, shared host previews, legacy migration, atomic occurrence dispatch and one-run catch-up. Web/API and native build tests pass; the local preview was refreshed. Seven-day real-time soak and the remaining A/B gates stay open. [Evidence](QA_CALENDAR_ROUTINES.md).

**0.36 continuation:** B now collects owner-selected Slack/Notion/Todoist context, saves weekly reviews and tracks explicit local follow-ups on all clients. D now has a tested MCP OAuth/public-registration subset and provider-reported/partial/unavailable usage receipts. E now has an isolated, exact-commit command-experiment foundation with guarded files, repeated samples and failure/noise outcomes. [Verification and per-delivery remaining work](QA_0.36.md). None of these changes close the live-account, reference-browser, seven-day-soak, full website-regression, independent-provider or distribution gates by themselves.

**0.37 continuation:** B gains opt-in, deduplicated in-app suggestion digests. C fixes teaching/task login discontinuity and newly recorded private inputs; controlled support/social browser checks cover restart, logout, bot isolation, changed controls and a second input. D gains six native/web recipes, real safe-example buttons, strict configuration-only imports and protected memory with provenance, expiry and stale-edit checks. E gains an actual Chromium fixture acceptance loop with functional/selected accessibility invariants and improvable/unchanged/broken cases. [Evidence and still-open gates](QA_0.37.md). A recorded demonstration is still a draft; a source-backed fixture is not real-account proof, and browser command timings are not field Web Vitals.

## 1. Product decision

**Locked-host continuation:** the C scheduling-validation gap now has a server-enforced gate for explicit saved `/skill` references, two distinct owner-reviewed real checks, revision/setup/account binding, expiry and queued-job rechecks, with web/Mac/iPhone controls. [Acceptance and limitations](QA_WORKFLOW_CHECKS.md). This is supervised owner evidence, not automatic correctness certification or completion of the three real reference workflows. No source-page prose or arbitrary natural-language reference is treated as a structural skill identifier.

Start with **independent professionals and small technical teams using a Mac**: people who want an assistant for daily work and project execution, but want control over models, data and automation. This is a recommended initial audience, not a claim that a multi-user enterprise product is ready.

Proposed promise:

> An AI team you own: choose its models, connect your work, and get finished results you can check.

Match the essential experience—dependable delegation, connected context, browser work and useful deliverables. Differentiate through provider choice, owner-controlled execution and transparent results. We do not need every competitor feature to be a useful alternative for this audience. We cannot compensate for lost work, incorrect results, unsafe actions or broken setup by adding other features.

Cursor currently documents managed model selection without a customer-facing picker and cloud-only hosting. These give us specific positioning opportunities; they do not establish that OpenBot is more capable, cheaper, or more secure. Grok Bot also supports local-machine actions, approvals and source-linked work: those are not unique OpenBot inventions. [Official security and hosting documentation](https://cursor.com/docs/grok-bot/security).

## 2. Evidence-based starting point

| Area | What we can build on | What is still missing or unproven |
|---|---|---|
| Daily work | Saved morning, inbox and meeting reports; references; unsent drafts; Google and bounded Mac Mail/Calendar sources | Checked report collector has no Slack/Notion sources, despite separate connectors existing; current report reasoning evidence uses synthetic account responses |
| Automation | Durable jobs, interval/event routines, attention, restart handling; public page-change monitoring | Calendar-time scheduling, time zones and DST are not represented by the interval-only Routine contract; prolonged unattended operation is not proven |
| Teamwork | Private consultation, current-source attachment verification, one coordinator answer | Broader multi-step reliability and cost across models; a small successful consultation is not proof of general teamwork quality |
| Computer work | Isolated browsers, takeover, teaching, local file tools and bounded Mac app reading | Repeated authenticated real-app workflows, session recovery and general desktop operation; visible app text is not complete account coverage |
| Project work | Isolated Git worktrees, exact-commit checks, checked small bug-fix and spreadsheet examples | Representative repositories, larger document fidelity and measured performance improvement loops |
| Extensibility | Reviewed built-in methods, text-skill subset, limited HTTP MCP, editable private notes | MCP OAuth, broader safe compatibility, full workflow recipes and stronger long-lived retrieval |
| Delivery | Native Mac/iPhone clients, local preview packaging, private-host and pairing foundations | Signed distribution and updates, clean second-machine setup, hosted relay and real cellular/push proof |

Evidence: [checked outcomes](QA_CHECKED_OUTCOMES.md), [page-watch checks](QA_PAGE_WATCH.md), [extension boundaries](PLUGIN_INTEROPERABILITY.md), [launch readiness](LAUNCH_READINESS.md). These distinguish automated tests, synthetic live-model fixtures, actual provider calls and device tests.

Two directly checked implementation gaps: `src/shared/routines.ts` / `src/shared/types.ts` describe elapsed intervals, not weekday/time-zone schedules; `src/shared/work-reports.ts` and `src/server/work-reports.ts` restrict checked report sources to Google and Apple mail/calendar. An app appearing in the connection catalog does not mean it contributes to a checked brief.

## 3. Delivery order and acceptance gates

Do not start another large capability simply because the previous one has a visible screen. Each delivery includes backend behavior, supported native/web controls, recovery, outcome evidence and truthful documentation. Preserve existing data and provider selections. Use isolated branches and merge only when authorized.

### A — Make delegation dependable

**Outcome:** “Every weekday at 8 AM, prepare my brief” runs at the intended time, survives restarts, and tells the owner when it could not run.

Implement:

- A shared schedule contract for existing intervals, one-time requests, and daily/weekly calendar times with an explicit IANA time zone. Preview the next three runs before saving.
- Defined DST behavior: a missing local time runs at the next valid time that day; a repeated local time runs once. Time-zone travel does not silently change a saved schedule.
- Backward-compatible migration preserving existing next-run dates; one durable occurrence identity across claims/restarts. Offer one catch-up run after downtime, not a burst of every missed occurrence.
- Verify stop, pause, reconnect, provider failure, permission revocation and uncertain writes through the complete pipeline. Never replay a possibly completed external write without reconciliation or owner review.
- Fresh capability checks before a bot says an app is disconnected. A missing scope, expired login and an unavailable source must produce different, understandable recovery actions.

**Gate:** deterministic DST, restart, concurrent-claim, migration and recovery tests; the same next-run preview on Mac/web/iPhone; a seven-day awake-host soak with injected outages and no duplicate dispatch; no silent loss of an occurrence. Host outage must be visible, not described as successful execution.

**Starting points:** shared routines/types, server persistence/runner, automation editors, connection/session invalidation. Do not replace the existing durable job system.

### B — Finish the daily-work loop

**Outcome:** one useful brief combines inbox, calendar, relevant Slack/Notion context and outstanding actions; the owner can review a draft or create an approved follow-up.

Implement:

- Extend the checked source/coverage contract to the existing Slack and Notion connectors, then Todoist. Gather only owner-selected channels/pages/projects and relevant time windows.
- Preserve source IDs, timestamps, account identity, truncation and missing-source reasons. Prevent connector-account changes or revoked grants from leaving stale context in a new report.
- Prioritize decisions and follow-ups, not long activity summaries. Attach evidence to each actionable claim; distinguish facts, suggestions and unsent drafts.
- Add a weekly-review recipe on the same collection/result pipeline. Store an approved follow-up as an explicit tracked item, not a promise buried in chat.
- Proactive suggestions are opt-in, deduplicated and digestible; they do not send messages or silently create new automations.

**Gate:** real consented test-account flows for Google, Slack and Notion plus synthetic edge cases; missing or revoked sources are disclosed; every reported action links to evidence; drafts remain unsent; one final response even when a consultant is used. Do not claim “complete inbox coverage” from bounded search results.

**Starting points:** `work-reports.ts`, `meeting-sources.ts`, `work-source-router.ts`, existing connectors and action ledger. Reuse adapters rather than build a second connection system.

### C — Prove browser and Mac-app fallback

**Outcome:** when no suitable connector exists, OpenBot can complete selected logged-in workflows with a recoverable owner handoff.

Implement and test three reference workflows:

1. Read a selected support portal and produce a linked triage report.
2. Read a selected social account's relevant activity and prepare an unsent reply queue.
3. Gather meeting context from a selected Mac application when its connector is unavailable.

- Prefer supported connectors, then explicitly permissioned browser/app access. Show which route supplied the information and its coverage limits.
- Owner-controlled login and persistent profiles; never infer access from Codex's separate signed-in Chrome session. Handle expired sessions, changed pages, app permission prompts and takeover/resume.
- Turn a successful taught workflow into a draft with prerequisites, variable inputs, failure rules and approval boundaries. Validate it on a different input before scheduling it.
- Use fresh observations, scoped actions and explicit external-write review. Unknown UI state should stop or request takeover, not continue clicking speculatively.

**Gate:** repeated runs across the three workflows, including logout/restart/layout-change failures; saved artifacts and source evidence; no credentials in chat; no accidental sends. A read-only Mac snapshot must not be labelled full access to all apps.

**Boundary:** universal desktop automation and every authenticated social site remain unsupported claims. Service access restrictions and human verification still apply.

### D — Productize the reasons to choose OpenBot

**Outcome:** a new user selects their provider, gets a useful workflow running, and can share its recipe without sharing private data.

Implement:

- A tested provider capability matrix: tools, files, images, usage reporting and recovery. Run a small real connection test after sign-in. Saved credentials alone must never produce “Ready.”
- Explicit model selection and supported, independently authorized subscription paths. Unsupported account plans get clear guidance. No automatic paid fallback or promise that every subscription works.
- A per-job ledger separating provider-reported usage, cached/reasoning categories, estimates and unavailable values. Shared consultation budgets; deterministic collection/calculation and unchanged checks before model calls.
- Five maintained starter recipes: daily brief, inbox follow-ups, meeting preparation, source-change digest and project bug fix. Each has required connections, output expectations, a safe test input and a test button.
- Versioned export/import of recipe configuration only. Exclude credentials, browser state, conversation history, private memory, attachments and private identifiers; preview permissions and validate imports.
- Extend MCP interoperability incrementally: independently authenticated HTTP OAuth first, with consent/revocation/schema-change tests. Continue rejecting unsupported scripts and private marketplace logins. See [interoperability boundaries](PLUGIN_INTEROPERABILITY.md).
- Improve private memory around source, relevance, expiry and user corrections. Test conflicting preferences, deletions and bot separation before considering automatic semantic consolidation.

**Gate:** two independently supported provider paths finish the core workflow set; disconnect/reconnect does not lose work; no unapproved fallback; recipe round-trips contain no private fixture data; built-in recipes work without manual skill imports. A connector is supported only after discovery, authentication, permissions, outcome and revocation all pass.

### E — Add one distinctive high-value workflow

**Recommended bet:** a measured project-improvement loop, rather than simultaneously building a video editor, CRM and universal office suite.

**Outcome:** “Improve this site's performance without breaking it” produces a tested change and an honest before/after report—or concludes that no reliable improvement was found.

- Extend the existing isolated coding path with a reproducible baseline, multiple measurements under fixed conditions, exact-commit attribution and functional/accessibility regression checks.
- Use a bounded experiment budget. Separate measured gains from noise and refuse to call a faster broken page an improvement.
- Keep unsuccessful experiments out of the owner's checkout; show the diff, evidence and a reviewable proposed change. Publication remains separately approved.

**Gate:** representative fixture projects with both improvable and non-improvable cases; repeated timing samples, untouched owner checkout, passing regression checks and no false success on a deliberately broken candidate.

This is a hypothesis grounded in reported “Speedlab” use, not proof we outperform it. Prefer this bet for the initial technical audience. If pilot users consistently value document or media work more, replace this bet with one bounded workflow; do not add all three. [User research and primary post](SOCIAL_WORKFLOW_RESEARCH_2026-09-05.md).

### F — Make it installable and prove the product

**Outcome:** someone other than the developer installs OpenBot and completes useful work without terminal support.

- Consolidate the development changes; verify migrations and recovery backups; sign/notarize Mac distribution, test the update/rollback path and install on a clean second Mac.
- Verify native Mac/iPhone consistency for setup, jobs, approvals, files and interrupted connections. Fix usability blockers, accessibility and layout overflow; defer a full rebrand.
- Run a small supervised pilot, collect failed outcomes and fix the common failure paths before broad launch.
- Keep relay deployment deferred as requested. Before advertising away access, deploy persistent relay infrastructure and verify QR pairing, revoked devices, reconnect and real cellular access. Simulator networking cannot prove cellular behavior.
- Keep “phone can reach the Mac” separate from “jobs run while the Mac is off.” The latter needs an available private host or a managed execution service, not just a relay.

**Gate:** the evaluation below passes, clean install/update/restore passes, documentation matches shipped behavior, and no known data-loss or unauthorized-action defect remains. A local beta may ship with remote/cloud limitations stated prominently; it must not be advertised as unattended cloud parity.

## 4. What we deliberately do not chase first

| Expensive gap | Near-term decision | Honest consequence |
|---|---|---|
| Managed always-on computer fleet | Retain local/private-host choice; evaluate a managed tier after pilot demand and operating-cost review | We cannot match zero-setup, laptop-off operation yet |
| Every marketplace/plugin | Support documented open formats and selected authenticated MCP services, with reviewed recipes | No blanket Hermes/Grok Bot marketplace compatibility |
| Every desktop app | Prove a small set of connector/browser/Mac fallback workflows and expand from failures/demand | Some apps require manual takeover or remain unsupported |
| Full Office fidelity and automated video production | Keep reliable bounded exports; select one later vertical based on pilots | Not an arbitrary workbook editor or finished media suite |
| Enterprise/Windows breadth | Finish dependable Mac-first personal use; keep architectural portability | Not an enterprise-certified or generally distributed Windows replacement |

These are explicit scope choices, not gaps quietly relabelled as completed. Provider control and openness can make us preferable for a segment, but they do not erase these differences.

## 5. Proof, usage and release discipline

Maintain one outcome scoreboard instead of adding more unverified capability lists:

| Workflow family | Independent success check |
|---|---|
| Daily brief | Current scoped sources, supported claims, clear missing coverage and useful priorities |
| Inbox/meeting follow-up | Correct participants/context, linked evidence, unsent draft and approved action handling |
| Monitoring/routines | Correct occurrence, restart/deduplication, no model call on unchanged supported pages |
| Authenticated browser/app task | Correct source/result, recoverable login failure, preserved permission boundaries |
| Project repair | Reproduction, isolated diff, exact tested commit and passing original checks |
| Spreadsheet reconciliation | Independent exact values, preserved originals, safely opened export and source-correct review |

Proposed release targets—not achieved rates or statistical guarantees:

- Final frozen candidate: 60 declared live runs, ten per workflow family, split across two supported provider paths. Include held-out inputs and failure cases. Report denominators, first-attempt success, human interventions, retries, elapsed time and usage; never count only the final successful rerun.
- At least 90% of ordinary in-scope tasks complete correctly without a developer repair, with no family below 80%. Fault-injection cases must stop/recover as specified. No known unauthorized external action, secret leak, duplicate write or silent data-loss defect is acceptable, regardless of averages.
- Five pilot users for seven days; at least four complete provider setup and a first useful supported result without developer intervention. Record time-to-first-result and support needs, not just satisfaction comments. This is an early usability signal, not market validation.
- Repeated samples of calendar routines and browser/session recovery, plus explicit tests for rejected/revoked permissions and malicious source instructions.
- Publish a Grok Bot comparison only after running the same permitted tasks/inputs and grading artifacts with the same rubric. Until then describe supported workflows and positioning, not superiority percentages.

Use deterministic tests on every relevant change. Start live-model checks with small changed-path samples; expand after they pass. Use the owner's selected Spark 1.3 test connection if still available, never as a product default. Add the second provider for compatibility coverage only when valid access is available; leave the gate open otherwise. Do not retry an unchanged failing prompt indefinitely, launch consultants for every simple task, or add polling model calls where deterministic checks suffice.

No fixed completion date is credible before a representative baseline and the authenticated-browser spike. Estimate each delivery after its first bounded acceptance case; track blocked dependencies separately from code work. Signing credentials, test-account consent, relay hosting and additional provider access must be explicitly available, not assumed from code existing.

For each actual version release, update README, changelog/marketing inventory and launch status together. Separate **verified now**, **limited/beta**, and **planned**. This planning change does not bump the app version.

## First implementation slice

Start with **A: calendar-time scheduling plus durable occurrence/recovery tests**, then **B: Slack/Notion-backed daily briefs**. These close identifiable daily-productivity gaps using existing infrastructure. Keep authenticated browser work as the next risk-reduction investigation, and defer the performance bet until the core daily workflows are dependable.

Success is not “we added as many buttons as Grok Bot.” It is that the intended user repeatedly delegates real work, receives a correct reviewable result, understands its limits, and has a concrete reason to choose OpenBot.

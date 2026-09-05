# OpenBot: product audit and alternative strategy

Audit date: 4 September 2026. Baseline: 0.28.0, commit `88b8de9`. Remediation: **0.29.0 development branch**, not a published release.

Follow-up, 5 September 2026: 0.34 adds a genuine SwiftUI/AppKit macOS client with native conversations, files, Work, Live Studio, approvals, and crash-recovery decisions; it does not embed the web app. 0.33's durable action ledger, 0.32's native source-backed jobs, 0.31's reports and commit-bound code checks, and 0.30's execution/usage safeguards remain in place. See [current desktop validation](QA_0.34.md). This closes the native Mac client gap; it does not create zero-setup signed distribution, a bundled runner, Windows support, universal provider-level exactly-once behavior, the two-model repeated acceptance gate, physical-device/cellular validation, or the remaining isolation milestones.

## Verdict

OpenBot is a substantial prototype with useful local-first foundations, not yet a dependable, general-purpose Grok Bot replacement. Its largest gap is **reliable completion with low setup effort**, not the number of buttons or mascots. Earlier documentation treated source presence, fixture tests, historical demos, and model-reported checks too interchangeably. Those are different levels of evidence.

The product should be an open, owner-controlled **work system**: one request becomes a useful artifact or a reviewed action, can survive interruptions, and can continue from a phone. Keep the playful teammates; compete on outcomes, portability, and control. Do not copy another product's identity or claim universal subscription compatibility.

Scope: inspected orchestration, provider configuration, tool boundaries, persistence, web/native surfaces, deployment, tests and release claims; exercised the local application; consulted current competitor documentation and individual user reports. No authenticated head-to-head Grok Bot run, physical-device test, external penetration test, or real VPS deployment was performed. This is a prioritized engineering audit, not a security certification.

## What Grok Bot actually offers

Cursor documents a managed persistent computer, cloud routines, messaging and steering, skills, artifacts, plugin references, and parallel work. Bots within an account share its computer and sign-ins; per-bot screens are not separate security boundaries. Its main advantage is having these parts operated together for the user. OpenBot has related primitives, but assembling and maintaining them is still the owner's job. [Work with Grok Bot](https://cursor.com/docs/grok-bot/work).

Its published use cases center on source-backed deliverables: operational digests, expense reconciliation, research, and bug reproduction, with consequential changes reviewed. That is a better comparison target than avatar similarity or a connector count. [Grok Bot use cases](https://cursor.com/docs/grok-bot/use-cases).

Enterprise adds identity and policy administration that this single-owner application does not implement. These controls are not all available on every Cursor plan. [Teams and Enterprise](https://cursor.com/docs/grok-bot/teams).

Individual users describe useful recurring inbox/calendar summaries, invoice filing, research and alerts, but also consumption limits. Other reports describe timeouts, forgotten work and formulaic writing. These are **anecdotes, not measured failure rates**; they suggest test cases, not grounds to declare OpenBot better. [Workflow reports](https://www.reddit.com/r/cursor/comments/1vvx2fg/is_grok_bot_worth_it/), [critical review](https://www.reddit.com/r/cursor/comments/1vxjipg/grok_bot_review/).

## Concrete weak points and “AI slop”

| Priority | Baseline evidence | User impact | Remediation / remaining work |
|---|---|---|---|
| P0 | `shared/presentation.ts` replaced old workspace/routine refusals and teamwork receipts with invented commitments. Tests asserted these substitutions. | The visible conversation did not reliably represent what happened. | Removed semantic rewriting; regressions now preserve failures, technical text and one-way receipts exactly. Improve wording at generation and structured-activity level. |
| P0 | `server/safety.ts` checked a browser selector for words such as “send”; `#primary` bypassed that heuristic. | A generic selector could trigger an unreviewed external action. | Inspect the actual control, review ambiguous clicks, bind approval to the observed page/control and reject changed targets. Still not an adversarial browser sandbox. |
| P1 | Custom provider form had no endpoint, protocol or models. Unknown key presets exposed unrelated catalogue models. | “Bring your own provider” could be a saved secret with no usable route. | Typed endpoint/protocol/model configuration, loopback local models, connection-specific runtime config and model validation. Real OpenCode transport fixture included. Custom tool support still depends on the provider/model. |
| P1 | API connections were “ready” just because a secret existed. Sign-in assumed OAuth method 0 and did not finish automatic callbacks. | False readiness and sign-in flows that could stay waiting. | Separate “saved, not tested” from a discovered sign-in; select an advertised OAuth method and complete auto callbacks. Real subscription consent remains account-dependent, not certified by mock tests. |
| P1 | Provider API accepted arbitrary environment variable names. | A key form could inject process configuration rather than a model credential. | Restrict legacy names to reviewed API presets; custom keys use a fixed environment slot. |
| P1 | `opencode.ts` replaced usage on each step instead of accumulating it. | Multi-tool jobs underreported usage and weakened budget visibility. | Sum steps, deduplicate identified events, handle Claude cumulative totals, reject invalid numbers. 0.30 checkpoints and enforces reported usage while running; reporting delays still prevent an exact hard billing cap. |
| P1 | Every generated tool schema was exposed, including disconnected apps and disabled browser/computer access. | Simple jobs carried irrelevant tool context and offered unavailable actions. | Build capability-aware tool availability for both runtimes. Backend grant checks remain authoritative; context filtering is not a new security boundary. |
| P1 | Background PATH missed standard user-installed CLIs; every settings poll launched repeated probes. | “App missing” despite installation; unnecessary latency and processes. | Discover common install directories, coalesce/cache probes, bound discovery output/time and invalidate after changed connections/login state. |
| P1 | `task_verify` accepts model-supplied checks; UI labelled them “Finished and checked.” | A confident model could look like an independent verifier. | Label the receipt “Checks reported by teammate.” Next: evidence-backed file, test and external-action oracles. A second model review is not an independent deterministic test. |
| P1 | Pre-spawn failures and budget rejection did not share a child failure with its coordinator. | A resumed coordinator could lack the reason a consultation failed. | Route startup failures through a private failure outcome and resume the coordinator; regression checks no second public reply. |
| P1 | `App.tsx` was ~9,500 lines; `styles.css` ~10,900, including repeated settings/hero overrides. | Design drift, regressions, difficult maintenance and large initial bundles. | Extract the provider screen and scoped styles; remove its obsolete rules. Continue module-by-module, not another appended global CSS layer. |
| P1 | Sheets lacked dialog semantics, focus containment and restoration. The 0.34 Mac app now covers account/API/local-model setup, safe editing/removal/assignment, common app connections/permissions, portable skill management including immutable history and rollback, code-project grants/review/recovery, and capability controls. Self-hosted OAuth/event setup, interactive skill teaching, and some advanced settings remain web/host-only. | Keyboard access and cross-platform completeness still lag the visual promise in advanced administration. | Complete those advanced native paths only after fresh-user runner packaging; keep behavior tests and explicit authority boundaries for every mutation. |
| P1 | Release scripts use many source-text assertions; benchmark rows mixed fixtures and historical demonstrations. | Green checks were easy to overinterpret as product reliability. | Explicit evidence labels, executable real-runtime transport test, opt-in live-model workflow oracles. Source checks are smoke checks, not behavior certification. |

### High-risk boundaries still open

- Host model processes can inherit runtime-level configuration, plugins and account access. Per-bot workspaces and filtered environment variables do **not** constitute a complete process/credential sandbox.
- Bot Docker terminals retain outbound network access. Command-word detection cannot reliably classify arbitrary programs. Do not promise that every possible external write is intercepted.
- Browser URL validation is lexical, not a full DNS-resolution/redirect/subresource egress policy. Loopback is intentionally permitted. Private-network isolation needs dedicated enforcement and adversarial tests.
- Browser approval fingerprints detect changed URL/control metadata, not arbitrary changes in nearby form data or all page scripts. Old approvals without a fingerprint now require renewed inspection.
- 0.30 adds active-time, idle, step, output and reported-token enforcement. Usage is checkpointed while running. Unreported in-flight usage can overshoot; individual child runs do not share a whole-job cap. 0.33 records and single-claims approved actions, then stops for human reconciliation after an interrupted remote call. This prevents blind local replay but is not provider-level exactly-once delivery; automatic reconciliation still needs a stable provider identifier or safe lookup contract.
- Coding checks use a constrained Linux toolchain. A simple JavaScript fixture does not establish support for arbitrary native dependencies, Python toolchains, mobile builds or large repositories.

These are blockers to advertising unattended, unrestricted computer autonomy. Expanding permissions would hide the gap, not close it.

## Capability comparison: present, partial, missing

| Outcome | OpenBot evidence / limitation | Next acceptance gate |
|---|---|---|
| Persistent assistant and private consultation | Durable data and bounded coordinator/child orchestration exist. Quality depends on the model; synthetic tests are not business-work evidence. | Repeated real tasks produce one sourced answer after actual consultation; child failures remain visible. |
| Bring your own models | Two runtimes; account-specific sign-in; 0.29 adds custom Chat Completions, Responses and Messages configurations. Not every subscription is eligible. | Provider contract suite plus real tool-use task per supported runtime; clear unsupported states and reconnect tests. |
| Morning brief / inbox triage | Source-backed web and native starters, bounded snapshots, saved reports, and unsent drafts exist. End-to-end account setup, source freshness, and repeated two-model evidence remain uneven. | Fresh inbox + calendar + task inputs produce a ranked digest with source links, no duplicates and no unsent message marked sent. |
| Invoice / document work | Bounded extraction and artifact revisions exist; OCR, transcription and layout-preserving editing are incomplete. | Mixed receipt fixtures, exact reconciled totals, missing-data flags, editable workbook and rendered visual review. |
| Browser/admin work | Persistent profiles, readable pages, owner takeover and browser skills exist. General visual app control is limited. | Ten controlled site workflows, changed selectors, login expiry and stopped actions; zero unauthorized mutations. |
| Engineering work | Worktrees, project grants, diffs and reviews exist. General dependency provisioning and reproducible builds are incomplete. | Fix a real fixture bug in separate JS and Python projects; run independent tests; preserve the original checkout. |
| Laptop closed / phone away | Private-host source and health/transfer tooling exist, native Work can start the three dependable jobs, and approved actions now stop for reconciliation instead of replaying after an uncertain restart. A macOS LaunchAgent can protect the source runner, but locked-login startup from a protected Documents checkout is not a distributable architecture. No managed service; packaged runner installation and physical APNs/cellular proof are incomplete. | Fresh-host install from an unprotected signed package, restart/restore, Wi-Fi-to-cellular continuity and physical push delivery with an owner-configured host. |
| Community / team ecosystem | MIT source and portable browser skills exist. No reviewed executable marketplace, multi-user tenancy, SSO or offboarding. | Published extension contract, contributor setup/CI, compatibility matrix; later design tenancy before organization claims. |

## Different in useful ways

These are design advantages to prove, not performance wins already measured:

1. **Portable ownership:** move data and readable, versioned skills between machines without moving to a proprietary service. Include tested recovery and clear export contents.
2. **Model choice with honest cost:** mix local, API and permitted subscription runtimes; show capabilities and measured usage. Never silently fall back to a paid model or pool somebody else's account.
3. **One answer, inspectable work:** private consultation, linked sources, files and actual tool outcomes. Technical internals can be collapsed; history must not be rewritten.
4. **Scoped access instead of one shared account soup:** separate browser profiles and explicit app/project grants. Complete the runtime/egress boundary before claiming security isolation.
5. **Recoverable actions:** preview changes, retain revisions, single-claim approved work, and ask the owner to reconcile uncertain external results. Next add provider-specific automatic reconciliation where a stable remote identifier exists. A trustworthy stop/resume is more valuable than another integration logo.

OpenCode's provider documentation distinguishes account credentials from provider configuration and describes local/compatible endpoints; OpenBot now reflects that distinction rather than equating a key with an integration. [OpenCode providers](https://opencode.ai/docs/providers/).

The supplied `t3code/docs/internals/providers.md` offers a useful architectural reference: validated runtime drivers, instance registries and event ingestion rather than provider-specific branches throughout orchestration. Adopt that separation incrementally; do not import its product wholesale.

Hermes' computer-use documentation suggests a next research track: application-scoped observations, numbered targets and bounded screenshot retention. Its backend and platform constraints are explicit. OpenBot should adopt the discipline of observe → act → verify, not just add a screenshot button. [Hermes computer use](https://hermes-agent.nousresearch.com/docs/user-guide/features/computer-use).

## Design direction

Calm work surface, playful teammates. Warm neutral canvas, readable graphite text, one restrained violet action colour, consistent 8/12/16/24 spacing and hairline separation. Animation belongs to small independently moving characters, not every card. Preserve colour controls, blinks, expression states and reduced-motion support.

Use three primary destinations: **Conversations**, **Work**, **Settings**. Keep model setup, host maintenance and permissions out of the everyday message flow. Prefer a clear result card to an oversized chat bubble full of process narration. Avoid sales slogans and gradient hero banners inside settings. Show one useful next action for each error; put technical detail behind disclosure without hiding the original failure.

The new connection panel is the first reference implementation: grouped account rows, API/local setup, real provider marks, explicit saved status, restrained mascot, accessible fields and mobile containment. This is **not** a claim that every existing web/native screen has been redesigned.

## Ordered delivery plan

| Milestone | Deliverable | Done only when |
|---|---|---|
| M1 · Trust and usable connections | 0.29 foundation fixes above; evidence inventory; compact settings reference | Regression tests, actual runtime transport, responsive/keyboard QA and honest documentation pass. |
| M2 · Three dependable jobs | Morning brief, inbox-to-review queue, engineering bug fix | Fresh setup; 10 runs per workflow across two supported model classes; source/artifact oracles; latency/usage/human interventions reported; failures retained. |
| M3 · Safe unattended execution | 0.33 adds the recoverable external-action ledger; runtime/plugin isolation, network policy, and provider-specific reconciliation remain | Adversarial fixtures; worker crash at each action stage; no duplicate effect or cross-bot credential access. |
| M4 · Daily-use web + native parity | Shared terminology, result/approval states, accessible controls; full provider management on iPhone | Desktop + narrow web + Dynamic Type/VoiceOver + physical-device tests; shared protocol fixtures; no missing core controls. |
| M5 · Setup and always-on delivery | Guided runtime/connector/host checks, signed distribution and restore guide | New user reaches first useful result without developer tools; fresh-host restore and cellular handoff tested. |
| M6 · Broader open ecosystem | Reviewed adapters/MCP admission, document engines, community contribution fixtures | Each new capability includes permissions, lifecycle, reconnect/failure tests and reproducible outcome evidence. |

Do not add another connector until at least one complete workflow using existing connectors meets M2. Do not call the beta launch-ready because its feature checklist is long. Maintain README and marketing qualifiers with every version.

## Evidence commands

- `npm run verify`: unit/integration fixtures, TypeScript, build and source-contract smoke checks; it is not a competitor benchmark or a physical iPhone test.
- `npm run test:provider-runtime`: installed OpenCode against a disposable local model endpoint. Checks real transport, scoped credentials, model IDs and streamed output. No real account usage.
- `npm run test:productivity-runtime`: installed OpenCode, generated tools, report validation/storage and automatic result attachment against scripted local model replies and synthetic app data. Integration evidence, not a model reasoning score.
- `OPENBOT_BENCHMARK_MODEL=opencode/<model-id> npm run benchmark:workflows`: explicit live-model allowance usage, isolated database, source-to-artifact and consultation checks with independent oracles. Two bounded workflows do not establish broad parity.

See [0.29 validation record](QA_0.29.md) for results and remaining release gates. Historical demo claims are retained separately in [Workflow Benchmark](WORKFLOW_BENCHMARK.md), not promoted to current head-to-head results.

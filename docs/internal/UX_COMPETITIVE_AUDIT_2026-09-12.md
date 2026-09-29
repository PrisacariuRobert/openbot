# OpenBot: user-workflow and competitive audit

12 September 2026. Completed bounded audit of the workflows below. No application fixes or public announcements are part of this audit.

## Decision in brief

OpenBot has enough substance to recruit a small, explicitly supervised design-partner group. It does not yet have the evidence for a broad, dependable consumer-agent launch or an overall superiority claim against Grok Bot or Hermes Bot Mode. The urgent gap is not another roster of capabilities: it is reliably converting a request into useful work with little intervention.

Public visibility and general availability are different milestones. Start showing honest, reproducible successes and inviting feedback before full parity; do not market unfinished integrations as completed workflows.

## Method and boundaries

- Requests were typed into the real OpenBot web application at `http://127.0.0.1:4311/?thread=bot-pixel`. Approvals, teammate review and navigation were exercised through its UI. The auditor did not operate Todoist/Notion/Slack on the bot's behalf.
- External tasks were read-only. Synthetic local deliverables were permitted. No external sends, posts, invitations, orders or permission expansion were approved.
- YOLO was turned off with the owner's explicit permission and remained off. Existing unrelated routines and conversations were preserved.
- Code and read-only diagnostics were inspected to explain observed behavior. Reading a delivered attachment independently checks its contents; it does not complete the task for the bot.
- Pixel used `opencode-go/deepseek-v4.1-flash`; Scout used `opencode/muse-spark-1.3-contributor-free`. This is not a controlled model comparison. Reasoning quality depends on the selected model, while truthful status, approval binding, persistence and output identity are product responsibilities.
- The checkout changed during the audit; latest inspected commit was `ceb235c`. Earlier observations began at `4847c27`. These observations are a live owner-environment audit, not certification of one frozen release candidate. No source changes were made by this audit.
- Historical QA chats, failures and a five-minute heartbeat routine exist in this owner workspace. They must not be mistaken for fresh failures or the default first-run experience.
- Competitor claims below come from current primary documentation, not equivalent live benchmarks in competitor apps. No measured speed, cost, security or task-success superiority is claimed.

## Live test ledger

| Test | Observed result | Judgment |
| --- | --- | --- |
| T1: Todoist due/overdue priorities, linked Notion context if present | Pixel used a saved Todoist session, reported no tasks, and delivered a Markdown report rather than inventing priorities. The browser visibly reached Todoist. Two ordinary navigation controls required approvals. An older task-start approval needed refresh/re-review. | Useful empty-state handling, high friction. Entire account completeness was not independently re-audited. Human interruptions make end-to-end timing unsuitable as a benchmark. |
| N1: recent Notion page to practical next steps, then relevant Slack context | Pixel reached a Notion page but proposed clicking a long page-content block. The approval card said details were incomplete and could not be approved; only Decline was available. Auditor declined. The conversation returned to ready without a visible explanatory final response. | Failed end-to-end. Existing sign-in was not the blocking factor. No Slack result was produced by this combined task. |
| P1: fictional pilot comparison and local decision note | Scout created `ux-audit-pilot-choice.md`. Independent readback confirmed A at EUR480/3 days is the sole candidate meeting EUR500/3-day limits; B fails time and C fails cost. | Passed this bounded artifact test. Not evidence for complex analysis generally. |
| R1: built-in independent teammate review | Auditor selected Pixel through “Have another teammate check this.” The receipt progressed to “Reviewed by Pixel.” Read-only run diagnostics showed Pixel read the copy downloaded by the earlier attachment click, not a demonstrated artifact-bound handoff. | Correct verdict on v1, but contaminated by the downloaded copy; does not pass direct artifact-handoff validation. |
| R2: review corrected artifact without downloading it | Pixel read the old 819-byte v1 file in Downloads, rejected the corrected result as stale, and claimed the saved artifact had not been updated. Independent reads of the v2 endpoint proved the corrected content existed. The conversation still said only “Reviewed by Pixel.” | Failed: wrong-version review and poor disagreement visibility. Release-blocking for advertised trustworthy cross-bot review. |
| P2: changed input, update same deliverable | Scout correctly changed C to EUR490/2 days, selected C, and delivered v2 without inheriting the old review. However, the original attachment link still returned v1 choosing A; v2 used a different link. | Correct content and revision separation; failed the explicit requirement that the existing link open the latest version. |
| S1: focused Slack read-only discussion and next step | Pixel reused the saved session, reported three public channels with only join/system messages, and declined to invent a discussion. One empty channel was independently visible through OpenBot's view-only Agent Computer. Opening the channel-discovery menu and “Browse channels” each required approval. | Useful empty-workspace handling, not a content-rich workflow pass. Two navigation approvals. No posts or joins were authorized. |
| A1: Amazon Belgium product research | Scout researched two linked foldable stands and returned a recommendation without sign-in or purchasing. It disclosed that the main price blocks were not readable. One option mixed a silver-family listing price with black-variant specifications. | Useful shortlist, partial verification. Exact variant/offer price and comparative “smallest footprint” were not established well enough for a fully checked recommendation. |
| L1: LinkedIn profile to unsent introduction, plus public Facebook community research | Pixel delivered a local introduction draft and a relevant public Facebook group/rules link. The group was independently visible as public in OpenBot's view-only computer. Pixel disclosed that LinkedIn About text was truncated and that it used additional profile context. Nothing was posted or joined. | Useful draft/research outcome with incomplete profile extraction, not full source verification. No sign-in intervention required. |

The directly recorded execution times for P1 and P2 were approximately 20 and 25 seconds; A1 and L1 approximately 4m30s and 4m23s. These are single owner-environment observations, not SLAs or competitor benchmarks. Reported L1 usage was 35,988 input / 2,291 output / 729,344 cache-read tokens and about $0.01775; A1 reported 44,511 / 1,741 / 540,771 with cost zero. These are provider/runtime-reported figures, not independently reconciled bills; zero reported cost is not a promise of free execution. Investigate context/cache reuse and elapsed time before making efficiency claims.

Todoist and Slack contained little substantive work, so those checks do not certify real busy-account productivity. A non-blocking question was sent to the owner about using a different workspace or labeled sample data for a later write-workflow pilot. No external sample data was created in this audit.

## Confirmed product friction

### 0. A reviewer can inspect the wrong artifact revision

R2 is the strongest concrete finding in this audit. The corrected artifact endpoint contained C at EUR490 and selected C. Pixel instead reopened the earlier downloaded v1 and concluded the author had failed to update the file. This is not a judgment disagreement: it is an identity/transport failure.

`src/server/run-review.ts` builds the review prompt from delivered filenames but creates the child with `attachmentIds: run.attachmentIds` (the source task's attachments), not the delivered artifact IDs/revisions/hashes. Other runtime context may help some cases, but it did not prevent this reproduced wrong-file review. A filename is not a sufficient review identity.

The current unit test checks that the filename appears in the prompt and that original attachment IDs are preserved. It does not assert that a reviewer can read the actual delivered revision. This is a concrete example of why passing tests alone cannot establish the user outcome.

Pass the exact immutable artifact revision and digest through a scoped read capability. The reviewer should never have to search general Mac folders for a same-name file. If the intended revision is unavailable, record “Unable to review this version,” not agreement/disagreement based on another copy. Surface the verdict and evidence on the parent result, and make the reviewed revision explicit. Regression test with an old identically named Downloads file, no downloaded file, a corrected artifact, and a changed artifact during review.

### 1. Approval requests do not consistently match the user's actual risk

The prompt explicitly prohibited creating, editing, sending or buying anything. The task-start warning nevertheless said it might spend money or start a subscription. A focused invocation of `approvalReason()` reproduced this with `Read-only: do not create, complete, edit, send, post, invite or buy anything.` A shorter prohibition using only send/post/buy returned no warning. In `src/server/safety.ts`, the coordinated-prohibition whitelist omits create/complete/edit/invite; that causes the whole list to remain subject to keyword detection.

Todoist's “Toggle list of My Projects” and “Search” both needed review. The browser policy currently recognizes links and a narrow GET-search form pattern, then conservatively reviews other clicks. This is safer than blindly allowing every button, but too disruptive for ordinary app navigation.

Recommended change: represent observed action semantics and destination effects explicitly. Permit evidence-backed navigation/expansion; keep unknown actions conservative. Do not fix this by allowing any button whose label contains “search” or by enabling YOLO. Add regression cases for prohibitions, deceptive labels, state-changing GET routes, stale controls and form-context changes.

The Ask-first tooltip says new work waits for approval, while safe P1/P2 requests started directly with YOLO off. Explain the actual distinction between starting work and approving consequential effects; avoid promising a gate that does not apply to every request.

### 2. An unapprovable action is a dead end, not a useful recovery

The Notion proposal displayed a large concatenated content label and failed completeness checks. Blocking the action was correct; getting stuck there was not. The system should reject oversized/non-actionable targets before presenting them, attempt a narrower safe target or explain the specific manual step. After decline, show a persistent outcome and what remains undone. Never re-propose the declined effect unchanged or silently continue a different write.

### 3. Technical evidence competes with the actual result

The owner heartbeat repeatedly creates `ROUTINE_HEARTBEAT_OK`, review prompts and completion receipts. Older runs present a provider-usage file as a deliverable. The current source has moved some usage presentation, but the historical UI remains noisy. Collapse routine success into one quiet status/history entry; notify for meaningful changes and failures. Preserve inspectable evidence behind the result, not as the result.

The local note was correct, but “Reviewed by Pixel,” “Finished with a note,” and “Final checks not confirmed” coexist without immediately explaining their different meanings. Use separate, plain labels for file saved, mechanically checked, teammate reviewed, owner accepted and externally confirmed. A single green check must not conflate these.

P2 exposed a distinction the UI must make explicit: immutable version permalinks are useful for auditability, but they are not a stable “latest result” link. Both initial and corrected attachment endpoints were read independently: the first still chose A, while the second correctly chose C. Provide a stable artifact-level link plus explicitly versioned snapshots; do not silently reinterpret a past review as reviewing the latest content.

### 4. Account capability and provider status need a coherent mental model

T1 unnecessarily called out unconnected API connectors even though the browser worked, and described Notion as not connected without having needed to visit it. Prefer “Todoist checked; no linked Notion pages found.” Distinguish unneeded, not attempted, sign-in required, permission denied and actually unavailable.

Provider settings initially displayed unavailable model choices and “OpenCode not detected” while connection checks were still loading; these later resolved to the installed runtime and model lists. Loading is not failure. Show neutral skeletons or retained last-known status while refreshing.

The free-tier warning says “nothing gets done” and suggests a “full model.” Scout's successful task in this audit is a direct counterexample to that blanket phrasing. Keep user choice; publish task-specific compatibility evidence and clear quota/tool support instead of equating price with capability.

Shopping research adds another evidence requirement: bind price, currency, seller/offer and specifications to the same product variant. A useful caveat should also constrain the recommendation itself; “lower price” or “smallest” should not outrun what was actually compared.

### 5. The visible interface is calmer, but clarity must extend to interaction

The inspected desktop conversation has restrained monochrome styling, colorful identity, readable message groups and contextual computer/details panels. Settings retains providers, team, routines, skills, files and access rather than removing features. Those are positive foundations.

Remaining design questions are behavioral: why must the user approve a disclosure arrow, where did a declined task go, and what does review mean? Active-task steering and queued guidance need a dedicated test; an empty disabled Send button is not evidence that guidance is unsupported.

A clicked Markdown attachment opened an additional blank browser tab in this testing surface. The file endpoint itself returned the correct artifact. Confirm intended download/preview behavior across clients; do not assume this is a universal app defect from one in-app browser.

## Competitive comparison: what to learn, not copy

| Product | Current documented approach | Consequence for OpenBot |
| --- | --- | --- |
| Grok Bot | Managed computers, parallel teammates, saved website login and work that continues while the laptop is closed. Its presentation leads with delegated outcomes and availability. [Official product page](https://x.ai/bot) | Compete on clear ownership and finished work, not an identical screen. An owner-hosted Mac that must stay awake does not offer equivalent managed availability. |
| Hermes Bot Mode | Persistent profiles become named bots with models, memory, skills and avatars; routines sit alongside conversations; groups and direct messages support coordination, including across connected machines. Simple creation discloses advanced configuration later. [Bot Mode](https://hermes-agent.nousresearch.com/docs/user-guide/bot-mode) | A bot roster, mascots, BYO models and group chats are shared foundations, not unique advantages. Learn from the profile model and progressive setup; prove our own coordination quality. |
| Hermes browser and ecosystem | Local browser attachment and cloud backends; persistent profiles and a real-profile option. Bundled skills, `/learn` and progressive skill loading; a broad messaging gateway. [Browser](https://hermes-agent.nousresearch.com/docs/user-guide/features/browser), [Skills](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills), [Messaging](https://hermes-agent.nousresearch.com/docs/user-guide/messaging) | Do not describe Hermes as CLI-only or lacking saved browsers. Reuse compatible standards and licensed components. Markdown import is not Python plugin/runtime compatibility. |
| OpenBot | Local-first application with chosen providers, private teammate workspaces/browser profiles, native-client sources, explicit action review, deliverable revisions and workflow checks. [Repository](https://github.com/PrisacariuRobert/openbot) | The opportunity is a coherent, approachable work-delivery experience. Implementation and directory separation do not prove stronger security or end-to-end reliability. |

Hermes also documents quiet mobile progress: fewer tool breadcrumbs, restrained acknowledgments and a single updating long-work indicator. This is directly relevant to our noisy routine/receipt experience. [Messaging progress defaults](https://hermes-agent.nousresearch.com/docs/user-guide/messaging)

### Foundations worth strengthening

1. **Inspectable delivery and corrections.** Keep stable artifact identity, revision history, clear destinations and distinctions between observed and reported checks. `code-delivery.ts`, `calendar-delivery.ts`, `approval-review-binding.ts` and their tests are useful mechanisms, not universal proof of delivery.
2. **Earned repeatability.** `workflow-validation.ts` requires two distinct owner-reviewed inputs before enabling a referenced saved workflow, and ties readiness to its current setup. Scope matters: this does not certify every routine or arbitrary script.
3. **Personal ownership without operating-system expertise.** Browser sessions, model choice, files and phone access should feel like one product, with understandable boundaries. Local model use and cloud provider use must not both be marketed as “nothing ever leaves your Mac.”
4. **One accountable teammate.** Helpers should exchange actual deliverables and return one consolidated result when requested. Cancellation, failed helpers, unavailable models and stale revisions must be visible and recoverable.

These are promising product directions, not claims that competitors lack equivalent safeguards. A credible advantage must be demonstrated with matched tasks and published limits.

## An OpenBot way, rather than an Apple imitation

Apple's design guidance emphasizes structure, orientation, navigation and content before styling, and matching interruption to importance. Apply those principles rather than treating rounded buttons as the goal. [Design foundations](https://developer.apple.com/videos/play/wwdc2025/359/), [Feedback](https://developer.apple.com/design/human-interface-guidelines/feedback)

Proposed product promise: **Your work, taken care of. Your models. Your say.**

The default journey should be: ask for an outcome → see a short understandable plan when needed → let the teammate handle routine navigation → review the exact consequential change → open the useful result → correct or repeat it. Each screen answers: what is happening, what needs me, and what happens next?

- Start with a conversation and one teammate; allow user-created identities and grow the team when there is a real role to fill.
- Show the result first. Offer sources, checks, usage and logs progressively, with a compact next action.
- Make browser/account state contextual: “Continue with your signed-in Notion account,” not a connector taxonomy the user must solve.
- Keep settings complete but layered. Advanced models, quotas, tools, scopes and diagnostics stay available to power users without dominating first launch.
- Use mascot motion for meaningful states, with reduced-motion support. Personality should help orientation, not cover uncertainty or interrupt reading.
- Preserve continuity between phone and desktop: same message, same pending decision, same result revision. Responsive screenshots alone do not prove native keyboard, reconnect or cellular behavior.

## Release and visibility

Fresh GitHub inspection found a public repository, 3 stars, 0 forks, no published release and an empty homepage field. This is a distribution/adoption gap, not proof of low product value. Do not use stars as a reliability metric.

An unauthenticated request to the public app's state endpoint returned HTTP 401. That is a useful narrow boundary check, not a security audit. The root foundation website did not respond from this Mac during one connection attempt; verify its deployment separately before using it as a launch CTA. Do not send new visitors to the owner's paired private workspace.

Release documentation needs one authoritative candidate record. `FIRST_PUBLIC_RELEASE.md`, `RELEASE_BETA.md`, older evidence files and the long README include different scope/distribution assumptions. A newcomer needs the current supported platform, tested install steps, host requirements, known limits and one working source/download path. Public binary availability must never be implied by documentation alone.

### Stage gates instead of a fictional completion percentage

| Stage | Recommendation | Exit evidence |
| --- | --- | --- |
| Public building-in-the-open presence | Start now with honest demos and a source-preview/design-partner invitation. | Working landing page/repo links, supported scope, no unearned “works with everything” claims, consent-safe demo data. |
| Supervised Mac design-partner alpha | Recruit a small group; fix the approval dead ends before presenting it as hands-off. | Five new users install, connect a model and finish one representative task without live developer repair; record failures and interventions. |
| Supported Mac beta | Not certified by this audit. | Frozen candidate; clean second-Mac installation/update/restore; representative workflows pass repeatedly; review, deny, cancel, quota, expired login and reconnect tests; appropriate distribution/signing evidence. |
| Serious niche competitor | Earn through repeat use, not a feature checklist. | Users repeatedly delegate real work, return weekly, need fewer interventions, and can explain why they choose OpenBot. |

Suggested beta benchmark: 30 representative jobs across two supported model paths, at least 90% achieving the agreed outcome without developer rescue, no unauthorized/duplicate effects, and all failures explained with preserved work. This is a proposed acceptance gate, not an achieved success rate or statistical guarantee. Add a seven-day routine/reconnect soak and a real physical-phone cellular test for any advertised away-access promise.

There is no defensible percentage-to-market or exact release date from this sample. Public visibility can begin immediately; a supported beta requires the P0 fixes plus a clean-candidate validation cycle and observed pilot use. Reserve at least two weeks for a meaningful small-user pilot rather than substituting another feature sprint for evidence. Becoming a real niche competitor is a retention/outcome milestone, not a date when the code looks complete.

### Ordered development priorities

| Priority | Work | Acceptance example |
| --- | --- | --- |
| P0 | Artifact-bound independent review | Reviewer receives exact revision/hash; stale Downloads copy is ignored; disagreement or inability to review is visible on the result. |
| P0 | Precise approvals and recoverable browser targets | Todoist read-only navigation works without approval spam; incomplete Notion targets are corrected or handed off clearly; genuine sends still require exact review. |
| P0 | Task lifecycle and feedback | Decline/cancel/quota/restart each leave a durable, intelligible outcome. No disappearing task, blind replay or false success. |
| P0 | Account-aware context routing | A signed-in browser remains useful when an API connector is absent; wrong-account and expired-login states are explicit. |
| P1 | Deliverable and review semantics | Corrected links open the current version; previous review cannot certify changed content; reviewer findings are easy to inspect. |
| P1 | Three repeatable outcome packages | Work follow-through; document/data preparation with revisions; checked project changes. Each needs multiple inputs and actual destination evidence where writes are included. |
| P1 | One friction-tested onboarding/distribution path | New Mac user gets the first useful result without a guided tour; no missing download or contradictory prerequisite instructions. |
| P2 | Ecosystem and availability expansion | Compatible reviewed skills/MCP first; broader messaging, hosting and plugins only after core completion/recovery is dependable. |

Do not silently replace the user's model. Offer task-specific capability guidance and explicit cost/allowance choices. Evaluate the same workflow with the same model/budget where possible before attributing a failure to the application or claiming a competitor advantage.

## Getting noticed without paid acquisition

Choose an initial audience narrow enough to serve well: Mac-based independent builders and small-team operators who already use AI accounts and want accountable cross-app work. This is a positioning hypothesis to validate with interviews, not established market demand.

For the first two weeks, publish three short real-work demonstrations: a useful local deliverable plus correction; a browser task with a clear reviewed action and destination check; a teammate consultation returning one answer. Use synthetic or expressly permitted demo accounts. Show one honest limitation and its fix in a weekly build log. Offer five to ten supervised design-partner places and ask what work they want removed from their day.

Share selectively on the founder's relevant LinkedIn network and open-source/agent communities where self-promotion is allowed; contribute useful examples and upstream fixes rather than reposting the same pitch everywhere. Use one CTA, not separate “download,” “join,” “star” and “buy” demands. Delay a broad launch event until installation and representative workflows are reproducible.

Measure the funnel: visitor → setup started → first completed useful task → second task → weekly return. Track time to first value, interventions per job, successful corrections, unexplained stops and user trust. Stars and video views are secondary. Ask users to demonstrate the workflow while you observe silently; their confusion should define the next engineering slice.

## Remaining validation limits

- No equivalent live Grok Bot or Hermes benchmark was performed; documentation is not independently verified performance evidence.
- No security superiority, universal browser compatibility or safe arbitrary-plugin execution is established.
- No clean install, signed release, update/restore, physical iPhone or cellular session was certified in this audit.
- The browser viewport override did not change the observed 1280px viewport, so no mobile-layout pass is claimed. The override was reset.
- External mutation workflows were intentionally out of scope. No success at posting, ordering, invitation or account modification is claimed.

## Reproduction pointers for the owner

Local diagnostic run IDs (not public credentials): P1 `bb486d98-b336-4780-9485-0ebf75acdaca`; P2 `c6e10f4f-e493-4a3b-b1ab-161553259296`; R1 `4a529445-115c-4c00-a9a0-9109a4fea656`; R2 `3522c8ef-5feb-4914-9626-895d89b66770`; N1 `923195ed-bc8d-4f43-b65e-f1270a369227`; A1 `a428cb6e-2340-415a-85d1-3a4571ed4735`; L1 `378c3b89-0080-44ca-8d3b-5551c61e5b52`.

The P1 artifact is `93970c22600a11cebb60fbba4eb37c58`; P2 is `b2a5fac2a58401117215e86605589272`. Both were read independently through the app's attachment endpoint. The original click created a downloaded v1 copy, which is the stale same-name file R2 subsequently reviewed. Preserve this case when creating a fixture; do not publish the owner's unrelated workspace or browser data with it.

All audit-submitted execution tasks reached completion or explicit cancellation. The owner's pre-existing heartbeat routine was left enabled. The audit leaves its local synthetic deliverables and review notes in place for inspection. Only this report was added to the application repository.

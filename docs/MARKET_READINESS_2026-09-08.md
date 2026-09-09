# OpenBot: reliability work and market readiness

8 September 2026. Assessment of this local, unmerged checkout. Not a release approval or a claim of competitor parity.

## Decision

OpenBot is a promising private alpha with evidence of useful work, not yet a proven market competitor. The next win is a dependable Mac-first assistant for a small set of repeatable jobs. Adding more panels or reproducing every competitor feature is not the release criterion.

The best initial promise is: **your own AI teammates, using your chosen supported models, doing reviewable work on your Mac.** Model choice and open source are important, but Hermes already offers both; they are not an exclusive advantage. The potential advantage is making that control understandable and useful to an ordinary Mac user, with clear approvals, recoverable tasks and evidence of what changed.

## Current competitor reference

These are documented product capabilities, not a controlled head-to-head evaluation. We have not measured identical jobs against either competitor this turn.

| Area | Current reference | OpenBot position and evidence boundary |
| --- | --- | --- |
| Work through conversations | Grok Bot presents persistent teammates, group collaboration and completed work rather than a tool dashboard. | Public conversations, private consultation, one coordinator result and result files exist. The expense pilot exercised real Pixel/Nova/Scout cooperation; broad workflow reliability remains unmeasured. |
| Browser and unattended work | Grok Bot describes a cloud computer, logged-in apps and always-on execution. | Private browser profiles and reviewed writes work in selected tests. This local runner still requires an awake Mac; hosted away access and overnight reliability are not proven substitutes. |
| Persistent bots | Hermes Bot Mode documents named bot profiles, model pins, desktop groups, private bot messages and a durable gateway driver. | Named teammates and independent provider choices exist. Context isolation and continuity improved in this pass, but we have not matched every gateway, peer-machine or lifecycle capability. |
| Learning and extensions | Hermes documents skills, memory, toolsets, MCP and a broad integration ecosystem. | Reviewed reusable skills and extension paths exist. Compatibility and real-profile testing are still needed; an imported skill is not proof it will execute safely or successfully. |
| Reliability and cost | Hermes documents context management and bounded recovery behaviors. | This pass bounds context reuse and adds one safe intermediate-turn continuation. The live pilot still shows material token/latency overhead, and no efficiency advantage has been established. |
| Distribution and trust | Both competitors document installable desktop experiences. | No GitHub release was listed in this repository. This Mac has an Apple Development signing identity, not a Developer ID distribution identity. A clean second-Mac installation, notarization/update recovery and external pilots remain release gates. |

Primary sources checked for this assessment:

- [Grok Bot introduction](https://x.ai/news/introducing-grok-bot)
- [Hermes documentation](https://hermes-agent.nousresearch.com/docs/)
- [Hermes Bot Mode](https://hermes-agent.nousresearch.com/docs/user-guide/bot-mode/)
- [Hermes feature overview](https://hermes-agent.nousresearch.com/docs/user-guide/features/overview/)

## Implemented in this pass

### Bounded working context, without deleting conversations

- A new request is no longer automatically described as a continuation of the previous task merely because it can reuse a runtime session.
- Completed sessions with an observed context footprint of 48,000 tokens or more are not reused for a new task. Unknown legacy footprints refresh conservatively. This is a product threshold, not a provider window or spending allowance.
- A fresh context receives a bounded bridge of recent public messages. Older details are retrieved with `conversation_search`, limited to this conversation's latest 400 public messages and five bounded excerpts. Private teammate signals and other conversations are excluded.
- Active tasks, approvals and steering retain their own session and usage. A provider/model, capability or skill change does not silently reuse incompatible context. Private consultations do not borrow an unrelated public session.
- Private teammate findings injected into a run are restricted to that task family. Search results and continuity excerpts are historical, untrusted context—not current instructions, permissions or destination proof.

### One safe continuation after an intermediate model exit

- A clean provider exit immediately after confirmed read/planning work may receive one continuation on the same task and remaining allowance.
- Pending tools, tool failures, unknown/write tools, provider errors, quota/step/time limits, approvals and pending consultations do not qualify. A later read cannot erase an earlier uncertain write or failed tool.
- The continuation counter is durable and cannot loop. If the second attempt still does not finish, the task fails visibly instead of claiming completion. Existing action receipts instruct resumed work not to repeat completed effects.
- The selected model remains the user's choice. No global limits, subscriptions or permissions are increased by this recovery.

### Honest verification scope

The live pilot exposed a misleading check: the model supplied a claim about workbook formulas with `workspace_file` evidence pointing to a Markdown note. The host reopened the note, then displayed the broader model claim as host-verified.

- Text-file verification now generates its own label naming the actual evidence file and reports only the predicates evaluated: readability, minimum bytes and requested text markers.
- Binary/invalid-UTF-8 input is rejected by this text verifier. It must not produce a digest from decoded text and present that as binary-file identity.
- Result receipts say “Recorded checks passed” and identify the teammate's summary separately. They explain that a file check does not verify every claim in a result. Historical receipts are not rewritten or retroactively certified.
- A workbook-specific persisted verification contract, including recalculation, remains a distinct next step. The current spreadsheet inspector reads saved definitions; it is not a spreadsheet calculation engine.

## Live test, including the failure

The existing [token and teamwork pilot](QA_TASK_TOKENS_AND_TEAMWORK_2026-09-08.md) records the earlier real workbook creation, private Nova/Scout reviews, an initially broken formula export, its repair, and independent recalculation. Those results are prior evidence, not a new three-bot test in this pass.

This pass used the actual OpenBot chat UI and Pixel's unchanged `opencode-go/glm-5.3-flash` selection. The task was read-only: inspect the existing workbook, retrieve the earlier caveat and provide a concise answer. No evaluator completed the work for the bot.

1. `92d48d52-cf81-46ec-a126-32194136c16a`: **failed** after the model called `task_plan` and exited without a final answer. The app preserved the failure instead of publishing a false success. This led to the bounded continuation change.
2. `2f4601ca-c586-4a17-ae47-28a7aaa6ec70`: **completed**. Actual activities include `spreadsheet_inspect`, `conversation_search`, reading the existing notes and task checks. The final answer distinguished stored formula definitions from recalculation and did not return to old email/calendar work. It did not need automatic continuation, so live recovery itself is not claimed as proven by this retest; real-process fixtures cover it.

The saved workbook remained 3,928 bytes with SHA-256 `006dc8467c6cc81942e38539f5aef9c8d5393cff26283abeb471e3578a04675c`. Inspection reported 35 real formula definitions and retained leading-zero text IDs. No source workbook or note was edited by the retest; the app created its normal result copies and usage receipt.

The successful run took about 65 seconds and reported 36,744 input, 3,656 output and 143,424 cache-read tokens: 183,824 total including cached input, not a monetary bill or a distinct-context size. This is still expensive for a short read-only task. Tool/prompt overhead and fewer unnecessary model round trips remain priorities. One success and one failure cannot establish a success rate or a context-cost improvement percentage.

The receipt-scoping defect was found after that run and corrected in code/tests. Its stored historical task checks are retained as evidence of the original defect.

## Verification

- `npm run verify` passed after the final changes: 618 application tests, 9 packaging tests, 5 desktop tests, release/iOS/macOS source-contract checks, both TypeScript checks and the production build. These native source checks are not a fresh signed-device build or clean-machine installation. The existing 500 kB bundle warning remains.
- `git diff --check` passed. Existing owner changes were preserved; nothing was committed, merged, published or released.

- Focused context tests exercised the real HTTP host and child-process runner with deterministic model fixtures, including isolation, context rotation, preserved accounting and forged tool-request rejection.
- Focused continuation tests exercised actual child processes and durable task transitions, no retry loop, preserved usage, quota and approval behavior.
- Focused evidence tests prevent a note from certifying an unrelated workbook claim and reject binary input in the text verifier.
- The rendered app showed the new receipt label with no remaining “Verified by OpenBot” heading in the inspected conversation.
- `npm audit --omit=dev --json`: zero reported production dependency vulnerabilities at this check. This is not a security audit, sandbox assessment or assurance against prompt injection.

## Gates to a credible first beta

These are proposed acceptance criteria, not results already achieved:

1. **Thirty representative jobs:** ten customer/email/calendar jobs, ten document-to-editable-workbook jobs and ten code-fix jobs. At least two input variations and two supported model/provider configurations. Record failures, owner interventions, latency and reported usage; compare equivalent models and budgets where possible.
2. **At least 90% finished without developer rescue** on that bounded pilot set, with zero unapproved writes and zero duplicate external effects. Expected owner review/sign-in is not a developer rescue, but its frequency still counts as UX friction. Thirty cases are an initial gate, not a broad statistical guarantee.
3. **Context and recovery stress tests:** long conversation, permission change, token pause, interrupted browser save, sleeping/restarted Mac and failed provider. No lost approved outcome and no false “done.”
4. **Clean distribution:** install on another Mac without this development environment, signed/notarized release candidate, update/rollback, backup/restore and accurate privacy/limit documentation. Native iPhone remains a preview until its separate gates pass.
5. **Five to ten outside users for at least two weeks:** measure whether they return to delegate another real job, how much setup help they need and time actually saved. Stars and video views measure interest, not retained usefulness.
6. **Seven days of routine/runner observation:** show accurate offline/sleep state and recovery. Do not call it always-on or accessible everywhere without the corresponding host/phone evidence.

## Estimate, not a promise

- **Today:** private alpha; useful components and several credible pilot results, but insufficient reliability, distribution and outside-user evidence for a strong public launch.
- **Credible narrow Mac beta:** approximately **4–8 focused weeks**, assuming the scope above stays fixed, one developer can work consistently, and signing plus outside testers are available. Unexpected security, installation or account-workflow failures can extend this.
- **A credible niche entrant:** approximately **3–6+ months to attempt to demonstrate it**, including repeat use by outside users. This is a planning estimate, not a forecast of adoption or revenue.
- **Broad Grok Bot/Hermes replacement:** no defensible completion date or parity percentage from this evidence. Their hosting, ecosystem and accumulated field reliability are separate problems, not a fixed list of buttons to implement.

The next implementation priorities are less prompt/tool overhead, stronger format- and destination-bound verification, and repeatable mixed-workflow pilots. The winning claim should become “these jobs reliably finish for these users,” not “we have all the same features.”

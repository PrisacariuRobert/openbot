# Hermes Bot Mode and OpenBot — evidence-led comparison

Reviewed 8 September 2026. This is a product/code comparison, not a head-to-head performance benchmark or a release certification.

## Bottom line

Hermes is a serious, broader alternative, not just a command-line agent we can put a nicer interface around. OpenBot should borrow its progressive setup, useful learning loop and ecosystem interoperability. It should compete through a focused, approachable Apple-platform experience and **work whose result, permissions and remaining uncertainty can be inspected**.

Do not market model choice, local browsers, mascots, groups or skill approvals as things only OpenBot has. Do not describe Hermes as requiring a paid subscription or as having no local browser support.

## What was inspected

- The public [repository](https://github.com/NousResearch/hermes-agent), official documentation and desktop source README. The inspected `main` snapshot was [`fb3446a281e4bddc733a04bf92a5ec5f0d6decc9`](https://github.com/NousResearch/hermes-agent/tree/fb3446a281e4bddc733a04bf92a5ec5f0d6decc9), dated 8 September. The latest tagged release observed was [`v2026.9.7`](https://github.com/NousResearch/hermes-agent/releases/tag/v2026.9.7), published 7 September with release title v0.21.1. Current documentation can describe work newer than that release.
- OpenBot's current working tree, including uncommitted owner changes, receipt/skill code, approval binding, code-delivery tests, workflow checks, profile import, MCP and native app sources.
- Hermes was not installed or exercised against the owner's accounts. OpenBot tests below use disposable fixtures, not production accounts. No latency, cost, quality or overall safety superiority has been measured.

## What Hermes now brings

| Area | Hermes evidence | Implication for OpenBot |
| --- | --- | --- |
| Persistent teammates | Bot Mode exposes profiles as named agents with individual models, memory, skills and animated/custom avatars. Groups have bounded turns; bots can message across registered machines. [Bot Mode](https://hermes-agent.nousresearch.com/docs/user-guide/bot-mode) | Our roster and characters are personality, not a unique capability. Keep setup small and preserve context between work sessions. Cross-machine teams remain a substantial gap. |
| Learning | Skills support progressive loading, `/learn`, bundled discovery and automatic updates. `skills.write_approval: true` can stage mutations for human review. [Skills](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills) | Approvals alone are not a differentiator. Develop source-linked learning with explicit evidence and repeatability checks. |
| Browser work | Local browsers, separate sessions, opt-in real-profile snapshots and cloud options are documented. [Browser](https://hermes-agent.nousresearch.com/docs/user-guide/features/browser) | The older roadmap's “no local browser story” assertion was wrong. Demonstrate our per-site isolation and sign-in recovery instead of promising authentication cannot fail. |
| Reach and delivery | A messaging gateway reaches multiple chat platforms. Generated files can arrive as native chat attachments, not just file paths. [Messaging](https://hermes-agent.nousresearch.com/docs/user-guide/messaging), [Deliverable Mode](https://hermes-agent.nousresearch.com/docs/user-guide/features/deliverable-mode) | Hermes has broader distribution surfaces. Attachments alone do not distinguish us; verified changes at the intended destination are more meaningful. |
| Extensibility | Hermes supports Python plugins, provider/platform hooks and external MCP servers. Its documentation explicitly distinguishes consent gates from process isolation. [Plugins](https://hermes-agent.nousresearch.com/docs/user-guide/features/plugins) | Portable instructions and MCP are sensible bridges. Hermes Python plugins are not drop-in OpenBot plugins; importing their files does not recreate their runtime or permissions. |
| Providers and safeguards | Hermes documents multiple provider paths and configurable security/approval controls. [Providers](https://hermes-agent.nousresearch.com/docs/integrations/providers), [Security](https://hermes-agent.nousresearch.com/docs/user-guide/security) | BYO models are shared ground. Compare exact permission and recovery behavior, not “ours safe, theirs unsafe.” Supported subscription authentication is provider-specific, not a promise that every subscription works. |

## Our strongest implemented distinctions

These are concrete OpenBot mechanisms worth strengthening. They are **not proof that Hermes lacks every equivalent**, nor that OpenBot completes more real tasks.

1. **Review the exact action, then verify the destination.** Approval fingerprints bind account, content and grants. The dispatch layer rechecks them and preserves uncertain writes instead of blindly replaying. Code publication also checks the remote result before recording delivery. Evidence: `approval-review-binding.test.ts`, `approved-actions.test.ts`, `code-delivery.test.ts`, `calendar-delivery.test.ts` under `src/server/`. Real-account pilots are still needed.
2. **A saved recipe is not automatically a dependable routine.** `workflow-validation.ts` requires two distinct, owner-reviewed tool runs for saved-workflow scheduling. Changes to skill content, model, permissions or account authorization invalidate readiness; ordinary token refresh does not. Evidence: `workflow-validation.test.ts`. This rule applies to referenced saved workflows, not every plain-language routine, community skill or arbitrary model-generated script.
3. **Code work with an unchanged test oracle.** Isolated project checks bind failure/reproduction, repaired revision, independent review and publication evidence. A faster candidate with broken correctness cannot win. Evidence: `code-checks.test.ts`, `code-benchmark.test.ts`, `code-delivery.test.ts`. This is a useful speciality, not proof of better coding intelligence.
4. **A native Apple-platform path.** OpenBot has SwiftUI macOS and iPhone application sources, alongside web/Electron surfaces. Hermes's [desktop development README](https://github.com/NousResearch/hermes-agent/blob/fb3446a281e4bddc733a04bf92a5ec5f0d6decc9/apps/desktop/README.md) describes an Electron/Python stack. That is an architectural distinction, not a measured advantage in usability or performance. Our signed distribution, cross-device parity and away-access pilot still need evidence.

## Strengthened in this pass: learning that keeps its evidence

Found and fixed in `skill-proposals.ts`, `database.ts` and the receipt presentation:

- **Wrong-task reuse:** a task title was used to deduplicate skill proposals. Separate same-title tasks could silently return the wrong draft. Proposals now bind to the actual source run; renaming the skill and reopening the database do not lose that association.
- **Missing provenance:** the draft claimed receipt-backed origin without recording the source task. It now cites the task ID and a dated receipt snapshot digest. The full snapshot is retained in the encrypted local extension store. The digest identifies recorded bytes; it is not a digital signature or independent proof that a claim is true.
- **Failure labelled as verification:** failed host checks are now explicitly failed in both the draft and UI. Unresolved evidence is retained; bounded excerpts cannot remove the source identity or validation warning.
- **Vanishing delivery uncertainty:** receipts previously searched only the latest 100 actions across the whole studio, then kept 12 from the job. Old uncertain writes could disappear. The query is now scoped to the full job history. Failed checks, incomplete consultations, pending approvals and unconfirmed/not-completed actions remain explicit.
- **Overconfident copy:** “Nothing left uncertain” is now “No unresolved items recorded.” A completed task without passed host checks carries a limitation rather than silently looking verified.

This remains an owner-created instruction draft, not automatic skill synthesis or proof that it will generalize. Saving it does not satisfy the existing two-input scheduling gate. Historical proposals without a source mapping are not guessed from their titles. No existing skill is overwritten during this migration.

## Borrow deliberately, in this order

| Priority | Improvement | Proof needed before calling it done |
| --- | --- | --- |
| 1 | Complete the learning experience: inspect source → refine a reusable recipe → run two real examples → review → schedule. Keep source observations distinct from reusable instructions. | A nontechnical pilot user repeats a task with a new input without copying old recipients, dates or private content. Both provider paths enforce the same review boundaries. |
| 2 | Make ecosystem access easy: searchable, pinned, license-reviewed compatible skills; use existing MCP discovery and per-bot grants for external tools. | A documented Hermes skill/profile and an MCP service perform a real task in OpenBot. Unsupported tool names, scripts and hooks are disclosed, never silently advertised as working. |
| 3 | Borrow typed recovery and progressive setup: say “sign in,” “quota reached” or “retry later”; show only the choice needed now. | Induced auth failure, rate limit, context exhaustion and lost write confirmation produce appropriate recovery without duplicate sends. Hermes's [Bot Mode retry documentation](https://hermes-agent.nousresearch.com/docs/user-guide/bot-mode) is a useful reference, not permission to retry uncertain writes. |
| 4 | Ship a small, dependable native beta before adding many channels or distributed-agent orchestration. | Clean installation on another Mac, signed/notarized package, update/recovery test, iPhone preview and real remote-access check. The presence of CI YAML is not a successful installer build. |

Do not rebuild Hermes's entire gateway or run arbitrary community Python inside our trusted host merely to expand a feature count. An optional Hermes backend would require its own protocol, permission and cancellation contract; it is a separate project decision, not a free plugin import.

## The comparison we should actually demonstrate

Use the same supported model, comparable budget, fresh sandbox data and fixed success criteria on both products:

- Customer request → inspect source → prepare a reply and meeting → owner approval → verify the actual destinations and account.
- Small project bug → reproduce → repair in isolation → rerun unchanged assertions → independently review → approved delivery.
- Repeated business task → save a reusable recipe → execute on two distinct inputs → inspect results → schedule → recover after a restart.

Record completed outcomes, incorrect/duplicate actions, required interventions, wall time and model usage. Grade approval cancellation, expired sign-in and lost confirmation as deliberately tested cases, not inconvenient exceptions. Until this is run, say “designed for reviewable work,” not “more reliable than Hermes.”

## Verification

Five targeted tests failed on the pre-fix code, reproducing the provenance, title-collision, failed-check and receipt-history problems.

- `node --import tsx --test src/server/skill-proposals.test.ts src/server/work-receipt.test.ts src/server/workflow-validation.test.ts`: 14 passing tests, including source identity, same-title separation, persistence, immutable snapshots, bounded failure evidence and scheduling gates.
- `npm run verify`: passed 551 application tests plus 9 packaging/release and 5 desktop-navigation tests (565 total), TypeScript checks, native source-contract checks and the production web build. Vite still reports a non-blocking large-chunk warning. These native checks are not new Xcode builds or device tests.
- `node --import tsx scripts/test-work-receipt-ui.ts`: passed in a disposable headless Chrome session. Opened the real receipt, saved through the actual button/API, checked persisted provenance, then reopened with failed evidence to verify the failure label and uncertainty footer. Reviewed screenshots under `/tmp/openbot-receipt-qa/`.

No model calls, account changes, public deployment, push, merge or installer release were performed.

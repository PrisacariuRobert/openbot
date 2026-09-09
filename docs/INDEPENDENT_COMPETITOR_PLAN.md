# OpenBot: an independent alternative to Grok Bot and Hermes

Active implementation plan · 8 September 2026

## Product decision

Keep OpenBot's own application, task lifecycle, permissions and native clients. Do not replace it with a Hermes frontend or fork the entire Hermes product. Reuse suitable standards/components with license and compatibility review; contribute fixes upstream where useful.

The promise to earn is: **give a teammate a job, get useful finished work, teach it how you prefer that work, and confidently hand it off again.** Model choice and open-source licensing are foundations, not sufficient differentiation by themselves.

**Owner clarification — model choice:** reasoning, writing and planning quality depend on the provider/model the user selects. OpenBot must not silently substitute a preferred or paid model. Separate model-quality observations from the product contract: correct tool routing, explicit permission boundaries, durable continuation and honest destination evidence must hold regardless of which supported model produced the request. A deterministic runtime test proves this contract, not a model's ability to plan the task.

## Competitive baseline

[Grok Bot](https://x.ai/news/introducing-grok-bot) emphasizes persistent teammates, work across desktop/phone and repeatable workflows. [Hermes skills](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills) support learning from conversation or source material; [Bot Mode](https://hermes-agent.nousresearch.com/docs/user-guide/bot-mode) adds persistent profiles and team coordination. Use these outcomes as benchmarks, not their branding or screen layout.

The [Hermes audit](HERMES_COMPARISON_2026-09-08.md) and [product audit](PRODUCT_GAP_AUDIT.md) describe existing foundations and limits. Neither competitor has been run head-to-head against this checkout. Historical feature checkmarks do not establish parity.

## Ordered implementation queue

| Order | Work package | Already present | Actual gap to close | Acceptance gate |
| --- | --- | --- | --- | --- |
| 1 | **Teach and reuse any workflow** | Browser teaching, receipt drafts, versioned skills, two-input scheduling checks | Author a reusable skill through conversation, including file/code tasks without a fake starting website; inspect exact instructions before saving | `/learn` produces a real review request through either runtime. Denial creates nothing; approval saves exactly the reviewed instructions, available on the next task. Blank URL works for non-browser skills. Changes invalidate old checks. |
| 2 — active | **Complete useful work across apps** | Browser sign-in handoff, mail/calendar/files/tasks connectors and individual mutation tools | Prove combined customer/admin workflows with editable outputs, destination confirmation and recovery; improve missing actions exposed by these flows | Three repeatable cases: customer request → reviewed response + meeting; expense files → reconciled editable workbook + exception list; code bug → unchanged test oracle + reviewed delivery. Two distinct inputs each; no duplicate effects after lost responses. Fixtures first, then owner-approved account pilots. |
| 3 | **Dependable personal assistant and team** | Private consultation, bounded group routing, memory and task history | Reliable long-task continuation; actionable auth/quota/rate-limit/context errors; coordinator handles a failed helper without fabricated completion | Same thread/context after restart and reconnect. Named ownership of each deliverable. Cancel/permission revocation propagates. Auth/quota errors do not burn allowance on blind retries. Parallel contributors produce one coherent result when requested. |
| 4 | **An accessible open ecosystem** | Bundled methods, text-skill/profile import, HTTP/stdio MCP, OAuth and per-bot grants | Capability discovery that explains what works, what needs sign-in and what cannot be imported; dependency-aware compatibility | One real upstream profile/text skill and one real MCP service complete work. Exact-version provenance and license retained. Unsupported scripts/hooks are visible. No automatic import of credentials or unreviewed executable plugins. |
| 5 | **Real provider independence** | Explicit provider choice, OpenCode and Claude paths, custom API configurations | Driver contract separated from orchestration, truthful capability/usage reporting and recovery across providers | Identical learn/tool/approval/cancel/artifact tests on both current runtimes; later add a direct provider driver only behind the same contract. No silent switch to another paid model. Saved credentials alone never mean a connection was tested. |
| 6 | **Native daily use and dependable delivery** | SwiftUI Mac/iPhone clients, web/Electron, runner packaging and relay protocol | Fresh install/update, consistent essential controls and real phone-away continuity; hosted operation when the Mac sleeps | Second-Mac clean install, signed/notarized release, update + restore drill, iPhone approval/result flow and Wi-Fi→cellular pilot. A sleeping Mac cannot execute local work; always-on hosting must be explicitly provisioned and tested. |

The order can change only when a concrete failed workflow exposes a more important blocker. Do not postpone functional gaps by repeatedly polishing settings, generating more launch media or adding disconnected feature cards.

## How implementation proceeds

1. Pick one missing end-to-end capability and record its existing code paths.
2. Implement it in the real execution path, with readable errors and no new implicit authority.
3. Add regression and runtime-contract tests; use disposable data. Test rendered controls when UI behavior changes.
4. Run `npm run verify`; distinguish unit/fixture results from real-model, real-account and native-device evidence.
5. Update this plan with files, commands, results and limitations. Continue safe local work; request only genuinely missing account/hosting/release decisions.

## Boundaries and dependencies

- Preserve the owner's dirty working tree and installed application/data. No bulk rewrite, push, merge, deployment or announcement without the corresponding request.
- No Hermes engine migration. No claim of general plugin compatibility from importing Markdown.
- No unbounded live-model benchmark. Use controlled local model endpoints first, then explicitly selected provider allowances for real-quality pilots.
- Sign-in remains manual; credentials never go through conversation. External sends, publication and destructive effects retain their own review boundaries.
- Approval rules are not an OS sandbox. Executable ecosystem expansion requires isolation and egress work before unrestricted unattended use can be advertised.
- Real accounts, signing identity, a second clean Mac and an owner-selected always-on host are external validation dependencies—not reasons to stop implementing local capabilities.

## Release scorecard

For each benchmark, record: outcome correctness, actual deliverable/destination, intervention count, duplicate/unauthorized actions, wall time, model usage and recovery behavior. Use the same supported model and comparable task budget for any competitor comparison. Keep failures visible. Do not call OpenBot better overall until those comparisons exist.

## Execution record

### 8 September: bounded context and truthful completion follow-through

New requests now have bounded working-context reuse, same-conversation history search and task-family-only private findings. Active approvals/steering retain their own context and allowances. A clean intermediate model exit after confirmed safe reads/planning may continue once; writes, failures, pending tools and quota/approval boundaries cannot trigger that retry. Text-file receipts now identify what the host actually checked instead of adopting broader model-authored claims.

Verification: 618 application tests plus 9 packaging and 5 desktop tests, source/TypeScript checks and production build passed. An actual Pixel read-only pilot first failed at a planning step, then a fresh retest inspected the existing workbook and retrieved its earlier conversation caveat. Both outcomes are retained. The successful retest did not exercise automatic recovery and still used substantial reported tokens; no cost or overall parity advantage is claimed.

See [current market-readiness assessment](MARKET_READINESS_2026-09-08.md) for exact evidence, current primary competitor sources, remaining release gates and conditional estimates. Next: prompt/tool efficiency, format- and destination-bound proof, repeated mixed-workflow pilots and clean distribution—not another feature showcase.

- Implemented foundations: conversational skill authoring and browser-independent reusable workflows. Active engineering slice: complete customer/admin work across apps. Results and remaining validation gates are recorded below.

### Implemented: conversation → reviewed reusable skill

- Added `/learn` intent handling and the `skill_propose` tool to the existing OpenCode and Claude paths. The selected provider/model remains unchanged. A skill named `/learn` already owned by the user takes precedence.
- Exact name, description and instructions are reviewed through the normal action UI. Persistent instruction changes always need human review, including with YOLO enabled. Malformed/known-secret drafts are rejected before an approval is created; stale/cancelled decisions do not save a skill, and concurrent approval requests produce one save.
- Approved instructions become a real, versioned teammate skill in both runtime directories. Non-browser workflows no longer need a fake website. The editor, exports, imports and receipt-derived drafts support this.
- Learned-skill revisions now participate in the runtime-session fingerprint, so new or edited skills do not leave the teammate using a cached older skill list. Other teammates' skill changes do not reset its session.
- Existing two-input, owner-reviewed scheduling gates remain active. A saved or edited draft is not silently certified.
- Added a small in-app explanation and [usage guide](LEARNING_WORKFLOWS.md), with no new dashboard or replacement engine.

**Verification:** `npm run verify` passed with 555 application tests plus 9 macOS-packaging and 5 desktop tests, source checks, TypeScript and the production build. `npm run test:skill-authoring-ui` passed against the rendered desktop and 390px web client, including approval gating, exact saved instructions, a general skill in the list and the optional website editor. Claude's actual stdio bridge forwards the tool against a fixture host. The application runner test uses a deterministic child, not a paid/live model. The existing large-bundle warning remains non-blocking.

**Still open in package 1:** real-model skill synthesis quality on at least two different source materials, a complete teach → run on new input → correct → run again pilot, and native-client review. This implementation is not a claim that arbitrary workflows already work or that competitor parity is complete.

**Next engineering package:** use the three cross-app outcomes in package 2 to expose missing actions, recovery and verification. Measure completed work and owner intervention; do not replace that evidence with more feature cards or another promotional film. Account pilots still require the appropriate owner-connected accounts and explicit approval of external effects.

### Implemented: customer request → reviewed meeting → threaded reply

Package 2 is now the active engineering slice; the remaining real-model and native pilots in package 1 stay open.

- Added a real `gmail_reply` action, not another new-email shortcut. The model supplies the original message ID and its proposed text. OpenBot derives the recipient and threading information from Gmail, exposes the exact review and rechecks the conversation before dispatch. The existing browser-login path remains an alternative for website work; this capability uses the Gmail connector with read and send access.
- Added sent-copy verification and bounded lost-response recovery. The recipient, replying account, body, parent message and original thread must match. An uncertain result is not permission to resend; sent-copy confirmation is not recipient-delivery proof.
- Exercised the real HTTP host, task runner, private runtime tools, separate Calendar/email approvals and approved-action ledger using two synthetic customer inputs. Both interrupted responses recover without another write in the fixture. Intervening mail, denial and withdrawn read/send permissions prevent a reply; an already completed meeting is preserved.
- Fixed a shared approval-handoff race exposed by these tests: a fast decision could queue continuation before the retiring process exited, and that old process's shutdown incorrectly cancelled the continuation. Pause now revokes old-worker tools immediately, targets only the captured process and preserves the host's newer decision. Browser sign-in uses the same pause primitive.
- Added rendered desktop/390px approval-flow QA, without redesigning the app or removing any provider choices.

Evidence, commands and precise limits are recorded in [customer workflow QA](QA_CUSTOMER_WORKFLOW_2026-09-08.md).

**Still open in package 2:** real-account customer pilot; expense documents → reconciled editable workbook + exceptions with two source sets; code bug → unchanged test oracle + reviewed delivery with two bugs. Existing individual tool tests do not count as completing these combined pilots. No overall competitor-parity or public-release claim follows from this implementation.

### Implemented: browser review, truthful stops and reconciled deliverables

- Real owner use exposed a Calendar browser action with no approvable review, a sent action hidden behind a later job limit, and an available browser route treated as an unavailable connector. These workflow blockers took priority over adding more feature surfaces.
- Browser click/type reviews now include readable controls and visible field values, checked again before execution. An actual private-browser fixture completes a calendar-like form once; changed fields prevent a stale Save. Generic browser actions no longer open a sign-in panel. Existing incomplete proposals require a fresh review rather than implicit approval.
- Host action results and task failures are independently visible in chat. Message-budget preflight preserves drafts, uploads and history, prevents partial team dispatch and never switches providers or raises owner limits. Sent-mail evidence is no longer described by the host as recipient delivery.
- Added exact, source-linked `table_reconcile` plus two upload-to-editable-workbook runtime cases. Totals, exceptions, original rows and unchanged sources are independently checked. This closes the bounded CSV reconciliation implementation slice; arbitrary scanned receipts and real-model accounting judgment are not thereby certified.
- Repaired live-browser lifecycle and second-viewer behavior; verified Calendar opens in Pixel's saved profile through the actual app without another login. No real event or email was created by this test.

Full evidence and limits: [workflow QA](QA_BROWSER_AND_WORKFLOWS_2026-09-08.md). The current suite passed 589 application tests, packaging/desktop tests, source checks and builds; rendered approval/budget tests cover desktop and phone widths. Real-model combined customer and file-work pilots, two-bug comparative code delivery, native-device parity and release gates remain open. Do not interpret deterministic fixtures or a reused sign-in as overall Hermes/Grok Bot parity.

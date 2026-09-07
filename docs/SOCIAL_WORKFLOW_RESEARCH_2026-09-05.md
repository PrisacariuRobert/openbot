# Grok Bot: real workflow research

Checked 5 September 2026. Public X posts were read in signed-in Chrome. No private messages, account changes, posts or purchases. This is a targeted qualitative sample, not a representative survey or authenticated head-to-head benchmark. Creator claims are not independently measured success rates.

| Primary source | Reported use | OpenBot gap / test target |
|---|---|---|
| [Ted Zhang, Aug 30](https://x.com/TedHZhang/status/2093842911930573174) | Gmail/Calendar/Notion daily priorities, reminders, news, social reply queues and podcast clips | Morning/inbox/meeting reports have synthetic live-model evidence. The current collector does not cover Notion or social DMs; add permissioned sources and verify coverage/drafts. His proposed grocery order was future intent, not a completed result. |
| [Lenny Rachitsky, Aug 28](https://x.com/lennysan/status/2093428147194847238) | Shared specialized bot templates, including a talent matchmaker | Reviewed built-in text skills are not full bot portability. Build shareable recipes containing instructions/capabilities, never credentials, memories or conversations. A reply asking about memory privacy is a question, not proof of a leak. |
| [Farzad, Aug 29](https://x.com/farzyness/status/2093485851606929592) | A channel clipper selecting moments and captioning Shorts | Material gap: tools alone do not establish a finished media pipeline. Need authorized inputs, timestamp-backed selections, actual renders, caption checks and preview before publication. Output video was not independently validated here. |
| [Jacob Miller, Aug 29](https://x.com/pwnies/status/2093494257105379569) | Speedlab tests website-performance improvements and retains successful candidates | Isolated code jobs and exact-commit checks exist. Missing: repeatable timing baselines, multiple measurements, regression checks and independently proven speed improvements. Unit-test success is not performance proof. |
| [Buildcamp first-person post](https://www.reddit.com/r/Buildcamp/comments/1vp0u3o/how_i_use_grok_bot_at_work_to_get_hours_of_time/) | Narrow news/issue/documentation/Reddit briefs and Gmail reply drafts with human sending | Target one owner, one digest, linked evidence and explicit unsent state. Account-reuse/promotional references are anecdotes, not portable connector authority. |
| [Business user's report](https://www.reddit.com/r/grok/comments/1vob5q2/grok_bot/) | Role-specific agents, follow-ups and browser apps without APIs | Reports also describe profile resets, crashes, usage and concurrency friction. Turn these into persistence/recovery/cost tests, not population-wide claims. |

The [workflow directory](https://grokbotlist.com/research/grok-bot-landscape/) helped locate primary posts; catalog counts and reconstructed prompts are discovery aids, not proof.

## Official facts and priority

The [work guide](https://cursor.com/docs/grok-bot/work) emphasizes persistent cloud execution, handoffs and reviewable work. It currently describes one computer shared by a user's bots with separate screens; screens are not security boundaries. Do not repeat older claims that every bot necessarily has its own VM. The [use cases](https://cursor.com/docs/grok-bot/use-cases) specify account research, expense reconciliation, staging bug reproduction and source-linked decisions. The complete repeatable job matters more than tool count.

## Implemented response

**Change-aware public-page monitoring:** save a readable baseline, compare later checks without a model, and queue the ordinary teammate workflow only when content changes. Source URL, times, hashes and bounded added/removed excerpts are retained, with a text evidence download independent of the model summary.

Web and native Mac creation/edit/pause/check controls and natural-chat creation share validated host behavior. Failed reads/dispatch keep the previous baseline; event/run and new baseline commit together. Restart does not replay an unchanged page. Editing the source starts fresh.

Limits: 20 watches, minimum 15-minute scheduled interval (manual Check now can run sooner), two simultaneous reads, 15-second timeout, 1 MB response and 8,000 characters of complete readable text. Public HTTPS only; no login, credentials, query strings, fragments, redirects or JavaScript. DNS is validated and pinned. No pixel/link-only comparison or every intermediate change between polls. The host must be awake. Normal budgets/approvals apply; page events cannot create more automations. This does not reuse Codex's Chrome sessions. [Verification](QA_PAGE_WATCH.md).

## Remaining outcome gaps

1. Broader daily-brief sources, especially Notion/Slack, through the receipt/permission contract and repeated real-account evaluation.
2. Reliable authenticated browser workflows; public-page monitoring is not social-inbox automation.
3. Privacy-safe shareable teammate recipes and guided required-connection setup.
4. Document fidelity, media transcription/clipping, measured website optimization—with independent output checks.
5. Managed provisioning, signed distribution/updates and real cellular/push proof. Relay deployment is explicitly deferred by the owner.

Defensible differences: owner-selected models/eligible subscriptions, self-hostable data/execution, explicit access, inspectable evidence and model-free unchanged polling. Lower total cost or higher task success versus Grok Bot has not been established.

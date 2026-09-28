# OpenBot 0.35 — workflow reliability and packaged startup

Date: 5 September 2026. Unpublished owner-operated beta.

Newest same-version follow-up: limited open MCP connections, reviewed portable text skills, correctable private memory, native/web controls and live-stream-safe shutdown. See [QA_OPEN_EXTENSIONS](QA_OPEN_EXTENSIONS.md) for the latest regression total, two live Spark outcomes, public MCP check and exact native/package scope. Earlier counts below describe their original passes.

Later same-version follow-up: Mac Mail/Calendar source fallback, access-aware starter routing and native source gates are implemented. The regression total is now **197 tests and 16 native Mac tests**. See [fallback evidence and the live-permission blocker](QA_MAC_FALLBACK.md); earlier counts below describe the preceding pass.

## Implemented and checked

- **Completion means a saved result.** Web, Mac and iPhone report starters persist the expected report kind. A missing result gets one repair within existing execution budgets; a second miss fails visibly. Wrong-kind reports, restart and steering cannot bypass the contract.
- **Meeting Prep has a source pipeline.** Select the next timed primary-calendar meeting within seven days, then collect bounded title-matched mail and Drive documents. Missing or truncated coverage and uncertain relevance remain visible. No upcoming meeting or unusable calendar access does not trigger unrelated mail/Drive searches. Drive downloads have byte and time bounds.
- **Actual tool filtering.** Named OpenCode agents enforce capability policies after global/legacy configuration precedence. Report starters expose only `work_collect` and `work_report`. A real OpenCode transport fixture checks the exact tool list and ordinary-agent disabled capabilities, not just generated JSON.
- **Scoped internal credentials.** Models receive an HMAC token bound to one teammate and run, not the server's master tool token. Cross-run, cross-teammate and malformed tokens fail. This is defense in depth, not host process/credential isolation.
- **Shared job allowance.** Coordinator, consultants and steered follow-ups share a persisted default 100,000 reported-token allowance, configurable through `OPENBOT_JOB_MAX_TOKENS`. Tests stop unfinished family members and pending approvals without stopping unrelated work. Reporting delays can overshoot; this is not an exact billing cap.
- **JavaScript and Python checks.** Real network-disabled Docker checks first fail on faulty code, then pass after changing only the implementation. Receipts bind to the checked commit. Fresh bounded check views solve a reproduced Colima stale-file problem; generated outputs stay disposable, tracked mutations are detected, and original checkouts/test oracles remain untouched. Arbitrary dependency provisioning and semantic test quality are not established.
- **Packaged native startup.** The app embeds Node, OpenCode, version-matched licenses, server, production UI, dependencies, skills and launcher. Fresh data uses Application Support; existing configured homes are preserved. Unknown/missing homes fail rather than silently creating a blank studio. Remote connections do not start a local runner.
- **No implicit migration.** No owner-data migration, rollback or login-service replacement was performed. Background protection remains explicit. The owner's existing studio is not evidence of a clean first installation.

## Automated evidence

- `npm run verify`: **185 tests passed**, release/native source contracts, TypeScript check and production build passed.
- Native macOS: **15 XCTest tests passed**; Release build succeeded. Includes data-home preservation and all three starters' report metadata.
- iOS: generic Simulator build succeeded. This is not a physical-device or visual review.
- `npm run test:productivity-runtime`: actual OpenCode against a local scripted model endpoint; Morning Brief, Inbox Follow-ups and Meeting Prep each save one source-linked artifact, with exactly one unsent inbox draft. Ordinary-agent permission filtering also passes. No real inbox, subscription or external write is used by this fixture.
- `npm run test:code-runtime`: real JavaScript and Python container acceptance passed, including unchanged independent tests, failure-before/fix-after, original checkout preservation and owned-container cleanup.
- `npm run test:macos-package -- /path/to/OpenBot.app`: packaged Node/OpenCode work on a system-only PATH; disposable studio health, SQLite, production UI and process shutdown pass. No owner's data or LaunchAgent is changed.
- `npm run test:provider-runtime`: actual OpenCode sends the configured model and fixture credential to a local endpoint and streams the reply. This is transport evidence, not model-quality evidence.

## Small live-model sample

Only `opencode/muse-spark-1.2-contributor-free` was selected, explicitly. Six runs used synthetic Google data: three before and three after narrowing the report agent. Every run saved a source-linked report; both inbox runs created one local unsent draft. No real account mail was read and no external write was made.

| Sample | Aggregate reported tokens (input + output + reasoning) | Aggregate elapsed time | Results |
|---|---:|---:|---|
| Before report-only profile | 52,226 | 81.7 seconds | 3/3 saved |
| After report-only profile | 25,878 | 51.1 seconds | 3/3 saved |

This small uncontrolled sample is encouraging, not a repeatable benchmark. One workflow's token count increased; aggregate reduction is not a per-job guarantee. It does not establish two-provider reliability, ten-run success rates, head-to-head Grok Bot parity, or exact billing. Main Codex development still consumes the owner's allowance; no usage reset was consumed.

## Local delivery

The updated source runner was restarted on port 4311 only after confirming zero running, queued or waiting jobs. Authenticated health returned online after restart, and the live database contains the additive report-completion columns. Existing data and connection settings stayed in place. A separately named, strict-signature-verified development app is saved at `/Users/robert/Applications/OpenBot Preview.app`; the previously installed `OpenBot.app` was not overwritten. The final bundled OpenCode executable also passed the local provider transport fixture with a system-only PATH. Nothing was pushed or merged in this pass.

## Remaining release boundaries

The package is ad-hoc signed for the build host's architecture. Developer ID signing, hardened runtime, notarization, signed update distribution and second-Mac Gatekeeper onboarding are not verified. Optional Claude Code, browser/Docker dependencies and model/connector consent remain separate setup. Mac-local work requires an awake, powered-on Mac; no always-on host was deployed in this pass.

The Mac was locked, so new visual review was unavailable. No physical iPhone/cellular/APNs/TestFlight test occurred. Host model/plugin credential isolation, full browser egress control, arbitrary document editing/render checks, Windows packaging and provider-specific uncertain-action reconciliation remain separate engineering gaps. No broad launch-readiness or comparative-superiority claim is supported by this record.

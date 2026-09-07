# Checked outcomes — 0.35.0 development beta

Verified September 5, 2026. This record distinguishes implemented behavior, live-model results, test-harness defects, and remaining release gates. It does **not** establish general Grok Bot parity or a public-launch certification.

## What changed

- `table_summary` computes exact decimal CSV sums with named grouping columns and explicit ANDed equality/inequality filters. Results identify the source SHA-256, included rows and exclusions. Blank, malformed or ambiguous numeric values fail instead of becoming guessed zeros. Different currencies must be grouped separately; no conversion or policy judgment is performed.
- `spreadsheet_export` creates new editable XLSX workbooks from workspace CSVs. It preserves source files, rejects overwrites, keeps text IDs and formula-like strings literal, and converts only explicitly selected numeric columns. It adds frozen headers and filters. Both OpenCode and Claude Code tool adapters expose it; the live-model tests below exercised OpenCode.
- Consultants receive the current original uploads in their own workspace, with explicit version context and source hashes. A missing, altered or cross-conversation source fails visibly. Old same-named files are not substituted. The coordinator still gives one user-facing result after private consultation.
- Clear coordinated prohibitions such as “do not push, publish, or change my checkout” no longer cause a false publishing approval. Ambiguous phrasing remains conservative; actual command, browser and external-write approval checks are unchanged.
- Acceptance scripts now have their own TypeScript check in `npm run verify` and retain outcome evidence instead of treating a fluent answer as proof.

Provider choice remains explicit. These tests selected **`opencode/muse-spark-1.3-contributor-free`**; the product does not default to it or silently switch models.

## Final live-model results

All records use synthetic inputs and isolated studio data. No personal inbox, reimbursement record, external message, push or PR was changed.

| Workflow | Result | Seconds | Reported input / output tokens |
|---|---|---:|---:|
| Expense variant 1 | Pass | 45.543 | 20,602 / 3,528 |
| Expense variant 2 — changed amounts, receipt availability and policy threshold | Pass | 56.592 | 22,424 / 3,500 |
| Expense variant 3 — current-source private review before one answer | Pass | 121.130 | 44,850 / 6,403 across coordinator + consultant |
| Morning brief | Pass | 8.423 | 6,613 / 404 |
| Inbox follow-ups with an unsent draft | Pass | 17.868 | 6,801 / 449 |
| Next-meeting preparation | Pass | 8.521 | 7,108 / 448 |
| JavaScript quantity bug: reproduce, isolate, fix, commit and retest | Pass | 61.348 | 24,321 / 3,613 |

Usage is provider-reported, not an invoice or an exact spending cap. Cached input is recorded separately: 195,261 / 147,178 / 362,279 for the three final expense cases, and 385,304 for coding. Reasoning is also recorded separately where reported; do not sum token categories into a billing claim without the provider's accounting definition. Daily-report logs did not print cached input, so it is unavailable here, not assumed zero. These samples are not a statistical success rate.

### Expense acceptance criteria

1. Upload three files through the production attachment endpoint, then submit a natural task through the production message endpoint.
2. Run the actual selected model, agent runtime, run-scoped tools, storage and artifact capture.
3. Independently compute expected totals with integer cents. Verify cancelled entries are excluded, refunds stay signed, currencies remain separate, and receipt/policy exceptions match the source IDs.
4. Download the returned JSON, Markdown and XLSX through the artifact endpoints. Open the workbook with **openpyxl 3.1.5**, independently of OpenBot's writer/previewer, and compare every value in both sheets.
5. Preserve leading-zero IDs, original rows and source hashes. A `HYPERLINK(...)`-like cell must remain literal text with no formula, macro, external link or active hyperlink. An imported note asking the agent to ignore policy must not change the result.
6. Require host-computed totals. For the consultation case, require a completed reviewer, no duplicate outward answer, receipt of the current source hash, and actual calculation against that same version.

The final third case produced EUR **218.44** and USD **33.94**. The consultant independently confirmed those values and all four policy exceptions from the current sources. This remains an eight-row synthetic expense exercise, not a production finance-system reconciliation or validated financial advice.

### Coding acceptance criteria

Spark reproduced a quantity bug using `node total.test.cjs`, then changed only `total.cjs` in an isolated Git task workspace. Original tests passed in a network-disabled Docker check view against the repaired commit. The test suite, original checkout, original branch and original commit stayed unchanged. No packages were installed by the agent and nothing was published.

This is one small JavaScript fixture, not general code quality or repository-scale performance. The existing Colima VM was initially stopped; it was started for these checks and left available without changing its configuration. Missing Docker was correctly reported as unverified work, not a successful test.

### Daily-report scope

Morning, inbox and meeting tests use actual Spark reasoning and the installed OpenCode/tool/report pipeline, but synthetic Google responses. Source references, saved report attachments and unsent-draft boundaries are checked. They do not prove real-account OAuth, mailbox coverage, calendar sync, OS consent or interpretation quality across representative inboxes.

## Failures we found rather than hiding

- An early expense run produced a correct final report, and the initial test called it a pass because a consultant completed. Manual inspection showed that the consultant had read an **older** same-named CSV and disputed the correct totals. That is a failed source-quality review, regardless of the final answer. The missing workspace handoff was fixed, three regressions were added, and the stronger current-source test passed. The earlier run is retained and is not counted as proof of correct consultation.
- The coding request was blocked before execution because a negative action list contained “publish.” This was an application false positive. Coordinated exclusions now have regression tests while positive/ambiguous publication and real tool mutations still trigger approval.
- Coding harness setup initially chose a hidden folder, which the real project API correctly rejected. The harness now uses a visible, disposable cache folder within the user's home.
- An early harness verifier opened a nested empty database instead of the runtime's configured data directory. That test error was fixed. Independent failing/passing commit receipts are now read from the correct isolated studio.
- The first actual coding attempt found Docker unavailable. Its unexecuted checks were not counted as passes. Only the subsequent real Docker reproduction and repaired-commit checks count in the final table.

## Automated and delivery verification

- `npm run verify`: **225 tests passed**, release/native source contracts, application TypeScript, acceptance-script TypeScript, and production build passed.
- `npm run test:onboarding`: production API + headless desktop/390px browser verified explicit provider/model choice, no dispatch before selection, persistence and contained layout. No live model login was used.
- `npm run test:productivity-runtime` without a live model: real OpenCode transport with scripted replies verified report-only tools, ordinary capabilities, synthetic Mac fallback and two-app source flow. This is integration evidence, not model reasoning.
- Updated `/Users/robert/Applications/OpenBot Preview.app` contains the new server capabilities. Code-signature verification and a packaged startup test with isolated data and a system-only PATH passed. The original `OpenBot.app` was not changed; the prior preview remains recoverable in the staging backup.
- The existing local server was refreshed only after checking it had no active/queued/approval-waiting jobs. Health returned successfully. Existing bot/provider assignments and studio data were not reset.

No new native layout or device-visual claim is made in this pass. The existing SwiftUI binary is unchanged; these capabilities are delivered through its shared backend and artifact flow. The package is still ad-hoc signed, not notarized for public distribution.

## Reproduce

Run in a source checkout with dependencies installed. Live commands use the explicitly chosen account's allowance. Do not run them against an owner's real studio.

```sh
npm run verify
npm run test:onboarding
npm run test:productivity-runtime

OPENBOT_BENCHMARK_MODEL=opencode/muse-spark-1.3-contributor-free \
OPENBOT_XLSX_PYTHON=/path/to/python-with-openpyxl \
npm run benchmark:expenses

OPENBOT_PRODUCTIVITY_LIVE_MODEL=opencode/muse-spark-1.3-contributor-free \
npm run test:productivity-runtime

# Requires the existing Docker/Colima host to be running.
OPENBOT_BENCHMARK_MODEL=opencode/muse-spark-1.3-contributor-free \
OPENBOT_BENCHMARK_CODE=1 npm run benchmark:workflows
```

The expense command prints an evidence folder containing prompts, independent expected data, downloaded outputs, exact-reader results and observations. It excludes the disposable runtime credentials. The coding command retains check receipts and a repair diff; failed private fixtures remain available for diagnosis. No silent fallback model is selected.

## Scope and release limits

CSV calculations/export are bounded to 2 MiB per UTF-8 input, 10,000 rows per sheet and 100,000 cells. Export supports up to eight sheets and 256 columns, with 32,767 characters per cell and at most 15 significant digits in explicitly numeric Excel cells. Aggregation supports up to three grouping columns, eight sums, five exact filters and 200 groups. Unsupported input fails instead of truncating silently. Decimal aggregation preserves more precision than Excel numeric cells; keep high-precision outputs as text.

This does not round-trip arbitrary workbooks, recalculate formulas, preserve existing charts/macros/layouts, render Excel visually, implement OCR, or replace a spreadsheet application. Shared-source identity does not guarantee sound reasoning. Local filesystem checks are not a complete adversarial process sandbox.

Remaining broad gates: signed installers and updates, clean second-Mac setup, representative repeated multi-provider workflows, real-account connector tests, OS-consented app reads, remote-host/cellular/push acceptance, stronger process/network isolation, and implemented public plugin interoperability. No authenticated Grok Bot head-to-head was run. The [current competitive assessment](COMPETITOR_RECHECK_2026-09-05.md) uses [Cursor's documented use cases](https://cursor.com/docs/grok-bot/use-cases) as outcome targets, not evidence that OpenBot outperforms them.

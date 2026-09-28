# Task allowances and live teamwork pilot

8 September 2026. Local checkout; no release or parity claim.

## Task-token approvals

Reaching the run or shared-job token ceiling now pauses the outcome instead of failing it. One owner review covers the coordinator and its consultants. Choose 50,000, 100,000 or 250,000 additional tokens, then separately approve a fresh review showing usage, the new total and participating models. Choosing an amount does not itself authorize spending. The amount and current usage are bound into the review fingerprint; old or duplicate decisions are rejected.

The same job keeps its counters, plan, model/session and completed-action receipts. A coordinator remains waiting for unfinished consultants. Prepared but unexecuted action approvals are withdrawn and require new review. An already-running host action must finish before a grant. Declining or stopping cancels the paused family, not unrelated work. YOLO does not auto-approve token spending. Weekly allowances, provider limits, time/step guards and external-action permissions remain unchanged.

Usage can arrive only after a model step, so a reported total can exceed the previous ceiling. The new review accounts for this overrun before adding the selected headroom. This is not a purchase, subscription reset or exact cost guarantee.

## Tests

- `npm run verify`: 604 application tests, 9 packaging tests, 5 desktop tests, source checks, TypeScript checks and production build passed after the changes below. The existing bundle-size warning remains.
- `npm run test:task-tokens-ui`: real React app and owner routes against a disposable calendar-like website, desktop and 390px phone viewport. Reviewed 250,000-token selection, separate approval, same-run continuation and exactly one Save. Screenshots were visually inspected.
- `src/server/task-token-workflow.test.ts`: actual host, runner and private browser with a deterministic model fixture. Missing/stale fingerprints, late usage, changing allowance, explicit approval in YOLO, refusal, and no repeated browser Save.
- `src/server/task-token-budget.test.ts`: durable pause, repeat ceilings, counters preserved, weekly gates, whole-family cancellation/continuation, in-flight actions and withdrawal of unexecuted approvals.

These fixtures do not use personal accounts or a real model. They are separate evidence from the live pilot below.

## Live pilot: expense workbook and private reviews

Submitted through OpenBot's actual UI to Pixel, using its selected `opencode-go/glm-5.3-flash`. Nova and Scout retain their selected `opencode/muse-spark-1.2-contributor-free` models. No global or weekly allowance was changed.

The fictional dataset has eight rows, duplicate ID `003`, missing receipt `002`, one refund, one zero amount, and separate EUR/USD values. The task requires private reviews from Nova and Scout and one final synthesized answer from Pixel. Expected independent controls:

| Currency | All rows | First occurrence per ID | Eligible with receipt |
| --- | ---: | ---: | ---: |
| EUR | 130.00 | 90.00 | 72.00 |
| USD | 20.00 | 20.00 | 20.00 |

Initial run: `66e0b6e9-f1b8-4541-b3e6-c0d7d8354129`. It paused at 118,984 reported tokens. A live owner-UI review approved 50,000 more and resumed the same run. The next step reported 179,338 total, exceeding that allowance again. This exposed the need for a larger selectable grant, rather than repeated undersized 50,000-token resumptions. A subsequent reviewed 250,000 grant set the family ceiling to 429,338. User feedback steered the same outcome into `dbdd72db-eaa4-4096-ab82-e95797948e48`, retaining the original family's usage and allowance.

### Confirmed workbook gap and repair

Independent inspection found that the first workbook contained formula-looking text, not Excel formula cells. Its note incorrectly promised recalculation. The original inputs, including leading-zero identifiers, were retained, but the workbook was not accepted as finished. No evaluator edited that bot-authored deliverable.

The app's CSV-to-XLSX exporter now has an explicit per-sheet `formulas` channel. It creates actual formula cells only from deliberately supplied `{cell, formula}` entries; CSV text is never silently evaluated. Destinations must be blank or contain the exact formula text and cannot overwrite headers or source values. Basic local arithmetic and a small allowlist such as SUMIFS, COUNTIFS and IF are supported. External books, DDE, dynamic/network functions, whole-column references and unknown sheets are rejected. Excel is asked to recalculate on opening. Export does not itself establish calculation correctness.

Export receipts report actual formula count, literal formula-looking cells and a warning when such text will not calculate. Both OpenCode and Claude tool schemas expose the new option. Focused export tests verify real formula XML, retained sources, formula-injection safety and unsupported-expression rejection. The actual Claude stdio schema is checked too.

Pixel was asked through the app to repair the workbook using the updated tool, preserve the original files, and obtain both private reviews.

The bot produced `expense-review-v2.xlsx` with 35 actual formula cells and zero literal formula-looking strings. Independent Artifact Tool import/recalculation verified all six currency totals above, eligible row counts (EUR 5, USD 1), eight retained source rows and the original text IDs. Increasing the first expense from 24.50 to 34.50 in a disposable in-memory copy changed the EUR totals to 140/100/82; restoring it restored 130/90/72. The bot's file was never modified by the audit. This verifies the imported formulas in that calculation engine, not a separate native Excel/Numbers session. Original-sheet renders were inspected; CSV source values and raw XLSX types remain the authority for leading-zero IDs.

### Actual private bot communication

- Pixel sent two distinct private questions with `message_teammate`, then waited rather than publishing a premature final answer.
- Nova (`f3e45575-4065-4f16-8bbc-36eba571faf0`) independently recomputed from the raw eight-row table. All six totals and both eligible row counts matched; it returned a private finding.
- Scout (`b78e6bdc-3547-4ee8-8657-971877b84070`) checked source files, rules and completeness. It explicitly reported that direct XLSX inspection was blocked by unavailable Docker, so its workbook check was partial, not complete. It returned a private finding.
- The coordinator woke only after both consultant runs finished. The family reached 443,531 reported tokens against its 429,338 allowance; a separately reviewed 250,000-token grant set a new 693,531 ceiling. Pixel resumed and completed at 17:40:57 UTC.
- Exactly one bot-authored final answer was published, from Pixel, with the workbook and verification note. The consultants did not publish competing final answers. System messages show the private exchanges. Historical request events now say “Reply requested,” not an indefinite “Waiting for their reply.”

The live test also caught reporting weaknesses: Pixel's final description overstated Scout's partial review and appended an unrelated earlier calendar update. The coordinator-resumption instructions now explicitly preserve partial/blocked/unverified findings and restrict synthesis to the current request. A regression test verifies those instructions are retained. This is a prompting safeguard, not a guarantee across all models.

### Docker-independent saved workbook read-back

Added `spreadsheet_inspect` to both provider tool paths. It reopens only visible XLSX files inside the calling teammate's workspace, rejects symlinks/traversal and oversized files, and returns a hash-bound bounded preview. Stored text IDs, cell addresses and formula definitions are exposed separately from potentially missing/stale caches. Formulas, macros and external links are never executed. Coverage remains explicitly partial where appropriate; the tool does not calculate or render a workbook.

Unit checks cover unchanged bytes, IDs, real versus literal formulas, unresolved shared formulas, unsafe paths, oversized files and inert external formula definitions. Two host workflow fixtures now export, reopen through the actual internal tool endpoint, and check the result hash against downloaded workbook bytes.

Follow-up live read-back run: `c7e1ae1f-2154-4913-99ad-a8fec0a9de9f`. Pixel was asked to call the new inspector and correct its own verification note, not to rebuild the workbook or revisit accounts. The long existing session reached 189,178 reported tokens; a reviewed 250,000 grant gave it a 439,178-token task ceiling. No global or weekly limits were changed.

The follow-up completed at 17:47:36 UTC with 203,454 reported tokens. Pixel called `spreadsheet_inspect` at 17:47:05; the host recorded `expense-review-v2.xlsx`, hash prefix `006dc8467c6c`, with stored cells explicitly marked not recalculated. Pixel updated and reread its own note, recording 35 stored formulas, the text IDs and the missing-cache/recalculation caveat. It corrected Scout's review to partial at the time of that review. Its single follow-up answer did not append the earlier calendar/email topic. The independently recalculated values remain separate evaluator evidence, not evidence that OpenBot itself ran Excel.

Final state: no pilot runs queued, running, awaiting approval or waiting for teammates. Final TypeScript/build checks and `git diff --check` passed after the historical chat-label change. The source and outputs are local; no release, commit, push or merge was performed.

## Scope and remaining evidence

No new email, event, invitation, purchase or third-party account was created by this fictional-data pilot. The earlier dinner task was not replayed. Google sign-in and other real-account workflows are not re-proven by these spreadsheet/teamwork tests. Native Excel/Numbers and the native iPhone token-review UI were not exercised here. Large existing model sessions still make task usage expensive; the approval controls provide bounded continuation, not a context-cost optimization or a provider quota reset.

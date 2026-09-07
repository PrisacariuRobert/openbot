# Provider-first setup and faithful spreadsheet previews

5 September 2026 · unpublished 0.35.0 follow-up.

## Research and defects

[Fresh comparative audit](COMPETITOR_RECHECK_2026-09-05.md) maps current official Grok Bot docs and user reports to actual source paths and outcome tests. No authenticated Grok Bot run was performed. Prioritize complete, dependable workflows over feature labels.

Found implicit OpenCode/Muse seeding, a global OpenCode-preferred model, fallback assignment on bot creation, and a legacy seed update that would reassign NULL providers on restart. Fresh bots now keep NULL provider/empty model until an explicit choice. Existing assignments and legacy configured OpenCode models survive. Choosing for the team only changes previously unconfigured bots. The user must choose both connection and model; saving/discovering a credential never makes that choice. Dispatch refuses unconfigured work before starting a model. New web/native Mac teammates no longer automatically select the first provider.

Web and native Mac show provider setup on fresh launch. Native iPhone adds account login/code completion, private API/local setup, explicit provider/model selection and individual teammate assignment. Loopback model addresses refer to the studio host, not the phone. Login eligibility and actual model tool support remain provider-dependent; no subscription OAuth flow was certified by these tests.

Spreadsheet audit found silent 500-row CSV cutoff, missing columns/cell positions and incorrect sheet-name association. CSV counts the complete bounded upload, retains quoted record boundaries, and labels omitted rows/columns/text. Excel uses workbook relationships for names, retains original cell addresses, flags missing shared strings, excluded XML, merged cells and formula caches. Cached formulas are not recalculated; macros/external links are not executed. Number/date formatting, pictures, charts, XML variants and full layout remain limited. [SpreadsheetML reference](https://learn.microsoft.com/en-us/office/open-xml/spreadsheet/working-with-sheets).

## Verification

- `npm run verify`: 211 tests, TypeScript, release/native source checks and production web build pass.
- `npm run test:onboarding`: real disposable host and headless Chrome; empty selection, refused pre-choice task with zero runs, rejected implicit new-bot creation, explicit local connection/model selection through UI, persisted choice on reload and no horizontal sheet overflow at 390px. No real sign-in/model request. Screenshots: `/tmp/openbot-provider-choice-desktop.png`, `/tmp/openbot-provider-choice-mobile.png`.
- Database tests cover empty first run and restart, no auto-assignment from saved providers, mismatched model rejection, preserved existing choices and unconfigured new bots. Runner test confirms zero process spawn for unconfigured work.
- Five spreadsheet regressions cover >500 rows, quotes/newlines/CRLF/BOM, blank cells, malformed CSV, wide/large previews, sparse Excel addresses, relationship names, formula caches, unavailable strings and archive exclusions.
- `npm run test:productivity-runtime`: real OpenCode transport with scripted local model, morning/inbox/meeting reports, normal tool permissions, Mac source fallback and two-app receipts all pass. App content is synthetic, not a real OS-access test.
- Native macOS Debug/Release and generic iOS Simulator builds pass with the new first-run paths; 16 native Mac XCTest cases pass. This is not complete native visual/accessibility/OAuth certification.

## Live model acceptance (isolated files, no personal inbox or external changes)

Explicit model selection via the opt-in benchmark; neither became the studio default.

| Model | Source/artifact result | Private consultation |
|---|---|---|
| Muse Spark 1.2 Free | Pass, 37.2s; 16,291 input / 1,582 output reported tokens | Pass, 128.9s; completed child before exactly one coordinator answer |
| Ling 3.0 Flash Free | Pass, 34.2s; 12,282 input / 1,530 output reported tokens | Pass, 115.9s; completed child before exactly one coordinator answer |

Artifact oracle independently parsed saved JSON totals (42 paid / 30 pending), checked source row IDs and a downloadable result. Consultation required an actual completed child run, not an invented exchange. Four workflows are a small sample, not the planned repeated quality gate or proof of equal/better performance than Grok Bot. Consultation timing is slow even for arithmetic; optimize and remeasure. This run did not print complete consultation-family token totals, so do not infer total cost from the artifact-only numbers.

## Local delivery

Updated `/Users/robert/Applications/OpenBot Preview.app` with the current native Release and bundled backend. Deep strict signature verification and system-only-PATH isolated package startup passed. The previous preview is recoverable at `/Users/robert/Applications/openbot-preview-stage.W9hSDv/Previous OpenBot Preview.app`. The original `OpenBot.app` was not changed. These changes remain local/unpublished; no push or merge was performed.

Reloaded the source host only after confirming zero queued/running/waiting jobs. Health returned 200 and the new provider-choice route returned its expected validation response without changing any existing provider assignment.

## Still open

Broad MCP/plugin integration, managed/clean-host deployment, signed updates and Windows; real consent/app reads and cellular/APNs testing; rich document output/recalculation/OCR; robust runtime/egress isolation and provider-specific action reconciliation; larger repeated live quality and performance evaluation. No blanket parity, universal subscription support, or launch-readiness claim.

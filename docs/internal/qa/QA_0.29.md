# 0.29 validation record

Date: 4 September 2026. Branch: `codex/product-audit-foundations`.

This records observed results for the development changes, not an App Store release or a head-to-head Grok Bot evaluation.

| Check | Evidence | Status |
|---|---|---|
| Message integrity, provider configuration/storage, usage accounting, environment filtering | Executable regression tests; historical failures remain unchanged; invalid configurations and cross-connection models rejected | Passing focused tests |
| OAuth protocol and polling | Fake runtime methods and callback lifecycle; concurrent status reads coalesce | Passing fixture tests; live account consent not exercised |
| Custom provider transport | Installed OpenCode 1.18.16; disposable HTTP fixture; exact model `fixture-model:latest`; scoped fixture key; streamed reply | Passed, two requests observed |
| Connection settings | Real API save with no key for a loopback local model; saved-not-tested message; source-backed assignment choices | Passed in isolated QA data |
| Browser action classification | Generic Send selector, ambiguous button, secure field, ordinary link and search cases | Passing policy tests; adversarial browser review still required |
| Full verification | `npm run verify`: 130 tests, zero failed/skipped; TypeScript and production build pass | Passed locally |
| Capability filtering | Real Claude MCP child process omits disabled tools and rejects a direct disabled write; no file created | Passed fixture test |
| Consultation startup failure | Invalid child model fails privately, queues the coordinator and does not publish a second user-facing reply | Passed regression test |
| Responsive connection settings | 390 × 844 and 1280 × 800; no horizontal overflow; local form, saved model assignment and fresh-page persistence checked | Passed web UI QA |
| Keyboard access | Initial dialog focus; Shift-Tab wraps within dialog; Escape closes; focus returns to the invoking control | Passed web UI QA |
| Running local app | Database backup, idle-job/approval check, managed background restart; HTTP 200, runner online, migrated configuration fields and runtime detection confirmed | Passed on this Mac; not a fresh-host installation |

## Live-model workflow observations

The opt-in `benchmark:workflows` command used the installed OpenCode runtime and `opencode/muse-spark-1.2-contributor-free`, in disposable OpenBot data. No real mailbox, calendar or project was connected. Both workflow types passed on both runs:

| Workflow | Before capability filtering | After capability filtering | Independent success condition |
|---|---|---|---|
| CSV to result files | 66.3 s; 29,185 input / 2,375 output tokens | 42.2 s; 27,621 input / 2,300 output tokens | JSON has exact totals 42 paid / 30 pending, three paid rows, pending source D; referenced report and result attachments exist |
| Private teammate consultation | 29.1 s | 97.6 s | A real child run completes; only the coordinator publishes a final user answer after consultation |

These are **two workflow types, two runs each**, not a reliability rate or a speed benchmark against Grok Bot. Latency varied substantially; no general performance improvement is claimed. Even the small CSV task still used considerable model context. Repeat with more realistic fixtures and at least two model classes before setting product targets.

## Build and release scope

The main client bundle is 414.45 kB uncompressed; the connection panel is loaded separately. This is the measured current build, not a claimed improvement percentage over a recorded release baseline.

The iOS project version/build metadata is synchronized at 0.29.0 / 33. Available Swift syntax parsing and source-contract checks passed. No native build, simulator flow, VoiceOver session, physical-device or APNs delivery test was performed in this pass. GitHub CI and the Docker/private-host build were not run in this pass; local verification must not be labelled a green published release.

Changes are on `codex/product-audit-foundations`, based on the existing 0.28 work. Nothing was merged or published. README, marketing claims, launch-readiness notes and the audit were updated together.

## Scope limits

No real email or third-party write was sent. No real Grok Bot account was benchmarked. No claim of certified sandboxing, all-provider tool compatibility, VPS readiness, native screen parity or physical APNs delivery is made. New custom API setup is implemented in the web client; the native client remains a follow-up.

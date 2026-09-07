# Outcome-first replies and self-contained Mac candidate

Latest rendered follow-up: [unlocked-Mac checks, 7 September](QA_UNLOCKED_MAC_2026-09-07.md). The earlier package and test counts below remain evidence of the 6 September candidate; they are not automatically evidence of later changes.

Verified 6 September 2026 on the local 0.37.0 working tree. No installed app was replaced, no release was published, and no owner account or model allowance was used by these checks.

## Functional changes

Previously, the runner concatenated intermediate assistant turns into the eventual conversation message. Claude's explicit result was ignored if any earlier assistant text existed. This made completed conversations read like work logs and could discard the actual final answer.

- The runner now tracks provider-delimited turns and completed text-part identities. Replayed parts do not duplicate the answer or replace newer output. Multipart final answers stay together.
- Claude's successful final result is authoritative for reply selection; it is not independent proof that the requested work succeeded. Existing host verification and delivery receipts remain responsible for that distinction.
- Intermediate assistant updates are stored separately as run activities and exposed under **Work updates** in web, native Mac and iPhone messages. The final answer remains the message body, sidebar preview and copy/share text. Activity retrieval is bound to the result's run, teammate and conversation.
- A clean process exit after an unfinished tool step or an explicit runtime error cannot publish an earlier progress update as a completed reply. Paused approvals, private consultations, cancellation and usage stops retain their existing state precedence.
- The text limit includes archived progress. Reasoning, system messages and tool payloads are not treated as public assistant text. This is event parsing, not another model call.
- Historical message bodies are unchanged. Older unstructured text streams retain all text when turn boundaries are unavailable. This does not automatically rewrite verbose text within a single final message or prove every output format is supported.

The event adapter was checked against [OpenCode's CLI implementation](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/cli/cmd/run.ts) and [Claude's documented message flow](https://code.claude.com/docs/en/agent-sdk/streaming-output#message-flow). The installed OpenCode executable also passed the controlled-endpoint test with this same parser.

## Verification

| Check | Result and boundary |
| --- | --- |
| Full `npm run verify` | 471 application/service tests and five packaging transaction tests passed; native source contracts, application/acceptance typechecks and production build passed. Existing large web-chunk warning remains. |
| Process regression | A real fixture process emits progress, a tool event and a final reply; only the final is published, earlier updates survive database reads, and another thread cannot acquire those updates using a mismatched run ID. Exit-zero/tool-only and error cases fail without a success message. |
| Actual OpenCode transport | Installed CLI → disposable deterministic endpoint → parsed final answer passed. This verifies transport/parser integration, not live-model reasoning or subscription eligibility. |
| Web acceptance | 1440/390/320-pixel flows passed, including folded/expandable work updates, retained drafts and no unconfigured send. The stale disabled-Send assertion was replaced by assertions for the current provider chooser, zero message submissions and draft preservation. |
| Native Mac | Debug build and 36 unit tests passed; Release build passed. No rendered inspection of this newest build while the Mac is locked. |
| iPhone Simulator | 28 unit tests and one synthetic UI workflow passed. The workflow expands/collapses progress, opens failed-work and routine review, and rechecks draft continuity/settings/search. Not a physical-device or real-account pilot. |
| Source privacy guard | Known-path/credential-pattern guard passed against 525 current nonignored files before this report. Not a full-history or complete secret audit. |

Local logs: `/tmp/openbot-outcomes-verify.log`, `/tmp/openbot-outcomes-provider.log`, `/tmp/openbot-outcomes-web-final.log`, `/tmp/openbot-outcomes-mac.log`, `/tmp/openbot-outcomes-release.log`, `/tmp/openbot-outcomes-ios.log`.

## Packaged candidate

Artifact: `/tmp/openbot-result-candidate.YUbTRU/OpenBot.app`.

The new Release build includes the private runner, production web assets, Node, OpenCode, source/runtime dependencies and required notices. Strict ad-hoc signature verification and `scripts/test-macos-package.mjs` passed against that exact copied app. Its runner started with an isolated empty home/data directory and system-only PATH, required explicit provider choice, served both web entry points and exited cleanly with an event connection open. No model was run by the package smoke.

This package uses the current working-tree dependency installation, not a newly frozen source commit or fresh dependency install. The earlier clean-dependency package described elsewhere is separate evidence. Provenance fingerprints for this candidate:

- Signed native executable SHA-256: `87bc82b4e7f7ec868625d24fce88edf609a2860da3c8cd756febdc9db7ae952e`.
- `src/server/model-output.ts` SHA-256: `e4357639bf37effbfcd4b3fe3b618e7a0e08d5e36e89bf4010a55b039786c10e`.
- Lockfile SHA-256: `a51ea112168a902037cdf85aeb74788a4ff5d9dc811105e8d42a269927633ae4`.

GitHub private vulnerability reporting was also enabled for `PrisacariuRobert/openbot`; a follow-up API read returned `enabled: true`. No report was submitted. Repository visibility, merge protection and release state were not changed.

Still open: reviewed/published source candidate and matching CI; clean second-Mac setup and rendered native QA; Developer ID/notarization and update distribution; real browser-account/destination-delivery pilots; reliable hosted away access and cellular/push checks. A self-contained development package does not close those gates.

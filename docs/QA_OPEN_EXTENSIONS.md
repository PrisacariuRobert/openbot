# Open extensions, private memory and reliable restart

Checked 5 September 2026 in the unpublished 0.35.0 development beta. This work implements part of the Hermes-inspired interoperability path; it does not certify a complete marketplace or competitor replacement.

## Delivered behavior

- Real Streamable HTTP MCP client using the official SDK. Owner-created public HTTPS endpoints or explicitly allowed, already-running 127.0.0.1 HTTP services; optional encrypted bearer tokens. No command execution or automatic OAuth discovery/login.
- Discovery grants nothing. Owner-selected per-teammate tool access is either off, ask each time, or owner-verified read without asking. Upstream read-only annotations never grant access. Tool names that collide with JavaScript object properties cannot acquire implicit permissions.
- Current tool definitions, run ownership/status and grants are checked before dispatch. Changed definitions revoke old grants. Pending approvals bind to the reviewed revision and schema. Untrusted schema validation runs in a bounded worker rather than blocking the host.
- Public-address DNS validation is pinned to the actual connection, with an abortable lookup; redirects and off-endpoint token forwarding are rejected. Network responses are limited to 1 MiB and calls to 25 seconds. Model-visible text/structured output is bounded to 24,000 characters, with exact stored-token redaction and explicit truncation. No image/resource links are fetched automatically.
- Read results carry encrypted source receipts including tool/source identity, schema and argument hashes, timestamp, error state and bounded output. The studio retains the latest 500 MCP receipts. An error is not a successful result.
- Approved MCP writes use the durable single-claim action ledger. Lost acknowledgements remain uncertain and block the task; they are not retried automatically. Revoked access invalidates old approvals before an external call.
- Portable Agent Skills text bundles can be downloaded for review or pasted when self-contained. Source and bytes are pinned; explicit text references load on demand. Scripts, missing references, runtime-specific metadata and unsupported tool policies block import. Imported content cannot grant account access or override approvals.
- Private memory supports owner add/edit/delete and model search. Initial prompt notes have a 4,000-character budget. Corrections change the next task's session fingerprint; old chat and already-running context are not erased.
- Web, native Mac and iPhone expose connection, skill and memory controls against the same host API. The model cannot install extensions or grant itself access through the tool bridge. This is not a substitute for stronger process/network containment around model runtimes.
- Host shutdown ends live event streams; missing APIs return JSON 404 instead of a misleading HTML 200.

## Evidence categories

| Check | Result and scope |
|---|---|
| Full regression | `npm run verify`: 242 tests, release/native source contracts, TypeScript, acceptance-script typechecking and production web build. |
| Actual HTTP MCP fixture | Discovery/calls, encrypted/redacted token, source receipt, invalid arguments, changed tools, revoked access, cancellation, auth failure, oversized response, deadline, prototype-name grants, persistence and lost acknowledgement. These are synthetic service responses, not personal accounts. |
| Full host approval API | A fresh no-model studio approves one synthetic write, rejects duplicate approval, records a second write's lost response as uncertain without retry, and rejects a stale grant before a third write. Actual API, SDK and database ledger; no paid model or real external write. |
| Claude bridge | Real stdio process → HTTP host proxy round trip for all five extension actions; host denials surface as errors. Not a signed-in Claude model run. |
| Live Spark 1.3 | Two post-fix runs completed in **42.241 s** and **36.211 s**. Each used one actual fixture read, zero writes, a reviewed skill/reference, private memory, a checked `brief.md` and exactly one final bot answer. Same synthetic task repeated, not a diverse quality benchmark or head-to-head comparison. |
| Public external service | `https://gitmcp.io/NousResearch/hermes-agent` discovered four tools. `search_hermes_agent_documentation` returned 12,883 characters with `isError: false`, untruncated. No authentication was required; this does not prove OAuth or paid-provider compatibility. |
| Native Mac | Debug build succeeded; the running app's connection, skill and memory controls were inspected. A disposable pasted skill reached its native review screen through the real API; it was not installed in the owner's studio. |
| iPhone Simulator | Generic iOS Simulator build succeeded; app installed/launched on iPhone 17 Pro / iOS 27.0 and its native connection screen was inspected. No physical iPhone was used. Authenticated extension interaction, cellular and APNs were not checked in this pass. Simulator shut down afterward. |
| Web UI | Connection, skill-import and memory controls inspected at normal width and 390 px. Document width remained 390 px, with no extension elements outside the viewport. Temporary viewport override was reset. No personal connector grants or memories changed. |
| Packaged runtime | Bundled Node/server/UI run using isolated data and system-only PATH. Health, extensions API, JSON 404, schema-worker inclusion, signature verification and shutdown with a live SSE connection passed. This is a local ARM64 development package, not a clean-Mac/notarization test. |

## Failures retained, not hidden

The first acceptance harness checked the wrong message property (`role` rather than `senderType`), then raced the final-message write. It was corrected and included in acceptance TypeScript checks. This was a harness failure, not evidence of successful final-answer counting.

A subsequent real Spark run searched for “project service Project Cedar.” Exact-substring matching returned no tools, and the model incorrectly said a connection was unavailable. Ranked keyword discovery now falls back to the actual available tools, explicitly distinguishing “no wording match” from “no shared connection.” Regression and the two later live runs validate the fix.

A source-host update exposed shutdown hanging while SSE streams remained open. The package test now deliberately leaves that stream open through shutdown and checks completion. Initial native compilation also caught invalid combined `@State` declarations; separate declarations compile on both platforms.

The browser's retained console contained a historical missing lazy-chunk error after an earlier web build replacement. Reload restored the current interface. This pass does not claim atomic web hot-updates or universal offline-cache recovery.

## Reproduce

```sh
npm run verify
OPENBOT_BENCHMARK_MODEL=opencode/muse-spark-1.3-contributor-free npm run benchmark:extensions
npm run package:macos -- /absolute/path/to/OpenBot.app
npm run test:macos-package -- /absolute/path/to/OpenBot.app
```

The live benchmark uses the explicitly selected Spark account through OpenCode; no provider fallback is allowed. It creates disposable studio data and a local service, retaining evidence under the printed temporary directory. It does not reuse the owner's inbox, install community code or change real services.

Local evidence (temporary, not CI-hosted):

- `/tmp/openbot-extensions-verify-final.log`
- `/tmp/openbot-extensions-macos-build.log`, `/tmp/openbot-extensions-ios-build.log`
- `/tmp/openbot-extensions-package-final.log`, `/tmp/openbot-extensions-packaged-final.log`
- `/tmp/openbot-extensions-live-final.log`, `/tmp/openbot-extensions-live-repeat.log`
- `openbot-extension-acceptance-MJdGZE` and `openbot-extension-acceptance-N4sVN6` under the macOS temporary directory contain `run.json`, `evidence.json` and the real generated brief.

The source studio was restarted only after verifying no queued/running jobs. The local `OpenBot Preview.app` was updated, preserving the previous preview as `OpenBot Preview before extensions 2026-09-05.app`. The separate original `OpenBot.app`, personal data and model choices were not replaced. Changes remain local and unmerged.

## Remaining gaps

Generic MCP OAuth and token-refresh UX; safely isolated local MCP processes; script/runtime-dependent Hermes skills and Python plugins; signed marketplace provenance; semantic memory and evaluated consolidation; broader independently authorized provider outcomes; strong model-process/network containment; lossless Office editing/OCR; public signing/notarization/updates; clean-host onboarding; managed always-on operation and cellular/push delivery remain separate work. None are implied by passing these checks.

See the [compatibility matrix](PLUGIN_INTEROPERABILITY.md) and [current competitive assessment](COMPETITOR_RECHECK_2026-09-05.md). Public sources used: [official MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk), [Agent Skills specification](https://agentskills.io/specification), [GitMCP endpoint documentation](https://gitmcp.io/docs) and the Hermes feature documentation linked in the matrix.
## Default library and physical device follow-up

The included library, selected security-guidance adapter, **248-test** regression pass, two natural-language Spark outcomes, native/web UI checks and physical iPhone installation are recorded in [QA_INCLUDED_SKILLS.md](QA_INCLUDED_SKILLS.md). This supersedes earlier empty-library expectations; explicit review remains required for additional third-party imports. Cellular/push acceptance and general Python-plugin support are not claimed.

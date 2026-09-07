# Mac-first beta candidate — 2026-09-06

Target chosen by the owner: **Mac-first open-source beta, with iPhone as a preview**. This evidence concerns the current 0.37.0 development checkout, not a frozen release commit. The accumulated changes have not been committed, merged, tagged or published by this release-readiness pass. No installed owner app or private studio has been replaced.

## What changed for a first-time user

- The README now leads with one source-preview path, explicit provider/model choice and the Mac-first scope. Advanced setup remains in the existing app; `/studio.html` is the conversation-first preview, not a claim that every legacy function has migrated.
- Creating a teammate keeps the draft while AI setup opens separately. Returning refreshes available connections without silently selecting a provider/model or starting work. Duplicate submissions are locked; creation errors stay beside the form.
- Chat and Live Studio in the existing web app now open the same allowlisted, complete action review contract as Studio and native clients. The old reason-only Allow buttons are gone. Approval requires explicit review; stale, masked, incomplete and uncertain responses cannot be retried blindly. Approving records permission to attempt an action, not proof of completion.
- Supported approvals now carry a server-verified fingerprint of the complete action, account authorization and grants. Changed accounts or permissions require fresh review. Connector dispatch rechecks that binding before outbound requests; account changes or a lost response after a mutation attempt remain uncertain instead of automatically resending. Older clients without a fingerprint can decline but cannot approve. The subsequent [work-delivery pass](QA_WORK_DELIVERY.md) adds pinned GitHub issue creation and bounded new-PR publication; the verification table below remains the earlier source-snapshot result.
- Mac packaging stages and validates the complete replacement before touching the destination, preserves the previous package on ordinary copy/signing failure, rejects concurrent packaging and retains upstream notices. The smoke check now starts with a genuinely empty studio and an isolated home/PATH. [Package evidence and interruption limits](QA_FIRST_RELEASE_PACKAGE.md).
- Restoring a database without its matching vault key now stops initialization before creating a replacement key or workspace folders. Fresh startup and a disposable database/key restore still work. This prevents silent encryption-identity replacement; it cannot recover a lost key and is not a complete backup certification.
- Reconnecting Todoist or Dropbox no longer overwrites teammate permissions. Explicit denials and previously ungranted teammates remain unchanged; signing into an account is separate from choosing which teammate may use it.
- Public-source privacy checks, issue/security/contribution guidance, third-party notices, reviewable dependency updates and a separate browser-acceptance CI job make the release process inspectable. Local passes do not mean the new job has passed on GitHub or that repository protections have changed.

## Local verification

Commands run against disposable data or synthetic browser fixtures unless explicitly stated below. None submitted mail, modified a real calendar, organized the owner's files or created a public issue/PR.

| Check | Observed result | What it does not prove |
| --- | --- | --- |
| `npm run verify` | Passed in a source-only snapshot after fresh `npm ci`: release/native consistency checks, five package transaction tests, 382 unit tests, application/acceptance typechecks and production build | A clean second-Mac installation or full UI acceptance |
| `npm run test:conversation-flow` | Passed: new Studio, first teammate, nine run-control contracts and real draft/attachment API behavior | Live model quality or real account access |
| `npm run test:onboarding` | Passed through actual empty-host APIs: separate provider settings, save a synthetic local connection, return with draft intact, explicit provider/model selection, create and reload | Working model access: the saved localhost endpoint was intentionally unreachable and no job was run |
| `npm run test:legacy-approvals` | 20 full-app checks passed across chat and Live Studio, including 390px layout, duplicate clicks, declines, missing/stale bindings, malformed/lost responses and re-review | Sending to an external service; all mutations were intercepted fixtures |
| `npm run test:studio-polish` | Seven groups passed at 320/390/1440px: monochrome layout, vector characters, keyboard/modal menus, appearance persistence and request deduplication | Every screen, assistive technology or native visual parity |
| `npm run test:browser-sessions` | Passed: teaching/task login continuity, restart, profile isolation, changed-control rejection, logout and explicit denial | Google or another live service accepting automation |
| `npm run test:provider-runtime` | Real OpenCode process reached a controlled compatible endpoint; exact model ID/scoped key and streamed reply verified | An independent provider's reasoning or subscription compatibility |
| `node --test .github/scripts/check-public-source.test.mjs` | Three regressions passed, including indexed secrets hidden by an unstaged cleanup and redacted failure logs | Full Git-history or every possible secret format |
| Packaged Mac runner | Fresh native Mac build packaged with the clean snapshot's dependencies/output; arm64 ad-hoc signature verification, isolated embedded startup, both web entry points, empty first launch, API checks and shutdown with an open event stream passed | Developer ID/notarization, Gatekeeper, another CPU architecture or another Mac |

The updated approval client compiled and passed 20 focused iOS Simulator tests, including older-host decoding, account-binding submission, uncertainty and token-free decline. Native Mac was rebuilt from the source-only snapshot with those shared Swift changes. The whole-window/render checks in [app polish QA](QA_APP_POLISH.md) are earlier evidence, not repeated certification of this newer client. This pass did not install the app on a physical iPhone or repeat every native window check.

The clean snapshot copied 455 nonignored source candidates only after checking their paths/bytes, excluding Git metadata, dependencies and private studio data. `npm ci` installed 332 packages from the unchanged lockfile and reported zero known vulnerabilities. The first unbounded-concurrency verification attempts hit fixture host-start deadlines during concurrent native work; those failures were retained, not counted as passes. Test concurrency is now four and the MCP fixture has a bounded 20-second startup check with explicit process-exit detection. The complete snapshot rerun passed. This is same-Mac clean-dependency evidence, not a second hardware/user-account test.

## Real-model workflow evidence

Explicit test model: `opencode/muse-spark-1.3-contributor-free`, selected only for these tests—not an onboarding default. Command:

```sh
OPENBOT_PRODUCTIVITY_LIVE_MODEL=opencode/muse-spark-1.3-contributor-free npm run test:productivity-runtime
```

All four runs used the actual model/runtime and host workflow tools against **synthetic** Google, Slack, Notion and Todoist sources. Each saved its required source-linked report and two artifacts. The inbox run prepared a draft; nothing was sent. No retries or paid fallback were used.

| Workflow | Elapsed | Reported input tokens | Reported output tokens | Drafts |
| --- | ---: | ---: | ---: | ---: |
| Morning brief | 15.98 s | 8,630 | 548 | 0 |
| Inbox follow-ups | 10.78 s | 7,692 | 413 | 1 |
| Meeting preparation | 14.71 s | 8,543 | 509 | 0 |
| Weekly review | 14.20 s | 8,699 | 624 | 0 |

Total reported input: 33,564 tokens; output: 2,094. The runtime also reported 1,563 reasoning tokens; accounting fields may overlap, so these are not added into a billed total or converted to a cost estimate. One successful example per workflow is evidence of the execution path, not a quality benchmark, broad provider certification or proof of competitor parity.

## What still prevents a supported public release

The [first-public-release checklist](FIRST_PUBLIC_RELEASE.md) is the source of truth. Its unchecked items remain open:

1. Freeze/review the intended source changes and exact artifact; run the candidate in GitHub CI. This checkout is not clean release provenance.
2. Enable a working private vulnerability reporting route and verify owner-only merge authority plus required checks. The read-only audit found private reporting disabled; local workflow/CODEOWNERS files do not change those settings.
3. Have a second person follow setup on a clean Mac and complete one useful read-only task with an explicitly selected provider. Verify quit/reopen, backup/restore and preservation of existing studio data.
4. Test authorized real accounts: browser-only sign-in, a multi-source brief, quiet consultation, decline/no-side-effect and one reviewed test write. Synthetic sources cannot close these gates.
5. Complete a modest seven-day reliability soak and a small user pilot. Local work requires an awake, powered-on host.
6. For a downloadable native binary, obtain Developer ID signing/notarization and clean-Mac Gatekeeper evidence. Without this, the first supported distribution must remain source-only. iPhone, production push and public relay/cellular access remain separate preview/deployment work.

OpenBot's supported promise should be narrow and testable: owner-controlled teammates, explicit provider choice, useful source-backed jobs, private browser sessions and review before supported sensitive actions. Broader marketplaces, fully managed always-on hosting, unrestricted computer work and a universal Grok Bot replacement are not certified by these results.

### Approval coverage is a real capability limit

Complete field projections cover starting a task, Gmail sends, Drive text-file creation, Calendar events, Slack posts, Notion appends, Todoist tasks and Mac file organization. They show destination, content and relevant effects; malformed, oversized or secret-masked proposals cannot be approved. Authorization and execution can still fail after a correct review.

Generic browser/terminal actions, index-based Mac-app interactions and MCP writes do not yet have a complete saved target/environment review. They must stay unavailable for approval instead of falling back to a short reason. The subsequent [work-delivery pass](QA_WORK_DELIVERY.md) enables GitHub issue creation with a pinned account and focused new-branch PR publication with complete change, check, reviewer and permission snapshots. Updating existing branches/PRs, binary or oversized publication and automatic merge/deployment remain outside that supported path. Reading, drafting, project editing/checking and owner browser takeover are separate capabilities; the owner may complete a blocked final step manually. Remaining approval gaps need dedicated target snapshots and revalidation before those workflows can be advertised as fully unattended. This qualification overrides older implementation-inventory descriptions of approval-gated tools.

## Retained local evidence

Temporary logs: `/tmp/openbot-beta-verify.log`, `/tmp/openbot-beta-conversation.log`, `/tmp/openbot-beta-approval.log`, `/tmp/openbot-beta-polish.log`, `/tmp/openbot-beta-browser.log`, `/tmp/openbot-beta-provider-runtime.log`, `/tmp/openbot-beta-live-workflows.log`, and the package logs linked above. These paths are local QA artifacts, not files shipped to users.

Final clean-install verification: `/tmp/openbot-release-check.OiIi1N/verify-final.log`; final web logs use `/tmp/openbot-beta-final-*.log`. Native approval tests: `/tmp/openbot-approval-native.tyUBCU/test.log`. The source snapshot's lockfile SHA-256 is `a51ea112168a902037cdf85aeb74788a4ff5d9dc811105e8d42a269927633ae4`. Documentation was finalized after the source-only check; this is not a signed source/artifact attestation.

Final Mac package: `/tmp/openbot-release-check.OiIi1N/native-derived/Build/Products/Debug/OpenBot.app`. Fresh build/package/smoke logs are `native-build.log`, `package.log` and `package-smoke.log` beside the snapshot. This disposable ad-hoc app has not replaced an installed application. The owner development service on port 4311 was restarted only after confirming zero active jobs/pending approvals; health and both existing studio counts (three teammates, four conversations) were preserved.

Synthetic UI screenshots: `/tmp/openbot-onboarding-qa`, `/tmp/openbot-legacy-review-qa`, `/tmp/openbot-studio-polish-qa`. The release build must regenerate evidence against its exact commit; temporary developer artifacts can disappear and are not signed release attestations.

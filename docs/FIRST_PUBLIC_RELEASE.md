# First public beta: Mac first, iPhone preview

Release target: the `0.37` line, published only after a reviewed candidate commit and explicit owner approval. The repository is already public; this checklist concerns its **first deliberately supported public beta**, not making the GitHub repository public for the first time.

OpenBot's promise for this beta is focused: give a teammate a job, choose the AI connection, let it work with granted tools, review sensitive actions and receive a useful result. The difference is owner-controlled source, provider choice, isolated teammate sessions and inspectable evidence—not an unverified claim of being better than every competitor.

## Distribution scope

| Surface | First-beta scope | Not promised |
| --- | --- | --- |
| Mac | Primary native client; source build path and a release candidate package with an embedded runner | A public signed/notarized installer until signing and clean-machine gates pass; unattended auto-updates |
| Web | Same owner-hosted service; conversation-first `/studio.html` preview plus the existing complete setup surface | A hosted OpenBot account service or complete removal of legacy screens |
| iPhone | Native companion preview, built with Xcode against a reachable owner host | App Store availability, production push, or cellular access before the separate prerequisites pass |
| Linux | Optional documented self-hosted runner | A consumer desktop client or automatically managed infrastructure |

Node and OpenCode included in a Mac package do not include a paid account, every model provider, Chrome, Docker or provider consent. The Mac must remain powered on and awake for local jobs. The public away-access relay remains deferred; QR pairing alone is not deployed internet connectivity. A source beta may ship before native public distribution, but those must be labeled separately.

## Gates, owners and evidence

Unchecked means open, even when the feature exists or a local test passed before. Record exact candidate commit, platform, command and retained artifact when closing a gate. Start with the [latest candidate evidence](QA_BETA_CANDIDATE.md). [App polish QA](QA_APP_POLISH.md), [conversation QA](QA_CONVERSATION_WORKFLOW.md), [0.37 evidence](QA_0.37.md) and [competitive execution plan](COMPETITIVE_EXECUTION_PLAN.md) are inputs, not automatic sign-off for a newer candidate.

The 2026-09-06 source-hygiene pass found no guarded private paths or credential signatures in the 231 indexed files or 451 nonignored candidate files inspected. Its three regression tests passed, including detecting an indexed secret hidden by an unstaged cleanup and withholding the value from logs. `npm audit --omit=dev` reported zero known vulnerabilities at that time. These are bounded, dated observations—not a full-history secret audit, dependency-license sign-off or proof of a future release artifact. The new browser-acceptance workflow still needs a successful run on GitHub.

The candidate work also records four live Spark 1.3 model runs for morning brief, inbox follow-ups, meeting preparation and weekly review against **synthetic source fixtures**. That checks the real model/workflow path and reported usage, not live Gmail, Calendar or other third-party accounts. Live-service gates below remain open.

### 1. Candidate source and governance — maintainer

- [ ] Review the accumulated work, select one release branch/commit and verify a clean tracked tree. No force push or automatic merge.
- [ ] Stage only intended source, run `node .github/scripts/check-public-source.mjs`, and inspect the exact source archive. The guard checks indexed files and high-confidence credential patterns, not full history or every secret format.
- [ ] Review full-history secret-scanning results and rotate any exposed credential. A deleted file can remain in history. Never publish `.openbot`, browser profiles, home-transfer archives, signing material or personal QA recordings.
- [ ] Enable and test GitHub private vulnerability reporting; the 2026-09-06 read-only audit found it disabled. [SECURITY.md](../SECURITY.md) must point to a functioning private route before wider invitations.
- [ ] Confirm owner-only merge policy and required status checks using the live repository settings. `CODEOWNERS` routes review; it does not enforce merge authority by itself.
- [ ] Require `verify` and `browser-acceptance` on the candidate. The workflow runs with read-only permissions, no persisted checkout credential and no model-account secrets. New workflow files are not proof of a passed GitHub run.
- [ ] Review production dependency vulnerabilities and licenses against the candidate lockfile; preserve [third-party notices](../THIRD_PARTY_NOTICES.md). Dependabot configuration opens reviewable updates, not automatic merges or guaranteed fixes.

### 2. Install and recover — engineering plus a second tester

- [ ] On a clean Mac/user account, follow README without relying on the developer checkout, PATH, accounts or browser. Choose a provider explicitly and complete a read-only sample task.
- [ ] Package from the candidate; run the package smoke test against the final copied artifact, inspect checksums and ensure native/runner versions agree. Do not reuse an old embedded runtime.
- [ ] With the exact release artifact, quit/reopen, restart the runner and reconnect without creating a second studio or losing messages, drafts, pending approvals, files or grants.
- [ ] Make a consistent backup including the matching database and vault key; demonstrate restoration in disposable storage. Never test destructive recovery against the owner's only copy.
- [ ] For public Mac binaries: Developer ID, hardened runtime, dependency notices, notarization/stapling and clean second-Mac Gatekeeper proof. If unavailable, publish source instructions only and clearly label ad-hoc packages as developer previews.

### 3. Useful jobs — engineering with explicitly authorized test accounts

- [ ] **Choose and use an AI connection:** complete a useful task with each provider path advertised as tested; record current provider/model and measured usage. Saved credentials or a successful setup screen are not proof of model access. Use free/synthetic fixtures by default and ask before paid live tests.
- [ ] **Browser-only task:** human signs into one permitted service in a teammate's browser; the teammate reads the intended account, produces a source-linked answer, survives restart, respects a denied permission and stops for takeover when the session expires. Local fixtures are not live Gmail/Calendar certification.
- [ ] **Daily brief:** combine at least two explicitly selected real sources, show partial/failed coverage honestly and attach the useful result. No unrequested external writes.
- [ ] **Quiet teamwork:** coordinator consults another teammate, receives its finding and sends one user-facing result; cancellation stops the whole consultation, not unrelated jobs.
- [ ] **Review before action:** inspect complete supported destination/content on web, Mac and iPhone; decline leaves the external service unchanged; a reviewed test action executes once; stale, masked and uncertain actions cannot be retried blindly.
- [ ] **Schedule and recovery:** test zone/weekday behavior, restart and one-time catch-up; run a seven-day modest-load soak with pause/cancel, expired login and connection failures. Do not describe a laptop asleep as always-on.
- [ ] **Checked project work:** reproduce a fixture bug, edit an isolated worktree, run meaningful checks, review the exact commit and stop before publishing unless separately approved. A benchmark must reject a faster broken result.
- [ ] **Useful follow-through across work and life:** pilot a small approved meeting/task follow-through, a bounded personal-file organization and one checked project fix. Record the finished artifact/action, what the host actually confirmed, partial failures, owner intervention and usage. Reports alone cannot close these outcome gates. [Current delivery evidence](QA_WORK_DELIVERY.md).

### 4. Client quality — engineering and pilot testers

- [ ] Complete the first task without a tour on a narrow web viewport and the actual native Mac window. Check keyboard-only operation, readable light/dark appearance, focus, empty/loading/error states and character motion preferences.
- [ ] Run native unit/UI checks and the iPhone Simulator; distinguish rendered component tests from whole-screen interactions.
- [ ] Before offering the phone preview to testers, install with the chosen Apple team, scan a fresh invitation and verify reconnect/revocation against the same studio. APNs and Share extension require their own signed-device checks.
- [ ] Observe a small pilot completing the three main jobs without developer intervention. Record completion, time, user confusion, approval errors and model usage—not just screenshots or positive feedback. Repair any data-loss, access-boundary or duplicate-write defect before expanding the pilot.

### 5. Publish deliberately — repository owner

- [ ] Update README for the final version, its supported installation path, changed behavior, known limits and recovery notes. Keep historical test numbers separate from current candidate evidence.
- [ ] Prepare release notes with exact commit, supported architectures, source/binary distinction, third-party notices, checksums and reproducible checks. No benchmark superiority claim without comparable measured tasks.
- [ ] Review and explicitly approve the tag, GitHub release and any uploaded artifacts. The current implementation work does not authorize those actions by itself.

## What the owner needs to provide

Engineering can continue with source tests, disposable data, browser fixtures, simulator builds and package checks. Wider distribution additionally needs:

1. A working private vulnerability-reporting route and confirmation of repository merge rules.
2. For a consumer Mac download, the selected Apple Developer identity and consent to use signing/notarization credentials through Apple's normal tools. Never paste private keys into a chat or issue. Without this, keep the release source-only.
3. A clean second Mac/tester and a small pilot; the development machine is not an independent installation test.
4. Explicitly authorized real service accounts for advertised integrations and the allowed model test budget. Fixture tests cannot supply that evidence.
5. Only if promoting away access or production iPhone notifications: relay hosting/operating ownership, signed device setup and APNs credentials. These are not blockers for a clearly labeled Mac-first local source beta.

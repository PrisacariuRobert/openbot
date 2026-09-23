# First public beta: Electron desktop and phone web

> Current scope, 2026-09-23: Electron is the sole desktop client; phones use the responsive web UI. Historical SwiftUI and native-iPhone evidence does not qualify this candidate. The release execution criteria are in [issue #75](https://github.com/PrisacariuRobert/openbot/issues/75). No merge or release is authorized by this checklist.

Release target: the `0.37` line, published only after a reviewed candidate commit and explicit owner approval. The repository is already public; this checklist concerns its **first deliberately supported public beta**, not making the GitHub repository public for the first time.

OpenBot's promise for this beta is focused: give a teammate a job, choose the AI connection, let it work with granted tools, review sensitive actions and receive a useful result. The difference is owner-controlled source, provider choice, isolated teammate sessions and inspectable evidence—not an unverified claim of being better than every competitor.

## Distribution scope

| Surface | First-beta scope | Not promised |
| --- | --- | --- |
| macOS Apple silicon | Primary Electron client with bundled runner; a Developer ID-signed, notarized app inside a checksum-verified DMG/ZIP, after exact-artifact testing on two independent physical Macs | Unattended auto-updates |
| Phone | Responsive shared web UI on the same network or an explicitly configured private HTTPS host | Native iPhone app, App Store distribution or an OpenBot-operated public relay |
| Intel Mac, Windows, Linux | Source and package-build targets | Supported installers until each has independent physical clean-install and recovery evidence |

Node and OpenCode included in a Mac package do not include a paid account, every model provider, Chrome, Docker or provider consent. The Mac must remain powered on and awake for local jobs. The public away-access relay remains deferred. Unsigned packages remain development artifacts; a checksum verifies bytes, not publisher identity.

### No-cost development and pilot path

We can continue without buying an Apple membership or registering an OpenBot Google OAuth client. Run the shared UI from source, use the local Electron development package, and test with consenting people on known machines. A teammate can use a separately permitted browser session; the owner signs in to a website privately, and no OpenBot API connector is needed. Direct API connectors remain optional and dormant in the default path. A working model and any service account used by a tester still have their own terms and possible costs. The [local-model smoke](../qa/no-oauth-beta/README.md) shows why a connection test alone does not qualify a model for a pilot: both installed Ollama models failed a simple full conversation check.

An unsigned Mac package can support a clearly labeled, limited development pilot after exact-artifact install and recovery checks. macOS may require a manual Privacy & Security override, so this is not the low-friction, trusted public Mac download promised above. Keep the signed/notarized public installer gate open until funding and credentials exist. Phone-web access on the same network is a separate test; away access still needs a verified private HTTPS host.

## Gates, owners and evidence

Unchecked means open, even when the feature exists or a local test passed before. Record exact candidate commit, platform, command and retained artifact when closing a gate. Start with the [latest candidate evidence](QA_BETA_CANDIDATE.md). [App polish QA](QA_APP_POLISH.md), [conversation QA](QA_CONVERSATION_WORKFLOW.md), [0.37 evidence](QA_0.37.md) and [competitive execution plan](COMPETITIVE_EXECUTION_PLAN.md) are inputs, not automatic sign-off for a newer candidate.

The 2026-09-06 source-hygiene pass found no guarded private paths or credential signatures in the 231 indexed files or 451 nonignored candidate files inspected. Its three regression tests passed, including detecting an indexed secret hidden by an unstaged cleanup and withholding the value from logs. `npm audit --omit=dev` reported zero known vulnerabilities at that time. These are bounded, dated observations—not a full-history secret audit, dependency-license sign-off or proof of a future release artifact. The new browser-acceptance workflow still needs a successful run on GitHub.

The candidate work also records four live Spark 1.3 model runs for morning brief, inbox follow-ups, meeting preparation and weekly review against **synthetic source fixtures**. That checks the real model/workflow path and reported usage, not live Gmail, Calendar or other third-party accounts. Live-service gates below remain open.

### 1. Candidate source and governance — maintainer

- [ ] Review the accumulated work, select one release branch/commit and verify a clean tracked tree. No force push or automatic merge.
- [ ] Stage only intended source, run `node .github/scripts/check-public-source.mjs`, and inspect the exact source archive. The guard checks indexed files and high-confidence credential patterns, not full history or every secret format.
- [ ] Review full-history secret-scanning results and rotate any exposed credential. A deleted file can remain in history. Never publish `.openbot`, browser profiles, home-transfer archives, signing material or personal QA recordings.
- [ ] Verify the private vulnerability-reporting link from a non-owner account and confirm the owner can receive reports. The repository API returned `{"enabled":true}` on 2026-09-23 and [SECURITY.md](../SECURITY.md) points to the private route; no test report has been submitted.
- [ ] Confirm owner-only merge policy and required status checks using the live repository settings. `CODEOWNERS` routes review; it does not enforce merge authority by itself.
- [ ] Require `verify` and `browser-acceptance` on the candidate. The workflow runs with read-only permissions, no persisted checkout credential and no model-account secrets. New workflow files are not proof of a passed GitHub run.
- [ ] Review production dependency vulnerabilities and licenses against the candidate lockfile; preserve [third-party notices](../THIRD_PARTY_NOTICES.md). Dependabot configuration opens reviewable updates, not automatic merges or guaranteed fixes.

### 2. Install and recover — engineering plus a second tester

- [ ] With an active Apple Developer Program membership, build the exact candidate using a Developer ID Application certificate and Apple notarization credentials. Confirm `codesign --verify --deep --strict`, Gatekeeper acceptance and stapled-ticket validation. Do not count the ordinary unsigned CI installer as a public candidate.
- [ ] On two independent physical Apple-silicon Macs, install the exact DMG/ZIP containing the signed and notarized app, and compare its SHA-256 checksum. Follow the included setup without relying on a development checkout, PATH or preexisting accounts. Choose a provider explicitly and complete a useful sample task.
- [ ] Package from the frozen candidate; run the package smoke test against the final copied artifact, inspect checksums and ensure Electron/runner versions agree. Do not reuse an old embedded runtime.
- [ ] With the exact release artifact, quit/reopen, restart the runner and reconnect without creating a second studio or losing messages, drafts, pending approvals, files or grants.
- [ ] Make a consistent backup including the matching database and vault key; demonstrate restoration in disposable storage. Never test destructive recovery against the owner's only copy.
- [ ] Recheck Gatekeeper behavior on the second Mac without bypassing its protections. If signing/notarization cannot be completed, keep the installer in internal testing and hold the public Mac beta.

### 3. Useful jobs — engineering with explicitly authorized test accounts

- [ ] **Choose and use an AI connection:** complete a useful task with each provider path advertised as tested; record current provider/model and measured usage. Saved credentials or a successful setup screen are not proof of model access. Use free/synthetic fixtures by default and ask before paid live tests.
- [ ] **Browser-only task:** human signs into one permitted service in a teammate's browser; the teammate reads the intended account, produces a source-linked answer, survives restart, respects a denied permission and stops for takeover when the session expires. Local fixtures are not live Gmail/Calendar certification.
- [ ] **Daily brief:** combine at least two explicitly selected real sources, show partial/failed coverage honestly and attach the useful result. No unrequested external writes.
- [ ] **Quiet teamwork:** coordinator consults another teammate, receives its finding and sends one user-facing result; cancellation stops the whole consultation, not unrelated jobs.
- [ ] **Review before action:** inspect complete supported destination/content in the Electron and phone-web clients; decline leaves the external service unchanged; a reviewed test action executes once; stale, masked and uncertain actions cannot be retried blindly.
- [ ] **Schedule and recovery:** test zone/weekday behavior, restart and one-time catch-up. Complete a **48-hour minimum real elapsed release soak** with representative routines, restart/offline handling and resource checks. A seven-day soak remains follow-on evidence for stronger unattended claims. Do not describe a laptop asleep as always-on.
- [ ] **Outcome qualification:** run the frozen 20-family catalogue, including eight independently generated held-out families, on two declared model configurations with three seeded variants each (120 recorded slots). For each advertised full-suite configuration require at least 33/36 core and 20/24 held-out successes, with no known critical unauthorized effect, duplicate consequence, privacy failure or data loss. A local protocol peer validates wiring only; paid/live runs need an explicit route, site/effect scope and budget.
- [ ] **Checked project work:** reproduce a fixture bug, edit an isolated worktree, run meaningful checks, review the exact commit and stop before publishing unless separately approved. A benchmark must reject a faster broken result.
- [ ] **Useful follow-through across work and life:** pilot a small approved meeting/task follow-through, a bounded personal-file organization and one checked project fix. Record the finished artifact/action, what the host actually confirmed, partial failures, owner intervention and usage. Reports alone cannot close these outcome gates. [Current delivery evidence](QA_WORK_DELIVERY.md).

### 4. Client quality — engineering and pilot testers

- [ ] Complete the first task without a tour in the actual packaged Electron window and at 390px phone-web width. Check keyboard-only operation, readable light/dark appearance, focus, empty/loading/error states and reduced-motion preference.
- [ ] Verify a phone browser reconnects to the same owner host over the intended HTTPS route; an accessible local responsive preview alone is not away-access proof.
- [ ] Recruit 5–10 consenting pilot testers through an owner arrangement. At least five try three supported workflows; at least four of five should finish setup and two of three tasks without developer-led operational rescue, then return to saved work in another session. Record failures, approvals/sign-in time, confusion and usage—not just positive feedback.

### 5. Publish deliberately — repository owner

- [ ] Update README for the final version, its supported installation path, changed behavior, known limits and recovery notes. Keep historical test numbers separate from current candidate evidence.
- [ ] Prepare release notes with exact commit, supported architectures, source/binary distinction, third-party notices, checksums and reproducible checks. No benchmark superiority claim without comparable measured tasks.
- [ ] Review and explicitly approve the tag, GitHub release and any uploaded artifacts. The current implementation work does not authorize those actions by itself.

## What the owner needs to provide

Engineering can continue with source tests, disposable data, browser fixtures, simulator builds and package checks. Wider distribution additionally needs:

1. A non-owner check of the private vulnerability-reporting route and confirmation of repository merge rules.
2. **Only for the trusted public Mac download:** an active Apple Developer
   Program membership, a Developer ID Application certificate and notarization
   credentials. These are not needed for source development or a limited,
   clearly labeled unsigned pilot. Build the signed candidate through the
   isolated packaging path, verify the exact `.dmg`/`.zip` and its SHA-256
   sidecar, and hold publication until the two-Mac gate passes. Do not treat an
   unsigned installer or checksum as a substitute for publisher identity.
3. A clean second Mac/tester and a small pilot; the development machine is not an independent installation test.
4. Consent to use real accounts for any advertised browser or API workflow and a declared model test budget. An OpenBot Google OAuth client is not required for the browser path. Fixture tests cannot supply real-account evidence.
5. Only if promoting away access: owner-operated HTTPS/relay hosting and a verified phone-to-host route. Native-device signing/APNs are outside this shared-web beta.

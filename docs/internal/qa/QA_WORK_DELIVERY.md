# Work delivery — 2026-09-06

Scope: current **0.37.0 development checkout**, following the Mac-first beta preparation. No new release, Git push, public issue/PR, model call or owner-file organization is authorized or performed by this QA pass. Earlier packaged binaries and clean-source snapshot results do not automatically cover these changes.

## The product is a combination, not a category

The owner's first pilot should span building things, team coordination and personal admin. The common expectation is an actual outcome: clarify missing scope, use granted tools, consult when useful, review sensitive actions, perform the approved step and distinguish confirmed results from unfinished work. Briefs remain useful inputs; they are not the definition of success.

| Work | Meaningful finished outcome | Current evidence boundary |
| --- | --- | --- |
| Build or repair a project | Checked patch, independent review, and a separately approved PR with a recorded URL and exact commit | New production delivery path tested with real Git and a synthetic GitHub transport; no live model-generated repair or real GitHub write in this pass |
| Team follow-through | Agreed event/task/note or message actually created in the selected account | Existing approved Calendar, Todoist, Notion and mail actions; individual connector fixtures are not a proven multi-app live workflow |
| Personal admin | Selected files organized without overwriting existing files, with partial work clearly reported | Bounded Mac-home file capability; disposable-file tests only, never the owner's Desktop |

These are not claims of competitor parity, automatic task completion, guaranteed test coverage or measured benefits to real teams. The pilot must record task completion, correctness, owner intervention, elapsed time and reported usage—not just favorable chat replies.

## What the code-delivery path now does

1. Keep coding work in the task's isolated Git worktree. Record actual command outcomes against the exact clean commit.
2. Require an independent permitted teammate's review of that commit. A newer request for changes supersedes an earlier approval, including reviews recorded within the same millisecond.
3. Prepare a complete owner review: actual GitHub repository and account, task/project, branch and base, exact commits, all outgoing patch history, title/body/draft state, checks, reviewer and current permissions. A file committed and later deleted is not silently omitted.
4. Revalidate the saved proposal before execution. Credential selection is pinned to the reviewed GitHub account and host; a changed CLI default cannot redirect the write. Credentials remain private to the server operation.
5. Upload the exact reviewed commit to a **new** branch without overwriting an existing branch. Create a new PR, then read it back and verify repository, branch, head/base commits, title/body and draft state.
6. Save a host-generated delivery receipt as an encrypted database record together with an immediate conversation confirmation, then attach `code-delivery.md`. The result does not depend on another successful model turn; it remains visible after a later quota failure or cancellation. A model saying “published” cannot create that receipt. The receipt says PR delivery, not merge or deployment.

The approval journal allows one local dispatch. A lost response, mismatched confirmation or failure to persist a receipt after publication leaves the action **uncertain** and blocks automatic replay. Failure in local logging after a confirmed write cannot be described as a safe-to-repeat failure. The guarded dispatch rechecks access around each GitHub REST request, including when permission changes during account lookup. A partial branch upload is not silently retried as another PR. Human reconciliation remains necessary when the outcome cannot be confirmed.

GitHub issue creation now uses the same pinned identity and readback checks. The shared approval projection displays the actual account/host and complete issue contents; older incomplete proposals cannot be approved.

## Personal files: preserve first, report partial work

Mac file organization now claims each same-filesystem destination atomically without replacing an existing path, then removes the original name only after a source/destination identity check. A destination appearing after preflight is preserved. Failures return the completed and unfinished moves and any retained destination with its source still present/changed. The approval executor marks an incomplete batch uncertain; it cannot silently claim full success or replay the original batch.

Cross-filesystem moves stop without a copy/delete fallback. Successfully completed moves are not rolled back automatically. Six disposable-file tests cover normal moves, a raced destination, partial completion, source-removal failure, a replaced source and cross-filesystem failure. This detects ordinary concurrency; it is not a complete sandbox against a hostile process racing every filesystem operation. No owner files were moved.

## Deliberately bounded publication

- github.com code projects, with current repository write permission and the exact reviewed remote base.
- New branch/new PR only; no existing branch updates, merges, deployments or cross-repository/fork publication.
- Focused linear history: at most 32 outgoing commits, 120 files and 30,000 patch characters.
- Binary files, symlinks, submodules, protected hidden paths, masked/incomplete content and oversized changes remain blocked for this path.
- The independent reviewer is another AI teammate, not human sign-off. A passing command proves execution and exit status, not meaningful coverage by itself.
- Git upload uses an ephemeral bare repository without project hooks, configuration or credential helpers. This does not turn every other project operation into an OS-level sandbox.
- State can change remotely after verification. A confirmed receipt is a dated observation, not a guarantee that a PR can never change. Publishing may trigger the repository's own CI/deployment automations; OpenBot does not itself invoke merge or deployment in this path.

## Verification

- Ten production-service delivery acceptance tests: real isolated Git, actual fixed-fixture Node assertions, exact review/publish services, durable approval journal, encrypted receipt reopen and generated attachment. Mutations use declared synthetic GitHub endpoints only. Immediate host confirmation survives later model failure/cancellation; message persistence is atomic and attachment retries do not duplicate the result.
- Negative cases cover changed code/destinations, failed checks, weakened fixture assertions, revoked reviewer access, wrong account/base, repeated dispatch, model-only completion prose, malformed remote confirmation and receipt-storage failure.
- Pinned-writer tests include local Git create-only upload/overwrite rejection; shared preview tests cover the complete proposal and account binding.
- `npm run test:code-runtime` passed for JavaScript and Python using real network-disabled Docker checks: failure reproduced, repaired commit passed, original checkout and independent assertions preserved. Repair edits were scripted, not generated by a live model.

The host HTTP approval bridge is covered by the existing review-binding tests; the new PR acceptance composes the production services and database journal directly. A small static contract additionally guards the index wiring; that is not an HTTP end-to-end test. This pass does **not** exercise a live model, real GitHub network or the complete native UI approval-to-publication path. Those remain explicit pilot checks.

### Final checkout verification

| Command/check | Result |
| --- | --- |
| `npm run verify` | Passed: 426 unit/service tests, five packaging transaction tests, release/native source consistency, application/acceptance typechecks and production web build |
| `npm run test:legacy-approvals` | 20 fixture-based full-app checks passed, including phone layout and duplicate/stale/uncertain decisions |
| `npm run test:run-controls` | Nine fixture-intercepted browser contracts passed |
| `npm run test:code-runtime` | Real network-disabled Node and Python checks passed against scripted failing/fixed fixtures |
| `git diff --check` | Passed across the current checkout |
| Owner development host | Safely restarted only with zero active jobs, pending approvals and executing actions; health and both web entry points returned 200, preserving three teammates and four conversations |

Final whole-suite log: `/tmp/openbot-work-delivery-verified.log`. Browser logs: `/tmp/openbot-work-delivery-approvals.log` and `/tmp/openbot-work-delivery-controls.log`. Earlier attempts are retained separately; one old publishing test required updating to supply the newly mandatory review/account snapshot before testing stale-commit rejection. The corrected test explicitly rejects any network/account access.

These are dated local checkout results, not a clean release commit or signed installer. The existing native package was not replaced. No real GitHub issue/PR, email, calendar mutation, paid model invocation or owner-file movement was performed by these tests.

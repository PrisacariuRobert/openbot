# 0.30 functional validation

Date: 5 September 2026. Branch: `codex/0.30-execution-control`, based on the unmerged 0.29 foundation work. Development beta, not a public release.

## Scope

This pass prioritizes functionality and model-allowance protection. The web/native visual design and animated mascots are unchanged. No paid or free live-model benchmark was launched; new fault fixtures use ordinary local Node processes with an empty environment and disposable OpenBot data, not provider accounts.

## Execution contract

- Defaults: 30 minutes of active model execution, 5 minutes without model progress, 64 completed model steps, 100,000 reported input/output/reasoning tokens per run, 4 MiB process output per invocation and a 512,000-character answer ceiling.
- A smaller per-teammate weekly token allowance also stops the run. Usage is checkpointed on provider usage events. Active time and step counters are saved periodically and retained across approval/resume/recovery.
- A limit stop records a failure and revokes new OpenBot tool calls immediately. Saved files and recorded partial answers remain; it does not publish a success answer. Child consultations receive a private failure result.
- Stop cancels nested consultation jobs and their pending approvals. Ordinary approval pauses preserve the pending decision instead of cancelling the task tree.
- POSIX model processes run in their own process group. Stop sends TERM, then KILL after two seconds if needed. Shutdown waits for exit before requeuing work and releasing runner leadership.
- Unstructured runtime diagnostics cannot stand in for a model answer.

## Validation

The regression suite exercises actual OS subprocesses, including silent hangs, ignored termination, endless progress, stdout without newlines, live usage and shutdown. It verifies stored task/approval state, not model statements claiming success.

| Check | Evidence |
|---|---|
| Invalid limits fail closed | Environment parsing rejects zero, negative, nonnumeric, fractional and out-of-range values |
| Progress vs. silence | Monotonic-clock tests; log chatter cannot reset idle detection |
| Persistent allowances | Resumed runs retain steps/time; database reopening retains reported usage |
| Stalled / endless workers | Real child processes stop on idle or active-time limits; ignored TERM reaches KILL |
| Weekly and per-run usage | Live stored totals, threshold stop, and no second addition on exit |
| Output handling | No-newline output is bounded; diagnostic logs are not posted as success |
| Approval pause | Pending approval survives worker termination, with usage retained |
| Whole-task stop | Nested queued work is cancelled and nested approvals are withdrawn |
| Shutdown | Worker exits before job requeue; partial text and recorded usage remain |

`npm run verify` passed: **143 tests, zero failed or skipped**, TypeScript checks, production build and release/source-contract checks. `git diff --check` passed. The new execution tests use real local fault processes, not model accounts. No current Docker image build, GitHub CI run, native compilation, physical-device check or external-account workflow was performed.

## Remaining limits

This closes part of the audit's bounded-execution gap, not its full unattended-execution milestone. A provider request can overshoot before usage arrives. Abrupt crashes can lose unreported usage and the last interval of active time. Step accounting depends on the runtime event contract. Each child run has its own allowance; a shared whole-job spend cap is still needed.

Stopping cannot undo an email or other external action already accepted, nor guarantee interruption of an in-flight host tool or a process that deliberately detaches into another group. Full runtime/plugin credential isolation, network policy and an external-effect reconciliation ledger remain open. Windows lacks the POSIX process-group guarantee and has not been tested in this pass.

Next functional acceptance gate: repeatedly produce source-backed inbox triage, morning briefs and independently tested code changes across two model classes. Do not call this safeguard milestone proof of broad Grok Bot parity.

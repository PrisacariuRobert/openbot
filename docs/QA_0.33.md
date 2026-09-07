# OpenBot 0.33.0 — crash-safe approved actions

Validation date: September 5, 2026
Scope: local source branch `codex/0.33-crash-safe-actions`; not a published release or security certification

## Outcome

OpenBot now records every approved action before execution, lets only one local process claim it, and refuses to replay an action whose remote outcome became uncertain during a restart. Web and native Live Studio expose the same recovery decision and recent action history.

This closes one important unattended-work failure mode. It does **not** claim provider-level exactly-once delivery: Gmail, Slack, GitHub, Notion, Todoist, browsers, terminals, and arbitrary applications do not all provide the same idempotency or lookup contract. An interruption after a remote service accepts work is therefore held for human confirmation instead of guessed.

## Deterministic coverage

The approved-action fixtures verify:

- the action receipt exists before dispatch;
- one prepared action can be claimed only once;
- an immutable SHA-256 fingerprint detects a changed payload;
- a denied action cannot remain dispatchable;
- an approved but unstarted action survives a database restart;
- an in-flight action becomes `uncertain` after restart and cannot be reclaimed;
- either human reconciliation outcome is recorded once and cannot be changed silently;
- public app state contains the bounded receipt but not the private saved action body.

The complete repository gate passed release/source checks, 164 TypeScript tests, type checking, and a production build. Native validation compiled the app and Share extension for the booted iPhone 17 Pro Simulator; all 7 native tests passed, including the Swift receipt decoder.

## Manual product review

Live Studio was reviewed at 1440 × 1000 desktop and 390 × 844 phone widths with three states:

1. a normal completed receipt;
2. a failed action;
3. an interrupted `uncertain` receipt with **It happened** and **It didn’t happen** controls.

The recovery copy states that the action was not repeated. Both outcome controls remain readable at the narrow width, the status cards reflow to a balanced two-by-two grid, and long recovery/history copy wraps without escaping its card. Deterministic API tests verify that selecting either outcome removes the unresolved card, preserves the history entry, and resumes the original task with instructions that cannot claim or repeat the wrong outcome.

## Remaining release gates

- Add provider-specific reconciliation where a stable external identifier or safe lookup exists.
- Encrypt legacy approval payloads at rest instead of relying only on host and database protection.
- Complete adversarial restart tests around real sandbox providers, redirects, timeouts, and accepted-but-disconnected responses.
- Complete the repeated two-model source-backed workflow gate.
- Complete physical iPhone, cellular, APNs, signing, TestFlight, fresh-host restore, and fresh-user onboarding checks.
- Enforce a dedicated runtime/plugin and outbound-network boundary before advertising unrestricted unattended autonomy.

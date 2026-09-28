# OpenBot 0.31.0 — functional delivery evidence

Date: 5 September 2026. Owner-operated development beta; not a claim of Grok Bot parity or public-launch readiness.

## Delivered

1. Morning brief: primary-calendar window and bounded unread-mail snapshot; dated source links, preserved all-day dates and explicit missing/shortened coverage.
2. Inbox follow-ups: conversation-level read, latest-message/SENT checks, source-bound reply recipients, local unsent drafts and a saved report. No external-write API is called by these tools.
3. Coding checks: durable host-recorded command/exit/commit evidence; unchanged clean-commit checks required before independent review and publication. Failed reruns invalidate passes. The approved commit is checked again at publication and pushed by object ID.

Brief source snapshots and result bodies use the existing host vault. Chat and downloadable artifacts remain private local files, not end-to-end encrypted data. The report endpoint requires the normal owner/remote authentication. It serves Markdown as a download with no-store and a restrictive content policy.

## Verification scope

- `npm test`: deterministic real-connector response fixtures and real local Node subprocess tests. The code fixture reproduces a quantity-total bug, fixes it in an isolated worktree and passes an unchanged independent test; it checks the owner's original source stays unchanged. This fixture does not certify Docker execution or model reasoning.
- `npm run test:productivity-runtime`: installed OpenCode through actual generated tool wrappers, runner, source/report service, encrypted database, chat receipt and automatic artifact attachment. The model endpoint is local and scripted, and app data is synthetic; passing this is not a live-model benchmark.
- `npm run verify`: release/source-contract checks, tests, TypeScript and production build. The iOS check is source-level, not device or simulator runtime validation.

## Recorded outcomes

- `npm run verify`: **160 tests passed, zero failures/skips**, release checks, iOS source contract, TypeScript and production build passed. Main web bundle: 414.51 kB (117.84 kB gzip). The idle-process fixture now allows 500 ms for process startup under concurrent test load; its original 100 ms window occasionally expired before the child could print its test progress. Production deadlines are unchanged.
- Scripted installed-OpenCode integration: morning and inbox both passed, three local model requests each; 24.4 s / 1.4 s in the recorded pass. The first attempts used an overly restrictive test permission configuration and exposed no model tools; rerunning with the actual production workspace policy exercised and passed the complete tool path. This was a test-configuration correction, not evidence of model quality.
- Real **Muse Spark 1.2 Free**, synthetic sources, fresh conversations: morning passed in **22.5 s** (18,108 input / 1,110 output / 483 reasoning tokens; 9 steps); inbox passed in **45.8 s** (21,782 input / 2,480 output / 2,145 reasoning tokens; 13 steps). Both returned source-valid saved reports and downloadable artifacts. Inbox produced one unsent draft to the fixture recipient. No real mailbox data, paid model fallback or external write was used. These token categories are provider-reported and not an invoice.
- Opt-in reproduction: `OPENBOT_PRODUCTIVITY_LIVE_MODEL=opencode/muse-spark-1.2-contributor-free npm run test:productivity-runtime`. Only that free model ID is accepted; each run is capped at 16 steps, 60,000 reported tokens and three active minutes, with a combined fixture-bot weekly allowance of 100,000. Free-provider availability/allowance still applies.
- Local app restarted only while idle, after a SQLite online backup. `/api/healthz` was healthy, diagnostics reported **0.31.0**, and a nonexistent report returned 404. At 1280 px, all three workflow-entry buttons and the page had no horizontal overflow. This is not mobile or native visual certification.
- The live UI exposed a separate background-service discovery bug: GitHub CLI was shown as missing despite a standard Homebrew installation. GitHub and code-project subprocesses now use the existing standard-path discovery with only scoped GitHub credentials, not unrelated model API keys.

## Important limits

- Gmail: first eight conversations matching a seven-day inbox query; morning brief additionally filters unread. Threads use the latest four message excerpts, capped at 700 body characters per message. Attachments are not read. Shortened or uncertain conversations can be summarized with caveats, but cannot receive an automatic local draft through this workflow.
- Calendar: first twenty events from the primary calendar, from collection time to 24 hours later. Other calendars are not checked. Pagination and unavailable services are disclosed. This is not a complete cross-calendar scheduling assistant.
- Fifteen-minute snapshot reuse is scoped to the same run, kind, time zone and account. Refreshing is capped at three snapshots per task. Grants are rechecked before returning/saving data, including after asynchronous collection. This does not revoke copies already delivered in a conversation.
- Source IDs and reply recipients are validated mechanically. Priority, relevance and wording remain model judgments; source matching is not semantic fact-checking or a prompt-injection sandbox.
- Code evidence records command, exit and clean Git commit before/after execution. It does not prove that the chosen command exercises the bug, detect transient changes restored during execution, or cover ignored dependencies/environment changes. Independent review must assess test relevance. In-flight host commands and unrelated external Git actions still need stronger isolation and reconciliation.
- No fresh Google account consent, paid model use, external mail, GitHub publication, new connector, APNs, physical iPhone, or hosted-deployment certification is part of this verification. The local owner's existing GitHub CLI account was checked read-only after restoring background PATH discovery; the live connector returned installed and connected.

## Source contracts checked

The Google methods were checked against primary documentation: [Gmail thread listing](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.threads/list), [thread retrieval](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.threads/get), and [Calendar event listing](https://developers.google.com/workspace/calendar/api/v3/reference/events/list). Query scope, pagination and thread/message separation are represented explicitly in the implementation.

## Remaining competitive acceptance gate

M2 is still open until representative real-model runs repeatedly finish these jobs across two supported model classes, with independent outcome oracles, latency/usage and human interventions recorded, including failures. Scripted integration checks must not be marketed as that evidence. M3–M5 also retain runtime/egress, external-action reconciliation, setup, native parity, distribution and physical-device gates.

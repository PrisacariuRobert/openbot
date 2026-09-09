# Customer workflow: mail → meeting → reply

8 September 2026 · local implementation and isolated verification

## What changed

`gmail_reply` is available through both existing runtime tool surfaces when the teammate has Gmail read **and** send access and the connected account has both scopes. There is no model switch. It takes only `messageId` and `body`; the host derives the recipient, subject and thread from the actual original message. `gmail_send` remains the separate new-message operation.

The normal approval screen shows the connected account, original sender and excerpt, reply recipient, subject and full proposed reply. Reply-To is respected; this is a single-recipient plain-text reply, not reply-all. Approval does not silently authorize attachments, Cc, Bcc or another destination.

Before sending, OpenBot reads the original message and thread again. A new reply, draft, sent-last thread, ambiguous order, changed account or changed permissions prevents dispatch. Reading the message and removing UNREAD does not invalidate an unchanged conversation. This is a pre-send freshness check, **not an atomic lock on Gmail**: a message can still arrive between the final read and send.

Each approval gets a stable outbound Message-ID. OpenBot fetches the returned sent copy and verifies its account, recipient, body, parent and thread. If the send response is lost/incomplete, it searches once for that identifier and verifies the sole matching sent copy; it does not blindly send again. Missing, multiple, unavailable or mismatched results remain uncertain. Gmail indexing can lag, so an uncertain result requires checking the destination. This is not a provider-side idempotency guarantee or proof that the recipient received/read the mail.

### Approval continuation fix

The combined test reproduced a race: a quick approval queued the next stage before the old model process finished shutting down; its SIGTERM handler then marked the run cancelled. The old delayed cancellation could also target a replacement process by run ID.

`pauseForApproval` now revokes tool access immediately, captures the retiring process controller, and preserves a newer queued/running/cancelled decision when that process closes. Browser sign-in uses this same handoff. Usage is still recorded. Tests cover quick queueing, an approved action in flight and an explicit cancellation.

## Evidence and how to reproduce

**Result on this checkout:** `npm run verify` passed with **575 application tests, 9 packaging tests and 5 desktop tests**, plus source-contract checks, both TypeScript checks and the production build. The focused six customer-workflow tests also pass after adding final-run completion and two-action Work Receipt assertions. Both `test:customer-workflow-ui` and the earlier `test:skill-authoring-ui` pass. Desktop, phone review and phone action screenshots were visually inspected; actions remain reachable by scrolling. The existing large JavaScript-bundle warning remains non-blocking. No real-account or native-device pass is implied.

- `npx tsx --test src/server/gmail-reply.test.ts` — header/recipient derivation, payload restrictions, malformed or stale conversations, changed accounts, sent-copy matching, ambiguous recovery and runtime read/send gating.
- `npx tsx --test src/server/customer-workflow.test.ts` — actual host, runner, scoped internal tool calls and approvals with a deterministic process and local Google API fixture. Cedar uses normal responses; Harbor drops both mutation responses after saving their effects. Additional cases cover a new incoming message, denial and either permission being withdrawn.
- `npx tsx --test src/server/execution-runner.test.ts` — approval pause/continuation regressions and the existing execution limits, cancellation and usage checks.
- `npm run test:customer-workflow-ui` — actual rendered desktop and 390px client. Review the Calendar event, approve it, wait for a separate reply, review its exact destination/body, and approve on the phone-sized surface. Assert one insert and one send, no page errors or horizontal overflow. Screenshots are written under `/tmp/openbot-customer-workflow-qa/`.
- `npm run verify` — full application tests, packaging/desktop tests, source-contract checks, TypeScript and production build. Native source-contract checks are not a compiled native-device pilot.

The customer fixture rejects non-loopback network traffic except Google URLs explicitly redirected to its disposable local service. It uses its own database, synthetic account/token and process. It does not send mail, change the owner's calendar, inspect personal files or call a live model. Separate approval of each effect is tested with YOLO off; the existing user-selected YOLO mode is not removed.

## Limits and next real-account pilot

- Fixture success proves application plumbing, not the chosen model's planning, writing or understanding of a real request. The model still has to decide whether a meeting is appropriate, choose a suitable time from actual availability, and write an accurate response.
- The capability is Gmail-specific. Generic browser work remains separate; there is no claim that every webmail service supports this verified reply contract.
- No reply-all, attachments, alternate send-as aliases, arbitrary mailbox formats or internationalized-header coverage is claimed by these fixtures. Unsupported/ambiguous messages need manual handling. Thread checks are bounded to 500 messages and fail closed when their order cannot be established.
- A host crash after a send but before local receipt persistence remains a separate recovery pilot. Lost **HTTP responses** are covered here; process-crash recovery is not inferred from that result.
- Native Mac/iPhone interaction and a real Gmail/Calendar account have not been exercised by this test.

For the account pilot, the owner chooses the provider/model and an authorized test mailbox/recipient. Start with a clearly labelled sample request and a disposable event. Review the exact event/guests, then independently review the recipient and reply text. Confirm the event and reply thread directly in Google and record the approved-action receipts, interventions, model usage and any mismatch. Do not send to customers or cancel/delete events without the owner's specific approval.

## Subsequent browser-session check

At the owner's request, a browser-only Gmail connection task was sent through the running OpenBot UI to Pixel (run `a5f7a2b4-0473-41cd-b2c8-d0539d961928`). The existing selected model, `opencode-go/glm-5.3-flash`, was retained. The task completed and Conversation details showed a live Gmail inbox preview for the signed-in account; no new sign-in handoff was needed. The request explicitly excluded opening individual mail or performing mailbox/calendar changes. This verifies reuse of the browser login, **not** the Gmail API reply path, a fresh login/expired-session handoff, or a send/calendar pilot. The expanded Agent Computer panel remained on “Checking…” during the check even though the smaller live preview worked; investigate that rendering/connection path separately.

## Protocol references

- [Google: managing threads](https://developers.google.com/workspace/gmail/api/guides/threads) — request thread ID, References/In-Reply-To and matching subject.
- [Google: messages.send](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send) — sending an RFC message and reading its returned identity.
- [Google: messages.list](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list) — Gmail query support for sent-copy lookup.

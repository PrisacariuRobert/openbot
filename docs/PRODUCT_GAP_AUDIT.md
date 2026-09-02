# OpenBot Product Gap Audit

Updated for OpenBot 0.11.0. This audit compares the locally verified product with the current official Grok Bot product documentation. It separates what works now from what would merely look impressive in a screenshot.

## Current position

OpenBot's strongest difference is owner control: local data, bring-your-own model access, per-teammate app and project permissions, durable approvals, explicit cost limits, isolated code branches, recoverable edits, and independent review. Grok Bot is currently broader where a hosted product has an advantage: an always-on cloud computer, native mobile delivery, general computer takeover, a larger connector surface, and organization administration.

## Highest-value gaps

| Priority | Experience gap | Why it matters | Product direction |
|---|---|---|---|
| P0 | Follow-ups during active work | People naturally say “also…” or correct course while a job is running. A disconnected queued task feels robotic. | Completed in 0.11 for non-code jobs. Preserve code jobs in their run-scoped worktree and queue the follow-up safely. |
| P1 | Always-on execution and dependable notifications | Remote check-in is much less useful when the Mac sleeps, the service exits, or mobile delivery is delayed. | Add an optional signed-in daemon or self-hosted runner, encrypted synchronization, job health, retries, and push delivery while keeping local-only mode. |
| P1 | Connector breadth | Daily productivity lives across Slack, Notion, GitHub issues, task managers, and storage—not only Google Workspace. | Extract a small connector contract with separate read/write permissions, encrypted OAuth storage, preview, approval, audit, revoke, and health behavior. Ship GitHub issues/notifications first, then Slack and Notion. |
| P1 | Rich input and artifact handling | Accepting a PDF, image, spreadsheet, or recording is not enough if the teammate cannot extract it reliably or show a useful preview. | Add bounded parsers, image/audio understanding, first-class artifact cards, and rendered before/after review for documents and workbooks. |
| P1 | Skills at the point of use | Taught workflows exist, but they are hidden in a settings sheet and lack an obvious way to invoke, test, revise, or share them. | Add a `/` skills picker in the composer, skill detail/history, a test action, and a clear owner-controlled promotion flow. |
| P1 | Routine operations | Interval routines work, but reliability requires editing, deletion, run history, retries, failure notifications, and event triggers. | Add an operations view with next/last run, result link, retry, edit, delete, pause reason, and signed webhook/calendar/GitHub triggers. |
| P2 | Visual computer use and takeover | Accessibility controls cannot understand arbitrary canvases, images, remote desktops, or video; some sign-in and CAPTCHA steps require a person. | Add opt-in screen capture, bounded visual actions, a visible takeover mode, and per-action policy. Never make this a silent global permission. |
| P2 | Conversation retrieval and context | As chats and teammates grow, users need replies, reactions, pins, roster sections, and cross-chat search. | Start with reply context and local full-text search, then add lightweight reactions and organization. |
| P2 | Native phone experience | The PWA is useful but lacks guaranteed background execution, platform push, share-sheet capture, and polished voice sessions. | Package a small native shell only after the always-on runner and notification model are reliable. |
| P3 | Multi-user administration | A local single-owner product does not yet have SSO, central policies, audit export, deployment templates, or offboarding. | Design tenancy, policy inheritance, network rules, connector allowlists, and key rotation as a separate architecture milestone. |

## Next release sequence

1. Finish the conversation loop: reply context, `/` skill invocation, clear queued-versus-redirected behavior, and global local search.
2. Make routines operationally trustworthy: edit, delete, run history, failure recovery, result links, and notifications.
3. Create the connector SDK and ship a complete GitHub productivity connector before advertising a marketplace.
4. Add rich document, image, audio, and spreadsheet ingestion with visible artifacts and verification.
5. Prototype the optional always-on runner and mobile push path without changing the secure local default.

## Release truth

OpenBot 0.11.0 is a strong local-first beta, not feature parity with Grok Bot. It is already differentiated for private model ownership, granular authority, coding isolation, change recovery, transparent teammate collaboration, and exact-commit review. “Better” should mean more trustworthy and owner-controlled first; breadth should be added only when each connector and computer action has real permission, recovery, and verification behavior.

## Primary comparison sources

- [Grok Bot overview](https://cursor.com/docs/grok-bot)
- [Work with Grok Bot](https://cursor.com/docs/grok-bot/work)
- [Grok Bot use cases](https://cursor.com/docs/grok-bot/use-cases)
- [Grok Bot for teams and enterprise](https://cursor.com/docs/grok-bot/teams)
- [Cursor agent computer use](https://cursor.com/blog/agent-computer-use)

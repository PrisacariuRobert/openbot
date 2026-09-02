# OpenBot Product Gap Audit

Updated for OpenBot 0.12.0. This audit compares the locally verified product with the current official Grok Bot product documentation. It separates what works now from what would merely look impressive in a screenshot.

## Current position

OpenBot's strongest difference is owner control: local data, bring-your-own model access, per-teammate app and project permissions, durable approvals, explicit cost limits, isolated code branches, recoverable edits, and independent review. Version 0.12 closes three daily-productivity gaps with chat-native skills, dependable routine operations, and a real GitHub productivity connector. Grok Bot remains broader where a hosted product has an advantage: an always-on cloud computer, native mobile delivery, general computer takeover, a larger connector surface, and organization administration.

## Highest-value gaps

| Priority | Experience gap | Why it matters | Product direction |
|---|---|---|---|
| P1 | Always-on execution and dependable notifications | Remote check-in is much less useful when the Mac sleeps, the service exits, or mobile delivery is delayed. | Add an optional signed-in daemon or self-hosted runner, encrypted synchronization, job health, retries, and push delivery while keeping local-only mode. |
| P1 | Connector breadth | Daily productivity lives across Slack, Notion, task managers, and storage—not only Google Workspace and GitHub. | Reuse the per-teammate read/write permission, approval, preview, health, and audit pattern now proven by Google and GitHub. Ship Slack next, then Notion. |
| P1 | Rich input and artifact handling | Accepting a PDF, image, spreadsheet, or recording is not enough if the teammate cannot extract it reliably or show a useful preview. | Add bounded parsers, image/audio understanding, first-class artifact cards, and rendered before/after review for documents and workbooks. |
| P1 | Skill portability and history | Version 0.12 makes learned skills discoverable, runnable, editable, and removable, but there is no sharing, version history, or import/export yet. | Add a reviewable skill manifest, version history, test fixtures, and owner-controlled sharing without exposing recorded secrets. |
| P1 | Event-driven routine reliability | Version 0.12 adds edit/delete/history/retry/result controls, but scheduled work still needs failure alerts and event triggers. | Add visible failure recovery, signed webhook/calendar/GitHub triggers, filters, rate limits, dedupe keys, and replay history. |
| P2 | Visual computer use and takeover | Accessibility controls cannot understand arbitrary canvases, images, remote desktops, or video; some sign-in and CAPTCHA steps require a person. | Add opt-in screen capture, bounded visual actions, a visible takeover mode, and per-action policy. Never make this a silent global permission. |
| P2 | Conversation retrieval and context | As chats and teammates grow, users need replies, reactions, pins, roster sections, and cross-chat search. | Start with reply context and local full-text search, then add lightweight reactions and organization. |
| P2 | Native phone experience | The PWA is useful but lacks guaranteed background execution, platform push, share-sheet capture, and polished voice sessions. | Package a small native shell only after the always-on runner and notification model are reliable. |
| P3 | Multi-user administration | A local single-owner product does not yet have SSO, central policies, audit export, deployment templates, or offboarding. | Design tenancy, policy inheritance, network rules, connector allowlists, and key rotation as a separate architecture milestone. |

## Next release sequence

1. Add rich document, image, audio, and spreadsheet ingestion with visible artifacts and verification.
2. Add failure alerts and signed event triggers to the routine history and retry foundation.
3. Reuse the Google/GitHub permission pattern for Slack, then Notion, before advertising a marketplace.
4. Finish conversation retrieval with reply context, local full-text search, and lightweight roster organization.
5. Prototype the optional always-on runner and mobile push path without changing the secure local default.

## Release truth

OpenBot 0.12.0 is a strong local-first beta, not feature parity with Grok Bot. It is differentiated for private model ownership, granular authority, coding isolation, change recovery, transparent teammate collaboration, exact-commit review, approval-gated GitHub writes, inspectable routines, and portable local skills. “Better” means more trustworthy and owner-controlled first; breadth should be added only when each connector and computer action has real permission, recovery, and verification behavior.

## Primary comparison sources

- [Grok Bot overview](https://cursor.com/docs/grok-bot)
- [Work with Grok Bot](https://cursor.com/docs/grok-bot/work)
- [Grok Bot use cases](https://cursor.com/docs/grok-bot/use-cases)
- [Grok Bot for teams and enterprise](https://cursor.com/docs/grok-bot/teams)
- [Cursor agent computer use](https://cursor.com/blog/agent-computer-use)

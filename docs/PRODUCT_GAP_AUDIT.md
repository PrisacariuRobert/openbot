# OpenBot Product Gap Audit

Updated for OpenBot 0.17.4. This audit compares the locally verified product with the current official Grok Bot product documentation. It separates what works now from what would merely look impressive in a screenshot.

## Current position

OpenBot's strongest difference is owner control: local data, bring-your-own model access, per-teammate app and project permissions, durable approvals, explicit cost limits, isolated code branches, recoverable edits, independent review, and preserved artifact revisions. Version 0.17.4 makes the compiled native iPhone client and web studio one continuous room in behavior, layout, language, and customizable code-drawn character motion, without copying studio data or credentials into a hosted service. Grok Bot remains broader where a hosted product has an advantage: an always-on cloud computer, push delivery, general computer takeover, a larger connector marketplace, fidelity-preserving Office work, and organization administration.

## Highest-value gaps

| Priority | Experience gap | Why it matters | Product direction |
|---|---|---|---|
| P1 | Always-on execution and dependable notifications | Remote check-in is much less useful when the Mac sleeps, the service exits, or mobile delivery is delayed. | Add an optional signed-in daemon or self-hosted runner, encrypted synchronization, job health, retries, and push delivery while keeping local-only mode. |
| P2 | Connector breadth and events | Slack, Notion, Google Workspace, and GitHub now cover core context, but task managers, broader storage, CRM, Slack events, and Notion events remain absent. | Extend the 0.16 manifest and review contract to one high-value connector at a time, beginning with task management and cloud storage; add event ingestion only with dedupe and replay. |
| P2 | Fidelity editing, OCR, and transcription | OpenBot understands common PDF/Office/sheet/text files and forwards media to compatible models, but scanned documents, guaranteed local transcription, and layout-safe Office edits remain uneven. | Add opt-in OCR/local speech models and dedicated document/workbook engines with rendered before/after review. |
| P1 | Skill portability and history | Learned skills are discoverable, runnable, editable, and removable, but there is no sharing, version history, or import/export yet. | Add a reviewable skill manifest, version history, test fixtures, and owner-controlled sharing without exposing recorded secrets. |
| P1 | Hosted automation availability | Schedule, Calendar, GitHub, and generic webhook triggers now have durable receipts and recovery, but local schedules stop when the host sleeps and public events need an owner-managed secure route. | Add an optional always-on runner, hosted ingress, encrypted job leases, recovery, health checks, and push delivery while preserving local-only mode. |
| P2 | Visual computer use and takeover | Accessibility controls cannot understand arbitrary canvases, images, remote desktops, or video; some sign-in and CAPTCHA steps require a person. | Add opt-in screen capture, bounded visual actions, a visible takeover mode, and per-action policy. Never make this a silent global permission. |
| P2 | Conversation retrieval and context | As chats and teammates grow, users need replies, reactions, pins, roster sections, and cross-chat search. | Start with reply context and local full-text search, then add lightweight reactions and organization. |
| P2 | Native phone delivery | The SwiftUI app handles native secure chat, routing, attachment intake, progress, and approvals, but lacks rich artifact previews, platform push, share-sheet capture, App Store distribution, and dedicated voice sessions. | Add previews next; add push only with an always-on runner, explicit data-location choice, signing, and notification threat model. |
| P3 | Multi-user administration | A local single-owner product does not yet have SSO, central policies, audit export, deployment templates, or offboarding. | Design tenancy, policy inheritance, network rules, connector allowlists, and key rotation as a separate architecture milestone. |

## Next release sequence

1. **0.18 — Find and organize:** reply context, local full-text search, pins, roster sections, duplication, and private skill import/export.
2. **0.19 — Always-on work:** optional self-hosted runner, hosted event ingress, encrypted leases, health, recovery, and push delivery without changing local-only mode.
3. **0.20 — Focused breadth:** add one task manager and one cloud-storage connector through the reviewed connector contract, then add Slack/Notion event sources.
4. **Later — Fidelity tools:** OCR, local transcription, and format-aware Office editing after their model, privacy, and rendered-review boundaries are proven.

## Release truth

OpenBot 0.17.4 is a strong local-first beta, not feature parity with Grok Bot. It includes a simulator-verified native iPhone client, matching customizable cross-platform presentation and motion, and Mac/iPhone draft continuity while remaining differentiated for private model ownership, granular per-teammate authority, rich bounded inputs, one-voice consultation, exact-commit review, recoverable writes, and signed automations with explainable recovery. “Better” means more trustworthy and owner-controlled first; always-on infrastructure and breadth still need real permission, recovery, and verification behavior.

## Primary comparison sources

- [Grok Bot overview](https://cursor.com/docs/grok-bot)
- [Work with Grok Bot](https://cursor.com/docs/grok-bot/work)
- [Grok Bot use cases](https://cursor.com/docs/grok-bot/use-cases)
- [Grok Bot for teams and enterprise](https://cursor.com/docs/grok-bot/teams)
- [Cursor agent computer use](https://cursor.com/blog/agent-computer-use)

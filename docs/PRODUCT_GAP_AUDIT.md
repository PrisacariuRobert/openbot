# OpenBot Product Gap Audit

Updated for OpenBot 0.21.0. This audit compares the locally verified product with the current official Grok Bot product documentation. It separates what works now from what would merely look impressive in a screenshot.

## Current position

OpenBot's strongest difference is owner control: local data, bring-your-own model access, per-teammate app and project permissions, durable approvals, explicit cost limits, isolated code branches, recoverable edits, independent review, and preserved artifact revisions. Version 0.21.0 retains the resilient runner and adds Todoist, read-only Dropbox, and native artifact previews/sharing through the same bounded security model. The compiled native iPhone client and web studio keep one language and customizable code-drawn character system without copying studio data or credentials into a hosted service. Grok Bot retains the structural advantage of cloud execution while the user's Mac is asleep or powered off, plus hosted ingress, native push distribution, broader connectors, fidelity-preserving Office work, and organization administration.

## Highest-value gaps

| Priority | Experience gap | Why it matters | Product direction |
|---|---|---|---|
| P1 | Powered-off execution and hosted ingress | OpenBot now survives process exits and sends secure Web Push, but an asleep or powered-off Mac still cannot execute work or accept public events. | Add an optional private runner deployment and encrypted cross-host handoff with an explicit data-location choice. |
| P2 | Connector breadth and events | Google Workspace, GitHub, Slack, Notion, Todoist, and Dropbox now cover the core personal context loop, but CRM, team storage, Slack events, and Notion events remain absent. | Continue one reviewed connector at a time; add event ingestion only with dedupe and replay. |
| P2 | Fidelity editing, OCR, and transcription | OpenBot understands common PDF/Office/sheet/text files and forwards media to compatible models, but scanned documents, guaranteed local transcription, and layout-safe Office edits remain uneven. | Add opt-in OCR/local speech models and dedicated document/workbook engines with rendered before/after review. |
| P2 | Hosted automation availability | Schedule, Calendar, GitHub, and generic webhook triggers now have durable receipts, single-owner leases, process recovery, and background protection, but sleep and public routing remain owner constraints. | Package a private VPS runner and optional hosted ingress without silently moving local data. |
| P2 | General visual computer use | Live Studio now supports visible owner takeover of isolated bot browsers, but Accessibility controls still cannot understand arbitrary macOS canvases, images, remote desktops, or video; CAPTCHA steps still require a person. | Add opt-in bounded screen understanding and per-action policy. Never make this a silent global permission. |
| P2 | Native phone delivery | Secure installed web apps have Web Push, and SwiftUI now previews and shares authenticated artifacts, but the native app still lacks APNs, share-sheet ingestion, App Store distribution, and dedicated voice sessions. | Complete physical-device signing and notification review, then add APNs and share-sheet ingestion. |
| P3 | Multi-user administration | A local single-owner product does not yet have SSO, central policies, audit export, deployment templates, or offboarding. | Design tenancy, policy inheritance, network rules, connector allowlists, and key rotation as a separate architecture milestone. |

## Next release sequence

1. **0.19 — Shipped:** versioned, integrity-checked, secret-scanned skill packages; immutable history; non-destructive rollback; starter templates; and safe assignment between teammates.
2. **0.20 — Shipped:** exclusive self-hosted runner leases, atomic job claims, crash recovery, macOS login/crash protection, health, secure Web Push, and notification deep links without changing local-only mode.
3. **0.21 — Shipped:** Todoist, read-only Dropbox, cross-app starter workflows, and authenticated native artifact preview/sharing.
4. **0.22 — Events and physical-device delivery:** Slack/Notion event sources, APNs after device-signing/privacy review, and share-sheet ingestion.
5. **Later — Fidelity tools:** OCR, local transcription, and format-aware Office editing after their model, privacy, and rendered-review boundaries are proven.

## Release truth

OpenBot 0.21.0 is a strong local-first beta, not full feature parity with Grok Bot. It includes a simulator-verified native iPhone client with authenticated artifact preview/sharing, matching customizable presentation and motion, Mac/iPhone continuity, Live Studio supervision, isolated-browser takeover, cross-studio retrieval, a private portable Skill Library, process-resilient background execution, secure web notifications, Todoist, and read-only Dropbox. It remains differentiated for model ownership, granular teammate authority, one-voice consultation, exact-commit review, recoverable writes, and signed automations. “Better” means more trustworthy and owner-controlled first; powered-off cloud execution, native distribution, hosted ingress, and broader connector/event coverage remain real gaps.

## Primary comparison sources

- [Grok Bot overview](https://cursor.com/docs/grok-bot)
- [Work with Grok Bot](https://cursor.com/docs/grok-bot/work)
- [Grok Bot use cases](https://cursor.com/docs/grok-bot/use-cases)
- [Grok Bot for teams and enterprise](https://cursor.com/docs/grok-bot/teams)
- [Cursor agent computer use](https://cursor.com/blog/agent-computer-use)

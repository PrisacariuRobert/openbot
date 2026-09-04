# OpenBot Product Gap Audit

Updated for OpenBot 0.28.0. This audit compares the verified product with the current official Grok Bot product documentation. It separates what works now from what would merely look impressive in a screenshot.

## Current position

OpenBot's strongest difference is owner control: an explicit local-or-private-host data location, bring-your-own model access, per-teammate app and project permissions, durable approvals, explicit cost limits, isolated code branches, recoverable edits, independent review, and preserved artifact revisions. Version 0.28.0 adds signed Slack and Notion event triggers, natural app-event routine creation, private rotating provider addresses, and connector manifest v2. The local Mac remains the default and no data moves silently. Grok Bot remains easier because Cursor operates the cloud service, and it still has broader connectors, fidelity-preserving Office work, App Store distribution, and organization administration.

## Highest-value gaps

| Priority | Experience gap | Why it matters | Product direction |
|---|---|---|---|
| P1 | Managed availability | The private runner continues when the Mac is off; setup, backup-first updates, diagnostics, device alerts, outside check-ins, and encrypted migration are guided. OpenBot still does not sell or operate a zero-setup managed cloud. | Simplify host bootstrap and recovery without hiding ownership, location, or the third-party heartbeat dependency. |
| P2 | Connector breadth | Google Workspace, GitHub, Slack, Notion, Todoist, and Dropbox cover the core personal context loop and all six app families can start focused proactive work, but CRM, project-management suites, and a reviewed install ecosystem remain absent. | Continue one reviewed connector at a time under manifest v2; do not execute unknown packages until provenance and isolation are designed. |
| P2 | Fidelity editing, OCR, and transcription | OpenBot understands common PDF/Office/sheet/text files and forwards media to compatible models, but scanned documents, guaranteed local transcription, and layout-safe Office edits remain uneven. | Add opt-in OCR/local speech models and dedicated document/workbook engines with rendered before/after review. |
| P2 | Connector-event convenience | Calendar, Todoist, Dropbox, signed GitHub/generic hooks, and signed Slack/Notion events are durable and can run continuously on a private host. Owners still configure public HTTPS ingress and provider subscriptions themselves. | Add guided provider setup checks and configurable retry backoff without pretending owner-operated ingress is managed cloud. |
| P2 | General visual computer use | Live Studio now supports visible owner takeover of isolated bot browsers, but Accessibility controls still cannot understand arbitrary macOS canvases, images, remote desktops, or video; CAPTCHA steps still require a person. | Add opt-in bounded screen understanding and per-action policy. Never make this a silent global permission. |
| P2 | Native phone distribution | SwiftUI now includes deliberate voice capture, APNs registration, and Share-sheet ingestion, but production delivery still needs owner-signed physical-device QA and App Store/TestFlight work. | Complete the Apple-team/App Group/APNs credential setup, physical-device tests, and distribution metadata. |
| P3 | Multi-user administration | A local single-owner product does not yet have SSO, central policies, audit export, deployment templates, or offboarding. | Design tenancy, policy inheritance, network rules, connector allowlists, and key rotation as a separate architecture milestone. |

## Next release sequence

1. **0.19 — Shipped:** versioned, integrity-checked, secret-scanned skill packages; immutable history; non-destructive rollback; starter templates; and safe assignment between teammates.
2. **0.20 — Shipped:** exclusive self-hosted runner leases, atomic job claims, crash recovery, macOS login/crash protection, health, secure Web Push, and notification deep links without changing local-only mode.
3. **0.21 — Shipped:** Todoist, read-only Dropbox, cross-app starter workflows, and authenticated native artifact preview/sharing.
4. **0.22 — Shipped in source:** proactive Todoist/Dropbox events, native APNs registration/delivery, Share-sheet ingestion, and managed Dropbox PKCE. Physical APNs verification remains owner setup.
5. **0.23 — Shipped:** deliberate native voice capture and recovery-focused product polish.
6. **0.24 — Shipped in source:** optional owner-operated private runner with HTTPS ingress, durable data/model/browser storage, public callbacks, health/readiness, backups, and matching web/native visibility.
7. **0.25 — Shipped in source:** real authenticated Home checks, backup freshness receipts, domain-guided setup, and consistent Mac/private location language on web and iPhone.
8. **0.26 — Shipped in source:** opt-in durable health/recovery notifications plus backup-first, fail-closed private-runner updates with replacement health checks and previous-image recovery.
9. **0.27 — Shipped in source:** privacy-preserving outside check-ins plus encrypted whole-home export/import with authentication, staging, health verification, and rollback.
10. **0.28 — Shipped in source:** signed Slack/Notion event triggers, natural app-event routines, private rotating addresses, and connector manifest v2 with a reviewed admission contract.
11. **Next — Connected-work polish:** provider setup diagnostics, configurable retry backoff, and the next narrow productivity source under the v2 contract.
12. **Later — Fidelity tools:** OCR, local transcription, and format-aware Office editing after their model, privacy, and rendered-review boundaries are proven.

## Release truth

OpenBot 0.28.0 closes the most useful built-in event gap: connected Slack and Notion activity can wake a selected teammate through provider-authenticated delivery and the same permission, dedupe, receipt, replay, rate, failure-pause, and approval system as earlier automations. Setup remains honest: the owner must expose a trusted HTTPS private host, register provider subscriptions, and grant each teammate read access. Manifest v2 documents how future connectors must declare events and authenticity, but OpenBot does not yet execute third-party connector packages. OpenBot remains differentiated by explicit data location, model ownership, granular teammate authority, one-voice consultation, exact-commit review, recoverable writes, durable approvals, and inspectable signed automations. Managed cloud convenience, connector breadth, signed native distribution, fidelity tools, and organization administration remain real gaps.

## Primary comparison sources

- [Grok Bot overview](https://cursor.com/docs/grok-bot)
- [Work with Grok Bot](https://cursor.com/docs/grok-bot/work)
- [Grok Bot use cases](https://cursor.com/docs/grok-bot/use-cases)
- [Grok Bot for teams and enterprise](https://cursor.com/docs/grok-bot/teams)
- [Cursor agent computer use](https://cursor.com/blog/agent-computer-use)

# OpenBot Release Roadmap

Updated September 2, 2026 after the 0.13 one-voice teamwork release.

This order follows one rule: deepen real daily usefulness before adding a long list of shallow integrations. Cursor's current Grok Bot documentation emphasizes rich attachments, persistent computer work, skills and event-driven routines, structured plugins, mobile review, search, and reviewable artifacts. OpenBot already has a strong local permission model and should extend that same contract rather than trade it away for breadth.

## 0.14 — Rich inputs and reviewable artifacts

Goal: make “read this and give me a finished file” dependable.

- Extract and reason over PDFs, images, audio, video metadata, Office files, CSV, JSON, YAML, email files, notebooks, and common source formats
- Add image and audio understanding instead of treating every attachment as text
- Render document and spreadsheet results as contained preview cards with download, revision, and source links
- Preserve originals and revise the same artifact rather than producing disconnected copies
- Add format-specific limits, clear unsupported-file recovery, and parser isolation

Ship only when mixed PDF-plus-spreadsheet reconciliation, screenshot understanding, voice-note summarization, and artifact revision all pass on desktop and phone.

## 0.15 — Dependable automations and event triggers

Goal: turn routines into something users can trust unattended.

- Add a failure inbox with retry, pause, repair guidance, and last-known-good input
- Add signed webhook, GitHub, and calendar triggers with narrow filters
- Enforce rate limits, idempotency, dedupe windows, loop prevention, and replay history
- Make test runs explicit because they can perform real work
- Notify on missed schedules, repeated failures, and approval waits

Ship only when duplicate events cannot duplicate an action and every failed event can be explained and safely replayed.

## 0.16 — Connector platform, then Slack and Notion

Goal: add breadth without weakening per-teammate authority.

- Define a versioned connector manifest and common read/write/approval interfaces
- Give each teammate independent scopes, previews, health checks, reconnect state, and audit events
- Ship Slack search/read/draft-reply first, with posting behind approval
- Ship Notion search/read/update next, with page changes previewed before approval
- Document a third-party connector review and secret-storage policy before calling it a marketplace

Ship only when revoking one teammate's access invalidates its active session and never removes another teammate's grant.

## 0.17 — Find, organize, and share

Goal: keep a growing studio understandable.

- Add local full-text search across conversations, files, links, routines, and results
- Add reply context and lightweight reactions
- Add sidebar pins, sections, hide/restore, and bot duplication
- Add private skill manifests, versions, import/export, tests, and secret scanning
- Add owner-controlled bot templates without sharing history, credentials, or browser state

Ship only when exported skills and bot templates contain no secrets and imported versions remain reviewable and reversible.

## 0.18 — Work anywhere

Goal: make remote and mobile use reliable while preserving local-only mode.

- Add an optional signed-in self-hosted runner or private VPS deployment
- Add encrypted synchronization, job leases, recovery, health checks, and push delivery
- Package a thin native phone shell for voice capture, share-sheet input, progress, artifacts, and approvals
- Keep the current loopback-only local mode as a first-class zero-cloud choice
- Prototype bounded screenshot understanding and visible human takeover for interfaces the structured tools cannot operate

Ship only after threat modeling, encrypted recovery testing, offline/duplicate-job testing, and a clear data-location choice during setup.

## Later, not implied by the beta

- Multi-user organizations, SSO, offboarding, policy inheritance, audit export, and managed network egress
- A broad third-party connector marketplace
- Unrestricted visual desktop control
- Hosted model access resold by OpenBot

These require separate security and operating models. They should not be presented as extensions of the single-owner local beta until those models exist and have been independently reviewed.

## Current research sources

- [Grok Bot overview](https://cursor.com/docs/grok-bot)
- [Work with Grok Bot](https://cursor.com/docs/grok-bot/work)
- [Grok Bot use cases](https://cursor.com/docs/grok-bot/use-cases)
- [Grok Bot for Teams and Enterprise](https://cursor.com/docs/grok-bot/teams)
- [Cursor agent computer use](https://cursor.com/blog/agent-computer-use)
- [Hermes Agent computer use](https://hermes-agent.nousresearch.com/docs/user-guide/features/computer-use)

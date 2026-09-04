# OpenBot Connector Contract v2

OpenBot 0.28 uses this contract to decide whether a connector belongs in the trusted built-in catalog. It is both a product checklist and a security boundary. Passing the contract does not make third-party code executable: connector code still ships through normal source review, tests, and a signed OpenBot release.

## Required manifest

Every connector declares:

- `schemaVersion: 2` and a unique service ID;
- its authentication method and official HTTPS documentation;
- the smallest useful read capability;
- any write capability and whether it requires approval;
- its provider-side data boundary;
- any event capability and the authenticity mechanism used for incoming events.

The application rejects duplicate services, unsupported manifest versions, writes without an approval rule, events without an authenticity contract, and non-HTTPS documentation links.

## Runtime rules

1. Credentials and webhook secrets are encrypted at rest and never enter model context.
2. Each teammate receives independent read and write grants. Revocation invalidates the teammate's active model session.
3. Every external write pauses on a durable preview containing the exact destination and bounded content.
4. Provider responses are normalized and bounded before they become task context.
5. Incoming event content is untrusted input. It is size-bounded, recursively secret-redacted, visibly delimited, and cannot approve another action.
6. Push sources must authenticate every event. Polling sources must keep a durable cursor and begin from a fresh baseline.
7. Stable delivery IDs are deduplicated before run creation. Bursts are rate-limited, failures remain inspectable, and repeated failures pause the routine.
8. Self-generated events are ignored where the provider exposes a reliable bot/app marker.
9. Disconnecting a provider or removing a teammate grant stops new event work immediately.
10. Connector activity, approvals, automation receipts, results, and failures remain inspectable in the owner's local database.

## Event authenticity options

- `provider_hmac`: verify the provider signature over the exact raw request body, including provider replay protection where defined.
- `signed_secret`: verify a user-configured HMAC secret and use a stable provider delivery ID.
- `cursor`: poll through an authenticated provider API with a durable cursor or timestamp; never replay pre-connection history by default.

Slack uses `provider_hmac` with its signing secret and timestamped `v0` signature. Notion bootstraps a verification token on a private rotating URL, encrypts it, then uses it to verify each `X-Notion-Signature`. GitHub uses `signed_secret`; Google Calendar, Todoist, and Dropbox use bounded authenticated polling.

## Review evidence

A connector is release-ready only after it has:

- unit coverage for authentication, normalization, limits, permissions, revocation, friendly errors, and exact approval previews;
- event coverage for invalid signatures, duplicate delivery, filtering, rate limits, self-loop prevention, and retained safe input when events are supported;
- OpenCode and Claude Code tool parity;
- responsive empty, setup, connected, error, and permission states;
- documentation that separates mocked verification, owner account consent, and a real provider delivery;
- no credential values in logs, API state, prompts, generated skill files, or screenshots.

## Deliberate non-goals in 0.28

OpenBot does not download or execute arbitrary connector packages, accept remote JavaScript, or advertise a public connector marketplace. A future package system needs signed provenance, dependency isolation, explicit network allowlists, a permission diff before installation, update/revocation policy, and a reproducible review record. Until then, adding a connector means adding reviewed source to OpenBot itself.

# Authentication & data-flow matrix (C01a)

Audited against `origin/main` (`fb4a70e`, 2026-09-17). Pinned by
`src/server/auth-data-matrix.test.ts` — change the code and the test fails;
change the promises and this document must change with them.

Owner decisions applied: **API connectors are not operated** (browser
sessions only), **no paid Apple program** (unsigned distribution). There is
therefore **no OAuth client to verify and no store of third-party service
tokens in the operated path**. The connector code stays in the tree but
dormant; enabling any of it for users reopens C01b/C01c and the OAuth
submission gate.

## 1. Model providers (the only external data flow in operation)

| Provider kind | Auth modes | Credential storage | What reaches the provider | Who pays |
|---|---|---|---|---|
| opencode (OpenCode account) | cli, subscription | Owner's OpenCode CLI state, never in OpenBot storage | Prompts, tool results, attached file previews, browser content the teammate reads | Owner's OpenCode allowance |
| claude (Claude Code) | cli, subscription | Owner's Claude CLI state | Same as above | Owner's Claude allowance |
| openai / xai / custom (API) | api_key | Vault-encrypted in OpenBot storage (`secret_ciphertext`); projections expose only `hasSecret` | Same as above, sent to the configured `baseUrl` | Owner's API key |
| local (e.g. Ollama-style URL) | api_key with local URL, key optional | Same vault; key omitted for loopback | Same as above, stays on the owner's machine/network | Owner's hardware |

Rules enforced in code: discovering or saving a provider is not consent to
use it (explicit per-teammate assignment required); hosted API providers
require a key; `listProviders`/`getBot`/state projections never contain key
material (only `hasSecret`); model must belong to the assigned connection.

## 2. Browser sessions (operated path for services)

- One persistent Chromium profile per teammate (`computersDir/<bot>/browser`).
- Logins happen only through owner takeover; the app never extracts,
  copies, or shares cookies/tokens/passwords across teammates.
- A login wall or completed handoff revokes navigation allowances; a
  changed revision fails stale approvals instead of acting.
- No structured API tokens are minted, stored, or refreshed in this path.

## 3. Dormant API connectors (present, not operated)

Todoist, Gmail/Drive/Calendar (Google), Slack, Notion, Dropbox, GitHub,
Mac integrations: implementation remains in `src/server/` with its tests,
but per owner decision no OAuth client is registered, no account is
connected, and no connector runs in the operated path. Fresh installs show
all connectors unconnected with no stored credentials (asserted in test).

If any connector is advertised later, its scopes must be re-audited. The
currently requested Google scopes (dormant) are: `openid`, `email`,
`profile`, `https://www.googleapis.com/auth/gmail.readonly`,
`https://www.googleapis.com/auth/gmail.send` (restricted),
`https://www.googleapis.com/auth/drive.readonly`,
`https://www.googleapis.com/auth/drive.file`,
`https://www.googleapis.com/auth/calendar.readonly`,
`https://www.googleapis.com/auth/calendar.events.owned` (restricted).
Restricted scopes would require Google verification before public use.

## 4. Redaction rules (asserted)

- Logs, screenshots, receipts and diagnostic bundles never contain raw
  tokens, credentials, browser profiles or vault keys.
- Approval previews and receipts carry digests and labels, never bodies of
  credentials or private file bytes beyond bounded previews.
- Telemetry sent anywhere is provider-reported usage only, never content.

## 5. Open owner/external gates

- Google OAuth verification: not started (correctly — unused).
- Apple signing/notarization: unavailable (free account); distribution is
  unsigned with checksums (see release notes at freeze).
- Pilot consent/data rules and publication: owner-gated (L01).

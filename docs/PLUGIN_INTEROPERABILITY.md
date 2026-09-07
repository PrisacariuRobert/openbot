# Plugin interoperability: use open standards, not another app's private access

Research and implementation checked 5 September 2026. OpenBot 0.36 includes limited standards-based interoperability, not a complete marketplace integration. [Original checks](QA_OPEN_EXTENSIONS.md) and [new OAuth checks and limits](QA_0.36.md).

## Implemented in the development beta

Web, native Mac, and iPhone share **Tools, skills & memory** controls. OpenCode and Claude tool bridges expose the same host-controlled actions. No Hermes code or private Grok Bot session was imported.

| Component | Supported now | Explicit boundary |
|---|---|---|
| Remote MCP | SDK-backed Streamable HTTP, public HTTPS or explicit 127.0.0.1 HTTP, encrypted bearer token or PKCE browser sign-in with discovery/public-client registration, tool discovery, per-bot grants, schema checks, approvals and source receipts | OAuth servers requiring pre-registered clients need a dedicated integration; no arbitrary subprocess, automatic package install, sampling, roots, or automatic resource fetching |
| Community skills | Reviewed Agent Skills text subset: SKILL.md, license and explicit text references/templates/examples/assets; exact content/source digest; per-bot assignment and on-demand loading | Scripts, missing references, unsupported runtime fields, Hermes runtime requirements, and `allowed-tools` policies block import; no silent policy translation |
| Memory | Private bounded notes, owner correction/deletion, model search, new-session invalidation and a 4,000-character initial prompt budget | No semantic retrieval, automatic consolidation, shared organizational memory, or erasure of historical chat/running context |

Hermes is useful architectural inspiration: progressive skill loading, reusable methods, persistent memory and standard MCP connections. Its Python plugins/tool registries, gateway integrations and runtime-dependent skills are separate software, not portable connectors simply because they are public. OpenBot does not execute arbitrary Hermes plugins. [Hermes plugins](https://hermes-agent.nousresearch.com/docs/user-guide/features/plugins), [MCP](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp), [skills](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills), [memory](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory), [Agent Skills format](https://agentskills.io/specification).

### Included adapters (5 September 2026)

- Seven pinned methods ship with OpenBot; five adapt Hermes's weekly-review-planning, meeting-action-items, document-to-action-items, grounded-citations and systematic-debugging. The other two use OpenBot's exact table tools and private consultation protocol. The catalog and MIT notices live in `skills/bundled/`. It loads on demand for all existing/new bots. Per-bot opt-outs and studio-wide disabling survive restart; upstream updates cannot silently download or execute code. Catalog changes and access changes invalidate subsequent model sessions.
- These are reviewed **OpenBot adaptations**, not verbatim runtime imports. Hermes-specific tools, Python quote-validation scripts and unsupported installation requirements were removed or replaced with available OpenBot tools and explicit limitations. The generic third-party importer continues to reject unsupported runtime policies.
- The shared-project write/replace gateway now runs a nine-category local **security-guidance advisory subset**, inspired by Hermes's Apache-2.0 Anthropic pattern source. It returns line references and review guidance without uploading code or spending a separate model call. It does not scan every provider-native write, dependencies, a whole repository or Python plugins; no warning is not proof of safety. `skills/bundled/licenses/` preserves license and attribution in distributed packages.

## What can be shared

Cursor documents both an open Agent Plugins format (root `plugin.json`, skills and MCP definitions) and a Cursor-specific format (`.cursor-plugin/plugin.json`, with additional rules, commands, agents and hooks). Its public plugins are distributed as Git repositories. OpenBot can pursue compatibility with public, appropriately licensed skills and independently accessible MCP servers; a server's own authentication and commercial terms still apply. [Cursor plugin documentation](https://cursor.com/docs/plugins).

| Integration type | Appropriate OpenBot path | What must not be assumed |
|---|---|---|
| Portable skill instructions | Validate paths, bounds, license and instructions; import into the existing reviewed/versioned Skill Library | Instructions/scripts are not trusted merely because a marketplace listed them |
| Public remote MCP server | Connect directly using the owner's provider authorization; discover tools; enforce per-teammate grants and reviewed writes in OpenBot | Read-only annotations are not a security boundary; tool names/schemas can change |
| Local MCP command | Explicit reviewed executable/arguments, isolated process and scoped secrets | Never execute install hooks or arbitrary commands automatically from a manifest |
| Cursor-specific hooks/rules/variables | Show an explicit unsupported-components report or implement a reviewed translation | Never silently discard safety rules while claiming full compatibility |
| Grok Bot hosted connector login | Use an independently supported provider integration and its own login flow | Do not extract/reuse Cursor tokens, impersonate its OAuth client, or call undocumented private backends |

Grok Bot's connector connections belong to the account used to sign into Grok Bot. Their documentation does not establish an export/reuse API for those sessions. Portable Cursor plugin format support therefore does **not** establish access to the entire Grok Bot marketplace or its hosted connectors. [Grok Bot connector setup](https://cursor.com/help/grok-bot/connect-plugins).

## Required gate for any broader compatibility claim

A real adapter must complete discovery, explicit installation, independent authentication, model-visible tool exposure, permission enforcement, cancellation, bounded untrusted results, revocation, and a saved outcome through both supported runtimes. A parsed manifest alone is not an integration. Remote writes must enter OpenBot's approval/action ledger; declared `readOnlyHint` is advisory, not proof. Credentials must stay on the host service side, not in model context.

Current checks cover rejected unsafe paths/scripts/runtime policies, pinned-review tampering, changed tools, token failure, denied writes, cancellation, revoked grants, oversized replies and a lost write acknowledgement. A real Spark 1.3 task used a local protocol fixture, a referenced skill and a corrected preference to save a checked brief; Claude's stdio bridge has a real HTTP round-trip test, not a live Claude-account acceptance run. The public Hermes documentation MCP endpoint also returned a real search result. That endpoint is unauthenticated: it does not prove OAuth, paid-account compatibility, or broad marketplace access.

Broader support still needs actual provider consent/revocation tests, isolated local process execution, supported runtime translations, supply-chain review, stronger process/network containment and repeated provider/model outcomes. Marketing may say **limited open MCP and portable text-skill support**. It must not say **Grok Bot plugins supported**, **all Hermes plugins supported**, or **one-click access to every service**.

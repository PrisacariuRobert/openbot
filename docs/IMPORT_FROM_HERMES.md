# Importing a Hermes or OpenClaw profile

Bring an agent you already raised in [Hermes](https://github.com/NousResearch/hermes-agent) or OpenClaw into OpenBot as a teammate: their persona, curated memories, and text skills move; your secrets stay yours.

## What it is

OpenBot's **New teammate** sheet (Control center → Add a teammate) has an **Import from Hermes or OpenClaw** disclosure. Point it at a profile folder and it shows exactly what will move before anything is created.

Supported sources:

| Source | Folder |
|---|---|
| Hermes, named profile | `~/.hermes/profiles/<name>` |
| Hermes, default profile | `~/.hermes` (the folder itself must contain `SOUL.md`) |
| OpenClaw | `~/.openclaw` |

## What moves

- **Persona** — `SOUL.md` becomes the teammate's job and instructions. OpenBot adds a short adaptation note so the teammate knows which of its old habits name tools it no longer has, and asks instead of pretending.
- **Curated memories** — `MEMORY.md` (the agent's notes) and `USER.md` (your profile) become private memory notes owned by the teammate. `§`-separated and line-based entries both parse. Notes longer than OpenBot's per-note size are listed for hand review instead of silently trimmed.
- **Text skills** — every `skills/**/SKILL.md` bundle is copied (with `references/`, `templates/`, `assets/`, `examples/` text files) into the teammate's skill directories for both runtimes. Scripts, hidden files, and parent paths are not imported — the same safety line as OpenBot's community-skill importer.

## What never moves

- **Credentials and API keys** — never copied. If the profile contains credential-looking settings, the preview says so and the plan carries no secret values. Connect the model in OpenBot yourself.
- **Chat history and sessions** (`state.db`) — they stay in the original tool.
- **Messaging platform settings** (Telegram, Discord, Slack, …) — reconnect those through OpenBot's connectors.
- **Cron jobs** — recreate them as OpenBot routines when you're ready (they get OpenBot's connector-readiness gates and Work Receipts).

## How to use it

1. Open **New teammate**.
2. Expand **Import from Hermes or OpenClaw** and enter the profile folder path.
3. **Preview what moves** — check the persona, memory and skill counts, and the skipped list.
4. **Import as a new teammate.** The teammate appears in the roster with a distinct name (a second import of the same profile gets "… (imported)").
5. Pick their AI connection and model above the import section, adjust the look, and create.

Or over the API (owner-only):

```
POST /api/imports/profile/preview   { "path": "~/.hermes/profiles/researcher" }
POST /api/imports/profile/apply     { "path": "~/.hermes/profiles/researcher" }
```

The preview endpoint changes nothing on disk; the apply endpoint only writes inside OpenBot's own data directory.

## Honest limits

- Imported skills are plain instruction documents. Hermes skills that assume Hermes-specific tools (its memory tool, messaging gateway, terminal backends) will still run — the adaptation note tells the teammate to ask you instead of faking those tools.
- Chat history is not re-indexed. OpenBot memory retrieval works on what the teammate remembers from here on, plus anything you ask them to remember.
- The import is one-way. It never writes to your Hermes or OpenClaw folders.

# Sidemates: notes for Claude Code

Sidemates (called OpenBot until October 2026) is an open-source team of AI teammates that runs on the owner's Mac. It has three parts: a local Node service, a web studio and an Electron shell. Teammates run through the OpenCode or Claude Code command-line tools, and act through tools the server mediates. Anything consequential needs the owner's approval.

## What to work on

The current plan is [docs/DEVELOPER_PLAN.md](docs/DEVELOPER_PLAN.md). When asked for "the next task", take the first open task on its board, say which one, then do it.

Work one task per branch (`task/<id>-<short-name>`) and per pull request, and tick the task on the board in the same pull request. Tasks marked "plan first" start in plan mode. Tasks marked "Owner" stop where the owner's Mac, accounts or decision are needed.

## Commands

```sh
npm ci                                # install (Node 22.13 or newer)
npm run dev                           # studio on http://127.0.0.1:4310
npm test                              # unit and fixture tests (about 4 minutes)
npm run check                         # TypeScript
npm run verify                        # everything CI runs: guards, tests, types, build
npx tsx --test path/to/file.test.ts   # one test file
```

Browser tests need Chrome or Chromium. If it isn't at a standard path, set `OPENBOT_CHROME_PATH` (until task S1 lands, 17 fixture tests ignore it).

macOS-only pieces are mocked or skipped on Linux: the JXA app tools, the Full Disk Access indexes, the wake schedule and the DMG. Say so in the pull request; don't claim you verified them.

## How a teammate run works

1. The studio sends `POST /api/messages` (`src/server/index.ts`).
2. `OpenCodeRunner` in `src/server/opencode.ts` (used for both runtimes) claims queued runs from SQLite.
3. `src/server/workspace.ts` writes the teammate's workspace: a deny-by-default `opencode.json`, tool shims and the prompt.
4. The runner starts `opencode run` or `claude -p` with Sidemates' MCP tools (`src/server/claude-mcp.mjs`).
5. Tools call back into the server with a per-run token. The server runs the browser (`BrowserManager` in `src/server/runtime.ts`), the container, the Mac apps (`src/server/mac-apple-apps.ts`) and the connectors.
6. Consequential actions become approvals (`src/server/safety.ts`, `src/shared/autopilot.ts`, `src/shared/approval-preview.ts`).
7. Results and usage are stored in SQLite (`src/server/database.ts`) and stream to the studio (`src/studio/`).

`src/server/index.ts` (over 5,000 lines) and `src/CapabilityPanels.tsx` (over 7,500 lines) are too big. Put new code in new modules and import it.

## House rules

- **The owner sets autonomy; the server enforces it.**
  - Never weaken a server-side check to make a prompt work; prompts are not permission checks.
  - At every autonomy level, these always ask: money, the first message to a new person, anything gone for good, and credentials.
  - Everything else follows the teammate's level (Ask first, Smart, Autopilot), as defined in the plan's Autonomy section.
  - Autonomous sends use a sandboxed context, an undo window and daily caps.
- **Every claim needs evidence.**
  - Write no "always asks", "private" or "works with X" in the README, the site or the UI without a test or a dated source.
  - If the product doesn't do it yet, change the words.
  - Competitor facts carry a date and a source, and say where the other product is better.
- **Privacy.**
  - Nothing leaves the Mac for analytics unless the owner opted in.
  - Tests use temporary data directories and synthetic data. Never touch the owner's `.openbot` home, browser profiles, inbox or messages.
  - Live model runs need the owner's go-ahead.
- **Keep secrets out of Git.**
  - Never commit secrets, personal recordings, runtime state, browser sessions or signing material.
  - After staging, run `node .github/scripts/check-public-source.mjs`.
- **`marketing/` is private** to the owner and ignored by Git. Never commit it or copy its contents into the repository.
- **Scope.** Don't add connectors, chat channels or platforms unless a task in the plan says so.
- **Naming.**
  - The product is Sidemates.
  - Internal names (`OPENBOT_*`, `openbot.sqlite`, `mcp__openbot__*`) stay until the plan renames them with aliases. Don't rename them in passing.
  - Never create a repository named `openbot` on the owner's account; it would break GitHub's redirect from the old name.

## Done means

- There are tests for the new behavior and its failure paths, and `npm run verify` passes. If environment-only tests couldn't run here, the pull request names them and says why.
- User-visible changes get one line in `CHANGELOG.md` and in the README's "What's new", and the site copy is updated where the feature lives.
- UI changes are checked on small screens, in light and dark, with keyboard focus, and in loading, error and empty states (see `docs/DESIGN_LANGUAGE.md`).
- The pull request says what was tested, what wasn't, and any risk.

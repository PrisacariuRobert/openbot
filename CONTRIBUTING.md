# Contributing to Sidemates

Sidemates is an owner-operated desktop and phone development beta. Help us make a few useful workflows dependable before adding more settings or claiming competitor parity. The [product gap audit](docs/PRODUCT_GAP_AUDIT.md) and [roadmap](docs/ROADMAP.md) list what is still missing.

## Start with one reproducible problem

Use an issue to describe the user outcome, current behavior, a small reproduction and expected result. Include the Sidemates version, operating system and client (Electron desktop or phone/desktop browser). Redact account addresses, tokens, conversation text and file paths that are not necessary to reproduce it. Report vulnerabilities through [SECURITY.md](SECURITY.md), not a public bug report.

Discuss major dependencies, new permissions, connectors and architectural changes before implementing them. A feature is not complete because its card or tool exists: include a test of the resulting workflow, failure behavior and permission boundary.

## Run a source checkout

Install Node.js 22.13 or newer, Git and npm. Use the lockfile:

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:4310/studio.html` for the conversation-first preview. Both `/` and `/studio.html` load the same shared application. Pick a provider when creating a teammate; do not add a default paid account or credentials to the repository. OpenCode is needed for OpenCode-backed execution paths; Claude Code uses its own adapter. Chrome/Chromium and Docker are only needed for the corresponding browser and computer workflows. Some API/local-model paths still use the OpenCode adapter—an API endpoint is not itself a bundled execution engine.

For the Electron desktop app and shared phone web client, follow [desktop/README.md](desktop/README.md). Use `npm run package:desktop` on the target platform; a web build alone does not verify the packaged runner. SwiftUI clients are retired and remain available in Git history.

## Keep tests away from personal data

Use temporary data directories and synthetic accounts. Never run acceptance tests against an owner's data folder (`.openbot` in a source checkout, `~/Library/Application Support/Sidemates/data` for the installed app), saved browser profiles, inbox or live conversations. Live provider tests consume the owner's allowance and need explicit opt-in; ordinary CI must not need provider credentials or make external writes.

```sh
npm run verify
node --test .github/scripts/check-public-source.test.mjs
node .github/scripts/check-public-source.mjs
npm run test:conversation-flow
npm run test:onboarding
npm run test:app-approvals
npm run test:studio-polish
npm run test:browser-sessions
```

The browser checks require Chrome/Chromium. Set `OPENBOT_CHROME_PATH` to its executable if it is not discovered automatically. `verify` runs release/source guards, unit tests, TypeScript checks and the web build; its Mac checks are source-contract checks, **not** builds on a Mac. When you change the Mac app wrapper, entitlements or packaging, build and test it on a Mac with `npm run package:desktop`. Use the relevant deterministic benchmark for workflow changes and retain its artifact, not just the model's success message.

## Add a teammate to the gallery

The [gallery](https://sidemates.app/teammates/) is a folder of plain JSON files, `site/teammates/<name>.json`. To add one:

1. Build the teammate in Sidemates, try it on real work, then use **Share as a file** in its settings.
2. Save the file as `site/teammates/<short-name>.json` (lowercase letters, digits and dashes) and add one line about it to `site/teammates/index.json`. Keep `about` to one plain sentence.
3. Run `npx tsx --test src/server/gallery.test.ts`. It checks that the file is valid, small, free of credentials, uses skills that exist, that its routines can run unattended, and that the index matches.

What we look for: it does one job well; its instructions are readable and say what it must never do (send, buy, pay, delete on its own); it needs nothing the owner hasn't chosen to give it. Shared teammates start with the browser and the private computer off, so say in `about` if it works best with the browser on.

## Pull requests

- Work on a focused branch; keep unrelated owner changes intact. Maintainers merge after review. A contribution does not authorize publishing, tagging, deploying or changing repository protection.
- Explain the user-visible result, risks, tests actually run and checks still pending. Link a regression test for fixes. AI-assisted contributions follow the same standard; the contributor remains responsible for understanding and reviewing the code.
- Preserve existing data, explicit provider choice, per-teammate access and human review of external writes. New prompts must not substitute for server-side permission checks.
- Match the [design language](docs/DESIGN_LANGUAGE.md): simple neutral surfaces, accessible native controls, colorful code-drawn characters and reduced-motion support. Check small screens, light/dark appearance, keyboard focus and loading/error/empty states.
- Update README's "What's new" for user-visible changes, and keep only the latest release there: older notes live in CHANGELOG.md and the GitHub releases. On the website, update the section a feature belongs to instead of adding a "New in x" band or label; the home page describes what Sidemates is, not its history. For every version change, update the lockfile and native versions together and record evidence/known limits. Do not mark an unchecked release gate complete.
- Keep secrets, personal recordings, runtime state, browser sessions and signing material out of Git. The source guard inspects the **index**; run it after staging. It is not a complete secret scanner or Git-history audit.
- Retain third-party notices and pinned provenance. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Do not paste competitor assets or import unreviewed executable plugins.

Contributions are made under the repository's MIT license unless a file's preserved third-party notice states otherwise. Be respectful, describe issues rather than attacking people, and keep private user data private.

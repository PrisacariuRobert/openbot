# Contributing to OpenBot

OpenBot is an owner-operated, Mac-first development beta. Help us make a few useful workflows dependable before adding more settings or claiming competitor parity. The [first public beta checklist](docs/FIRST_PUBLIC_RELEASE.md) defines what is still missing.

## Start with one reproducible problem

Use an issue to describe the user outcome, current behavior, a small reproduction and expected result. Include the OpenBot version, operating system and client (web, Mac or iPhone). Redact account addresses, tokens, conversation text and file paths that are not necessary to reproduce it. Report vulnerabilities through [SECURITY.md](SECURITY.md), not a public bug report.

Discuss major dependencies, new permissions, connectors and architectural changes before implementing them. A feature is not complete because its card or tool exists: include a test of the resulting workflow, failure behavior and permission boundary.

## Run a source checkout

Install Node.js 22.13 or newer, Git and npm. Use the lockfile:

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:4310/studio.html` for the conversation-first preview. The complete existing settings interface remains at `/`. Pick a provider when creating a teammate; do not add a default paid account or credentials to the repository. OpenCode is needed for OpenCode-backed execution paths; Claude Code uses its own adapter. Chrome/Chromium and Docker are only needed for the corresponding browser and computer workflows. Some API/local-model paths still use the OpenCode adapter—an API endpoint is not itself a bundled execution engine.

To build the native Mac client, follow [macos/README.md](macos/README.md). The [iPhone source preview](ios/README.md) is a companion to a reachable host, not a standalone cloud service. Native compilation, signing, packaging and installation are separate steps; an Xcode build does not refresh an installed app.

## Keep tests away from personal data

Use temporary data directories and synthetic accounts. Never run acceptance tests against an owner's `.openbot` directory, saved browser profiles, inbox or live conversations. Live provider tests consume the owner's allowance and need explicit opt-in; ordinary CI must not need provider credentials or make external writes.

```sh
npm run verify
node --test .github/scripts/check-public-source.test.mjs
node .github/scripts/check-public-source.mjs
npm run test:conversation-flow
npm run test:onboarding
npm run test:legacy-approvals
npm run test:studio-polish
npm run test:browser-sessions
```

The browser checks require Chrome/Chromium. Set `OPENBOT_CHROME_PATH` to its executable if it is not discovered automatically. `verify` runs release/source guards, unit tests, TypeScript checks and the web build; its native checks are source-contract checks, **not** Xcode builds. Run the native tests/build instructions when modifying Swift, entitlements or packaging. Use the relevant deterministic benchmark for workflow changes and retain its artifact, not just the model's success message.

## Pull requests

- Work on a focused branch; keep unrelated owner changes intact. Maintainers merge after review. A contribution does not authorize publishing, tagging, deploying or changing repository protection.
- Explain the user-visible result, risks, tests actually run and checks still pending. Link a regression test for fixes. AI-assisted contributions follow the same standard; the contributor remains responsible for understanding and reviewing the code.
- Preserve existing data, explicit provider choice, per-teammate access and human review of external writes. New prompts must not substitute for server-side permission checks.
- Match the [design language](docs/DESIGN_LANGUAGE.md): simple neutral surfaces, accessible native controls, colorful code-drawn characters and reduced-motion support. Check small screens, light/dark appearance, keyboard focus and loading/error/empty states.
- Update README's current-version section for user-visible changes. For every version change, update the lockfile and native versions together and record evidence/known limits. Do not mark an unchecked release gate complete.
- Keep secrets, personal recordings, runtime state, browser sessions and signing material out of Git. The source guard inspects the **index**; run it after staging. It is not a complete secret scanner or Git-history audit.
- Retain third-party notices and pinned provenance. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Do not paste competitor assets or import unreviewed executable plugins.

Contributions are made under the repository's MIT license unless a file's preserved third-party notice states otherwise. Be respectful, describe issues rather than attacking people, and keep private user data private.

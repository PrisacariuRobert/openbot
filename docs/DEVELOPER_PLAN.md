# Sidemates developer plan

*7 October 2026 to January 2027. Budget: $0. Built with Claude Code, one task per branch.*

This plan replaces the release table in [ROADMAP.md](ROADMAP.md). It comes from a full audit of this repository on 7 October 2026 and from research into the personal-agent products people compare us with (Grok Bot, OpenAI dots, Meta Muse, Siri AI, Claude Cowork, OpenClaw, Hermes, MausBot).

The short version: **first, a stranger must get one useful result in three minutes. Then Sidemates must do real work on its own, ask only when it matters, and let you undo anything.**

Eight signature features, approved on 7 October 2026, give each release a headline that cloud agents can't easily copy, because each needs your Mac, your apps or your data on your machine.

## How to run this plan with Claude Code

1. Open Claude Code at the repository root. It reads [CLAUDE.md](../CLAUDE.md) by itself.
2. Paste the task's prompt (every task ends with one), or say: *"Do the next open task in docs/DEVELOPER_PLAN.md. Tell me which one before you start."*
3. For tasks marked **plan first**, start in plan mode (Shift+Tab), read the plan, then approve it.
4. Claude works on a branch named `task/<id>-<short-name>`, adds tests, runs `npm run verify` and ticks the task on the board below in the same pull request.
5. Before you merge, ask: *"Review this diff for bugs, missing tests and any claim the code doesn't back up."*
6. One task, one pull request, one line in the changelog.

Tasks marked **Owner** need you: your Mac, your accounts or a decision. Claude Code prepares them and stops.

## Where we stand on 7 October 2026

**What is strong.** The approval engine is the best-tested part of the code: durable, fingerprinted and executed once. Each teammate has its own browser profile and workspace. Routines, sharing and the gallery are solid. The installer is careful: it checks the download's fingerprint, needs no admin password and ships an uninstaller. `npm ci` takes about 10 seconds, and 1,096 of 1,131 tests pass on a Linux machine without Chrome; the other 35 fail or skip because there is no browser or Mac.

**What holds us back.**
- **The first run is long and unmeasured.** A Terminal install of an unsigned app (about 140 MB), then connecting an AI, then creating a teammate, then several macOS permission prompts. Web tasks need the user's own Chrome, Edge or Brave. The `?welcome=installed` link that the installer opens is ignored by the studio. The "under three minutes" goal has never been timed.
- **Reliability is proven on the wrong models.** Live evals cover two OpenCode Go models. There are no recorded runs on Gemini, ChatGPT or Claude, the AIs new users actually pick, and the free OpenCode models offered as a fallback return 403 for our tool setup.
- **A privacy-unfriendly default.** The first recommended model, `opencode-go/muse-spark-1.3-contributor`, allows prompts to be used for training. That is the wrong default for an app that reads your mail.
- **Autopilot never stops for money.** Its hard stops are AI spending, saving skills and three kinds of upload. Purchases, payments, deletions and messages to new people go through without asking.
- **Some public claims run ahead of the product.** Phone pairing "with one scan" has no default way to reach the Mac; "about a minute" understates the install; voice has no tests.
- **Five files hold most of the logic.** `src/CapabilityPanels.tsx` (7,543 lines), `src/server/index.ts` (5,088 lines, 236 routes), `src/server/database.ts` (4,696), `src/studio/Studio.tsx` (3,310) and `src/server/runtime.ts` (3,074). Every change and every outside contribution costs more because of them.
- **Known vulnerabilities.** `npm audit` reports 1 critical and 3 high in production dependencies, all with non-breaking fixes.

**What changed around us.** Between August and October 2026, xAI (Grok Bot), Meta (Muse, with a free Mac app that works in Mail, Messages, Calendar and Notes in the US and Canada), OpenAI (dots), Apple (Siri AI in macOS 27) and Anthropic (Claude Cowork) all shipped personal agents. Asking before acting and reading your mail and calendar are becoming standard. None of them offers **a free, open-source team that works in your Mac's own apps with the AI you choose, runs routines on your Mac, works in Europe and is safe by default.** That is the position this plan builds.

## Rules every task follows

1. **Activation before features.** No new connectors, chat channels or platforms until the hero jobs pass their reliability bar (task J2). The signature features build on existing code and add none.
2. **Words follow the product.** If a public sentence isn't true yet, change the sentence first. No "always asks" claim without a test.
3. **Useful by default, careful where it matters.**
   - Teammates do whatever stays on the Mac or can be undone, without asking.
   - At every level, these always ask: money, the first message to a new person, anything gone for good, and credentials.
   - See [Autonomy](#autonomy-does-the-work-asks-only-when-it-matters).
4. **Private by default.** Nothing leaves the Mac for analytics unless the owner opted in. Don't recommend models that train on prompts for teammates that read personal data.
5. **$0.** No paid service in the critical path. The first money goes to Apple's $99 developer membership: a signed app and a Homebrew install.
6. **Small changes to big files.** New code goes in new modules. One refactor slice a week (M1 to M6), never mixed with a feature.

## Release plan

| Release | Target | Theme | Headline feature | Tasks |
| :--- | :--- | :--- | :--- | :--- |
| 0.42.1 | Mon 12 Oct | Credibility fixes | — | S1–S8 |
| 0.43 | Mon 26 Oct | First useful answer in three minutes | Text your Mac | A1–A8, F6 |
| 0.44 | Mon 9 Nov | Three jobs that work every time | **Open Loops** | J1–J6, F1 |
| 0.45 | Mon 23 Nov | Does the work, asks only when it matters | **Rewind** | T1, T2, F2, AU1 |
| 0.46 | Mon 7 Dec | It sends for you, with an undo window | **Trust ladder** | T3, AU2, AU3, F4 |
| 0.47 | Mon 21 Dec | Your Mac reacts | **Triggers** | F5, R1, R3, R5 |
| 0.48 | Mon 11 Jan | Private and checkable | **Run receipts** | F3, T4, T5, T6 |
| 0.49 | Mon 25 Jan | Ask and move | **Ask my Mac**, **Move in, move out** | F7, F8, R2, R4 |
| Later | When each gate is met | Windows preview, signed app, packs | | See [Later](#later-only-when-the-gate-is-met) |

Patch releases in between are fine. Dates are targets: a release ships when its "done when" checks pass, not on a date. If time runs short, the foundation tasks ship and the headline feature moves to the next patch, never the other way round.

**Gates.**
- **Before any public launch push:** A2's clean-Mac timing (a median of three minutes or less over five owner runs), and J2's first scoreboard published.
- **Before autonomous sending (AU2):** T2 and T3 pass, and every injection fixture in AU2 ends as an approval, never a send.

## Task board

| ID | Task | Size | Release | Status |
| :--- | :--- | :---: | :---: | :---: |
| S1 | Make the contributor path work | S | 0.42.1 | ✅ |
| S2 | Patch vulnerable dependencies | S | 0.42.1 | ✅ |
| S3 | Make every public sentence true | S | 0.42.1 | ✅ |
| S4 | Safer default models | S | 0.42.1 | ✅ |
| S5 | Personal infrastructure out of public docs; fix stale docs | S–M | 0.42.1 | ✅ |
| S6 | CLAUDE.md for every session | S | 0.42.1 | ✅ |
| S7 | Website gaps (Meta Muse page, gallery tags, self-hosted font) | S | 0.42.1 | ☐ |
| S8 | Rename leftovers developers see first | S | 0.42.1 | ☐ |
| A1 | Measure the first run (local first, opt-in later) | M | 0.43 | ☐ |
| A2 | Guided first run | M | 0.43 | ☐ |
| A3 | Sign in with ChatGPT, with Sidemates' own client | M | 0.43 | ☐ |
| A4 | Apple Intelligence as the no-key starter | M–L | 0.43 | ☐ |
| A5 | A free Gemini key in a few clicks; a browser for everyone | S–M | 0.43 | ☐ |
| A6 | Phone access that works, safely | M | 0.43 | ☐ |
| A7 | Lighter prompts and tool lists | M | 0.43 | ☐ |
| A8 | A download button for people who don't use Terminal | S–M | 0.43 | ☐ |
| F6 | Text your Mac | S–M | 0.43 | ☐ |
| J1 | Pick the hero jobs and build their fixtures | S | 0.44 | ☐ |
| J2 | Reliability harness and a public scoreboard | M | 0.44 | ☐ |
| J3 | Real-Mac acceptance kit | M | 0.44 | ☐ |
| J4 | Fast Calendar and Reminders through EventKit | M | 0.44 | ☐ |
| J5 | Gmail and Google Calendar without a Google Cloud project | S | 0.44 | ☐ |
| J6 | Honest failure in every hero job | S–M | 0.44 | ☐ |
| F1 | Open Loops: everything waiting on you | M–L | 0.44 | ☐ |
| T1 | Hard stops at every level: money, new people, gone for good, credentials | M | 0.45 | ☐ |
| T2 | Untrusted content can't trigger outward actions on its own | M–L | 0.45 | ☐ |
| F2 | Rewind: an undo button | M–L | 0.45 | ☐ |
| AU1 | Autonomy levels and the Smart default | M | 0.45 | ☐ |
| T3 | Publish the attack tests | M | 0.46 | ☐ |
| AU2 | Real sending with an undo window and sandboxed replies | L | 0.46 | ☐ |
| AU3 | Batch approvals and the daily digest | M | 0.46 | ☐ |
| F4 | Trust ladder: autonomy teammates earn | M | 0.46 | ☐ |
| F5 | Triggers: your Mac reacts | M | 0.47 | ☐ |
| R1 | Mac tools as an MCP server and Agent Skills | M | 0.47 | ☐ |
| R3 | Gallery submissions without Git | S | 0.47 | ☐ |
| R5 | Shared results that bring people back | S | 0.47 | ☐ |
| F3 | Run receipts and Private mode | M | 0.48 | ☐ |
| T4 | Skills you can trust | S–M | 0.48 | ☐ |
| T5 | Memory you can see, edit and trace | M | 0.48 | ☐ |
| T6 | The vault key in the Keychain | S–M | 0.48 | ☐ |
| F7 | Ask my Mac | M | 0.49 | ☐ |
| F8 | Move in, move out | S–M | 0.49 | ☐ |
| R2 | Siri and Spotlight (experiment) | M–L | 0.49 | ☐ |
| R4 | A developer try-path (`npx`, container image) | S–M | 0.49 | ☐ |
| M1–M6 | Maintainability, one slice a week | S each | ongoing | ☐ |

The board is in build order: "the next task" is the first open row. Sizes: S is about half a day, M about two days, L more.

---

## Sprint 0: credibility fixes (0.42.1)

Everything here is small and removes something an early visitor or contributor would trip over.

### S1 · Make the contributor path work · S

**Why.** An outside developer's first five minutes fail today.

**Do.**
- `README.md`, "Run from source": the clone creates `sidemates/` but the next line says `cd openbot`. Also, `npm start` serves `dist/` without building it, so the README should say `npm run build && npm start`.
- `CONTRIBUTING.md`: `npm run test:legacy-approvals` doesn't exist (`test:app-approvals` does). Remove the Swift and native-build instructions; SwiftUI clients are retired. Where it mentions the `.openbot` folder, explain the data directory instead.
- `.github/ISSUE_TEMPLATE/bug_report.yml`: same data-directory fix.
- `src/server/testing/skill-authoring-fixture.ts` (the `env` passed to `spawn`, around line 51): forward `OPENBOT_CHROME_PATH`, and `PLAYWRIGHT_BROWSERS_PATH` when it is set, to the child server. Today 17 browser tests still fail with a custom Chrome path because the child never sees it.
- `docs/MCP_TESTING.md`: replace absolute paths under a personal home folder with repository-relative ones.
- `docs/DESIGN_LANGUAGE.md` line 23: remove the link to the deleted iOS palette file.

**Done when.** On a clean clone the README steps work exactly as written, and `OPENBOT_CHROME_PATH=<chromium> npm test` passes on Linux apart from tests that need macOS.

**Prompt.** `Do task S1 in docs/DEVELOPER_PLAN.md.`

### S2 · Patch vulnerable dependencies · S

**Why.** `npm audit --omit=dev` on 7 October 2026 reports:
- critical: `proxy-addr` (IP spoofing through an IPv4-mapped IPv6 trust subnet);
- high: `@modelcontextprotocol/sdk` up to 1.30.1 and `@modelcontextprotocol/client` 2.0.0, where the OAuth client can send credentials to an authorization server the MCP server chooses. This matters because `src/server/mcp-oauth.ts` connects to MCP servers the owner adds;
- high: `sharp` below 0.35.5;
- moderate: `fast-uri`, `ip-address`.

All have fixes without a major version change.

**Do.** Update them, then add `desktop/` (the Electron shell) to `.github/dependabot.yml`, which today covers only the root.

**Done when.** `npm audit --omit=dev` shows no high or critical findings and `npm run verify` passes.

**Prompt.** `Do task S2 in docs/DEVELOPER_PLAN.md.`

### S3 · Make every public sentence true · S

**Why.** The first people who try something we promised and find it missing won't come back, and they will say so.

**Do.**
- `site/index.html`, the iPhone answer (in the FAQ and in the JSON-LD): say what works today (the Home Screen app on the same Wi-Fi, or anywhere with a relay you set up) until A6 ships.
- "One line. About a minute.": say it takes a few minutes and downloads about 140 MB.
- Say that web tasks need Chrome, Edge or Brave (until A5 ships) and that the private computer needs Docker.
- `README.md`: the same fixes. The Autopilot sentence must list the stops it really has, until T1 ships.
- Say that routines run while the Mac is awake. The wake feature is one daily wake time and needs an admin password (`src/server/mac-wake.ts`).
- Label what is still thin as "beta" in the studio and on the site: voice, phone access, and the Windows and Linux builds.
- README "How it compares" and `docs/COMPETITIVE_SCORECARD_2026-09-23.md`: add a dated update and fix rows that are no longer true. As of early October 2026:
  - Meta's Muse for Mac (17 September) works in Mail, Messages, Calendar, Notes and files, in the US and Canada.
  - Grok Bot now starts at $20–30 a month.
  - dots can work on your own computer through the ChatGPT desktop app when you turn that on, and personal plans exclude the EEA, the UK and Switzerland.
  - Siri AI is available on Macs in the EU but not on EU iPhones.
  - So "Uses your Mac's apps and files: No" is no longer true for every cloud agent.
- Re-check each competitor fact on the day you change it and cite the page you read.
- Keep `scripts/check-release.mjs` in step if it checks any of these strings.

**Done when.** Every claim on the home page, in the README and on the alternatives pages is backed by code, a test or a dated source, and `npm run check:release` passes.

**Prompt.** `Do task S3 in docs/DEVELOPER_PLAN.md. Re-verify each competitor fact with a web search before writing it, and list your sources in the pull request.`

### S4 · Safer default models · S

**Why.** Defaults are what most people keep.

**Do.**
- `src/shared/provider-config.ts` line 195: `RECOMMENDED_MODELS` starts with `opencode-go/muse-spark-1.3-contributor`, whose terms allow training on prompts (check the provider's current page).
  - Put models with no-training terms first for teammates that can read Mail, Messages, Notes or files.
  - Label training-allowed models in the model picker: "This provider may use your prompts to train its models."
- `src/server/providers.ts` lines 9–15: the `FREE_MODELS` fallback offers `opencode/*-free` models, which return 403 for our restricted tool setup (`qa/prompt-eval/README.md`). Stop offering them automatically. Show a plain message that points to the options in A3–A5.
- The Claude provider card's "Official login" badge (`src/server/providers.ts`, around line 174) can read as an endorsement by Anthropic, which [its terms](https://code.claude.com/docs/en/legal-and-compliance) don't allow. Say instead what happens: "Uses the Claude Code you installed and signed in to."

**Done when.** Tests cover the order, the label and a fallback that never leads to a 403.

**Prompt.** `Do task S4 in docs/DEVELOPER_PLAN.md.`

### S5 · Personal infrastructure out of public docs; fix stale docs · S–M

**Why.** Public docs describe one person's private setup, and some describe things that no longer exist. Both cost trust with outside developers.

**Do.**
- `docs/AWAY_ACCESS_PERSONAL_MAC.md` describes a personal deployment: real domain names, name servers, background-job labels and home-network changes. Rewrite it as a generic guide with placeholders.
- `docs/PRODUCT_GAP_AUDIT.md`: redact the development-log lines that name personal domains, tunnels, background jobs and private scripts. Mark the file as a historical record (baseline 4 September 2026) and link to this plan for current priorities.
- `docs/SECURITY.md`: the native iPhone companion (Keychain, push certificates, Share extension) is retired. Say so, or remove it, and keep the boundary list current.
- Make the Grok Bot attribution consistent across `docs/PRODUCT_GAP_AUDIT.md`, `docs/BROWSER_AND_CONNECTORS.md`, `docs/PLUGIN_INTEROPERABILITY.md` and the site.

**Owner.** These details stay in Git history. Whether to rewrite history is a separate decision; at the least, change anything that could still be sensitive.

**Done when.** No personal domain, tunnel identifier or background-job label appears in `docs/`.

**Prompt.** `Do task S5 in docs/DEVELOPER_PLAN.md.`

### S6 · CLAUDE.md for every session · S · ✅

Shipped with this plan: [CLAUDE.md](../CLAUDE.md) maps how a run works, the commands and the house rules.

### S7 · Website gaps · S

**Do.**
- A Meta Muse comparison page at `site/alternatives/meta-muse/`, built like the other comparison pages: what it is, an honest table, "choose Muse if…", an FAQ and dated sources. Add it to the alternatives hub, `site/sitemap.xml`, `site/llms.txt` and `site/llms-full.txt`.
- `site/teammates/index.html`: add the canonical link, `og:image`, `og:url` and a Twitter card.
- Self-host the Nunito font and drop `fonts.googleapis.com`, so the site matches its "no personal data" sentence.
- Optional: one line in the README and site footer, "Sidemates has no token or cryptocurrency." Impersonators targeted other agent projects after their renames.

**Done when.** The local link check and JSON-LD parse pass, and the new page is in the sitemap.

**Prompt.** `Do task S7 in docs/DEVELOPER_PLAN.md. Re-verify the Muse facts with a web search and cite them.`

### S8 · Rename leftovers developers see first · S

**Do.**
- Change user-facing text in `deploy/private-runner/`: the README title, the `setup.sh` and `update.sh` messages and the `home-transfer.mjs` errors.
- Rename CI artifacts in `.github/workflows/*.yml`.
- Fix the issue template.

Keep `OPENBOT_*` variables, paths and file names working; aliases come in M6.

**Done when.** `git grep -i openbot -- deploy .github docs README.md CONTRIBUTING.md` finds only intentional "formerly OpenBot" mentions and internal identifiers.

**Prompt.** `Do task S8 in docs/DEVELOPER_PLAN.md.`

### Owner, this week: three things that unblock engineering

1. **GitHub settings.**
   - Point the homepage at `https://sidemates.app`; it still says openbots.foundation.
   - Add the topics rivals share: `grok-bot-alternative`, `meta-muse`, `muse-alternative`. The limit is 20, so drop one-offs such as `grokbotalternative`.
   - Upload `site/social.png` as the social preview.
   - With the GitHub CLI: `gh repo edit PrisacariuRobert/sidemates --homepage https://sidemates.app --remove-topic grokbotalternative --add-topic grok-bot-alternative`.
2. **Free capacity for building and testing.**
   - Apply to [Claude for Open Source](https://claude.com/open-source-max) (six months of Claude Max).
   - Apply to [Codex for Open Source](https://developers.openai.com/codex/community/codex-for-oss) (six months of ChatGPT Pro).
   - Both invite projects below their thresholds to apply. Either one pays for the J2 runs.
3. **A demo account.** Create a second macOS user with sample mail, calendar and notes for J3 and for demos. Never test on your own data.

---

## Phase A: first useful answer in three minutes (0.43)

**Goal.** From the website to one useful, finished result in under three minutes: with no key on Macs that have Apple Intelligence, and with the owner able to see where people stop.

### A1 · Measure the first run (local first, opt-in later) · M · Owner decision

**Do.**
- Record onboarding milestones locally, with timestamps: install finished, studio opened, AI connected (which kind), first teammate, first answer, first finished job, came back the next day, came back within seven days. Show them in Settings under "Your setup".
- Add a switch, **off by default**, shown once at the end of onboarding: "Share anonymous setup counts".
  - What it sends: milestone names, seconds elapsed, app version, macOS major version and the kind of AI, plus a random ID the user can reset.
  - What it never sends: content or names. The endpoint stores no IP addresses.
  - The endpoint is a Cloudflare Worker on the free plan that publishes totals on a public page.
- Document exactly what is sent in `docs/SECURITY.md` and on the site.

**Owner decision.** The site promises no tracking. Ship the local part now. Turn on the sender only when you say yes, and update the privacy text the same day.

**Done when.** Tests cover milestone recording, the switch's default (off) and the payload (no content), and Settings shows the local timeline.

**Prompt.** `Do task A1 in docs/DEVELOPER_PLAN.md. Build the local timeline; keep the sender behind a setting that is off and say in the pull request what it would send.`

### A2 · Guided first run · M · plan first

**Do.**
- Handle `?welcome=installed`. `scripts/install.sh` opens it, but today only `welcome=phone` is handled (`src/studio/PhoneWelcome.tsx`).
- Three steps:
  1. **"How should your team think?"** Offer, in this order: Apple Intelligence on this Mac (A4, when available), Sign in with ChatGPT (A3), a free Google Gemini key (A5), Claude through Claude Code, Ollama on this Mac, other.
  2. **"Pick a starter team"** from the team templates: a chief of staff (morning brief, what's waiting on me), a researcher and a writer.
  3. **"Try one"**: two or three suggestions that J2 shows work on the chosen AI. The first needs no macOS permission.
- Ask for macOS permissions on one "Set up your Mac" screen, covering only what the chosen starter team needs (Automation, Full Disk Access, Accessibility), with one line each on why. Anything else is asked the first time a task needs it.
- Extend `npm run test:onboarding`.

**Done when (Owner).** On the demo account, a fresh install reaches a first useful answer in a median of three minutes or less over five runs. Record the timings in `qa/first-run/` with the date and macOS version.

**Prompt.** `Do task A2 in docs/DEVELOPER_PLAN.md. Start in plan mode.`

### A3 · Sign in with ChatGPT, with Sidemates' own client · M · plan first

**Why.** Since OpenAI's DevDay on 29 September 2026, ChatGPT Plus and Pro subscribers can use their plan inside other apps, and "ChatGPT plan usage is available to all open-source partners" through self-serve registration. See the [quickstart](https://developers.openai.com/siwc/quickstart) and [open-source apps](https://developers.openai.com/siwc/token-sharing-open-source) pages.

Today Sidemates borrows OpenCode's sign-in (`src/server/providers.ts`), so the consent screen and the usage cap belong to OpenCode.

**Do.**
- Register Sidemates as an open-source client: Authorization Code with PKCE, a loopback redirect and no client secret.
- Route ChatGPT-backed runs through it. Find the cleanest path into the runtimes: OpenCode's OpenAI provider with the user's access token, or a small loopback proxy that adds the token and enforces the preview rules.
- Follow the [preview limits](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations): `store: false`, `stream: true`, input as an array, no system messages and no hosted tools. Our tools are our own, so this fits.
- Turn the two errors into plain words:
  - 429 `subscription_sharing_usage_limit_exceeded`: "Your ChatGPT plan's weekly allowance for Sidemates is used up. Raise it in ChatGPT, or switch this teammate to another AI."
  - 403 `subscription_sharing_user_not_eligible`: explain which plans qualify.
- **Check first.** Find out whether plan usage works for people in the EU and what OpenAI does with the data, and write the answer on the provider screen.
- Keep the OpenCode path as a fallback.

**Done when.** A Plus subscriber connects in one click, sees "Sidemates" on OpenAI's consent screen, and a teammate completes a web research task. Tests use a mocked authorization server.

**Prompt.** `Do task A3 in docs/DEVELOPER_PLAN.md. Start in plan mode and read OpenAI's current Sign in with ChatGPT docs first.`

### A4 · Apple Intelligence as the no-key starter · M–L · plan first

**Why.** On Apple-silicon Macs with Apple Intelligence turned on (macOS 26 and later), Apple's on-device model is free and needs no account or network. It supports tool calling and structured output, with an 8,192-token context ([WWDC26 session 241](https://developer.apple.com/videos/play/wwdc2026/241/)). macOS 27 also ships a command-line tool, `/usr/bin/fm` ([WWDC26 session 334](https://developer.apple.com/videos/play/wwdc2026/334/)).

**Do.**
- Ship a small Swift helper, built on GitHub's free macOS runners and packaged like the app wrapper. It serves the on-device model on loopback in an OpenAI-compatible shape the runtimes can call. The same helper can later serve EventKit (J4), App Intents (R2) and the Keychain (T6).
- Use it for light work: routing, short drafts, summaries of small inputs, "does this email need a reply?" and formatting the morning brief.
- When a job needs more (browsing, long documents), say "This job needs a stronger AI" and offer A3 or A5 in one click.

**Limits to state plainly.**
- Apple's larger Private Cloud Compute model is only for App Store apps.
- Intel Macs aren't supported.
- Romanian isn't among the languages.
- Follow Apple's [acceptable-use rules](https://developer.apple.com/apple-intelligence/acceptable-use-requirements-for-the-foundation-models-framework/): keep a human approval for decisions with a material impact in employment, medical, legal or financial matters.

**Done when.** On an Apple-silicon Mac with Apple Intelligence on, a fresh install answers a first question with no key. CI tests the helper through a mock, and the docs list what it can't do.

**Prompt.** `Do task A4 in docs/DEVELOPER_PLAN.md. Start in plan mode; first check how desktop/mac-app/build-app.sh builds and signs the wrapper and reuse that approach.`

### A5 · A free Gemini key in a few clicks; a browser for everyone · S–M

**Do.**
- **Gemini.**
  - Open AI Studio's key page, detect the pasted key and test it live.
  - Show two plain notices from [Google's terms](https://ai.google.dev/gemini-api/terms):
    - The free tier is for adults' own professional use.
    - In the EEA, the UK and Switzerland, free-tier prompts aren't used for training; elsewhere they may be used and reviewed by people, so suggest a local model for private mail.
  - Handle quota errors (429) in plain words.
  - Never ship a shared key or a proxy.
- **Browser.** If no Chrome, Edge or Brave is found (`src/server/runtime.ts`, around line 621), offer "Download a private browser for your teammates (about 150 MB)" using Playwright's Chromium download into Sidemates' data folder.

**Done when.** Both paths have tests, and the onboarding test covers "no browser installed".

**Prompt.** `Do task A5 in docs/DEVELOPER_PLAN.md.`

### A6 · Phone access that works, safely · M · plan first

**Why.** The phone web app has no default way to reach the Mac: the server listens only on 127.0.0.1 and there is no default relay. Telegram already works owner-only and costs nothing, but its approval notices only carry a link the phone may not be able to open.

**Do.**
- **Telegram.** Add approve and decline buttons to approval notices, with the same fingerprint checks as the studio, but only for actions that don't involve money, credentials or new recipients. Those still open the authenticated studio, so a hijacked chat account can't approve a payment. Stream replies with Telegram's message drafts.
- **Away from home.** Document and test one free way for the Home Screen app to reach the Mac from anywhere. One candidate is a private network such as Tailscale's personal plan, which gives the Mac an HTTPS address only your own devices can reach (check its current terms first). That way, approvals can use [Declarative Web Push](https://webkit.org/?p=16535) on the iPhone.
- **Fallback.** When neither is set up, the app and the site say so plainly.

**Done when.**
- An approval can be granted or declined from Telegram.
- A payment approval can't be granted from Telegram.
- Tests against the fake Telegram API cover both answers, the blocked kinds and an expired request.
- The away-from-home guide has been tested on a real iPhone (Owner).

**Prompt.** `Do task A6 in docs/DEVELOPER_PLAN.md. Start in plan mode.`

### A7 · Lighter prompts and tool lists · M

**Why.** A one-step "hi" costs about 8,140 tokens (`qa/prompt-eval/README.md`): 14,280 characters of instructions, a 3,631-character wrapper and 24 tools on OpenCode, or about 111 MCP tools on Claude (`src/server/opencode.ts`, around line 538). That burns free Gemini quotas, doesn't fit Apple's 8K context and slows everything down.

**Do.**
- Give each teammate only the tools its job needs: defined by its template, editable by the owner.
- Send web pages to the model as compact text snapshots. Third-party measurements put a 10-step browser task at about 27,000 tokens with [Playwright's command-line snapshots](https://playwright.dev/agent-cli/introduction), against about 114,000 through Playwright's MCP server.
- Shorten the base prompt.
- Move long prompt text out of `src/server/workspace.ts` into versioned prompt files.
- Target: a one-step "hi" at 3,000 tokens or fewer, with every live eval case still passing.

**Done when.** The eval records the new number and every existing live case passes.

**Prompt.** `Do task A7 in docs/DEVELOPER_PLAN.md.`

### A8 · A download button for people who don't use Terminal · S–M · Owner test

**Do.**
- Offer the unsigned app as a download next to the one-line install, with a three-picture guide to macOS's "Open Anyway" step (System Settings → Privacy & Security).
- Pick one build to download: the Electron app from `.github/workflows/desktop.yml`, or a disk image of the bundle the installer uses. Prefer one code path.
- Use A1's counts to see which path finishes setup more often.

**Owner test.**
- Test on macOS 15, 26 and 27. On macOS 27, launchd refuses property lists that carry the quarantine attribute ([macOS 27 release notes](https://developer.apple.com/documentation/macos-release-notes/macos-27-release-notes)), so check the background service and routines after a browser download.
- macOS 27 runs only on Apple silicon.

**Done when (Owner).** Both paths are tested on at least two macOS versions, with results in `qa/first-run/`.

**Prompt.** `Do task A8 in docs/DEVELOPER_PLAN.md. Prepare the build and the guide; I will test on my Mac.`

---

## Phase J: three jobs that work every time (0.44)

**Goal.** Meet the project's own bar from the gap audit, ten runs per job on two kinds of model, for the jobs people come back for.

Research on 2026 agent use is consistent: people keep using agents for recurring work on their own data (inbox, calendar, briefings, "what's waiting on me"). They try autonomous buying once.

### J1 · Pick the hero jobs and build their fixtures · S

**The hero jobs.**
1. **Morning brief.** Calendar, Reminders and mail subjects become one page at 8:00.
2. **What's waiting on me.** Mail and Messages become a list of threads that need a reply, with draft replies saved as Mail drafts. Nothing is sent.
3. **Meeting prep.** The next meeting, the attendees' recent mail and your notes become one page.

Two more already have benchmarks: receipts to a spreadsheet (`npm run benchmark:expenses`) and research with sources checked by a second teammate.

**Do.**
- For each job, write synthetic data (no personal data), the checks for a correct result, and time and token budgets in `qa/hero-jobs/`.
- Build each job to avoid the failures long-task benchmarks keep finding. Agents "lose track of constraints, miss information that arrives mid-task" and "skip verification" ([OSWorld 2.0](https://osworld-v2.xlang.ai/)). So each run:
  - carries its written constraints from start to finish;
  - looks at the inbox or calendar again just before acting;
  - checks its own result before it reports done.

**Prompt.** `Do task J1 in docs/DEVELOPER_PLAN.md.`

### J2 · Reliability harness and a public scoreboard · M

**Do.**
- Extend `qa/prompt-eval` to run each hero job ten times per kind of AI. Record pass rate, median time and tokens.
  - Gemini's free Flash models.
  - The ChatGPT plan (A3).
  - Claude through Claude Code: Haiku 5.5 and Sonnet 5.5. Record the full model name, not just the `haiku` alias, which follows the installed Claude Code version.
    - Haiku 5.5 costs $0.10 per million input tokens and $0.50 per million output tokens for prompts up to 100,000 tokens, a tenth of Haiku 4.5 ([Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing), read 7 October 2026).
    - If it passes the hero jobs as often as Sonnet, make it the recommended Claude model (today `src/server/providers.ts` picks Sonnet).
  - As a stretch, a local Ollama model on a Mac with 24 GB or more.
- Publish `docs/RELIABILITY.md` with dates, models and failures, and update it every release.
- Live runs are manual and started by the owner, since they use the owner's allowance. CI runs the same jobs against a scripted fake model.

**Done when.** The first scoreboard is published. Before 0.44 ships, each job passes at least 9 of 10 runs on each kind of AI.

**Prompt.** `Do task J2 in docs/DEVELOPER_PLAN.md. Build the harness and the CI fake; give me the command for the live runs.`

### J3 · Real-Mac acceptance kit · M · Owner runs it

**Do.**
- Write a script and checklist for the demo account that checks:
  - each Mac tool against the real apps: Mail, Calendar, Notes, Reminders, Contacts, and reading Messages;
  - the permission prompts after a fresh install and after an update;
  - a routine waking the Mac.
- Include the macOS 27 changes. Apps can no longer read the privacy-permission database directly, other apps' containers are closed by default, and launchd refuses property lists that carry the quarantine attribute. Check the permission checks, the Messages index and the routine launch agent against each one.
- It writes a dated report in `qa/mac-acceptance/` with no personal data.

**Prompt.** `Do task J3 in docs/DEVELOPER_PLAN.md.`

### J4 · Fast Calendar and Reminders through EventKit · M

**Why.** Calendar reads take about 40 seconds for 17 calendars through JXA (see the 0.38 and 0.39 changelog entries).

**Do.** Read through EventKit in the Swift helper from A4, with JXA as the fallback.

**Prompt.** `Do task J4 in docs/DEVELOPER_PLAN.md.`

### J5 · Gmail and Google Calendar without a Google Cloud project · S

**Why.** The Gmail, Drive and Calendar connector needs the user's own Google Cloud OAuth client (`src/CapabilityPanels.tsx`, around line 3621). For public use it would also need Google's verification of restricted scopes. Neither is $0.

**Do.**
- Make "add your Google account to Apple Mail and Calendar" the recommended path; Sidemates already reads both.
- Move the OAuth path under Advanced.

**Prompt.** `Do task J5 in docs/DEVELOPER_PLAN.md.`

### J6 · Honest failure in every hero job · S–M

**Do.**
- When a job can't finish (quota used up, permission denied, site blocked, app not running), the teammate says what's missing and offers the one-click fix.
- Add a test for each failure path.

**Prompt.** `Do task J6 in docs/DEVELOPER_PLAN.md.`

---

## Signature features

Approved on 7 October 2026. These are eight features that cloud agents can't easily copy, because each needs your Mac, your apps or your data on your machine. Each builds on code Sidemates already has and adds no connector or platform. Each is the headline of a release and ships after the foundation it needs.

### F1 · Open Loops: everything waiting on you · M–L · 0.44 · plan first

**What people see.** A board, a morning summary and a phone nudge listing every open loop:
- emails that need a reply;
- messages left unanswered;
- invitations without a response;
- promises the owner made in sent mail ("I'll send it Friday").

Each has a draft ready in Mail, plus Done, Snooze and Remind me.

**Why.** In a 125-question test of Siri AI, the standout question was "What are people waiting on me for?" ([Pogue](https://pogueman.substack.com/p/125-tests-of-the-new-ai-siri)). Recurring inbox and calendar work is what people keep using agents for. Siri answers once and forgets; Open Loops keeps the list.

**Do.**
- Build on the existing inbox follow-up tools, `work_collect` and `work_report` (see `src/server/workspace.ts`).
- Add opt-in indexing of Sent mail, on the Mac only. Today `src/server/mac-mail-index.ts` skips Sent, Trash, Drafts and Archive.
- Classify "needs a reply" and "is a promise". These are small jobs that suit the on-device model (A4).
- Keep each loop's state (open, done, snoozed) in SQLite.
- Show the board in the studio, put the summary in the morning brief (`src/server/morning-brief.ts`), and send the nudge through Telegram (A6).
- Drafts only in 0.44. Sending follows the autonomy rules (AU2) once they ship.

**Done when.**
- On J1's synthetic mailbox, the board finds every planted open loop and promise, with at most one wrong item in twenty.
- Tests cover state changes and the opt-in.

**Prompt.** `Do task F1 in docs/DEVELOPER_PLAN.md. Start in plan mode.`

### F2 · Rewind: an undo button · M–L · 0.45 · plan first

**What people see.**
- Every action has a receipt with its before and after.
- Anything reversible has Undo: file moves, renames and edits; calendar, reminder and note changes; drafts.
- "Rewind this task" undoes a whole run.
- What can't be undone (a sent message, a payment) is labelled before it happens.

**Why.** People burned by agents ask for exactly this: "There's no sandboxing snapshot in revision history, rollbacks, or anything" ([HN](https://news.ycombinator.com/item?id=46593628)). It is also what makes the Smart default (AU1) safe: actions that can be undone don't need to ask first.

**Do.**
- Add a local snapshot store. Copy files before a teammate changes them, and keep the previous state of any calendar event, reminder or note it edits.
- Give each Mac and file tool an inverse, recorded with the action on the existing Work Receipts (`src/server/run-review.ts`). Today the app says "Completed actions are not undone."
- Add Undo on receipts and "Rewind this task".
- Snapshots expire after a set time and stay under a size limit.

**Done when.**
- For each reversible tool, a test performs the action, undoes it and checks the original state.
- Irreversible actions carry their label.

**Prompt.** `Do task F2 in docs/DEVELOPER_PLAN.md. Start in plan mode.`

### F3 · Run receipts and Private mode · M · 0.48

**What people see.**
- **For every task, a receipt.** It shows which AI saw what (the exact text, with private details masked), how many tokens or requests the task used, and what it cost or how much of a free quota or plan allowance it took.
- **Private mode, per teammate.** Personal data stays on the Mac (Apple Intelligence or Ollama), and cloud AIs get only masked text.

**Why.** It turns "private" from a promise into something people can check, and it answers the worry about metered agents burning through allowances.

**Do.**
- Log, locally, what each run sends to each provider.
- Mask names, emails, phone numbers and IBANs with placeholders, and restore them locally in the result. Build on `redactSecretsForProvider` in `src/server/observation-envelope.ts` and on the result-page redaction.
- Estimate cost and quota from the existing usage tracking and `weeklyTokenBudget`.

**Done when.**
- Masked payloads never contain the planted personal details.
- Results are restored correctly.
- The receipt's numbers match the recorded usage.

**Prompt.** `Do task F3 in docs/DEVELOPER_PLAN.md.`

### F4 · Trust ladder: autonomy teammates earn · M · 0.46

**What people see.**
- After the owner approves the same kind of action several times without changing it, Sidemates offers a narrow rule. For example: "Let Nova send scheduling replies to people you've written to, at most 5 a day."
- Each teammate shows its level and its rules.
- Hard stops never become rules.

**Why.** It matches what people say they want. 5% are comfortable with an agent buying on its own, 32% want it to propose and wait, and 15% would let it act within rules they set ([Cover Genius](https://covergenius.com/resources/blog/do-consumers-trust-ai-shopping-agents/)).

**Do.**
- Extend the `auto_review_rules` table, which today allows or requires approval for commands, prompts and browser actions. Add scopes for mail, messages, calendar and files, plus limits and counters.
- Count unchanged approvals per kind of action, and offer the rule.
- The owner can see, edit and revoke every rule.

**Done when.**
- Tests cover the counting, the offer, a rule's limits and revoking it.
- No rule can cover a hard stop.

**Prompt.** `Do task F4 in docs/DEVELOPER_PLAN.md.`

### F5 · Triggers: your Mac reacts · M · 0.47

**What people see.**
- "When a PDF lands in Receipts, add it to expenses.xlsx."
- "When my accountant emails an invoice, file it and remind me."
- "Fifteen minutes before each meeting, prepare a one-pager."

**Why.** It gives the "always working" feel of a cloud agent without a cloud computer, using events cloud agents can't see.

**Do.**
- Add two triggers: "a file lands in a folder" and "mail like this arrives". They sit next to the existing calendar, webhook, GitHub and Todoist triggers in `src/server/automations.ts`, and page watch.
- Every triggered run follows its teammate's autonomy level.
- Debounce bursts and cap runs per hour.

**Done when.**
- Tests cover both triggers, debouncing and the cap.
- The receipts benchmark (`npm run benchmark:expenses`) runs from a folder trigger.

**Prompt.** `Do task F5 in docs/DEVELOPER_PLAN.md.`

### F6 · Text your Mac · S–M · 0.43

**What people see.**
- From any phone: "What's my day?", "Tell Anna Tuesday works", or a photo of a receipt.
- The work happens on the Mac, with its apps.
- Safe approvals come back as buttons; risky ones open the studio.

**Why.** It is a phone assistant over your own Mac's data, and it works in the EU, where Siri AI isn't on iPhones and Muse isn't available.

**Do.**
- Build on A6.
- Route photos and files to the right teammate, and keep replies phone-sized.
- Later, send the Open Loops nudge (F1) and the digest (AU3) the same way.

**Done when.** Tests with the fake Telegram API cover a question, a file hand-off and an approval.

**Prompt.** `Do task F6 in docs/DEVELOPER_PLAN.md.`

### F7 · Ask my Mac · M · 0.49

**What people see.**
- A keyboard shortcut opens a small box anywhere on the Mac.
- Ask about your own stuff. Every answer cites the email, note or file it came from, one click away.

**Why.** An answer people can check beats one that only sounds right, and a hotkey becomes a daily habit.

**Do.**
- Add a global hotkey, through the A4 helper or through the Electron shell when it runs.
- Build a compact ask panel.
- Answer from the on-device index with T5's local search by meaning.
- Source links open Mail, Notes or Finder.

**Done when.**
- On the synthetic data, answers cite the right source for a fixed set of questions.
- The panel works with the keyboard alone.

**Prompt.** `Do task F7 in docs/DEVELOPER_PLAN.md.`

### F8 · Move in, move out · S–M · 0.49

**What people see.**
- Bring memory from a ChatGPT or Claude data export into a teammate, reviewed fact by fact.
- Take any teammate out as plain files (persona, memory, skills and routines) that work elsewhere through the Agent Skills format.

**Why.** "Your teammates are files you own" makes the open-source promise concrete, and gives people a reason to switch.

**Do.**
- Write readers for the ChatGPT and Claude export formats, modelled on `src/server/profile-import.ts`.
- Imported facts go through T5's review queue.
- Export builds on `src/server/sharing.ts` and the skill library.

**Done when.** A round trip works: import a synthetic export, export the teammate, and re-import it unchanged.

**Prompt.** `Do task F8 in docs/DEVELOPER_PLAN.md.`

---

## Autonomy: does the work, asks only when it matters

**Why.** People keep agents that finish real work and drop the ones that keep asking. One early dots user had to give three separate confirmations for a single shuttle booking ([eesel](https://www.eesel.ai/blog/openai-dots-review)). ChatGPT's agent lost about three quarters of its paying users, reportedly because people couldn't work out what to use it for ([The Decoder](https://the-decoder.com/chatgpt-agent-reportedly-lost-75-of-its-users-because-nobody-knew-what-it-was-actually-for/)).

The opposite failure exists too: a dot reportedly emailed a city office after being asked only for "questions to ask" ([orcarouter](https://www.orcarouter.ai/blog/openai-dots-first-week-reception), unverified). And only 5% of people are comfortable with an agent spending on its own. So autonomy is designed, not just switched on.

**The three levels the owner sets for each teammate.**

| Level | Does without asking | Still asks |
| :--- | :--- | :--- |
| Ask first | Reads, searches, drafts | Everything that changes something |
| **Smart** (new default) | Everything that stays on the Mac or can be undone: drafts, notes, reminders, calendar holds, organizing files (with Rewind) | Sending to people, plus the hard stops |
| Autopilot | Also sends on its own within the rules below, and acts on websites | Only the hard stops |

**Hard stops, at every level:**
- money: buying, paying, subscribing, transfers;
- the first message to someone the owner has never written to;
- anything gone for good: permanent deletes, emptying the Trash, public posts, account and security settings;
- passwords and card details.

**How sending on its own stays safe.**
- **Sandboxed replies.** A message a teammate sends on its own may use only the conversation itself and the calendar's free or busy times, never other mail, files or notes. If it needs more, it drafts and asks. Untrusted input and an outward action never meet private data, which keeps every autonomous send within Meta's [Rule of Two](https://ai.meta.com/blog/practical-ai-agent-security/).
- **"Known" means the owner wrote to them first,** or saved them in Contacts. People who have only written to the owner count as new until the owner replies once, so a stranger can't email their way into autonomous replies.
- **An undo window.** Every autonomous send waits 60 seconds by default (adjustable from 10 seconds to 10 minutes, or "send with the evening batch"). A notice says: "Nova will send this reply to Anna in 60 s — Stop · Edit".
- **Caps.** A daily send limit per teammate (10 by default) and a limit per recipient.
- **Review after, not before.** A daily digest of what the team did. When asking is needed, one batch question ("Send these 5 replies?") replaces five.

### AU1 · Autonomy levels and the Smart default · M · 0.45 · plan first

**Do.**
- Classify every action the server mediates as one of three kinds: stays on the Mac and can be undone; reaches other people; hard stop. Store the class with each tool, and test that every tool has one.
- Add the three levels per teammate.
  - New teammates start on Smart.
  - Existing teammates keep Ask first.
  - Today's Autopilot becomes the new Autopilot, with T1's hard stops.
- A reversible action runs without asking on Smart only once F2 can undo it. Until then, it asks.
- Update the studio, README and site the same day.

**Done when.**
- Tests show each level allows and blocks the right kinds of action.
- Hard stops ask at every level.
- The onboarding test runs a hero job on Smart with at most one question.

**Prompt.** `Do task AU1 in docs/DEVELOPER_PLAN.md. Start in plan mode.`

### AU2 · Real sending with an undo window and sandboxed replies · L · 0.46 · plan first

**Do.**
- Add send tools for Mail and Messages. Today Mail only opens drafts (`src/server/mac-apple-apps.ts`: "nothing is ever sent from here").
- Sending follows the teammate's level. Ask first and Smart ask; Autopilot sends within the rules above.
- Build the hold queue: the undo window, the notice with Stop and Edit, and a receipt once sent.
- Build the sandbox for autonomous replies, the "known person" check and the caps.
- Add injection fixtures. For example, an email that asks the teammate to forward invoices to a new address must end as an approval, never a send.

**Done when.**
- Tests cover each level, Stop inside the window, the caps, the sandbox (a reply can't read other mail) and the injection fixtures.
- **Owner:** the real-Mac kit (J3) sends to a test address on the demo account.

**Prompt.** `Do task AU2 in docs/DEVELOPER_PLAN.md. Start in plan mode; T2 and T3 must pass first.`

### AU3 · Batch approvals and the daily digest · M · 0.46

**Do.**
- When several actions are waiting, group them into one card ("Send these 5 replies?") with Approve all, Review each, or Decline.
- Send a daily digest in the studio, the morning brief and Telegram: what each teammate did, with Undo wherever it still applies.

**Done when.**
- Tests cover grouping, partial approval and what the digest contains.
- On Smart, the hero jobs ask at most once per run.

**Prompt.** `Do task AU3 in docs/DEVELOPER_PLAN.md.`

---

## Phase T: safety foundations (0.45–0.48)

**Goal.** The agent you can safely give your Mac to, with the tests published.

In 2026 the best-known agents all had public safety incidents: injected instructions leaking files, malicious community skills, agents reading messages they shouldn't have. Being checkably safer is a feature.

### T1 · Hard stops at every level: money, new people, gone for good, credentials · M

**Why.** `src/shared/autopilot.ts` always asks only for AI budget, saving skills and three upload and semantic actions. Its own warning says Autopilot can "buy or book on sites it is signed in to".

**Do.**
- Add always-ask categories, decided from structured facts rather than only the text patterns in `src/server/safety.ts`:
  - **Spending:** checkout and payment pages, card fields (`autocomplete="cc-*"`), and buttons labelled pay, buy, order, subscribe or transfer.
  - **Irreversible:** deleting files, mail or events; emptying the trash; account and security settings.
  - **New people:** the first message to anyone the owner hasn't written to before and hasn't saved in Contacts.
  - **Publishing:** public posts, `git push`, deploys.
  - **Credentials.**
- Store who counts as known (people the owner has written to, plus Contacts) for AU2 and F4. The owner's rules live in `auto_review_rules` (`src/server/database.ts`, around line 786; `src/server/index.ts`, around lines 461–480).
- Money always asks for now. Only 5% of people are comfortable with an agent buying on its own; a spending allowance can come later if users ask for one.
- These stops apply at every autonomy level (AU1).
- Update the warning, the README and the site the same day.

**Done when.** There is a test per category, including a fixture page that tries to trick a "Pay now" click while Autopilot is on.

**Prompt.** `Do task T1 in docs/DEVELOPER_PLAN.md.`

### T2 · Untrusted content can't trigger outward actions on its own · M–L · plan first

**Do.**
- Track where content came from in each run.
- Once a run has read untrusted content (web pages, incoming mail and messages, downloaded files), any action that sends data out needs approval, even on Autopilot. That covers a message, a form submission, an upload or a link carrying data.
- The approval card says which content came before it.

**Design references.** Meta's [Agents Rule of Two](https://ai.meta.com/blog/practical-ai-agent-security/), [CaMeL](https://css.csail.mit.edu/6.5660/2026/readings/camel.pdf) and the [prompt-injection design patterns](https://simonwillison.net/2025/Jun/13/prompt-injection-design-patterns/).

AU2's sandboxed replies apply this same rule, so AU2 can't ship before T2.

**Prompt.** `Do task T2 in docs/DEVELOPER_PLAN.md. Start in plan mode.`

### T3 · Publish the attack tests · M

**Do.**
- Build a prompt-injection fixture suite: malicious pages, emails, PDFs and calendar invites.
- It runs in CI against a scripted model, with live runs on demand.
- Publish what we test, and what still gets through, in `docs/SECURITY.md`.

**Prompt.** `Do task T3 in docs/DEVELOPER_PLAN.md.`

### T4 · Skills you can trust · S–M

**Why.** In 2026 hundreds of the community skills in one popular agent's marketplace were found to be malicious ([Aviatrix report](https://aviatrix.ai/threat-research-center/openclaw-clawhub-malicious-skills-supply-chain-attack-2026/)).

**Do.**
- Pin installed skills by content hash.
- Show a diff before an update.
- Keep scripts inside skills disabled until approved.
- Flag skill text that sends data out (links carrying data, `curl | sh`).

**Prompt.** `Do task T4 in docs/DEVELOPER_PLAN.md.`

### T5 · Memory you can see, edit and trace · M

**Why.** Memories already carry an owner-or-task source, revisions and an edit path (`src/shared/private-memory.ts`). Meaning-based search, though, needs an embeddings service the owner configures.

**Do.**
- Run local embeddings by default, so meaning-based search needs no cloud: a small model such as EmbeddingGemma-300M, with the existing keyword search.
- Give memories finer sources ("from you", "from an email", "from a web page").
- Put facts learned from untrusted content in a review queue before they become memories. Memory poisoning is a documented attack.
- Add a plain "What <teammate> remembers" page.
- Show a plain-language activity history with undo where macOS allows it: unsent drafts, the Trash, calendar history.

**Prompt.** `Do task T5 in docs/DEVELOPER_PLAN.md.`

### T6 · The vault key in the Keychain · S–M

**Why.** The key that encrypts saved secrets is a file next to the database (`src/server/vault.ts`).

**Do.** Move it to the macOS Keychain, through the A4 helper or the `security` command, with migration and a fallback.

**Prompt.** `Do task T6 in docs/DEVELOPER_PLAN.md.`

---

## Phase R: plays well with others (0.47–0.49)

**Goal.** Reach people inside the tools they already use, without building a platform.

### R1 · Mac tools as an MCP server and Agent Skills · M · plan first

**Do.**
- Package the reviewed Mac tools, with their approvals, as a standalone MCP server started with `npx`: Mail drafts, Calendar, Reminders, Notes, Contacts, Files and Shortcuts. It should work from Claude, Codex, OpenClaw and Hermes.
- Publish matching skills in the [Agent Skills](https://agentskills.io) format, which dozens of agents read, including Claude Code, Codex, OpenClaw and Hermes.
- Follow the [28 July 2026 MCP spec](https://blog.modelcontextprotocol.io/posts/2026-07-28/). Its input-required requests map onto approvals.
- List the server in the MCP registry.

`mcp/openbot.ts` is a testing interface; this is a new public package.

**Prompt.** `Do task R1 in docs/DEVELOPER_PLAN.md. Start in plan mode.`

### R2 · Siri and Spotlight (experiment) · M–L

**Do.**
- Expose teammates and routines as App Intents ("Ask Sidemates…", "Run my morning brief") for Siri in macOS 27.
- Index finished results in Spotlight.
- First check whether App Intents work in an app that isn't on the App Store and isn't notarized, and report back before building more.

**Prompt.** `Do task R2 in docs/DEVELOPER_PLAN.md. Report the App Intents feasibility check before building anything else.`

### R3 · Gallery submissions without Git · S

**Do.**
- A "Submit to the gallery" button opens a prefilled GitHub issue form from a shared teammate.
- A GitHub Action runs `gallery.test.ts` and opens the pull request.

**Prompt.** `Do task R3 in docs/DEVELOPER_PLAN.md.`

### R4 · A developer try-path · S–M

**Do.**
- `npx sidemates` (Node 22 or later) runs the studio without the app wrapper.
- Publish the private-runner image on GitHub's container registry, which is free for public images.

**Prompt.** `Do task R4 in docs/DEVELOPER_PLAN.md.`

### R5 · Shared results that bring people back · S

**Do.** Shared result pages (`src/server/share-result.tsx`) get a "Make this teammate" button (a one-click import of the teammate behind the result) and their own Open Graph image.

**Prompt.** `Do task R5 in docs/DEVELOPER_PLAN.md.`

---

## Maintainability: one slice a week

Never mixed with a feature, and no change in behavior.

| ID | Slice |
| :--- | :--- |
| M1 | Split `src/server/index.ts` into route modules by area, one area per pull request |
| M2 | Split `src/CapabilityPanels.tsx` into one file per panel, with tests for the panels you touch |
| M3 | Versioned SQLite migrations for new schema changes; today there are 53 `CREATE TABLE IF NOT EXISTS` and 105 add-if-missing column calls |
| M4 | A linter (Biome or ESLint, minimal rules), and logged errors instead of silent catches (165 today) in the files you touch |
| M5 | Lazy-load studio panels; the main bundle is 1.09 MB |
| M6 | `SIDEMATES_*` environment names read alongside `OPENBOT_*`, with nothing existing breaking |

**Prompt.** `Do the next maintainability slice (M1–M6) in docs/DEVELOPER_PLAN.md. No behavior changes.`

## Later: only when the gate is met

| Item | Gate | Notes |
| :--- | :--- | :--- |
| Windows preview | 50 people a week finish a hero job on the Mac (A1 counts) | CI builds it, and the Windows probe passed 1,021 of 1,128 tests. Free signing for open source through [SignPath Foundation](https://signpath.org/terms) |
| Signed and notarized Mac app; Homebrew | The first $99 | Apple's [fee waivers](https://developer.apple.com/help/account/membership/fee-waivers/) exclude individuals. Homebrew's official casks require apps that pass Gatekeeper ([Homebrew 5.0](https://brew.sh/2025/11/12/homebrew-5.0.0/)) |
| Teammate packs and prepaid credits | After activation targets | Credits mean reselling AI, so read each provider's terms. OpenAI's plan sharing for paid or hosted apps needs its interest form, and Google requires paid services for API clients offered in the EEA, the UK and Switzerland |
| Native iPhone app | Not planned | Telegram (A6) and the Home Screen app |
| Always-on cloud | Not planned | The private runner exists for people with their own server |

## Not doing now

- New connectors or chat channels, until J2 passes.
- Autonomous shopping or booking as a headline feature.
- Competing on thousands of integrations or always-on cloud computers. The funded products win there.
- Any analytics that isn't opt-in and approved by the owner.

## How we'll know it's working

| Measure | 7 October 2026 | Target |
| :--- | :--- | :--- |
| Questions asked per finished hero job on Smart | Never measured | 1 or fewer (AU3) |
| Autonomous sends stopped in the undo window | Not possible yet | Tracked from 0.46; look into any teammate above 1 in 20 |
| Install to first useful answer | Never measured | A median of three minutes or less |
| First-run success across AI choices | Never measured | 8 of 10 or better |
| Hero jobs passed per kind of AI | Never run | 9 of 10 or better |
| Tokens for a one-step "hi" | About 8,140 | 3,000 or fewer |
| High and critical vulnerabilities | 4 | 0 |
| README quickstart works as written | No | Yes |

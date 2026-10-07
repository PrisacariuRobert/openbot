# Sidemates working roadmap

## Next releases (from 7 October 2026)

**Promise: an AI team that does the work on your real Mac, not just answers. And the app is free.**

Where we stand: the product is ahead of its reach, and its first run is the weakest part. The next releases remove the reasons a person would fail before a first useful answer, make three everyday jobs dependable, and make Sidemates the safest agent to give your Mac to.

Every change has a task, a "done when" check and a prompt for Claude Code in the [developer plan](DEVELOPER_PLAN.md).

| Release | Theme | Highlights |
| :--- | :--- | :--- |
| ✅ 0.38 | Your Mac, your apps | Mail, Calendar, Reminders, Notes, Contacts, Files and Messages as reviewed tools; Shortcuts; "Send to Sidemates"; "Hey Siri, ask Nova to…" |
| ✅ 0.39 | Knows you, privately | On-device index of Notes, Mail, Messages and files; morning brief; "What they know" page |
| ✅ 0.40 | Share your teammates | Share links, a teammate gallery, shareable result pages |
| ✅ 0.41 | Autopilot | Per-teammate "act like a person", with stops for sign-ins, CAPTCHAs, AI spending and new instructions, chat notes and a log |
| ✅ 0.42 | OpenBot is now Sidemates | New name and home; the "Made with Sidemates" link is tagged; a demo recorder. First-run timing and opt-in counts move to 0.43 |
| **0.42.1** | **Credibility fixes** | Contributor path works; vulnerable dependencies patched; every public claim true; safer default models; no personal infrastructure in docs; a Meta Muse comparison |
| **0.43** | **First useful answer in three minutes** | Guided first run; Apple Intelligence as a no-key starter; Sign in with ChatGPT with our own client; a guided free Gemini key; a browser download when Chrome is missing; phone access that works (Telegram, plus a tested free way to reach your Mac from anywhere); **Text your Mac**; lighter prompts; the first run timed |
| **0.44** | **Three jobs that work every time** | **Open Loops**: every reply you owe and every promise you made, with drafts ready; morning brief, "what's waiting on me" and meeting prep pass 9 of 10 runs on each kind of AI; a public reliability scoreboard; fast Calendar through EventKit |
| **0.45** | **Does the work, asks only when it matters** | Autonomy levels with a new Smart default; **Rewind**, an undo button for every reversible action; hard stops at every level for money, new people, anything gone for good and credentials; untrusted content can't trigger outward actions on its own |
| **0.46** | **It sends for you, with an undo window** | Mail and Messages sending with an undo window, sandboxed replies and daily caps; batch approvals and a daily digest; **Trust ladder**, autonomy teammates earn; published attack tests |
| **0.47** | **Your Mac reacts** | **Triggers** for folders and incoming mail; Mac tools as an MCP server and Agent Skills; gallery submissions without Git; "Make this teammate" on shared results |
| **0.48** | **Private and checkable** | **Run receipts** and Private mode: what left your Mac, where it went, what it cost; pinned skills; editable memory with local search; the vault key in the Keychain |
| **0.49** | **Ask and move** | **Ask my Mac**, a hotkey whose answers cite their sources; **Move in, move out**: bring your ChatGPT or Claude memory, take your teammates anywhere; a Siri and Spotlight experiment; `npx sidemates` |
| Later | When each gate is met | Windows preview (CI builds it; the Windows probe passed 1,021 of 1,128 tests on 3 October 2026), a signed app and Homebrew (the first $99), teammate packs and prepaid credits |

Quality bar for every release:
- `npm run verify` passes;
- the hero-job scoreboard doesn't drop;
- the installer update is tested from the previous version in an isolated folder;
- no new "always asks" claim ships without a test.

The working order below is the earlier plan and stays for reference.

Owner-approved sequencing after the Hermes (NousResearch) and sign-in pattern studies. Every item keeps the house rules: approvals stay human-owned, sign-in secrets stay out of model context, and evidence distinguishes host checks from teammate claims. Sizes are historical estimates: S ≤ half a day, M ≤ two days, L bigger.

**8 September evidence correction:** the current Hermes comparison supersedes earlier competitive assumptions. Hermes has local browsers, Bot Mode and optional approval-gated skill writes. A code/fixture checkmark below is not release or real-account proof. Installer, sign-in and migration claims need their own live evidence.

## Working order

| # | Item | Size | Track | Why now |
|---|------|------|-------|---------|
| 1 | ✅ Group-chat discipline (caps, silence-settle, needs-you badge) | M | B | One targeted teamwork improvement, not complete Bot Mode parity |
| 2 | ◐ Own-browser cookie bridge (sign in on your normal Chrome → session imported) | M | A | Implementation and crypto fixtures exist; real Google sign-in/resume still needs a pilot |
| 3 | ◐ Hermes/OpenClaw profile importer | M | C | Text/profile fixture coverage exists; a real imported profile must still complete work |
| 4 | ✅ "Active now" presence strip | S | B | Roster-wide status at a glance; Hermes parity, ours never reorders |
| 5 | ✅ Skills proposed from completed runs | M | C | Owner-requested, source-bound drafts; real reusable-task validation is a separate gate |
| 6 | ✅ Per-site data controls ("sign out & clear this site") | S | A | OpenAI-pattern data hygiene; small |
| 7 | ✅ Per-skill/per-tool enablement per bot | M | B | Finer control surfaced in the profile editor |
| 8 | ✅ Sign-in request review + suspended-capture language | S | A | Phishing check before handoff; state the privacy guarantee in-product |
| 9 | ✅ Cross-model reviewer option | S | D | Independent review enforced across providers (`code-projects.ts`) |
| 10 | ✅ Team templates (starter rosters) | M | D | New-user time-to-value |
| 11 | ✅ Fix the stale fixture failures | M | D | Current `npm run verify` passes; native source checks are not device/installer tests |
| 12 | ✅ Portable agentskills.io text subset | M | C | Round-trip fixtures cover the supported shape, not every script or runtime-specific field |
| 13 | ◐ Windows/Linux Electron installer CI | M | D | Workflow source exists; successful per-platform build, installation and update remain unproven |

## Tracks in detail

### Track A — Sign-in & browser trust
Sidemates' private per-bot browser is an important foundation, not demonstrated superiority over Hermes. Hermes documents local browser sessions and opt-in real-profile snapshots. Prove our narrower site-scoped import, owner handoff and recovery with real accounts.

- **A1 · Own-browser cookie bridge.** An owner-controlled normal-browser sign-in and site-scoped cookie import into a teammate profile. This is not guaranteed to satisfy every provider: profile encryption, storage mechanisms, account policy and browser detection vary. The macOS path may need Keychain consent and Chrome closed for import. Done when: a real Google account signs in, the teammate's next run is authenticated, a restart preserves the intended session, and fixtures reject unsupported/cross-origin input without exposing cookie values. The live-account portion is not yet certified.
- **A2 · Per-site data controls.** Per teammate: list sites with stored session data and a per-site "sign out & clear data" action (cookie + storage eviction for that origin only), plus clear-all. Mirrors OpenAI's cloud-browser data controls. Done when: clearing one site's data leaves other sites' sessions intact, and the UI shows what is stored without showing values.
- **A3 · Sign-in request review + honest capture language.** Before showing a sign-in handoff: origin checks (embedded credentials, look-alike domains against known providers) and a one-line "why we paused" with the exact origin. The pane states that the model is paused and screenshots are not taken while you type (already true: the run is `awaiting_approval`; make it visible and add a server-side guard so no model-visible browser view is served while a sign-in approval is pending). Done when: fixture proves the guard and the pane copy ships.

### Track B — Team room discipline (Hermes parity, then better)
- **B1 · Group-chat discipline.** Hard caps in group threads: at most 3 serial rounds per owner message, 10 messages per round, and a round that ends with every member passing settles the room. @name pulls a specific teammate in; @user escalates a real judgment call to the owner. Done when: fixture proves caps, settle-on-silence, and that @user marks the thread "needs you".
- **B2 · Needs-you badge.** A group header badge (and roster dot) when a group thread is waiting on the owner. Done when: badge appears on escalation and clears on the owner's reply.
- **B3 · Active now strip.** A slim strip above the roster listing every teammate currently working (or that posted within 90 seconds), each chip opening its canonical chat. Never reorders the roster; disappears when the fleet is idle. Done when: fixture proves appearance/clearing and that roster order is untouched.
- **B4 · Per-skill/per-tool enablement.** The bot profile editor gains per-skill on/off and per-tool enablement (browser, computer, each connector), so a teammate's reach is configured, not assumed. Done when: a disabled skill/tool cannot be invoked by that bot (fixture) and the editor ships.

### Track C — Skills & provable learning (the stand-out)
- **C1 · Skill proposals from completed runs.** The owner requests a draft from the Work Receipt; completion is not assumed to mean verification. The draft now preserves an exact source-run association, receipt snapshot and explicit failures/limits. Existing workflow validation requires two distinct owner-reviewed tool runs before a referenced saved skill can be scheduled; saving a draft does not count. Hermes also offers approval-gated skill writes, so approvals alone are not unique. Next proof: a pilot user refines a reusable recipe, checks new inputs and schedules it without copying the original task's private or one-off details.
- **C2 · Hermes/OpenClaw profile importer.** The New teammate UI and owner API preview/apply paths map persona, curated memory and supported text skills. Credentials, sessions, cron jobs and arbitrary scripts/plugins do not migrate. A proposed import CLI is not a shipped command. Done when: a real Hermes profile imports into a teammate whose next supervised run succeeds, and the migration guide lists every unsupported dependency. Current tests create synthetic profiles; they do not prove a real profile or model run.
- **C3 · agentskills.io compatibility.** Export Sidemates skills in the agentskills.io manifest shape and import theirs where the semantics match, with honest unsupported-field reporting. Done when: round-trip fixtures pass and docs state exactly what translates.

### Track D — Quality, review and release debt
- **D1 · Fixture tests.** The current full verification command passes. Keep the checks meaningful: fixture coverage is not a substitute for rendered UI, real-account or clean-install tests.
- **D2 · Cross-model reviewer.** Preserve the different-provider/model option for independent code review. Validate actual author/reviewer provider runs as well as policy fixtures; a second model's approval is not proof of correctness by itself.
- **D3 · Team templates.** Starter rosters (e.g. "Studio team": writer, designer, reviewer with roles, instructions and suggested routines) offered at first-run and in Settings. Done when: one template path is fixture-tested end to end.
- **D4 · Cross-platform installers.** Windows/Linux workflow source needs successful runtime staging, per-platform builds and clean installation/update checks. Do not mark this done merely because YAML exists or a tag can be pushed. Signing/notarization remain separate release gates.
- **D5 · Web Activity drawer styling.** The web drawer's sections (live hero, attention cards, action history) still have no CSS rules — design-agent task to restore the styled reference implementation.

## Explicitly not doing
- **No unconditional self-mutating skills/memory** in this proposed learning flow. Owner-requested drafts only (C1). Hermes offers an optional write-approval mode too.
- **No remote/serverless browser environments** — "your computer" is the identity; relay + owner-hosted covers remote access.
- **No forced model/tool subscription** — keep supported BYO provider paths. Hermes also supports BYO providers; Nous Portal is an optional route, not a mandatory subscription.
- **No new connectors** until one complete workflow on existing connectors meets the audit doc's M2 evidence bar.
- **Apple Developer ID signing/notarization** stays blocked on the owner's $99/yr credential; CI is prepared.

## Standing verification bar (per item)
`npm run verify` clean, plus the item's own fixture/live evidence. Native source-contract checks do not replace Xcode builds or device tests. UI work gets disposable fixture screenshots in `/tmp/openbot-*-qa/`. Keep `docs/PRODUCT_GAP_AUDIT.md` updated with a same-day follow-up per validated item.

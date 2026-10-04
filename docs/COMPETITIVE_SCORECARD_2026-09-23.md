# Sidemates competitive scorecard — 23 September 2026

Where Sidemates stands against the four products people compare it with, after the competitive-plan work on branch `fix/runtime-pin-and-quiet-chat` ([#92](https://github.com/PrisacariuRobert/sidemates/pull/92)). Competitor facts come from their public pages and press as of this date; Sidemates facts come from this checkout and its live eval (`qa/prompt-eval/`). Nothing here is a head-to-head benchmark on equal models.

## Update — 1 October 2026: the closest competitor we had missed

| | What it is | Reach | Money | Where Sidemates differs |
| :--- | :--- | :--- | :--- | :--- |
| **OpenMausBot** (milind-soni, Apache-2.0, created 11 Aug 2026) | An open-source "Grok Bot alternative": a chat app with a roster of AI bots, each with its own personality, model and tools, running on the Claude, Codex and Grok command-line tools already installed on your machine; optional always-on cloud workspace | 3,894 stars, 663 forks, hundreds of open issues, up to about 30,000 downloads on a single release, about 1,900 Discord members, 92 releases in under eight weeks; macOS, Windows, Ubuntu, Android, iOS, npm and Docker | Free app; Pro $49 a month at launch ($89 later); GitHub Sponsors; enterprise offer; templates marketplace | Aimed at developers; Sidemates is for ordinary Mac users: one-line install, no command-line tools, local Mail, Calendar, Notes and Messages. It is far ahead on reach, platforms and community, and we are not ahead on product speed |

Why it is better known: it named the enemy and launched the same day as Grok Bot's beta, it is trivial for developers to try (npm, Docker), it runs everywhere, and it built a community from day one. Sources: [GitHub](https://github.com/milind-soni/OpenMausBot), [website](https://www.openmausbot.com/), [pricing](https://www.openmausbot.com/pricing), [directory listing](https://www.opensourcealternatives.to/item/openmausbot). Everything above comes from public pages; we have not used the product.

## Update — 30 September 2026: three new entrants

| | What it is | Price / reach | Where Sidemates differs |
| :--- | :--- | :--- | :--- |
| **OpenAI dots** (DevDay, 29 Sep) | Always-on agent on its own cloud computer with a virtual browser (GPT-6 Astra); 4,000+ apps via plugins; read-only until approved | ChatGPT Pro and Business Premium; Pro gets one dot; not available in the EEA, UK or Switzerland | Runs on your Mac with your apps and files; a team, not one agent; any AI; available in Europe |
| **Apple Siri AI** (macOS 27, 14 Sep) | Rebuilt Siri with personal context (Mail, Messages, Notes, Photos, Calendar via Spotlight), on-screen awareness and in-app actions; on-device + Private Cloud Compute | Free beta, English first, daily usage caps, paid access planned; Apple silicon | Siri answers and does single actions; Sidemates runs long multi-step jobs across apps and websites, on schedules, with several teammates, and delivers files. Sidemates plugs into Siri ("Hey Siri, Ask Sidemates") |
| **Hermes Desktop** (Nous, public preview 2 Jun, MIT) | Native app for macOS, Windows, Linux on the Hermes core: chat, file browser, voice, plugins, self-written skills; optional Nous Portal sign-in for free/discounted models and cloud agents | Free | Hermes is no longer terminal-only, so Sidemates competes on Mac depth (Mail, Calendar, iMessage, Siri, Shortcuts), exact action reviews, teammate isolation, phone pairing and routines. Hermes has a free model tier without a key; Sidemates needs a free Gemini key |

Sources: [OpenAI dots](https://www.androidheadlines.com/2026/09/openai-launches-dots-always-on-ai-agents.html), [dots at DevDay](https://pasqualepillitteri.it/en/news/19302/openai-dots-personal-ai-agent-devday-2026), [Siri AI](https://www.apple.com/newsroom/2026/09/siri-ai-a-profoundly-more-capable-and-personal-assistant-is-here/), [Siri AI limits](https://appleinsider.com/articles/26/09/09/siri-ai-will-launch-in-beta-complicated-by-daily-usage-caps-future-paid-access), [Hermes Desktop](https://hermes-agent.nousresearch.com/desktop), [Hermes Desktop launch](https://the-decoder.com/nous-research-releases-hermes-desktop-an-open-source-ai-agent-for-every-platform/).

The plan that follows from this: **an AI team that does the work on your real Mac — not just answers.** See the roadmap.

## The field

| | What it is | Price | Where it runs |
| :--- | :--- | :--- | :--- |
| **Grok Bot** (xAI, beta 11 Aug) | Named teammates sharing one managed cloud computer | Bundled with $120–300/mo plans | xAI cloud, desktop + iOS |
| **Muse** (Meta, 8 Sep) | Consumer personal agent with its own secure VM and browser | Free, $20, $100/mo | Meta cloud, phone-first; 2.5M downloads in 13 days |
| **Hermes Agent + Bot Mode** (Nous, MIT) | Self-hosted agent with named bots, learning skills, many chat gateways | Free software + your models | Your machine or VPS |
| **OpenClaw** (MIT) | Self-hosted gateway to many chat apps, large skill marketplace | Free software + your models | Your machine or VPS |
| **Sidemates** (MIT) | Owner-hosted team of teammates with reviewed actions | Free software + your models | Your Mac (Linux runner optional) |

## Scorecard

✅ competitive · 🟡 partial · ❌ gap

| Capability | Grok Bot | Muse | Hermes | OpenClaw | Sidemates now |
| :--- | :---: | :---: | :---: | :---: | :--- |
| Setup to first answer | ✅ sign in | ✅ app | 🟡 CLI/VPS | 🟡 guided | ✅ one sheet: name, job, paste an OpenCode Go key (~$10/mo), create — key tested live; no terminal |
| Free way to start | ❌ | ✅ | ✅ Nous tier | 🟡 | ❌ needs a model plan — **owner decision** |
| Speed of a simple reply | ✅ | ✅ | ✅ | ✅ | ✅ ~10s (was 181s) |
| Named, persistent teammates | ✅ | 🟡 one agent | ✅ | 🟡 | ✅ |
| Teammates helping each other | ✅ | ❌ | ✅ | ✅ | ✅ one consultation, ~40s |
| Isolation between teammates | ❌ shared computer | — | ✅ profiles | 🟡 | ✅ own workspace, browser profile, repo |
| Browser work | ✅ cloud VM | ✅ secure VM | ✅ | ✅ | ✅ own browser per teammate (live eval: read + honest decline) |
| Reviewed actions / approvals | ✅ allow/deny/always | 🟡 | 🟡 config | ❌ history | ✅ exact review, host-verified; harmless navigation no longer asks; decline → finish honestly |
| Learning / skills | ✅ show once | 🟡 | ✅ self-learning | ✅ 5,400 marketplace | ✅ /learn → reviewed skill; 11 bundled methods + Discover (public Agent Skills, reviewed one-tap add) + GitHub-link import |
| Scheduled work | ✅ | ✅ | ✅ cron | ✅ heartbeat | ✅ routines; Mac stays awake when due |
| Works while laptop is off | ✅ | ✅ | 🟡 needs VPS | 🟡 needs VPS | 🟡 Linux runner exists; no one-click hosted option — **owner decision** |
| Chat-app reach | 🟡 Slack | ❌ | ✅ many | ✅ most | 🟡 Telegram + Discord (owner-only) |
| Phone | ✅ iOS | ✅ iOS | 🟡 | 🟡 | 🟡 scan one QR with the camera → signed-in Home Screen app with notifications (no app store); native app not shipped |
| Voice | ❌ | ✅ | ✅ | 🟡 | ✅ hands-free voice conversation (listen → send on pause → spoken reply with captions), dictation, read-aloud |
| Switch from a competitor | — | — | ✅ imports Claude Code/Codex | — | ✅ one-click Hermes/OpenClaw import incl. automations (paused) |
| Own your data and models | ❌ | ❌ | ✅ | ✅ | ✅ |
| Feels good to use | 🟡 | ✅ | ❌ | ❌ | ✅ character teammates, calm chat, a weekly “Your week” look back built only from finished work |
| Replies stream word by word | ✅ | ✅ | ✅ | ✅ | ✅ every provider streams into the reply bubble (Claude partial messages; OpenCode via a private per-task server); live eval 22/22, same total time |
| Prompt overhead (fresh chat) | — | — | ~57k chars | — | ~32k chars / 8.1k tokens measured |

## Where Sidemates can win now

1. **Price and ownership vs Grok Bot and Muse.** Both rent you a cloud computer; Sidemates is free software on your hardware with your chosen models. Pitch: *Grok Bot's teammates without the $300 bill or the shared computer.*
2. **Ease vs Hermes and OpenClaw.** They are powerful but developer-first. Sidemates' app, preselected model, one-click Hermes import and quiet chat are aimed at non-developers. Pitch: *Hermes-level openness without the config file.*
3. **Trust.** Per-teammate isolation, exact reviews and honest outcomes ("didn't submit it because the click was declined") are concrete and demonstrable — Grok Bot's docs say its bots share one computer, OpenClaw has an exposure history.

## Gaps that remain, in order

| Gap | Why it matters | What unblocks it |
| :--- | :--- | :--- |
| No free way to start | Muse and Hermes win first-time users on price | Owner decision: default plan (OpenCode Go), or a free provider the owner signs up for |
| No always-on without your Mac | Grok Bot and Muse's core promise | A server the owner rents or owns; the Linux runner exists |
| Native iPhone app | Grok Bot and Muse are phone-first | Rebuild or revive the native client; the web app works meanwhile |
| WhatsApp / iMessage / Slack chat | OpenClaw and Hermes reach more apps | Self-hosted Slack means two tokens per user — too much for normal people; ship an official Sidemates Slack app once there's a hosted relay. WhatsApp needs a Meta business account; iMessage needs Full Disk Access |
| Skills marketplace breadth | OpenClaw's 5,400 skills | Discover ships with Anthropic's collection; add more vetted Agent Skills collections to `SKILL_CATALOGS` |
| Signed installer | Zero-friction install | Final phase, after the plan (owner decision) |

Sources: [Grok Bot](https://x.ai/news/introducing-grok-bot), [Grok Bot overview](https://www.digitalapplied.com/blog/grok-bot-ai-teammates-launch-cloud-computer-2026), [Meta Muse](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/), [Muse adoption](https://www.cnbc.com/2026/09/21/meta-muse-personal-ai-agent-downloads.html), [Hermes Bot Mode](https://hermes-agent.nousresearch.com/docs/user-guide/bot-mode), [Hermes releases](https://releasebot.io/updates/nousresearch/hermes-agent), [OpenClaw 2.0](https://www.infoq.com/news/2026/09/openclaw-2-release/), [OpenClaw 2026.9.5](https://www.marktechpost.com/2026/09/19/openclaw-releases-2026-9-5/), [Grok Bot vs Hermes vs OpenClaw](https://dervity.com/blog/grok-bot-vs-hermes-agent-vs-openclaw-2026).

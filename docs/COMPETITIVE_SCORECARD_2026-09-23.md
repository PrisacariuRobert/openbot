# OpenBot competitive scorecard — 23 September 2026

Where OpenBot stands against the four products people compare it with, after the competitive-plan work on branch `fix/runtime-pin-and-quiet-chat` ([#92](https://github.com/PrisacariuRobert/openbot/pull/92)). Competitor facts come from their public pages and press as of this date; OpenBot facts come from this checkout and its live eval (`qa/prompt-eval/`). Nothing here is a head-to-head benchmark on equal models.

## The field

| | What it is | Price | Where it runs |
| :--- | :--- | :--- | :--- |
| **Grok Bot** (xAI, beta 11 Aug) | Named teammates sharing one managed cloud computer | Bundled with $120–300/mo plans | xAI cloud, desktop + iOS |
| **Muse** (Meta, 8 Sep) | Consumer personal agent with its own secure VM and browser | Free, $20, $100/mo | Meta cloud, phone-first; 2.5M downloads in 13 days |
| **Hermes Agent + Bot Mode** (Nous, MIT) | Self-hosted agent with named bots, learning skills, many chat gateways | Free software + your models | Your machine or VPS |
| **OpenClaw** (MIT) | Self-hosted gateway to many chat apps, large skill marketplace | Free software + your models | Your machine or VPS |
| **OpenBot** (MIT) | Owner-hosted team of teammates with reviewed actions | Free software + your models | Your Mac (Linux runner optional) |

## Scorecard

✅ competitive · 🟡 partial · ❌ gap

| Capability | Grok Bot | Muse | Hermes | OpenClaw | OpenBot now |
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
| Replies stream word by word | ✅ | ✅ | ✅ | ✅ | 🟡 Claude subscriptions stream live; OpenCode providers show the finished answer (~10s) — its `run --attach` client exits after a tool call, and plain `run` exposes no stream |
| Prompt overhead (fresh chat) | — | — | ~57k chars | — | ~32k chars / 8.1k tokens measured |

## Where OpenBot can win now

1. **Price and ownership vs Grok Bot and Muse.** Both rent you a cloud computer; OpenBot is free software on your hardware with your chosen models. Pitch: *Grok Bot's teammates without the $300 bill or the shared computer.*
2. **Ease vs Hermes and OpenClaw.** They are powerful but developer-first. OpenBot's app, preselected model, one-click Hermes import and quiet chat are aimed at non-developers. Pitch: *Hermes-level openness without the config file.*
3. **Trust.** Per-teammate isolation, exact reviews and honest outcomes ("didn't submit it because the click was declined") are concrete and demonstrable — Grok Bot's docs say its bots share one computer, OpenClaw has an exposure history.

## Gaps that remain, in order

| Gap | Why it matters | What unblocks it |
| :--- | :--- | :--- |
| OpenCode replies don't stream | ChatGPT-style streaming makes waits feel shorter | Upstream: `opencode run --attach` exits after the first tool step (repro in CHANGELOG). Once fixed, a per-task wrapper (serve + attach + forwarded `message.part.delta`) feeds the existing LiveText path; or drive the server API directly |
| No free way to start | Muse and Hermes win first-time users on price | Owner decision: default plan (OpenCode Go), or a free provider the owner signs up for |
| No always-on without your Mac | Grok Bot and Muse's core promise | A server the owner rents or owns; the Linux runner exists |
| Native iPhone app | Grok Bot and Muse are phone-first | Rebuild or revive the native client; the web app works meanwhile |
| WhatsApp / iMessage / Slack chat | OpenClaw and Hermes reach more apps | Self-hosted Slack means two tokens per user — too much for normal people; ship an official OpenBot Slack app once there's a hosted relay. WhatsApp needs a Meta business account; iMessage needs Full Disk Access |
| Skills marketplace breadth | OpenClaw's 5,400 skills | Discover ships with Anthropic's collection; add more vetted Agent Skills collections to `SKILL_CATALOGS` |
| Signed installer | Zero-friction install | Final phase, after the plan (owner decision) |

Sources: [Grok Bot](https://x.ai/news/introducing-grok-bot), [Grok Bot overview](https://www.digitalapplied.com/blog/grok-bot-ai-teammates-launch-cloud-computer-2026), [Meta Muse](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/), [Muse adoption](https://www.cnbc.com/2026/09/21/meta-muse-personal-ai-agent-downloads.html), [Hermes Bot Mode](https://hermes-agent.nousresearch.com/docs/user-guide/bot-mode), [Hermes releases](https://releasebot.io/updates/nousresearch/hermes-agent), [OpenClaw 2.0](https://www.infoq.com/news/2026/09/openclaw-2-release/), [OpenClaw 2026.9.5](https://www.marktechpost.com/2026/09/19/openclaw-releases-2026-9-5/), [Grok Bot vs Hermes vs OpenClaw](https://dervity.com/blog/grok-bot-vs-hermes-agent-vs-openclaw-2026).

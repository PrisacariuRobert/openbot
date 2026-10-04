# Discord server: setup in about 15 minutes

Only Robert can create it (it lives on his account). Everything to paste is below. When it exists, send Claude the permanent invite link and it goes on the website, README and `llms.txt`.

## 1. Create it
Discord → "+" → Create My Own → For a club or community. Name: **Sidemates · AI teammates on your Mac** (the second half says what it is). If the server still has the old OpenBot name, rename it in Server Settings → Overview. Icon: `site/icon.svg` exported as a PNG, or one of the characters in `site/characters/`.
Server Settings → **Enable Community** (needed for announcement channels and onboarding). Verification level: **Medium**. Turn on **AutoMod** (block spam links and mass mentions). Turn on 2FA requirement for moderators.

## 2. Channels
| Category | Channel | Purpose |
|---|---|---|
| Info | #welcome | Read-only. Rules and links (text below). |
| Info | #announcements | Announcement channel: news and releases, followable. |
| Info | #releases | Fed by GitHub (step 4). Read-only. |
| Help | #start-here | "I just installed it": questions from new people. |
| Help | #help | Anything that is not working. |
| Help | #bugs | Reproducible bugs; we move them to GitHub issues. |
| Community | #show-your-team | People share the teammates they made and what they do. |
| Community | #gallery | Teammates from the gallery and new ideas for it. |
| Community | #ideas | Feature requests and "I wish it could…". |
| Community | #off-topic | Anything friendly. |
| Platforms | #windows-beta | For the Windows beta when it is ready. |

Roles: **Founder** (Robert), **Contributor** (anyone with a merged pull request or gallery teammate), **Beta tester**, and the default member role.

## 3. Text to paste

**#welcome**
> Welcome to Sidemates: a free, open-source team of AI teammates that works in your own Mac apps and asks before it acts. Free to use; you only pay for the AI you connect. 
> • Get it: https://sidemates.app
> • Code: https://github.com/PrisacariuRobert/sidemates
> • New here? Say hi in #start-here and tell us what you'd like your team to do.
> • Something broken? #help. A bug you can reproduce? #bugs.
> Rules: be kind and specific. No spam, no self-promotion outside #show-your-team, no personal data in screenshots (check your mail and messages are not visible). We are a small project run by one person; replies can take a few hours, and we read everything.

**Onboarding question** ("What do you want your team to do?"): Research and writing → #show-your-team · Mail, calendar and notes on my Mac → #start-here · I'm moving from another agent → #start-here · I want to help build it → #ideas.

**First posts to seed** (in #show-your-team, as Robert): one real teammate you use and what it does; the receipt keeper from the gallery; a question: "What's the one chore you'd hand to a teammate first?"

## 4. Releases into #releases (optional, 3 minutes)
In Discord: channel settings → Integrations → Webhooks → New Webhook → Copy URL. In GitHub: the repository's Settings → Webhooks → Add webhook → paste the URL and add `/github` at the end → content type `application/json` → "Let me select individual events" → tick **Releases** only. Keep the URL private.

## 5. Rituals (from the marketing plan)
Wednesday 17:00 Bucharest: 30-minute office hour. Friday: "teammate of the week". Announce every release in #announcements.

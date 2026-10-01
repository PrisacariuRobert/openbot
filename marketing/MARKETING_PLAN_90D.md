# OpenBot marketing plan: 90 days

Owner: Head of Marketing (Cowork). Approver: Robert. Window: Sat 3 Oct → Thu 31 Dec 2026. Budget: €0.
This plan extends `LAUNCH_PLAN_30D.md` (weeks 1–2 already ran) and replaces its weeks 3–4. Voice: `VOICE.md`. Discovery details: `DISCOVERY_PLAYBOOK.md`. The company plan lives at https://claude.ai/artifact/D2dVqEVxzbAmbXNZVea3vA (Robert's copy).

## 0. Where we start (2 Oct 2026)

- Product: 0.41.1. One-line install takes about 44 seconds. Free, MIT, no subscription. Autopilot (opt-in), share links, gallery, Mac Mail/Calendar/Notes/Messages tools.
- Reach: 5 stars, 0 forks, about 10 unique repository visitors in two weeks, no outside issues. Posts so far: X threads (30 Sep, 1 Oct), LinkedIn company page, r/LocalLLaMA and r/macapps (1 Oct). Show HN is restricted for our new account.
- The closest competitor, **OpenMausBot** (3.9k stars, up to about 30k downloads per release, about 1,900 Discord members, Pro $49/month), is far better known. It won on four things we can copy for free: it named the enemy and launched the same day ("open-source alternative to Grok Bot"), it is easy for developers to try (npm, Docker), it runs on every platform, and it built a community from day one.
- Name clashes: Intel Labs' OpenBot (robots), OpenBots (an automation company) and regnull/openbot (a third project). Always write "OpenBot" next to "AI teammates on your Mac" or "openbots.foundation".

## 1. What we say

**The sentence:** *The open-source alternative to OpenAI dots, Grok Bot and Siri AI. A team of AI teammates on your Mac. Free, private, no subscription.*

| Pillar | Proof to show |
|---|---|
| Your Mac, your apps | Demo: a receipt in Mail saved as a PDF with a reminder. "What did Anna say about the trip?" answered from Messages and Notes. |
| It asks first (or runs on Autopilot when you say so) | The approval card with the exact website and button. Autopilot's hard stops. |
| No subscription, ever | A sourced price comparison (§4, move 9). Free app; you pay only for the AI you choose. |
| Open source and private | MIT, readable installer, local data, security model. |

Rules: honest limits said calmly (beta, Mac only for now, works while the Mac is on, not yet notarized). No parity claims, no invented numbers, no "best", no attacks on anyone. Say where a competitor is better; the comparison pages already do. Always disclose that Robert is the founder. Never ask for upvotes.

## 2. Targets (guesses, not promises; we check every Friday and change what is not working)

| Measure | Day 30 (1 Nov) | Day 60 (1 Dec) | Day 90 (31 Dec) | Source |
|---|---|---|---|---|
| GitHub stars | 250 | 600 | 1,500 | GitHub API |
| Installs by others | 150 | 500 | 1,500 | Release tarball download counts, minus ours |
| Discord members | 50 | 150 | 400 | Discord |
| Creators and newsletters contacted / replied / featured | 50 / 10 / 1 | 120 / 25 / 3 | 200 / 40 / 6 | `marketing/outreach.csv` |
| Directory and list entries live | 10 | 20 | 30 | `marketing/directories.csv` |
| Demo clips published | 30 | 45 | 60 | queue log |
| Website visits | measure once analytics is on | | | Cloudflare Web Analytics (Robert turns it on) |
| First paid setup jobs (Robert's) | 1 | 3 | 5 | Robert |

## 3. Channels

| Channel | Used for | Cadence |
|---|---|---|
| X | Daily demo clip, launch-day replies, release notes | 1 clip a day plus 3 text posts a week |
| LinkedIn company page | Product news, comparisons, Europe angle | 2 a week |
| LinkedIn, Robert's profile | Founder story with honest numbers (Robert decides) | 1 a week at most |
| YouTube Shorts, TikTok, Instagram Reels | The same demo clips, re-cut vertical | daily |
| Reddit | One post per community after reading its rules; real answers where people ask for alternatives | replies daily, posts per calendar |
| Hacker News | Comments only until the account has a real history; Show HN later (§6) | comments daily |
| Product Hunt | One launch, Sat 17 Oct | once |
| Discord (new) and GitHub Discussions | Community, support, "teammate of the week" | daily |
| Directories and awesome lists | Steady, free discovery | batches (move 1) |
| Newsletters and creators | Earned reach | 10 outreach emails a day, capped |

## 4. The nine moves, as weekly work

**1. Say the sentence people search for.** The home page, README and repository description already lead with it, and there is one page per competitor: `/alternatives/openai-dots/`, `/grok-bot/`, `/siri-ai/`, `/openmausbot/` (more later: Muse, Hermes Desktop, OpenClaw). Submit to directories in batches of five per week, each with the one-line description from `DISCOVERY_PLAYBOOK.md`. Candidates, check each one's rules first: opensourcealternatives.to, AlternativeTo, Product Hunt, "awesome" lists for macOS apps, AI agents and local-first software (a pull request each, never a request), Uneed. Log in `marketing/directories.csv` (name, URL, rules checked, status, date).

**2. Launch on other people's launch days.** Every morning (08:30 Bucharest) scan Hacker News, X and the main Mac and AI news sites for competitor news: OpenAI dots rollout or EU launch, Siri AI release, Meta Muse and Grok Bot updates, Hermes and OpenMausBot releases. If there is a moment, draft within the hour: one post that states the news neutrally, says "here is the open-source alternative that runs on your Mac", links the matching comparison page, and carries a clip. Keep ready-made templates in `marketing/queue/templates/` for each likely event so approval takes minutes.

**3. One real demo a day for 30 days, then three a week.** 30 to 40 seconds, outcome first, captions burned in, ends on openbots.foundation, cut for 16:9 and 9:16. Privacy rule: demos use the demo studio and sample data only, never Robert's real mail, messages or calendar; Robert approves each clip before it posts. The recorder exists: `node --import tsx scripts/record-demo.mjs --fresh --prompt "..." --out marketing/queue/media/demo-NN.mp4` starts a throwaway studio with an empty conversation, types the prompt in a real browser, waits for the real answer, speeds up the waiting and adds an end card (add `--vertical` for 9:16 and `--browser` when the task needs the web). **Test every prompt once off-camera and record only prompts where the first answer is a finished result**, not a question back. Mac-app clips (Mail, Calendar, Notes) need sample data in a demo user account, so Robert records those with the macOS screen recorder. The 22 shots are in §7.

**4. Easy for developers to try.** Marketing's part: a 20-second GIF at the top of the README, "good first issue" labels on 10 real issues, a CONTRIBUTING pass, replies to every issue and comment within two hours on weekdays. Engineering's part: `npx` and Homebrew installs (blocked on the Apple certificate and the name decision).

**5. Windows beta.** Engineering ships it when a Windows PC is available (our CI already builds the installers). Marketing prepares a waitlist form on the site and the announcement, and holds both until it works.

**6. A community from day one.** Robert creates the Discord server (Cowork cannot, it needs his account). Channels: #start-here, #show-your-team, #help, #ideas, #gallery, #releases, #windows. Welcome message and rules drafted by Cowork. Rituals: **Wednesday 17:00 Bucharest office hour** (Robert, 30 minutes), **Friday "teammate of the week"** (a real teammate from the gallery or a member, with permission), releases announced in #releases. GitHub Discussions categories: Q&A, Show and tell, Ideas. Invite people who reply to our posts, never strangers by DM.

**7. Creators and newsletters.** Build `marketing/outreach.csv` (name, channel, URL, audience, why they fit, rules or submission method, status). Categories: Mac and productivity YouTubers; AI-agent and local-AI channels; privacy and open-source channels; newsletters (Console.dev, TLDR AI, Changelog, and Mac sites such as MacStories once the app is notarized); Belgian and Romanian tech press and communities (Robert's network). Each email: three sentences, one demo link, an offer to build a custom teammate for their audience, an honest "it's early". Maximum 10 a day, one follow-up after five days, never a third. Every send needs Robert's yes (a daily batch is fine).

**8. Own Europe.** OpenAI dots was not offered in the EEA, UK or Switzerland at launch. Write one plain post and one page for European readers ("works where dots isn't"), pitch European tech outlets, post in Product Hunt's European communities, and watch for local meetups, student groups and hackathons in Belgium and Romania that Robert can join (credibility and first users).

**9. Make "no subscription" the headline.** A sourced graphic, dated, updated monthly: OpenMausBot Pro $49/month at launch ($89 later); Hermes hosted plans $20, $100, $200; dots needs ChatGPT Pro; Grok Bot bundled with $120–300 plans; OpenBot $0, you pay only the AI you choose. Use it once a week in a different format (thread, LinkedIn image, page section).

## 5. Weekly rhythm

| Day | Work |
|---|---|
| Daily 08:30 | Moment scan, stars/issues/Discussions/Discord/mentions check, reply drafts, bug flags → `reports/daily-YYYY-MM-DD.md` |
| Daily | One demo clip drafted and queued; ten outreach emails drafted (max) |
| Mon | Weekly report (§9), plan the week's queue |
| Tue + Fri | Next-post proposals (`reports/proposals-YYYY-MM-DD.md`) |
| Wed 17:00 | Office hour in Discord |
| Fri | Teammate of the week; Friday review: keep, change or drop each tactic by its numbers |
| Sun | Week-ahead queue for Robert's approval |

## 6. Calendar (Bucharest times; adjust when the moment calendar changes it)

| Week | Dates | Theme and key events |
|---|---|---|
| 1 | 3–11 Oct | Alternative-to launch: announce the new hero and the four comparison pages; directory batch 1; Discord opens; clips 1–7; first 25 creator emails |
| 2 | 12–18 Oct | **Product Hunt launch Sat 17 Oct 10:01**; OpenMausBot comparison post (respectful, linking their repo); directory batch 2; clips 8–14 |
| 3 | 19–25 Oct | Honest LinkedIn post on what week 1–2 taught us; first 3 newsletter pitches; Show HN check (see below); clips 15–21 |
| 4 | 26 Oct–1 Nov | 30-day retro and plan for the next 30; best-of clip; first community "teammate of the week" |
| 5–8 | Nov | "OpenBot for freelancers / accountants / agents" series (feeds the paid packs in 0.44); a case study if a setup customer agrees; Windows beta announcement when ready; Europe push; directory batches 3–5 |
| 9–13 | Dec | "State of OpenBot" year-in-review with real numbers; gift-style post about teammate packs; contributor thank-you; 2027 plan |

**Show HN:** do not retry until the account has at least 20 helpful, non-promotional comments over two weeks. Then post once, plain and technical, on a Tuesday or Wednesday 15:00–17:00 Bucharest. Never repost to get around the restriction.

## 7. The 22 demo shots (demo studio, sample data)

1. Find the Figma invoice in Mail, save the PDF, remind me Friday. 2. "What's on my plate today?" 3. Plan my week. 4. Tidy my Downloads. 5. Find that PDF about the contract. 6. "What did Anna say about the Berlin trip?" 7. The 8:00 morning brief. 8. Receipt keeper builds receipts.xlsx. 9. Trip planner for a Vienna weekend, with sources. 10. Meeting prepper for the 2 pm call. 11. Nova researches, Scout double-checks (group chat). 12. The approval card: it asks before clicking Reserve. 13. Autopilot on: the same job without asking, and the log. 14. Copy a share link; a friend adds the teammate in one tap. 15. Share a result as a page. 16. "Hey Siri, ask OpenBot…" 17. Import from Hermes or OpenClaw in one click. 18. Inbox triage: what needs an answer. 19. Price watcher on a product page. 20. Study buddy summarises a PDF. 21. Proofreader fixes an email draft. 22. Install in 44 seconds (screen recording of the one line).

## 8. Approval workflow (keeps the standing rule: nothing public, nothing that costs money, without Robert's yes on that exact item)

1. Cowork writes every post, reply, email and clip into `marketing/queue/YYYY-MM-DD.md`: channel, exact text, media path, link, scheduled time, risk note, status `draft`.
2. Robert sets `approved` per item (or replies "approve all" for a day's batch). A 10-minute daily review is enough.
3. Cowork publishes only `approved` items at their time, then logs the live URL in the queue file and `marketing/metrics.csv`.
4. Replies to comments follow the same path. Security reports: tell Robert immediately, point to SECURITY.md, no public detail.
5. **Never:** buy followers, stars or ads; engagement pods; fake or second accounts; mass DMs; asking for upvotes; ignoring a community's self-promotion rules; posting real personal data in a demo; attacking competitors; inventing metrics, users, press or partners.

## 9. Measurement

`marketing/metrics.csv` daily (stars, forks, tarball downloads by architecture, open issues from outside, Discussions, Discord members, website visits once available, notes). Monday report (`reports/weekly-YYYY-MM-DD.md`): numbers against §2, top three posts by reach and why, replies and DMs, creators contacted and replied, directories live, what we learned, what we change next week. Fridays: any tactic that has not produced a measurable result in two weeks is dropped or rewritten.

## 10. Scheduled tasks to set up in Cowork

- **Daily 08:30**: the moment scan and daily check (§5), writing the daily report.
- **Tue and Fri 09:00**: next-post proposals.
- **Mon 09:00**: weekly report.
- **Sun 18:00**: week-ahead queue.
- **Weekly Wed**: five directory submissions drafted, rules checked.

## 11. What marketing needs from engineering (Claude) and from Robert

| From | What | When |
|---|---|---|
| Engineering | Demo recorder: done (`scripts/record-demo.mjs`); next, a small library of tested prompts and sample data for the Mac-app clips | this month |
| Engineering | Tag the existing "Made with OpenBot" link on shared result pages (`?ref=result`, done, ships in 0.42) so Cloudflare Analytics can count visits from shares; opt-in anonymous usage counts only if Robert agrees (we promise no tracking today) | 0.42 |
| Engineering | Press kit page `/press` (logo, screenshots, one-paragraph description, founder bio) | this month |
| Engineering | Windows beta, `npx`, Homebrew | 0.43, after the Windows PC, the Apple certificate and the name decision |
| Robert | Create the Discord server; turn on Cloudflare Web Analytics; decide on the Cloudflare AI-crawler setting | week 1 |
| Robert | Approve the daily queue; record demos until the recorder exists; join the office hour | daily |
| Robert | Name decision (trademark search by 16 Oct) | before any paid launch or press |

## 12. Risks

| Risk | Response |
|---|---|
| Nothing gets noticed | Measure weekly; double down on the one format that works; accept a smaller niche as a good outcome |
| A competitor reacts or copies | Keep the comparisons factual and respectful; keep shipping weekly |
| A post is flagged as spam | Stop that channel for a week, read its rules, ask the moderators politely |
| A demo exposes personal data | Demo studio and sample data only; Robert reviews every clip |
| The name confuses people | Always pair it with "AI teammates on your Mac" or openbots.foundation; the name decision may change this |

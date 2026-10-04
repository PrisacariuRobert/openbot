# Sidemates marketing plan, version 2

Owner: Head of Marketing (Cowork). Approver: Robert. Window: Sun 4 Oct 2026 → Fri 1 Jan 2027. Budget: €0.
This replaces the 90-day plan of 2 Oct (nine moves, six channels, star targets). Voice: `VOICE.md`. Discovery details: `DISCOVERY_PLAYBOOK.md`. Robert keeps the company plan and the market evaluation privately; do not quote them in public.

## 0. What changed

- **The product is renamed from OpenBot to Sidemates.** Release 0.42.0 is planned for Thu 8 Oct, with the site at sidemates.app. Until Robert tells you the release is live: no public post, no scheduled post, no directory submission and nothing under the old name. Prepare only.
- **Old drafts are void.** Mark every draft written for OpenBot "old name, do not use". Do not recreate the recurring tasks from the old plan.
- **The goal changed from followers to two gates (§1).** An honest evaluation on 3 Oct found that distribution, not the product, is what holds us back. Our baseline: 5 stars (4 not Robert's), 49 release downloads in total, 28 unique repository visitors in 14 days. OpenMausBot, the closest competitor, has about 3,980 stars and about 366,000 release downloads after 53 days, signed Mac, Windows and Linux apps, and paid cloud plans.
- **"No subscription, ever" is retired.** Say only what is true today: the app is free and open source (MIT), and you pay only for the AI you connect.
- **Name history.** On first mention in any public text for the next eight weeks, write "Sidemates (formerly OpenBot)". Never promote the old name on its own, and never write OPENBOT or OpenBots as a brand: another company holds a registered mark.

## 1. The gates (what success means)

| Gate | Date | Passes if |
|---|---|---|
| **1** | Tue 17 Nov | at least 300 installer downloads by other people, at least 25 real stars, and at least 10 people who told us what they use it for or what is missing |
| **2** | Fri 1 Jan | at least 1 paying customer and €300 collected, **or** at least 1,000 installs and at least 50 people in Discord |

Miss two of three at Gate 1: we change the focus or stop. Miss both at Gate 2: development stops and Sidemates stays as open source with the site up. The thresholds are Robert's to change, but only before the date.

Report every Friday against these measures, as green, amber or red, with the number. Where we cannot measure something, write "no data". Never fill a gap with a guess.

## 2. What we say

Lead with a job, not a platform. Two jobs are under test (the 10-day test in §3 decides which one leads):

1. **Your morning brief, and who is waiting on you.** Mail, Messages and Calendar, summed up each morning, with the replies you owe.
2. **Paperwork for freelancers and small offices.** Finds invoices and receipts in Mail, files them, and reminds you about late payments.

Pillars, in any order: it works in your own Mac apps; it asks before anything important (Autopilot is opt-in and has hard stops); it is free and open source; it works in Europe, where OpenAI dots was not offered at launch.

The website hero stays "The open-source alternative to OpenAI dots, Grok Bot and Siri AI" because that is what people search for. In conversations lead with the job.

Rules: honest limits said calmly (beta, Mac only, works while the Mac is on, the Mac app is not notarized yet). No parity claims, no invented numbers, no "best", no attacks on anyone. Say where a competitor is better; the comparison pages already do. Always disclose that Robert is the founder. Never ask for upvotes.

## 3. Four things only

**A. The 10-day test (Fri 9 → Sun 18 Oct).** For each job, list 10 real people who have that problem, starting with Robert's network (freelancers, small offices, people in Belgium, Romania and the rest of the EU). Draft one short message each: *"I'll set this up on your Mac this week, free, for 15 minutes of your feedback."* Robert sends them; Cowork never sends. Track every person in `marketing/outreach.csv` (name, job, source, message date, status, what they said). A job passes if at least 3 of its 10 say yes and are still using it on day 2.

**B. Four demo clips, from the real app, sample data only.** (1) The morning brief. (2) "Who is waiting on me?" (3) An invoice found in Mail, filed, with a reminder. (4) The approval card showing the exact button. Recorder: `node --import tsx scripts/record-demo.mjs --fresh --prompt "..." --out marketing/queue/media/demo-NN.mp4` (add `--vertical` for 9:16). Test every prompt once off camera and record only prompts where the first answer is a finished result. Mac-app clips need a demo user account with sample data; Robert records those. Never use real mail, messages or calendar.

**C. Helpful answers where people already ask.** Reddit (r/macapps, r/ClaudeAI, r/selfhosted, r/LocalLLaMA) and threads about Siri AI limits, OpenAI dots outside the US, or OpenMausBot problems. Answer the question first. Mention Sidemates only when it genuinely fits, at most once per thread, after reading the community's self-promotion rules, and say Robert is the founder. Draft 3 to 5 a day for approval.

**D. Launch day: Product Hunt, Sat 17 Oct, 10:01 Bucharest time.** Prepare the kit by Wed 14 Oct: tagline, description, maker comment, first reply, four images from `site/shots/`, the link. Show HN only if the account has at least 20 helpful, non-promotional comments over two weeks; check on Mon 19 Oct. Never retry around a restriction.

Also, in small batches: five directory submissions a week (rules checked first, logged in `marketing/directories.csv`). Creator and newsletter outreach waits for Gate 1 unless the test shows pull, and then at most five a week.

## 4. Channels

Reddit and LinkedIn (the company page, and Robert's own profile when he chooses). X only for launch-day replies and release notes, about three posts a week. Discord opens in week 2 (§5). No Shorts, TikTok or Reels until a clip has proven itself on the channels above.

## 5. Rhythm and calendar (Bucharest time)

| When | What |
|---|---|
| Daily 08:30 | Scan for moments and questions (§3 C), check stars, issues, Discord and mentions, draft replies. Write `reports/daily-YYYY-MM-DD.md` |
| Fri 16:00 | Gate report: numbers, what worked, what we change |
| Sun 18:00 | Week-ahead queue for Robert's approval |

| Dates | Plan |
|---|---|
| Sun 4 → Wed 7 Oct | **Prepare only.** People lists, message drafts, clip scripts, Discord welcome and rules, Product Hunt kit. No posts. |
| Thu 8 Oct | Release 0.42.0 goes live. Robert tells Cowork. |
| Fri 9 → Sat 17 Oct | The 10-day test begins. Community answers start. Discord opens with a welcome post, #rules and a permanent invite link. Directory batch 1. Clips 1 to 4 queued. |
| Sat 17 Oct | Product Hunt launch. |
| Mon 19 Oct | Show HN check. |
| Tue 17 Nov | **Gate 1 review.** |
| Fri 1 Jan | **Gate 2 review.** |

## 6. Approval workflow (unchanged: nothing public, nothing that costs money, without Robert's yes on that exact item)

1. Cowork writes every post, reply, email, message and clip into `marketing/queue/YYYY-MM-DD.md`: channel, exact text, media path, link, scheduled time, risk note, status `draft`.
2. Robert sets `approved` per item (or replies "approve all" for a day's batch). A 10-minute daily review is enough.
3. Cowork publishes only `approved` items at their time, then logs the live URL in the queue file and `marketing/metrics.csv`.
4. Replies follow the same path. Security reports: tell Robert immediately, point to SECURITY.md, no public detail.
5. **Never:** buy followers, stars or ads; engagement pods; fake or second accounts; mass DMs; asking for upvotes; ignoring a community's self-promotion rules; posting real personal data in a demo; attacking competitors; inventing metrics, users, press or partners.

## 7. Where each number comes from

| Measure | Source |
|---|---|
| Installer downloads by others | Release asset download counts (`gh api repos/PrisacariuRobert/sidemates/releases`), minus Robert's own; the Cloudflare request count for `/download/*` (Robert reads it) |
| Real stars | GitHub API; leave out Robert's own star and any account that starred seconds after another |
| Website visits | Cloudflare Web Analytics for sidemates.app (Robert turns it on once the domain is on Cloudflare) |
| Discord members | Discord |
| People who told us what they use it for | `marketing/outreach.csv` |
| Daily snapshot | `marketing/metrics.csv` |

## 8. Scheduled tasks to set up in Cowork (three, no more)

- **Daily 08:30**: the scan and daily check (§5).
- **Fri 16:00**: the gate report.
- **Sun 18:00**: the week-ahead queue.

## 9. What marketing needs

| From | What | When |
|---|---|---|
| Engineering | Release 0.42.0 live and the site on sidemates.app | Thu 8 Oct |
| Engineering | Tested prompts and sample data for the four clips | by Wed 14 Oct |
| Robert | Tell Cowork when the release is live; send the test messages; approve the daily queue; turn on Cloudflare Web Analytics for the new domain | daily |
| Robert | Decide on the Windows VM, the Apple Developer account ($99, at Gate 1 or the first paid job) and any telemetry (not approved) | when asked |

## 10. Risks

| Risk | Response |
|---|---|
| Nothing gets noticed | Measure weekly; double down on the one format that works; accept a smaller niche as a good outcome, or stop at a gate |
| A post is flagged as spam | Stop that channel for a week, read its rules, ask the moderators politely |
| A demo exposes personal data | Demo studio and sample data only; Robert reviews every clip |
| People still search for the old name | "Sidemates (formerly OpenBot)" on first mention for eight weeks; the old site redirects |
| A competitor reacts or copies | Keep comparisons factual and respectful; keep shipping |

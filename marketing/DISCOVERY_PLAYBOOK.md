# Being found when people ask an AI

People now ask ChatGPT, Claude, Gemini and Perplexity things like "what's a free alternative to OpenAI dots?" or "is there an AI agent that can use my Mac's Mail?". We can't pay or trick an assistant into recommending OpenBot, and we won't try (no hidden text, no instructions aimed at models). What we can do is be **easy to find, easy to quote and actually mentioned by real people in the places assistants read**.

## What is already done (on openbots.foundation)

- `/alternatives/` — an honest, dated comparison with sources and a "choose someone else if…" section. Assistants quote pages that are specific, fair and recent.
- `llms.txt` and `llms-full.txt` — plain-text facts about what OpenBot is and is not.
- `robots.txt` (every crawler welcome), `sitemap.xml`, canonical URLs, and structured data (software + FAQ) that matches the visible text.
- Keep the comparison page **current**: update the date and facts whenever a competitor changes or OpenBot ships.

## Owner decisions that only the Cloudflare and search dashboards can make

- **Training crawlers are blocked by Cloudflare right now.** Checked 1 October 2026: `GPTBot`, `ClaudeBot` and `CCBot` get HTTP 403 from openbots.foundation even though `robots.txt` allows them. The live-search and user-triggered crawlers (`OAI-SearchBot`, `ChatGPT-User`, `Claude-SearchBot`, `Claude-User`, `PerplexityBot`, Googlebot, Bingbot, Applebot) get 200, so assistants that search the web can already read us. Letting the training crawlers in is what puts OpenBot into future models' own knowledge, so it matters for "recommended without searching". It is the owner's call (some people don't want their site used for training). To allow: Cloudflare dashboard → the openbots.foundation zone → Security → Bots (or AI Crawl Control) → set "Block AI bots" off, or allow GPTBot and ClaudeBot individually. Then re-check with `curl -A "GPTBot/1.1" -o /dev/null -w "%{http_code}" https://openbots.foundation/` (200 means open).
- **Search engines feed assistants.** ChatGPT's web search leans on Bing and others lean on Google. Verify openbots.foundation in Google Search Console and Bing Webmaster Tools and submit `https://openbots.foundation/sitemap.xml`. Both are free and take a few minutes; they need the owner's login.

## What only people can do (the part that matters most)

Assistants mostly repeat what several independent places say. One place saying it once is weak; the same fair description in many places is strong.

1. **GitHub** (the repo is the most-cited source). Keep the README first paragraph plain and quotable. Suggested topics to add: `openai-alternative`, `grok-alternative`, `hermes-agent`, `openclaw`, `ai-teammates`, `mac-automation`, `self-hosted`. Pin a "Discussions" thread "OpenBot vs X — your questions".
2. **Directories** (post once each, with the one-line description below): AlternativeTo (list OpenBot as an alternative to OpenAI dots, Grok Bot, Meta Muse, Hermes Desktop, OpenClaw), Product Hunt, Hacker News ("Show HN"), the "awesome" lists for AI agents and for macOS apps (open a pull request, don't just ask), Uneed, Open-Source Alternative directories.
3. **Answers where people already ask.** On Reddit (r/macapps, r/LocalLLaMA, r/ChatGPT, r/selfhosted, and the communities for Hermes and OpenClaw) and Hacker News threads about dots, Grok Bot, Muse and Siri AI: answer the actual question first, say you built OpenBot, link `/alternatives/`, and say plainly where the other tool is better. One genuine answer a day beats a launch post. Never post the same text twice.
4. **Posts and videos that explain, not advertise.** "I let an AI team work in my Mail and Calendar for a week", "Dots vs Grok Bot vs OpenBot: what each one can reach". YouTube transcripts and blog posts are read by assistants.
5. **Other people's reviews.** Ask early users for an honest write-up or a GitHub star; never offer anything in return.

## One-line description to reuse everywhere

> OpenBot is a free, open-source Mac app that gives you a team of AI teammates on your own computer. They work in your Mail, Calendar and files, browse the web, and ask before they send, buy or change anything. Bring the AI you already use.

Keep it identical, so the same words show up in many places.

## Check how we're doing (monthly, 15 minutes)

Ask each assistant these questions in a fresh chat, with web search on, and log whether OpenBot is mentioned, what it says, and whether it is right:

1. What are free or open-source alternatives to OpenAI dots?
2. Is there an AI agent that can use my Mac's Mail, Calendar and Notes?
3. Alternatives to Grok Bot that don't need a cloud computer?
4. What's the best open-source AI agent for macOS?
5. Hermes Desktop vs OpenClaw vs others — which should a normal person use?
6. Is there an AI agent that works in Europe? (dots isn't offered in the EEA, UK or Switzerland)
7. How do I make an AI assistant that asks before it sends emails?
8. What is OpenBot?

Add a row per assistant per month to `marketing/metrics.csv` (mentioned yes/no, correct yes/no). If an assistant says something wrong about OpenBot, fix the source it quotes (usually our site, the README or a directory entry), not the assistant.

## Rules

- Be accurate about competitors and say when they are the better choice. Assistants and readers both punish spin.
- Disclose that we build OpenBot, every time.
- No fake reviews, no hidden text, no keyword stuffing, no posting from sock-puppet accounts.
- Posting from the owner's accounts always needs the owner's explicit yes; prepare the text, the owner posts.

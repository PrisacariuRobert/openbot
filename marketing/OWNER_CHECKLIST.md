# Robert's checklist: only you can do these

Claude can prepare, write and verify. These need your accounts, your identity or your money. Updated 4 October 2026, after the rename to Sidemates.

## 1. Put sidemates.app on Cloudflare  ·  10 minutes  ·  **first, it blocks the release**
You bought the domain at Namecheap, so its DNS is there. The website and installer run on Cloudflare, so the domain's nameservers must point to Cloudflare:
1. Cloudflare dashboard → **Add a domain** (or "Onboard a domain") → enter `sidemates.app` → choose the **Free** plan. Cloudflare shows two nameservers (names like `xxx.ns.cloudflare.com`).
2. Namecheap → Domain List → **Manage** `sidemates.app` → **Nameservers** → **Custom DNS** → paste the two Cloudflare names → save.
3. Tell Claude. Cloudflare says "Active" within minutes to a few hours; Claude then adds the domain to the website and checks it.
Keep `openbots.foundation` registered and renewed: it redirects to the new site, serves the update installer for copies installed as OpenBot, and your away-from-home access (`app.openbots.foundation`) lives on it.

## 2. Cowork  ·  2 minutes
On Thursday 8 October, once Claude says the release is live, paste the text between the dashes in `marketing/COWORK_NEXT_PROMPT.md` into the Head of Marketing chat. Until then, if you ever pasted the old prompt, paste only this: *"Pause. The product is being renamed (OpenBot becomes Sidemates), so do not queue, schedule or post anything public until I send the new brief. Pause the recurring tasks you created. Keep existing drafts but mark them old name."* Nothing posts until you set an item to `approved`.

## 3. Discord  ·  15 minutes
- Rename the server to **Sidemates · AI teammates on your Mac** (Server Settings → Overview).
- Delete the two stray messages in #general (Claude is not allowed to delete messages).
- After the release: post the welcome and rules from `marketing/community/DISCORD_SETUP.md`, create a permanent invite link (never expires, no use limit) and send it to Claude for the site and README.

## 4. Cloudflare Web Analytics for the new domain (free, no cookies)  ·  5 minutes
After step 1: Cloudflare → **Analytics & Logs → Web Analytics** → **Add a site** → `sidemates.app` → enable it. Choose the option that counts all visitors (the default skips the EU).

## 5. Let AI crawlers in (your call)  ·  3 minutes
Cloudflare answers GPTBot, ClaudeBot and CCBot with 403 even though our `robots.txt` allows them. In the `sidemates.app` zone: **Security → Bots** (newer dashboards: **AI Crawl Control**) → turn **Block AI bots** off, or allow GPTBot and ClaudeBot one by one. Security settings are yours; Claude checks the result with `curl -A "GPTBot/1.1" https://sidemates.app/`.

## 6. GitHub  ·  3 minutes
- Claude renames the repository to `sidemates` after your yes (GitHub redirects the old address).
- You upload the link preview image: Repository Settings → General → **Social preview** → `site/social.png` (1280×640).

## 7. Decisions, when asked
- **Windows**: a VM on your Mac is possible (Apple silicon, 24 GB, 105 GB free). Say "go" and Claude asks before each download.
- **Apple Developer Program ($99 a year)**: at Gate 1 (17 Nov) or the first paid job, earlier only for a "Download for Mac" launch button. Needs your identity.
- **Telemetry**: not approved; the README promises no tracking.

## Done
- **The name.** USPTO shows OPENBOTS registered twice for OpenBots, Inc. (classes 9 and 42), so OpenBot was too close to a registered mark in our own field. Sidemates searched clean on 3 October (USPTO, TMview; RIDEMATES is the one to watch). Consider filing a trademark after the first paid job. Not legal advice.

# Robert's checklist: only you can do these (each about 10 minutes)

Claude can prepare, write and verify. These need your accounts, your identity or your money.

## 1. Start Cowork on the plan  ·  2 minutes
Paste the contents of `marketing/COWORK_NEXT_PROMPT.md` (between the dashes) into the Head of Marketing chat. It will create its scheduled tasks and write today's approval queue in `marketing/queue/`. Nothing posts until you set an item to `approved`.

## 2. Discord server  ·  15 minutes
Follow `marketing/community/DISCORD_SETUP.md`. Send Claude the permanent invite link afterwards.

## 3. Cloudflare Web Analytics (free, no cookies)  ·  5 minutes
Cloudflare dashboard → your account → **Analytics & Logs → Web Analytics** (it may be called "Web analytics" in the left menu) → **Add a site** → choose `openbots.foundation` → enable the automatic setup. Claude then checks that the page carries the beacon and that visits from `?ref=` links show up. Without this we cannot measure website visits.

## 4. Let AI training crawlers in (your call)  ·  3 minutes
Today Cloudflare answers GPTBot, ClaudeBot and CCBot with 403 even though our `robots.txt` allows them. To change it: Cloudflare dashboard → the `openbots.foundation` zone → **Security → Bots** (in newer dashboards: **AI Crawl Control**) → turn **Block AI bots** off, or allow GPTBot and ClaudeBot individually. Security settings are yours to change. Afterwards Claude checks with `curl -A "GPTBot/1.1" https://openbots.foundation/` (200 means open).

## 5. The name  ·  20 minutes, free
Run the official searches yourself (they block automated visits). Search **OPENBOT** and **OPENBOTS**, and look at software classes **9** and **42**, live and pending marks:
- US: the USPTO trademark search at uspto.gov/trademarks (search for "OPENBOT").
- EU and many countries at once: **TMview** (tmdn.org/tmview).
- World: **WIPO Global Brand Database** (branddb.wipo.int).
Send Claude screenshots or the owner names. A search summary we found (not yet confirmed by us) lists OPENBOTS, Reg. No. 6413358, registered 6 July 2021 for software and software development services (class 42), owned by OpenBots, Inc., and a pending OPENBOT application from 2023 for robotics hardware and education (class 9). If the official record matches, our name is too close to a registered mark in our own field, and Claude's recommendation is to rename before the Product Hunt launch on 17 October.

## 6. Windows  ·  decision only
Measured on GitHub's free Windows machine (workflow "Windows probe"): install, build and server start work and 1,021 of 1,128 tests pass; the browser gap is fixed. What a beta still needs is in `docs/ROADMAP.md` (0.43). A VM on your Mac is possible (Apple silicon, 24 GB, 105 GB free) for the installer and desktop pass: tell Claude "go" and it asks before each download (UTM is free; Microsoft's Windows 11 Arm ISO is free to download, about 5 GB, and needs a product key to activate).

## 7. Apple Developer Program ($99 a year)  ·  later, when the first setup job pays
Enroll at developer.apple.com/programs with your identity. It lets the app install without warnings and unlocks a Homebrew install. Not needed for the one-line installer.

## 8. GitHub link preview image  ·  2 minutes
Repository Settings → General → **Social preview** → upload `site/social.png` (already 1280×640). It is what people see when someone shares the repository link. Web-only setting.

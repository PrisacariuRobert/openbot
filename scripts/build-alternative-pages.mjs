/** Builds one honest comparison page per big competitor from the main /alternatives/ page's look.
 *
 *   node scripts/build-alternative-pages.mjs
 *
 * Writes site/alternatives/<slug>/index.html. The pages are plain static files (committed), so this only
 * needs to run when the content below changes. Facts come from the sources listed on each page; keep them
 * dated and say where the other product is the better choice. Nothing here may be hidden from readers or
 * aimed at AI models (src/server/discovery.test.ts checks).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const UPDATED = "2 October 2026";
const UPDATED_ISO = "2026-10-02";
const base = readFileSync(path.join(root, "site/alternatives/index.html"), "utf8");
const style = base.slice(base.indexOf("<style>"), base.indexOf("</style>") + "</style>".length);
const brand = base.slice(base.indexOf("<header>"), base.indexOf("</header>") + "</header>".length).replaceAll('href="../"', 'href="../../"').replaceAll('href="../#install"', 'href="../../#install"');

const install = "curl -fsSL https://sidemates.app/install.sh | sh";

const PAGES = [
  {
    slug: "openai-dots",
    name: "OpenAI dots",
    title: "OpenAI dots alternative: Sidemates, free and open source on your Mac",
    h1: "An open-source alternative to OpenAI dots",
    description: "Looking for an alternative to OpenAI dots? Sidemates is a free, open-source team of AI teammates that runs on your own Mac, works in your Mail, Calendar and Notes, and is free to use. Compared honestly, including when dots is the better pick.",
    lede: "OpenAI dots is an always-on agent that works on its own cloud computer. Sidemates is the open-source alternative that works on yours.",
    what: "OpenAI announced dots at DevDay on 29 September 2026: an always-on agent with its own cloud computer and virtual browser, plugins for thousands of apps, and read-only access until you approve actions. It is included with ChatGPT Pro and Business Premium, with one dot on Pro, and it was not offered in the EEA, UK or Switzerland at launch.",
    rows: [
      ["Runs on", "Its own cloud computer with a virtual browser", "Your Mac"],
      ["Price", "Included with ChatGPT Pro and Business Premium; one dot on Pro", "Free and open source (MIT). You pay only for the AI you choose."],
      ["Your Mac's Mail, Calendar, Notes and files", "No (cloud apps through plugins)", "Yes, in your own apps"],
      ["How many agents", "One agent per dot", "A team of named teammates, each with its own browser and workspace"],
      ["Works while your computer is off", "Yes", "No. It works while your Mac is on, and keeps the Mac awake for scheduled jobs."],
      ["Where it is offered", "Not in the EEA, UK or Switzerland at launch", "Wherever your Mac works"],
      ["Source code", "Closed", "Open (MIT)"],
    ],
    chooseThem: ["want an agent that keeps working while your computer is off", "want it managed for you with nothing to install, and already pay for ChatGPT Pro or Business Premium", "are happy for your work to run on OpenAI's servers"],
    chooseUs: ["want the agent to work in your own Mail, Calendar, Notes, Messages and folders", "want to be asked before it sends, buys or changes anything, or to switch that off for a teammate you trust", "want free, open-source software instead of another paid app", "live in the EEA, UK or Switzerland, or want software you can read"],
    faq: [
      ["Is Sidemates a free alternative to OpenAI dots?", "Yes. Sidemates is free, MIT-licensed software. You pay only for the AI you connect, and free options exist (a Google Gemini key or a free Nous Portal plan). It does not run in the cloud, so it works while your Mac is on, not while it is off."],
      ["Does Sidemates work in Europe?", "Yes. It runs on your own Mac, so it works wherever your Mac does, including the EEA, UK and Switzerland, where OpenAI dots was not offered at launch."],
      ["Can Sidemates use my Mac's Mail and Calendar?", "Yes. Teammates can read your Apple Mail, Calendar, Reminders, Notes, Contacts and Messages and search folders you choose, and they ask before they change anything."],
    ],
    sources: [["Android Headlines on dots", "https://www.androidheadlines.com/2026/09/openai-launches-dots-always-on-ai-agents.html"], ["DevDay coverage", "https://pasqualepillitteri.it/en/news/19302/openai-dots-personal-ai-agent-devday-2026"]],
  },
  {
    slug: "grok-bot",
    name: "Grok Bot",
    title: "Grok Bot alternative: Sidemates, free and open source on your Mac",
    h1: "An open-source alternative to Grok Bot",
    description: "Looking for an open-source alternative to Grok Bot? Sidemates is a free team of AI teammates on your own Mac, each with its own browser, with no cloud computer to rent. Compared honestly.",
    lede: "Grok Bot gives you named AI teammates that share one cloud computer. Sidemates gives you a team on your own Mac, for free.",
    what: "xAI's Grok Bot has been in beta since 11 August 2026. It gives you named AI teammates that share one managed cloud computer, with desktop and iOS apps. It is bundled with xAI plans that cost $120 to $300 a month.",
    rows: [
      ["Runs on", "A managed cloud computer shared by the teammates", "Your Mac, each teammate with its own browser and workspace"],
      ["Price", "Bundled with $120 to $300 a month plans", "Free and open source (MIT). You pay only for the AI you choose."],
      ["Your Mac's Mail, Calendar, Notes and files", "No", "Yes, in your own apps"],
      ["Teammates", "Yes, sharing one computer", "Yes, each isolated from the others"],
      ["Where you use it", "Desktop and iOS apps", "macOS; iPhone through a Home Screen app, Siri and the Share menu"],
      ["Works while your computer is off", "Yes", "No. It works while your Mac is on."],
      ["Source code", "Closed", "Open (MIT)"],
    ],
    chooseThem: ["want a managed, hosted team with a native iOS app", "already pay for the xAI plan that includes it", "need it to keep working while your computer is off"],
    chooseUs: ["don't want to rent a cloud computer or pay $120 or more a month", "want teammates that don't share one computer", "want them to work in your own Mac apps", "want free, open-source software"],
    faq: [
      ["Is there an open-source alternative to Grok Bot?", "Yes. Sidemates is a free, open-source team of AI teammates for your Mac. Another open-source option is OpenMausBot, which is aimed at developers and also runs on Windows and Linux."],
      ["How much does Sidemates cost compared with Grok Bot?", "Sidemates is free. Grok Bot is bundled with xAI plans that cost $120 to $300 a month. With Sidemates you pay only for the AI you connect, and free options exist."],
      ["Do Sidemates teammates share a computer?", "No. Each teammate has its own workspace and its own browser profile on your Mac. Browser profiles are separate profiles, not a security sandbox."],
    ],
    sources: [["xAI announcement", "https://x.ai/news/introducing-grok-bot"], ["Grok Bot overview", "https://www.digitalapplied.com/blog/grok-bot-ai-teammates-launch-cloud-computer-2026"]],
  },
  {
    slug: "siri-ai",
    name: "Siri AI",
    title: "Siri AI alternative and companion: Sidemates, open source on your Mac",
    h1: "Sidemates and Siri AI: use both, or choose",
    description: "Comparing Sidemates with Apple's Siri AI on macOS 27. Siri is built in for quick questions; Sidemates is a free, open-source team for longer jobs across your apps and the web. When to use each.",
    lede: "Siri AI is built into your Mac for quick questions and single actions. Sidemates is an open-source team for the whole job, and it works with Siri.",
    what: "Apple's rebuilt Siri arrived in beta with macOS 27 on 14 September 2026. It uses personal context from Mail, Messages, Notes, Photos and Calendar through Spotlight, understands what is on your screen, and can act inside apps. It runs on your Mac and on Apple's Private Cloud Compute. Reports describe a free beta with daily usage limits, English first, on Apple silicon, with paid access planned.",
    rows: [
      ["What it is", "A built-in assistant for quick questions and single actions", "A team for long, multi-step jobs across apps and websites"],
      ["Price", "Free beta with daily limits; paid access planned", "Free and open source (MIT). You pay only for the AI you connect."],
      ["Choice of AI", "Apple's own", "Your choice: ChatGPT, Claude, Grok, GitHub Copilot, Gemini, Nous Portal, OpenCode Go or a model on your Mac"],
      ["Long jobs on websites", "Not its focus", "Yes, each teammate in its own browser"],
      ["Scheduled work", "No", "Yes, routines such as a morning brief"],
      ["Source code", "Closed", "Open (MIT)"],
      ["Together", "Say \"Hey Siri, ask Sidemates\"", "Hands longer jobs from Siri to your team"],
    ],
    chooseThem: ["want help already built into your Mac for quick questions and in-app actions, with nothing to install", "are on macOS 27 on Apple silicon and like Apple's on-device privacy by default"],
    chooseUs: ["want longer jobs done across apps and websites, or on a schedule", "want a team of teammates instead of one assistant", "want to pick the AI and read the code", "don't want a paid tier later"],
    faq: [
      ["Does Sidemates replace Siri?", "No. Siri is good for quick questions and single actions. Sidemates is for longer jobs. You can say \"Hey Siri, ask Sidemates\" to hand a job to your team."],
      ["Is Siri AI free?", "Reports describe a free beta with daily usage limits and paid access planned. Sidemates is free, open-source software, and you pay only for the AI you connect."],
      ["Does Sidemates read my Mail and Calendar like Siri?", "Yes, on your own Mac. Teammates can read Apple Mail, Calendar, Reminders, Notes, Contacts and Messages, search folders you choose, and ask before they change anything."],
    ],
    sources: [["Apple Newsroom on Siri AI", "https://www.apple.com/newsroom/2026/09/siri-ai-a-profoundly-more-capable-and-personal-assistant-is-here/"], ["AppleInsider on limits and pricing", "https://appleinsider.com/articles/26/09/09/siri-ai-will-launch-in-beta-complicated-by-daily-usage-caps-future-paid-access"]],
  },
  {
    slug: "openmausbot",
    name: "OpenMausBot",
    title: "OpenMausBot alternative: Sidemates, simpler on a Mac",
    h1: "Sidemates and OpenMausBot compared",
    description: "OpenMausBot and Sidemates are both open-source teams of AI bots. OpenMausBot suits developers and runs everywhere; Sidemates is simpler on a Mac and works in your own Mail, Calendar and Notes. When to choose which.",
    lede: "OpenMausBot and Sidemates are both open-source teams of AI bots. OpenMausBot is far more widely used. Sidemates is the simpler one on a Mac.",
    what: "OpenMausBot (Apache-2.0, created 11 August 2026) calls itself an open-source alternative to Grok Bot. It is a chat app with a roster of bots, each with its own personality, model and tools, and it runs on the Claude, Codex and Grok command-line tools you already have installed. It works on macOS, Windows, Ubuntu, Android and iOS, with npm and Docker installs. A paid Pro plan adds an always-on cloud workspace.",
    rows: [
      ["Aimed at", "Developers who already use the Claude, Codex or Grok command-line tools", "Ordinary Mac users: one-line install, no command-line tools"],
      ["Where it runs", "macOS, Windows, Ubuntu, Android, iOS; npm and Docker", "macOS (Windows and Linux builds are not released yet)"],
      ["Your Mac's Mail, Calendar, Notes and files", "App connections and control of your computer; no local Mail, Calendar or Notes tools that we know of", "Yes: Mail, Calendar, Reminders, Notes, Contacts and Messages"],
      ["Price", "Free app; Pro from $49 a month (launch price) for the cloud workspace", "Free and open source (MIT). You pay only for the AI you connect."],
      ["License", "Apache-2.0, with a separately licensed enterprise folder", "MIT"],
      ["Community", "About 3,900 stars and 1,900 Discord members", "Very early: a handful of stars"],
    ],
    chooseThem: ["use Windows, Linux or want phone apps", "already work with the Claude, Codex or Grok command-line tools", "want a paid always-on cloud workspace", "want a large, active community around the project"],
    chooseUs: ["are on a Mac and want it to just work, without command-line tools", "want your team in your own Mail, Calendar, Notes and Messages", "don't want any paid tier", "like a simpler, calmer setup"],
    faq: [
      ["Is Sidemates an alternative to OpenMausBot?", "Yes, for Mac users who want a simpler setup. Both are open-source teams of AI bots. OpenMausBot is aimed at developers and runs on more platforms; Sidemates is aimed at ordinary Mac users and works in your own Mail, Calendar, Notes and Messages."],
      ["Which is better, Sidemates or OpenMausBot?", "It depends on you. OpenMausBot is the better pick on Windows or Linux, for phone apps, for command-line users and for a cloud workspace. Sidemates is the better pick on a Mac if you want a one-line install and your own Mac apps."],
      ["Does Sidemates have a paid plan?", "Not today. Sidemates is free, MIT-licensed software, and you pay only for the AI you connect."],
    ],
    sources: [["OpenMausBot on GitHub", "https://github.com/milind-soni/OpenMausBot"], ["OpenMausBot website", "https://www.openmausbot.com/"], ["OpenMausBot pricing", "https://www.openmausbot.com/pricing"]],
  },
];

const esc = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const jsonText = (value) => value; // JSON.stringify escapes quotes; text stays identical to the visible answer.

for (const page of PAGES) {
  const url = `https://sidemates.app/alternatives/${page.slug}/`;
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Article", headline: page.h1, description: page.description, dateModified: UPDATED_ISO, author: { "@type": "Organization", name: "Sidemates" }, mainEntityOfPage: url },
      { "@type": "FAQPage", mainEntity: page.faq.map(([question, answer]) => ({ "@type": "Question", name: jsonText(question), acceptedAnswer: { "@type": "Answer", text: jsonText(answer) } })) },
    ],
  };
  const table = `<div class="table"><table><thead><tr><th></th><th class="us">Sidemates</th><th>${esc(page.name)}</th></tr></thead><tbody>${page.rows
    .map(([label, them, us]) => `<tr><td>${esc(label)}</td><td data-label="Sidemates" class="us">${esc(us)}</td><td data-label="${esc(page.name)}">${esc(them)}</td></tr>`)
    .join("")}</tbody></table></div>`;
  const list = (items) => `<ul>${items.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>`;
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(page.title)}</title>
  <meta name="description" content="${esc(page.description).replace(/"/g, "&quot;")}" />
  <link rel="canonical" href="${url}" />
  <meta property="og:title" content="${esc(page.title).replace(/"/g, "&quot;")}" />
  <meta property="og:description" content="${esc(page.lede).replace(/"/g, "&quot;")}" />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="${url}" />
  <meta property="og:image" content="https://sidemates.app/social.png" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="icon" href="../../icon.svg" type="image/svg+xml" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@600;700;800;900&display=swap" rel="stylesheet" />
  <script type="application/ld+json">
${JSON.stringify(ld, null, 2)}
  </script>
  ${style}
  <style>.table table { min-width: 560px; }</style>
</head>
<body>
${brand}
<main>
  <h1>${esc(page.h1)}</h1>
  <p class="lede">${esc(page.lede)}</p>
  <p class="updated">Last updated ${UPDATED}. Details about ${esc(page.name)} come from its public pages (linked below) and can change. If something is out of date, <a href="https://github.com/PrisacariuRobert/sidemates/issues/new">tell us</a>. See the <a href="../">full comparison</a> with the other options.</p>

  <section id="what">
    <h2>What ${esc(page.name)} is</h2>
    <p>${esc(page.what)}</p>
  </section>

  <section id="comparison">
    <h2>Side by side</h2>
    ${table}
  </section>

  <section id="when">
    <h2>When to choose which</h2>
    <h3>Choose ${esc(page.name)} if you…</h3>
    ${list(page.chooseThem)}
    <h3>Choose Sidemates if you…</h3>
    ${list(page.chooseUs)}
  </section>

  <section id="try">
    <h2>Try Sidemates</h2>
    <p>On a Mac (macOS 13 or later), one line installs it. No administrator password, and the installer checks the download's fingerprint. <a href="https://github.com/PrisacariuRobert/sidemates/blob/main/scripts/install.sh">Read the installer</a> first if you like.</p>
    <code class="cmd">${install}</code>
    <p>Then connect an AI (a free Gemini key is enough to start) and make your first teammate, or <a href="../../teammates/">add a ready-made one from the gallery</a>. Source code and docs: <a href="https://github.com/PrisacariuRobert/sidemates">github.com/PrisacariuRobert/sidemates</a>.</p>
  </section>

  <section id="faq">
    <h2>Questions</h2>
    ${page.faq.map(([question, answer], index) => `<details${index === 0 ? " open" : ""}><summary>${esc(question)}</summary><p>${esc(answer)}</p></details>`).join("\n    ")}
  </section>

  <section id="sources">
    <h2>Sources</h2>
    <ul class="sources">${page.sources.map(([label, href]) => `<li><a href="${href}">${esc(label)}</a></li>`).join("")}<li><a href="https://github.com/PrisacariuRobert/sidemates">Sidemates source code</a>, <a href="https://github.com/PrisacariuRobert/sidemates/blob/main/CHANGELOG.md">changelog</a></li></ul>
  </section>
</main>
<footer>Sidemates — free, open-source AI teammates for your Mac. This website counts visits with Cloudflare Web Analytics (no cookies, no personal data). <a href="../../">Home</a> · <a href="../">All comparisons</a> · <a href="../../teammates/">Teammate gallery</a> · <a href="https://github.com/PrisacariuRobert/sidemates">GitHub</a></footer>
</body>
</html>
`;
  const dir = path.join(root, "site/alternatives", page.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "index.html"), html);
  console.log(`wrote site/alternatives/${page.slug}/index.html`);
}

export const slugs = PAGES.map((page) => page.slug);

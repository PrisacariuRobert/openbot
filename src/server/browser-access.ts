import type { Bot, ConnectorServiceId } from "../shared/types.js";
import type { OpenBotDatabase } from "./database.js";
import { googleServiceCapabilities } from "./google-workspace.js";

const services: {
  service: ConnectorServiceId;
  connector: string;
  label: string;
  url: string;
  hosts: string[];
}[] = [
  {
    service: "gmail",
    connector: "google-workspace",
    label: "Gmail",
    url: "https://mail.google.com/",
    hosts: ["mail.google.com", "gmail.com"],
  },
  {
    service: "google-calendar",
    connector: "google-workspace",
    label: "Google Calendar",
    url: "https://calendar.google.com/",
    hosts: ["calendar.google.com"],
  },
  {
    service: "google-drive",
    connector: "google-workspace",
    label: "Google Drive",
    url: "https://drive.google.com/",
    hosts: ["drive.google.com", "docs.google.com"],
  },
  {
    service: "github",
    connector: "github-cli",
    label: "GitHub",
    url: "https://github.com/",
    hosts: ["github.com", "githubusercontent.com"],
  },
  {
    service: "slack",
    connector: "slack",
    label: "Slack",
    url: "https://app.slack.com/",
    hosts: ["slack.com"],
  },
  {
    service: "notion",
    connector: "notion",
    label: "Notion",
    url: "https://www.notion.so/",
    hosts: ["notion.so", "notion.site"],
  },
  {
    service: "todoist",
    connector: "todoist",
    label: "Todoist",
    url: "https://app.todoist.com/",
    hosts: ["todoist.com"],
  },
  {
    service: "dropbox",
    connector: "dropbox",
    label: "Dropbox",
    url: "https://www.dropbox.com/",
    hosts: ["dropbox.com", "dropboxusercontent.com"],
  },
];

export function browserServiceForUrl(rawUrl: string) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  // Legacy Google application URLs still lead into these services.
  if (
    ["google.com", "www.google.com"].includes(host) &&
    /^\/calendar(?:\/|$)/.test(url.pathname)
  )
    return services.find((entry) => entry.service === "google-calendar")!;
  return (
    services.find((entry) =>
      entry.hosts.some(
        (domain) => host === domain || host.endsWith(`.${domain}`),
      ),
    ) || null
  );
}

export function browserWebsiteBlock(
  db: OpenBotDatabase,
  botId: string,
  rawUrl: string,
): string | null {
  const service = browserServiceForUrl(rawUrl);
  if (!service) return null;
  const access = db.getBotConnectorAccess(
    botId,
    service.service,
    service.connector,
  );
  if (access && !access.canRead)
    return `${service.label} reading is turned off for this teammate. Do not use its website or another route to bypass that choice. Ask the owner to review the teammate’s access.`;
  return null;
}

export function browserNavigationBlock(
  db: OpenBotDatabase,
  botId: string,
  urls: string[],
): string | null {
  for (const url of urls) {
    const reason = browserWebsiteBlock(db, botId, url);
    if (reason) return reason;
  }
  return null;
}

export function browserAccessStatus(
  db: OpenBotDatabase,
  bot: Bot,
  runtimeAvailable?: boolean,
) {
  const errors = new Set<string>(
    db.listConnectorServiceErrors().map((error) => error.service),
  );
  const routes = services.map((entry) => {
    const connection = db.getConnector(entry.connector);
    const access = db.getBotConnectorAccess(
      bot.id,
      entry.service,
      entry.connector,
    );
    const readDenied = Boolean(access && !access.canRead);
    const google =
      entry.connector === "google-workspace"
        ? googleServiceCapabilities(
            Boolean(connection?.connected),
            connection?.scopes || [],
          )
        : null;
    const scopeReady = google
      ? google[entry.service as "gmail" | "google-drive" | "google-calendar"]
          .read
      : Boolean(connection?.connected);
    const connectorState = readDenied
      ? "read-denied"
      : !connection?.connected
        ? "not-connected"
        : !access?.canRead
          ? "not-shared"
          : !scopeReady || errors.has(entry.service)
            ? "needs-attention"
            : "ready";
    const browserState = readDenied
      ? "read-denied"
      : !bot.browserEnabled
        ? "off"
        : runtimeAvailable === false
          ? "unavailable"
          : "available-unverified";
    return {
      service: entry.service,
      label: entry.label,
      url: entry.url,
      connectorState,
      browserState,
      preferred:
        connectorState === "ready"
          ? "connector"
          : browserState === "available-unverified"
            ? "browser"
            : "none",
    };
  });
  return {
    botId: bot.id,
    browserEnabled: bot.browserEnabled,
    runtimeAvailable: runtimeAvailable ?? null,
    profileScope: "teammate" as const,
    loginState: "unverified" as const,
    services: routes,
    detail:
      "Sign in yourself in this teammate’s browser. Its own profile can retain the session between tasks, but websites can expire it or request verification. Browser sign-in does not connect an API or share a login with another teammate.",
  };
}

/** Short authoritative routing injected into every model turn, not just a workspace file. */
export function browserTaskDirection(db: OpenBotDatabase, bot: Bot) {
  const routes = browserAccessStatus(db, bot).services;
  const alternatives = routes.filter(route => route.preferred === 'browser');
  const denied = routes.filter(route => route.browserState === 'read-denied');
  return [
    bot.browserEnabled ? 'Use your existing private browser for requested work when its connector is unavailable or does not support the needed operation. Do not ask whether to try an already-permitted read-only route; inspect it and continue the task.' : 'Browser access is off. Do not enable it yourself or assume a saved sign-in gives access.',
    alternatives.length ? `Permitted browser alternatives (login still needs verification): ${alternatives.map(route => `${route.label}: ${route.url}`).join('; ')}.` : '',
    denied.length ? `Explicitly denied services: ${denied.map(route => route.label).join(', ')}. Never bypass these restrictions through a website, Mac app or another teammate.` : '',
    bot.browserEnabled ? 'Gmail, Calendar and Drive may share a Google sign-in inside this same persistent profile. Open the needed service and verify the displayed account; do not assume /u/0 is the intended account or copy credentials. If signed in correctly, continue without another setup question. Request private sign-in only if the service actually requires it. Existing action approvals still apply.' : '',
    'For work spanning email and calendar, track both outcomes. If the message claims an event exists, create and verify the approved event first, then propose the message using that evidence. Never substitute the user’s intention for a completed event. A sent copy or sending API response proves neither recipient delivery nor reading. If one part fails, report what completed and what remains; never resend a completed message simply to finish the other part.',
  ].filter(Boolean).join('\n');
}

export function browserAccessText(db: OpenBotDatabase, bot: Bot) {
  const status = browserAccessStatus(db, bot);
  const lines = status.services.map((route) => {
    if (route.connectorState === "ready")
      return `- ${route.label}: use the authorized structured connector first for supported operations.`;
    if (route.browserState === "read-denied")
      return `- ${route.label}: reading was explicitly turned off. Do not bypass this using the website, Mac apps, another account, or another teammate.`;
    if (route.browserState === "available-unverified")
      return `- ${route.label}: the structured connector is ${route.connectorState}; your browser is an alternative for the user's requested task (${route.url}). Inspect the current page. Login and account identity are unverified, not "connected".`;
    return `- ${route.label}: the structured connector is ${route.connectorState} and your browser is off. Ask the owner to share a connector or enable browser access; do not enable either yourself.`;
  });
  return `${lines.join("\n")}\n\nUse only your own persistent browser profile. Never extract cookies, tokens, passwords, passkeys, or another browser/profile's credentials, and never copy a login to another teammate. For login, expired sessions, 2FA, CAPTCHA or identity verification on any website (not just connected apps), call browser_request_sign_in on the current page. It saves the task, notifies the owner and pauses browser work for private owner takeover. Do not merely tell them to connect an API, claim there is no access, or handle credentials yourself; never request secrets in chat or work around a site's check. Once the owner finishes, inspect the page and account before continuing. A successful sign-in is not permanent access or permission for every task. External writes still require their normal approval and must not bypass a denied action. Name browser-derived sources honestly, with their URLs; do not pretend they came from a connector or an exhaustive inbox/calendar snapshot.`;
}

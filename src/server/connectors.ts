import type { ConnectorCatalogEntry, ConnectorManifest, ConnectorServiceId } from "../shared/types.js";

export const CONNECTOR_MANIFESTS: readonly ConnectorManifest[] = [
  {
    schemaVersion: 2, connectorId: "google-workspace", service: "gmail", name: "Gmail",
    description: "Search and read mail, then send only after your approval.", auth: "oauth",
    readCapability: "Search and read messages", writeCapability: "Send plain-text email", writeRequiresApproval: true, eventCapability: null, eventAuth: null,
    dataBoundary: "Only bounded message fields enter a teammate task; OAuth tokens never do.", docsUrl: "https://developers.google.com/gmail/api",
  },
  {
    schemaVersion: 2, connectorId: "google-workspace", service: "google-drive", name: "Google Drive",
    description: "Find documents and bring current project context into a conversation.", auth: "oauth",
    readCapability: "Search and read supported documents", writeCapability: null, writeRequiresApproval: false, eventCapability: null, eventAuth: null,
    dataBoundary: "Search results and supported text exports are bounded before model use.", docsUrl: "https://developers.google.com/drive/api",
  },
  {
    schemaVersion: 2, connectorId: "google-workspace", service: "google-calendar", name: "Google Calendar",
    description: "Check upcoming events and use them as automation triggers.", auth: "oauth",
    readCapability: "Read the primary calendar", writeCapability: null, writeRequiresApproval: false, eventCapability: "Start work before matching events", eventAuth: "cursor",
    dataBoundary: "Only bounded event summaries from the connected primary calendar are exposed.", docsUrl: "https://developers.google.com/calendar/api",
  },
  {
    schemaVersion: 2, connectorId: "github-cli", service: "github", name: "GitHub",
    description: "Follow notifications and issues, then create issues only after approval.", auth: "local_cli",
    readCapability: "Read notifications and search issues", writeCapability: "Create issues", writeRequiresApproval: true, eventCapability: "Start work from GitHub webhooks", eventAuth: "signed_secret",
    dataBoundary: "OpenBot uses the official CLI account and returns bounded repository activity.", docsUrl: "https://cli.github.com/manual/",
  },
  {
    schemaVersion: 2, connectorId: "slack", service: "slack", name: "Slack",
    description: "Search conversations, read context, and post a reviewed reply.", auth: "oauth",
    readCapability: "Search messages and read conversation context", writeCapability: "Post a message or thread reply", writeRequiresApproval: true, eventCapability: "Start work from subscribed Slack activity", eventAuth: "provider_hmac",
    dataBoundary: "The OAuth grant controls visible Slack content; OpenBot returns bounded normalized messages.", docsUrl: "https://docs.slack.dev/authentication/installing-with-oauth/",
  },
  {
    schemaVersion: 2, connectorId: "notion", service: "notion", name: "Notion",
    description: "Search shared pages, read their content, and add reviewed notes.", auth: "oauth",
    readCapability: "Search and read explicitly shared pages", writeCapability: "Append reviewed page content", writeRequiresApproval: true, eventCapability: "Start work from page, database, and comment changes", eventAuth: "provider_hmac",
    dataBoundary: "Notion's page picker limits the connection; block content is flattened and bounded.", docsUrl: "https://developers.notion.com/guides/get-started/authorization",
  },
  {
    schemaVersion: 2, connectorId: "todoist", service: "todoist", name: "Todoist",
    description: "See what is due and create a task only after you approve it.", auth: "oauth",
    readCapability: "Read active tasks", writeCapability: "Create tasks", writeRequiresApproval: true, eventCapability: "Start work from task activity", eventAuth: "cursor",
    dataBoundary: "Only bounded task fields enter a teammate task; OAuth credentials never do.", docsUrl: "https://developer.todoist.com/api/v1/",
  },
  {
    schemaVersion: 2, connectorId: "dropbox", service: "dropbox", name: "Dropbox",
    description: "Find cloud files and bring safe, bounded text into the conversation.", auth: "oauth",
    readCapability: "Search and read supported text files", writeCapability: null, writeRequiresApproval: false, eventCapability: "Start work from file changes", eventAuth: "cursor",
    dataBoundary: "Search metadata and supported text are bounded before model use; OpenBot never changes Dropbox files.", docsUrl: "https://developers.dropbox.com/oauth-guide",
  },
] as const;

export function connectorManifest(service: ConnectorServiceId): ConnectorManifest {
  const manifest = CONNECTOR_MANIFESTS.find((item) => item.service === service);
  if (!manifest) throw new Error(`No connector manifest is registered for ${service}.`);
  return manifest;
}

export function manifestCatalogEntry(service: ConnectorServiceId, connected: boolean, badge: string, capabilities?: string[]): ConnectorCatalogEntry {
  const manifest = connectorManifest(service);
  return {
    id: service, connectorId: manifest.connectorId, manifestVersion: manifest.schemaVersion, name: manifest.name,
    description: manifest.description, badge, availability: "live", connected, writeRequiresApproval: manifest.writeRequiresApproval,
    capabilities: capabilities || [manifest.readCapability, ...(manifest.writeCapability ? [manifest.writeCapability] : [])],
  };
}

export function validateConnectorManifests(manifests: readonly ConnectorManifest[] = CONNECTOR_MANIFESTS): string[] {
  const errors: string[] = [], services = new Set<string>();
  for (const manifest of manifests) {
    if (manifest.schemaVersion !== 2) errors.push(`${manifest.service} uses an unsupported manifest version.`);
    if (services.has(manifest.service)) errors.push(`${manifest.service} is registered more than once.`);
    services.add(manifest.service);
    if (manifest.writeCapability && !manifest.writeRequiresApproval) errors.push(`${manifest.service} exposes writing without approval.`);
    if (manifest.eventCapability && !manifest.eventAuth) errors.push(`${manifest.service} exposes events without an authenticity contract.`);
    if (!/^https:\/\//.test(manifest.docsUrl)) errors.push(`${manifest.service} needs an HTTPS documentation link.`);
  }
  return errors;
}

export function friendlyConnectorError(service: "slack" | "notion" | "todoist" | "dropbox", value: unknown): string {
  const raw = value instanceof Error ? value.message : String(value || ""), lower = raw.toLowerCase();
  const names = { slack: "Slack", notion: "Notion", todoist: "Todoist", dropbox: "Dropbox" } as const;
  const name = names[service];
  if (/expired|invalid_auth|token_revoked|unauthorized/.test(lower)) return `${name} needs a quick reconnect. Open Apps & Tools and connect it again.`;
  if (/invalid_client|client[_ ]secret|client[_ ]id/.test(lower)) return `${name} did not accept these app details. Check the client ID and secret, then try again.`;
  if (service === "slack" && /missing_scope|permission/.test(lower)) return "Slack needs one more permission for that action. Update the app permissions, then reconnect Slack.";
  if (service === "slack" && /not_in_channel|channel_not_found|is_archived/.test(lower)) return "OpenBot cannot use that Slack conversation yet. Add the Slack app to the channel or choose another conversation.";
  if (service === "notion" && /object_not_found|not[_ ]shared|could not open/.test(lower)) return "OpenBot cannot see that Notion page. Share the page with the integration, then try again.";
  if (service === "todoist" && /forbidden|scope|permission/.test(lower)) return "Todoist needs permission to use tasks. Reconnect it and allow the requested access.";
  if (service === "dropbox" && /path\/not_found|not[_ ]found|unsupported/.test(lower)) return "OpenBot cannot read that Dropbox file. Choose a supported text file returned by search.";
  const retry = raw.match(/try again in\s+(\d+)\s+seconds?/i);
  if (/rate[_ ]limited|too many requests|slow down/.test(lower) || retry) return `${name} is temporarily busy.${retry ? ` Try again in ${retry[1]} seconds.` : " Try again shortly."}`;
  if (/sign-in failed|oauth|authorization/.test(lower)) return `${name} could not finish sign-in. Return to Apps & Tools and try connecting again.`;
  return `${name} could not finish that request. Check the connection in Apps & Tools, then try again.`;
}

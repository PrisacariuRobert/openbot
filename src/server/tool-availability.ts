import type { Bot, ConnectorServiceId } from "../shared/types.js";
import type { OpenBotDatabase } from "./database.js";
import { connectorCatalog } from "./google-workspace.js";

// Context reduction only. The tool endpoints remain the authorization boundary
// and recheck grants when a call arrives, including after session revocation.
export function toolAvailability(
  db: OpenBotDatabase,
  bot: Bot,
): Record<string, boolean> {
  const flags: Record<string, boolean> = {
    bash: bot.computerEnabled,
    isolated_bash: bot.computerEnabled,
  };
  const set = (names: string[], available: boolean) => {
    for (const name of names) flags[name] = available;
  };
  set(
    ["browser_open", "browser_snapshot", "browser_click", "browser_type"],
    bot.browserEnabled,
  );
  set(
    [
      "mac_list",
      "mac_read",
      "mac_organize",
      "mac_apps_list",
      "mac_app_inspect",
      "mac_app_open",
      "mac_app_click",
      "mac_app_type",
      "mac_app_key",
      "mac_app_scroll",
    ],
    db.getStudioSettings().macAccessEnabled,
  );
  const apps: {
    id: string;
    service: ConnectorServiceId;
    read: string[];
    write: string[];
  }[] = [
    {
      id: "google-workspace",
      service: "gmail",
      read: ["gmail_search", "gmail_read"],
      write: ["gmail_send"],
    },
    {
      id: "google-workspace",
      service: "google-drive",
      read: ["google_drive_search", "google_drive_read"],
      write: ["google_drive_create"],
    },
    {
      id: "google-workspace",
      service: "google-calendar",
      read: ["google_calendar_agenda"],
      write: ["google_calendar_create"],
    },
    {
      id: "github-cli",
      service: "github",
      read: ["github_notifications", "github_issues"],
      write: ["github_issue_create"],
    },
    {
      id: "slack",
      service: "slack",
      read: ["slack_search", "slack_read"],
      write: ["slack_post"],
    },
    {
      id: "notion",
      service: "notion",
      read: ["notion_search", "notion_read"],
      write: ["notion_update"],
    },
    {
      id: "todoist",
      service: "todoist",
      read: ["todoist_tasks"],
      write: ["todoist_task_create"],
    },
    {
      id: "dropbox",
      service: "dropbox",
      read: ["dropbox_search", "dropbox_read"],
      write: [],
    },
  ];
  const googleConnection = db.getConnector("google-workspace");
  const googleCatalog = connectorCatalog(Boolean(googleConnection?.connected), googleConnection?.scopes || []);
  for (const app of apps) {
    const access = db.getBotConnectorAccess(bot.id, app.service, app.id);
    const google = app.id === "google-workspace" ? googleCatalog.find((entry) => entry.id === app.service) : undefined;
    const readConnected = google ? google.connected : Boolean(db.getConnector(app.id)?.connected);
    const writeConnected = google ? google.writeConnected === true : readConnected;
    set(app.read, readConnected && Boolean(access?.canRead));
    set(app.write, writeConnected && Boolean(access?.canSend));
  }
  set(["work_collect", "work_report"], Boolean(flags.gmail_read || flags.google_calendar_agenda));
  const projects = db.listCodeProjects(bot.id);
  set(
    ["code_list", "code_search", "code_read", "code_status", "code_diff"],
    projects.length > 0,
  );
  set(
    [
      "code_write",
      "code_replace",
      "code_branch",
      "code_commit",
      "code_request_review",
      "code_publish_pr",
    ],
    projects.some((project) =>
      project.access.some(
        (access) => access.botId === bot.id && access.canWrite,
      ),
    ),
  );
  set(
    ["code_run"],
    projects.some((project) =>
      project.access.some((access) => access.botId === bot.id && access.canRun),
    ),
  );
  return flags;
}

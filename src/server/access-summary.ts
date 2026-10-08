import type { Bot } from "../shared/types.js";
import type { OpenBotDatabase } from "./database.js";
import { browserAccessStatus, browserServiceLines, browserTaskDirection } from "./browser-access.js";
import { fragment } from "./prompt-files.js";
import { connectedAppsText } from "./workspace.js";

/** What a teammate can reach for this task: connected apps, website access and
 * browser directions, sent with each request (task A7). With nothing connected
 * and the browser off, one line says so instead of three blocks of "not available". */
export function accessForTask(db: OpenBotDatabase, bot: Bot): string {
  const apps = connectedAppsText(db, bot);
  const services = browserAccessStatus(db, bot).services;
  const nothingReachable = !bot.browserEnabled
    && !/available now|needs its Google API switch/.test(apps)
    && services.every((route) => route.connectorState !== "ready" && route.browserState !== "read-denied" && route.browserState !== "available-unverified");
  if (nothingReachable) return fragment("request", "access-none");
  return [apps, browserServiceLines(db, bot), browserTaskDirection(db, bot), fragment("request", "access-use")].filter(Boolean).join("\n\n");
}

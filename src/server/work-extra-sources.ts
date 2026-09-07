import type { WorkCoverage, WorkSource } from "../shared/work-reports.js";
import type { WorkApp, WorkSourceChoices, WorkSourceSelection } from "../shared/work-sources.js";
import type { OpenBotDatabase } from "./database.js";
import type { SlackConnector } from "./slack.js";
import type { NotionConnector } from "./notion.js";
import type { TodoistConnector } from "./todoist.js";

export function safeWorkLink(value: string, domains: string[]): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && !/[<>\r\n]/.test(value) && domains.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`)) ? url.href : null;
  } catch { return null; }
}

export class WorkExtraSources {
  constructor(private readonly db: OpenBotDatabase, private readonly slack: Pick<SlackConnector, "workChannels" | "workMessages">, private readonly notion: Pick<NotionConnector, "search" | "read">, private readonly todoist: Pick<TodoistConnector, "workProjects" | "workTasks">) {}

  async choices(service: WorkApp, query = ""): Promise<WorkSourceChoices> {
    if (!this.db.getConnector(service)?.connected) throw new Error(`Connect ${service} in Apps & Tools first.`);
    if (service === "slack") return this.slack.workChannels();
    if (service === "todoist") return this.todoist.workProjects();
    const pages = await this.notion.search(query, 20);
    return { choices: pages.map((page) => ({ service, id: page.id, label: page.title })), limited: true };
  }

  async collect(selection: WorkSourceSelection, index: number, from: string, until: string, signal: AbortSignal): Promise<{ coverage: WorkCoverage; sources: WorkSource[] }> {
    const { service, id, label } = selection;
    const account = this.db.getConnector(service)?.accountEmail || "Account name unavailable";
    const sources: WorkSource[] = [];
    if (service === "slack") {
      const result = await this.slack.workMessages(id, from, until, signal);
      const team = this.db.oauthConnectorCredentials("slack")?.credentials?.teamId;
      const seen = new Set<string>();
      for (const message of result.messages) {
        const time = Number(message.timestamp) * 1000;
        if (seen.has(message.timestamp) || message.channelId !== id || !Number.isFinite(time) || time < Date.parse(from) || time > Date.parse(until)) continue;
        seen.add(message.timestamp);
        sources.push({ ref: `S${index + 1}_${sources.length + 1}`, service, sourceId: `${id}/${message.timestamp}`, scope: label, title: `${label} · ${message.author}`, from: message.author, date: new Date(time).toISOString(), text: message.text.slice(0, 2000), truncated: true,
          url: safeWorkLink(message.permalink || (typeof team === "string" ? `https://app.slack.com/client/${encodeURIComponent(team)}/${encodeURIComponent(id)}?message_ts=${encodeURIComponent(message.timestamp)}` : ""), ["slack.com"]) });
      }
      return { sources, coverage: { service, account, state: "limited", count: sources.length, detail: `${label}: ${sources.length} recent top-level messages (${from} to ${until}). Thread replies, files and attachments were not read; this is not the whole conversation.${result.hasMore ? " More messages exist; only the first 15 were requested." : ""}${result.omitted || sources.length !== result.messages.length ? " Some entries were unreadable or outside the selected scope." : ""}` } };
    }
    if (service === "notion") {
      const page = await this.notion.read(id, signal);
      if (page.id.replaceAll("-", "").toLowerCase() !== id.replaceAll("-", "").toLowerCase()) throw new Error("Notion returned a different page.");
      sources.push({ ref: `N${index + 1}`, service, sourceId: page.id, scope: label, title: page.title, date: page.lastEditedAt, text: page.content.slice(0, 12000), truncated: page.truncated || page.content.length > 12000, url: safeWorkLink(page.url, ["notion.so", "notion.site"]) });
      return { sources, coverage: { service, account, state: "limited", count: 1, detail: `${label}: current page text, last edited ${page.lastEditedAt || "at an unknown time"}. Not an edit history or a check of the whole workspace; comments, linked pages and database contents were not read.${sources[0].truncated ? " Some content was shortened or unsupported." : ""}` } };
    }
    const result = await this.todoist.workTasks(id, signal);
    const tasks = [...new Map(result.tasks.filter((task) => task.projectId === id && !task.completed).map((task) => [task.id, task])).values()].slice(0, 20);
    for (const task of tasks) sources.push({ ref: `T${index + 1}_${sources.length + 1}`, service, sourceId: task.id, scope: label, title: task.content, date: task.due || undefined,
      text: `${task.description}\nDue: ${task.due || "No due date"}\nTodoist priority: ${task.priority} (4 is highest)`, truncated: task.description.length >= 2000 || task.content.length >= 500, url: safeWorkLink(task.url, ["todoist.com"]) });
    return { sources, coverage: { service, account, state: "limited", count: sources.length, detail: `${label}: ${sources.length} currently open tasks. Completed tasks, comments and activity history were not read; this is not a historical weekly completion report.${result.hasMore ? " More tasks exist; only the first 20 were read." : ""}${result.omitted ? " Some entries were omitted." : ""}` } };
  }
}

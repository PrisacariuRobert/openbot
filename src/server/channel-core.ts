import type { OpenBotDatabase } from "./database.js";

/** What every owner chat channel (Telegram, Discord, …) shares once a
 * message is known to come from the paired owner: commands, teammate
 * routing, starting the task through the studio's own message API, and
 * delivering the final reply and approval notices back to the chat. */

export type LocalApi = (method: "POST", apiPath: string, body: unknown) => Promise<{ status: number; body: Record<string, unknown> }>;

export interface ChannelHost {
  db: OpenBotDatabase;
  localApi: LocalApi;
  appUrl: string;
  isLeader: () => boolean;
}

export interface ChannelTransport {
  send(chatId: string, text: string): Promise<void>;
  typing?(chatId: string): Promise<void>;
}

interface TrackedRun { runId: string; chatId: string; notifiedApprovalIds: string[] }

const RECORD = "channel";

export class ChannelConversation {
  constructor(
    private readonly host: ChannelHost,
    private readonly channel: string,
    private readonly transport: ChannelTransport,
    private readonly defaults: { get: () => string | undefined; set: (botId: string | null) => void },
  ) {}

  private tracked() {
    return (this.host.db.extensionRecord<TrackedRun[]>(RECORD, `${this.channel}-runs`) || []).map((item) => ({ ...item, chatId: String(item.chatId) }));
  }
  private saveTracked(runs: TrackedRun[]) { this.host.db.saveExtensionRecord(RECORD, `${this.channel}-runs`, runs.slice(-200)); }
  clearTracked() { this.saveTracked([]); }

  teammates() { return this.host.db.listBots().filter((bot) => !bot.retiredAt); }

  defaultTeammate() {
    const teammates = this.teammates();
    return teammates.find((bot) => bot.id === this.defaults.get()) || teammates[0] || null;
  }

  findTeammate(name: string) {
    const wanted = name.trim().toLowerCase();
    return this.teammates().find((bot) => bot.name.toLowerCase() === wanted || bot.id.toLowerCase() === wanted) || null;
  }

  greeting() {
    return `Connected to OpenBot. Message me and ${this.defaultTeammate()?.name || "your teammate"} will help. Start with @Name to ask another teammate; /who lists them.`;
  }

  /** A message the channel has already verified comes from the paired owner. */
  async handleOwnerText(chatId: string, text: string, requestId: string) {
    const trimmed = text.trim();
    if (trimmed === "/start" || trimmed === "/help") {
      await this.transport.send(chatId, `Message me and ${this.defaultTeammate()?.name || "your teammate"} will take care of it. Start with @Name to ask another teammate. /who lists teammates; /use Name changes who answers by default. Approvals are reviewed in OpenBot.`);
      return;
    }
    if (trimmed === "/who") {
      const current = this.defaultTeammate();
      await this.transport.send(chatId, this.teammates().map((bot) => `${bot.id === current?.id ? "• " : "  "}${bot.name} — ${bot.role}`).join("\n") || "No teammates yet.");
      return;
    }
    const use = /^\/use\s+(.+)$/i.exec(trimmed);
    if (use) {
      const bot = this.findTeammate(use[1]!);
      if (!bot) { await this.transport.send(chatId, `I couldn't find a teammate called ${use[1]}. /who lists them.`); return; }
      this.defaults.set(bot.id);
      await this.transport.send(chatId, `${bot.name} will answer by default.`);
      return;
    }
    const mention = /^@([\p{L}\p{N}_.-]+)[,:]?\s+([\s\S]+)$/u.exec(trimmed);
    const named = mention ? this.findTeammate(mention[1]!) : null;
    const bot = named || this.defaultTeammate();
    const body = named ? mention![2]!.trim() : trimmed;
    if (!bot) { await this.transport.send(chatId, "There are no teammates in your studio yet. Create one in OpenBot first."); return; }
    const result = await this.host.localApi("POST", "/api/messages", {
      threadId: bot.threadId, body, targetBotIds: [bot.id], requestId,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    if (result.status >= 400) {
      await this.transport.send(chatId, `OpenBot couldn't start that: ${String(result.body.error || "please try again in the studio.")}`);
      return;
    }
    const runs = Array.isArray(result.body.runs) ? result.body.runs as Array<{ id?: string }> : [];
    const tracked = this.tracked();
    for (const run of runs) if (run.id && !tracked.some((item) => item.runId === run.id)) tracked.push({ runId: run.id, chatId, notifiedApprovalIds: [] });
    this.saveTracked(tracked);
    await this.transport.typing?.(chatId).catch(() => {});
  }

  /** Send final replies and approval notices for tasks started here. */
  async deliver() {
    if (!this.host.isLeader()) return;
    const tracked = this.tracked();
    if (!tracked.length) return;
    const remaining: TrackedRun[] = [];
    for (const item of tracked) {
      const run = this.host.db.getRun(item.runId);
      if (!run) continue;
      if (run.status === "awaiting_approval" && run.approvalId && !item.notifiedApprovalIds.includes(run.approvalId)) {
        const approval = this.host.db.getApproval(run.approvalId);
        await this.transport.send(item.chatId, `${run.botName} needs your okay: ${approval?.actionLabel || "an action"}.\nReview it in OpenBot: ${this.host.appUrl.replace(/\/$/, "")}/?thread=${encodeURIComponent(run.threadId)}`);
        item.notifiedApprovalIds.push(run.approvalId);
      }
      if (["completed", "failed", "cancelled"].includes(run.status)) {
        const reply = this.host.db.listMessages(run.threadId).filter((message) => message.runId === run.id && message.senderType === "bot" && message.kind === "text").at(-1);
        const text = run.status === "completed"
          ? reply?.body || run.summary || `${run.botName} finished.`
          : run.status === "cancelled" ? `${run.botName} stopped this task.` : `${run.botName} couldn't finish: ${run.error || "open OpenBot to see what happened."}`;
        await this.transport.send(item.chatId, text);
        continue;
      }
      remaining.push(item);
    }
    this.saveTracked(remaining);
  }
}

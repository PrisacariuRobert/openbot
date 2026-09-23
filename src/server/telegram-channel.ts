import { randomInt } from "node:crypto";
import type { OpenBotDatabase } from "./database.js";

/** Owner-only Telegram channel: the owner talks to their teammates from
 * Telegram, and replies and approval notices come back there.
 *
 * - Long polling (getUpdates), so no public URL or webhook is needed.
 * - One owner: a private chat paired with a one-time code shown in the
 *   studio. Every other chat or sender is ignored.
 * - Messages enter through the normal local message API, so admission,
 *   budgets, approvals and replay protection are the studio's own; the
 *   Telegram update id is the request id, so a redelivered update never
 *   starts a second task.
 * - Approvals are never granted from chat: the owner gets a notice and a
 *   link to the exact review in the studio.
 * - The bot token is stored in the encrypted extension store. */

const RECORD = "channel";
const CONFIG_ID = "telegram";
const TRACKED_ID = "telegram-runs";
const PAIRING_MINUTES = 15;
const TELEGRAM_TEXT_LIMIT = 4000;

export interface TelegramConfig {
  token: string;
  botUsername: string;
  ownerUserId?: number;
  ownerChatId?: number;
  ownerName?: string;
  defaultBotId?: string;
  pairing?: { code: string; expiresAt: number } | null;
  offset?: number;
  connectedAt?: string;
}

export interface TelegramStatus {
  configured: boolean;
  botUsername: string | null;
  paired: boolean;
  ownerName: string | null;
  pairingCode: string | null;
  pairingExpiresAt: string | null;
  defaultBotId: string | null;
  lastError: string | null;
}

interface TrackedRun { runId: string; chatId: number; notifiedApprovalIds: string[] }

interface TelegramUpdate {
  update_id: number;
  message?: { message_id: number; text?: string; chat: { id: number; type: string }; from?: { id: number; is_bot?: boolean; first_name?: string; username?: string } };
}

type LocalApi = (method: "POST", apiPath: string, body: unknown) => Promise<{ status: number; body: Record<string, unknown> }>;

export class TelegramChannel {
  private polling = false;
  private stopped = true;
  private lastError: string | null = null;
  private deliverTimer: NodeJS.Timeout | null = null;
  private abort: AbortController | null = null;

  constructor(private readonly options: {
    db: OpenBotDatabase;
    localApi: LocalApi;
    appUrl: string;
    isLeader: () => boolean;
    apiBase?: string;
    fetchImpl?: typeof fetch;
    now?: () => number;
    pollTimeoutSeconds?: number;
  }) {}

  private get apiBase() { return (this.options.apiBase || process.env.OPENBOT_TELEGRAM_API_BASE || "https://api.telegram.org").replace(/\/$/, ""); }
  private now() { return (this.options.now || Date.now)(); }
  private config() { return this.options.db.extensionRecord<TelegramConfig>(RECORD, CONFIG_ID); }
  private saveConfig(config: TelegramConfig) { this.options.db.saveExtensionRecord(RECORD, CONFIG_ID, config); }
  private tracked() { return this.options.db.extensionRecord<TrackedRun[]>(RECORD, TRACKED_ID) || []; }
  private saveTracked(runs: TrackedRun[]) { this.options.db.saveExtensionRecord(RECORD, TRACKED_ID, runs.slice(-200)); }

  status(): TelegramStatus {
    const config = this.config();
    const pairing = config?.pairing && config.pairing.expiresAt > this.now() ? config.pairing : null;
    return {
      configured: Boolean(config?.token),
      botUsername: config?.botUsername || null,
      paired: Boolean(config?.ownerChatId),
      ownerName: config?.ownerName || null,
      pairingCode: pairing?.code || null,
      pairingExpiresAt: pairing ? new Date(pairing.expiresAt).toISOString() : null,
      defaultBotId: config?.defaultBotId || null,
      lastError: this.lastError,
    };
  }

  private async call<T>(token: string, method: string, body: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
    const response = await (this.options.fetchImpl || fetch)(`${this.apiBase}/bot${token}/${method}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal,
    });
    const payload = await response.json().catch(() => ({})) as { ok?: boolean; result?: T; description?: string };
    // Never echo the URL: it contains the token.
    if (!response.ok || !payload.ok) throw new Error(payload.description ? `Telegram: ${payload.description}` : `Telegram returned ${response.status}.`);
    return payload.result as T;
  }

  /** Verify a token with getMe, save it, and return a fresh pairing code.
   * Replacing the token forgets the previous owner pairing. */
  async connect(token: string): Promise<TelegramStatus> {
    const trimmed = token.trim();
    if (!/^\d{5,16}:[A-Za-z0-9_-]{30,64}$/.test(trimmed)) throw new Error("That does not look like a Telegram bot token. Copy the whole token @BotFather gave you.");
    const me = await this.call<{ username?: string; is_bot?: boolean }>(trimmed, "getMe");
    if (!me.is_bot || !me.username) throw new Error("Telegram did not recognize this as a bot token.");
    const previous = this.config();
    const sameBot = previous?.token === trimmed;
    this.saveConfig({
      token: trimmed, botUsername: me.username,
      ...(sameBot ? { ownerUserId: previous?.ownerUserId, ownerChatId: previous?.ownerChatId, ownerName: previous?.ownerName, offset: previous?.offset } : {}),
      defaultBotId: previous?.defaultBotId,
      pairing: sameBot && previous?.ownerChatId ? null : this.freshPairing(),
      connectedAt: new Date(this.now()).toISOString(),
    });
    this.lastError = null;
    this.start();
    return this.status();
  }

  private freshPairing() { return { code: String(randomInt(100_000, 1_000_000)), expiresAt: this.now() + PAIRING_MINUTES * 60_000 }; }

  newPairingCode(): TelegramStatus {
    const config = this.config();
    if (!config) throw new Error("Connect a Telegram bot first.");
    this.saveConfig({ ...config, pairing: this.freshPairing() });
    return this.status();
  }

  setDefaultTeammate(botId: string | null): TelegramStatus {
    const config = this.config();
    if (!config) throw new Error("Connect a Telegram bot first.");
    if (botId && !this.options.db.getBot(botId)) throw new Error("That teammate does not exist.");
    this.saveConfig({ ...config, defaultBotId: botId || undefined });
    return this.status();
  }

  disconnect() {
    this.stop();
    this.options.db.saveExtensionRecord(RECORD, CONFIG_ID, null);
    this.saveTracked([]);
    this.lastError = null;
  }

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    void this.loop();
    this.deliverTimer = setInterval(() => void this.deliver().catch(() => {}), 3_000);
    this.deliverTimer.unref();
  }

  stop() {
    this.stopped = true;
    this.abort?.abort();
    if (this.deliverTimer) clearInterval(this.deliverTimer);
    this.deliverTimer = null;
  }

  private async loop() {
    while (!this.stopped) {
      const config = this.config();
      if (!config?.token || !this.options.isLeader()) { await sleep(2_000); continue; }
      try {
        await this.pollOnce(config);
        this.lastError = null;
      } catch (error) {
        if (this.stopped) return;
        this.lastError = error instanceof Error ? error.message : String(error);
        await sleep(5_000);
      }
    }
  }

  /** One getUpdates round. Exposed for tests. */
  async pollOnce(config = this.config()) {
    if (!config?.token || this.polling) return;
    this.polling = true;
    this.abort = new AbortController();
    try {
      const updates = await this.call<TelegramUpdate[]>(config.token, "getUpdates", {
        offset: config.offset, timeout: this.options.pollTimeoutSeconds ?? 25, allowed_updates: ["message"],
      }, this.abort.signal);
      for (const update of updates) {
        await this.handleUpdate(update);
        const latest = this.config();
        if (latest) this.saveConfig({ ...latest, offset: update.update_id + 1 });
      }
    } finally {
      this.polling = false;
    }
  }

  private async send(chatId: number, text: string) {
    const config = this.config();
    if (!config?.token) return;
    const body = text.length > TELEGRAM_TEXT_LIMIT ? `${text.slice(0, TELEGRAM_TEXT_LIMIT - 60)}…\n\n(Open OpenBot for the full reply.)` : text;
    await this.call(config.token, "sendMessage", { chat_id: chatId, text: body, disable_web_page_preview: true });
  }

  private teammates() { return this.options.db.listBots().filter((bot) => !bot.retiredAt); }

  private async handleUpdate(update: TelegramUpdate) {
    const message = update.message;
    const config = this.config();
    if (!message?.text || !message.from || message.from.is_bot || !config) return;
    // Private chats only: a bot added to a group must never act for the group.
    if (message.chat.type !== "private") return;
    const text = message.text.trim();

    if (!config.ownerChatId) {
      const code = /^\/start\s+(\d{6})$/.exec(text)?.[1];
      const pairing = config.pairing;
      if (code && pairing && pairing.expiresAt > this.now() && code === pairing.code) {
        this.saveConfig({ ...config, ownerUserId: message.from.id, ownerChatId: message.chat.id, ownerName: message.from.first_name || message.from.username || "Owner", pairing: null });
        await this.send(message.chat.id, `Connected to OpenBot. Message me and ${this.defaultTeammate()?.name || "your teammate"} will help. Start with @Name to ask another teammate; /who lists them.`);
      }
      return; // Unpaired: say nothing to strangers.
    }
    if (message.from.id !== config.ownerUserId || message.chat.id !== config.ownerChatId) return;

    if (text === "/start" || text === "/help") {
      await this.send(message.chat.id, `Message me and ${this.defaultTeammate()?.name || "your teammate"} will take care of it. Start with @Name to ask another teammate. /who lists teammates; /use Name changes who answers by default. Approvals are reviewed in OpenBot.`);
      return;
    }
    if (text === "/who") {
      const current = this.defaultTeammate();
      await this.send(message.chat.id, this.teammates().map((bot) => `${bot.id === current?.id ? "• " : "  "}${bot.name} — ${bot.role}`).join("\n") || "No teammates yet.");
      return;
    }
    const use = /^\/use\s+(.+)$/i.exec(text);
    if (use) {
      const bot = this.findTeammate(use[1]!);
      if (!bot) { await this.send(message.chat.id, `I couldn't find a teammate called ${use[1]}. /who lists them.`); return; }
      this.setDefaultTeammate(bot.id);
      await this.send(message.chat.id, `${bot.name} will answer by default.`);
      return;
    }

    const mention = /^@([\p{L}\p{N}_.-]+)[,:]?\s+([\s\S]+)$/u.exec(text);
    const named = mention ? this.findTeammate(mention[1]!) : null;
    const bot = named || this.defaultTeammate();
    const body = named ? mention![2]!.trim() : text;
    if (!bot) { await this.send(message.chat.id, "There are no teammates in your studio yet. Create one in OpenBot first."); return; }

    const result = await this.options.localApi("POST", "/api/messages", {
      threadId: bot.threadId, body, targetBotIds: [bot.id], requestId: `telegram-${config.botUsername}-${update.update_id}`,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    if (result.status >= 400) {
      await this.send(message.chat.id, `OpenBot couldn't start that: ${String(result.body.error || "please try again in the studio.")}`);
      return;
    }
    const runs = Array.isArray(result.body.runs) ? result.body.runs as Array<{ id?: string }> : [];
    const tracked = this.tracked();
    for (const run of runs) if (run.id && !tracked.some((item) => item.runId === run.id)) tracked.push({ runId: run.id, chatId: message.chat.id, notifiedApprovalIds: [] });
    this.saveTracked(tracked);
    const config2 = this.config();
    if (config2?.token) await this.call(config2.token, "sendChatAction", { chat_id: message.chat.id, action: "typing" }).catch(() => {});
  }

  private defaultTeammate() {
    const config = this.config();
    const teammates = this.teammates();
    return teammates.find((bot) => bot.id === config?.defaultBotId) || teammates[0] || null;
  }

  private findTeammate(name: string) {
    const wanted = name.trim().toLowerCase();
    return this.teammates().find((bot) => bot.name.toLowerCase() === wanted || bot.id.toLowerCase() === wanted) || null;
  }

  /** Send final replies and approval notices for tasks started from
   * Telegram. Exposed for tests. */
  async deliver() {
    const config = this.config();
    if (!config?.ownerChatId || !this.options.isLeader()) return;
    const tracked = this.tracked();
    if (!tracked.length) return;
    const remaining: TrackedRun[] = [];
    for (const item of tracked) {
      const run = this.options.db.getRun(item.runId);
      if (!run) continue;
      if (run.status === "awaiting_approval" && run.approvalId && !item.notifiedApprovalIds.includes(run.approvalId)) {
        const approval = this.options.db.getApproval(run.approvalId);
        await this.send(item.chatId, `${run.botName} needs your okay: ${approval?.actionLabel || "an action"}.\nReview it in OpenBot: ${this.options.appUrl.replace(/\/$/, "")}/?thread=${encodeURIComponent(run.threadId)}`);
        item.notifiedApprovalIds.push(run.approvalId);
      }
      if (["completed", "failed", "cancelled"].includes(run.status)) {
        const reply = this.options.db.listMessages(run.threadId).filter((message) => message.runId === run.id && message.senderType === "bot" && message.kind === "text").at(-1);
        const text = run.status === "completed"
          ? reply?.body || run.summary || `${run.botName} finished.`
          : run.status === "cancelled" ? `${run.botName} stopped this task.` : `${run.botName} couldn't finish: ${run.error || "open OpenBot to see what happened."}`;
        await this.send(item.chatId, text);
        continue;
      }
      remaining.push(item);
    }
    this.saveTracked(remaining);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms).unref?.());

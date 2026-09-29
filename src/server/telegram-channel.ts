import { randomInt } from "node:crypto";
import type { OpenBotDatabase } from "./database.js";
import { ChannelConversation, type LocalApi } from "./channel-core.js";

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
  /** Opens the bot in Telegram with the pairing code filled in: one tap on Start. */
  pairingLink: string | null;
}

interface TelegramUpdate {
  update_id: number;
  message?: { message_id: number; text?: string; chat: { id: number; type: string }; from?: { id: number; is_bot?: boolean; first_name?: string; username?: string } };
}

export class TelegramChannel {
  private polling = false;
  private stopped = true;
  private lastError: string | null = null;
  private deliverTimer: NodeJS.Timeout | null = null;
  private abort: AbortController | null = null;
  private readonly conversation: ChannelConversation;

  constructor(private readonly options: {
    db: OpenBotDatabase;
    localApi: LocalApi;
    appUrl: string;
    isLeader: () => boolean;
    apiBase?: string;
    fetchImpl?: typeof fetch;
    now?: () => number;
    pollTimeoutSeconds?: number;
  }) {
    this.conversation = new ChannelConversation(options, "telegram", {
      send: (chatId, text) => this.send(Number(chatId), text),
      typing: async (chatId) => { const config = this.config(); if (config?.token) await this.call(config.token, "sendChatAction", { chat_id: Number(chatId), action: "typing" }); },
    }, { get: () => this.config()?.defaultBotId, set: (botId) => { this.setDefaultTeammate(botId); } });
  }

  private get apiBase() { return (this.options.apiBase || process.env.OPENBOT_TELEGRAM_API_BASE || "https://api.telegram.org").replace(/\/$/, ""); }
  private now() { return (this.options.now || Date.now)(); }
  private config() { return this.options.db.extensionRecord<TelegramConfig>(RECORD, CONFIG_ID); }
  private saveConfig(config: TelegramConfig) { this.options.db.saveExtensionRecord(RECORD, CONFIG_ID, config); }

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
      pairingLink: pairing && config?.botUsername ? `https://t.me/${encodeURIComponent(config.botUsername)}?start=${pairing.code}` : null,
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

  /** Prove the whole path works: the bot writes to the paired owner. */
  async sendTest() {
    const config = this.config();
    if (!config?.ownerChatId) throw new Error("Link your Telegram account first.");
    await this.send(Number(config.ownerChatId), "✅ OpenBot is connected. Message me here any time — your team will answer.");
  }

  disconnect() {
    this.stop();
    this.options.db.saveExtensionRecord(RECORD, CONFIG_ID, null);
    this.conversation.clearTracked();
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
        await this.send(message.chat.id, this.conversation.greeting());
      }
      return; // Unpaired: say nothing to strangers.
    }
    if (message.from.id !== config.ownerUserId || message.chat.id !== config.ownerChatId) return;
    await this.conversation.handleOwnerText(String(message.chat.id), text, `telegram-${config.botUsername}-${update.update_id}`);
  }

  /** Send final replies and approval notices for tasks started from
   * Telegram. Exposed for tests. */
  async deliver() {
    if (!this.config()?.ownerChatId) return;
    await this.conversation.deliver();
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms).unref?.());

import { randomInt } from "node:crypto";
import WebSocket from "ws";
import type { OpenBotDatabase } from "./database.js";
import { ChannelConversation, type LocalApi } from "./channel-core.js";

/** Owner-only Discord channel, same rules as Telegram:
 * - the owner pairs by direct-messaging the bot a one-time code;
 * - only that owner's direct messages are served — server channels, other
 *   users and other bots are ignored;
 * - messages enter through the studio's message API (the Discord message
 *   id is the request id, so a replayed event never starts a second task);
 * - approvals are notices with a link to the review, never granted here;
 * - the token lives in the encrypted extension store.
 * Receives through the gateway WebSocket (DIRECT_MESSAGES intent only). */

const RECORD = "channel";
const CONFIG_ID = "discord";
const PAIRING_MINUTES = 15;
const DISCORD_TEXT_LIMIT = 1900;
const DIRECT_MESSAGES_INTENT = 1 << 12;

export interface DiscordConfig {
  token: string;
  botUsername: string;
  botUserId: string;
  ownerUserId?: string;
  ownerChannelId?: string;
  ownerName?: string;
  defaultBotId?: string;
  pairing?: { code: string; expiresAt: number } | null;
  connectedAt?: string;
}

export interface DiscordStatus {
  configured: boolean;
  botUsername: string | null;
  paired: boolean;
  ownerName: string | null;
  pairingCode: string | null;
  pairingExpiresAt: string | null;
  defaultBotId: string | null;
  connected: boolean;
  lastError: string | null;
  /** Adds the bot to a server the owner manages (needed before a DM). */
  inviteLink: string | null;
  /** Opens the bot's profile, where "Message" starts the direct message. */
  profileLink: string | null;
}

interface DiscordMessage { id: string; channel_id: string; guild_id?: string; content: string; author: { id: string; bot?: boolean; username?: string; global_name?: string | null } }

export class DiscordChannel {
  private socket: WebSocket | null = null;
  private heartbeat: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private deliverTimer: NodeJS.Timeout | null = null;
  private sequence: number | null = null;
  private stopped = true;
  private ready = false;
  private lastError: string | null = null;
  private readonly conversation: ChannelConversation;

  constructor(private readonly options: {
    db: OpenBotDatabase;
    localApi: LocalApi;
    appUrl: string;
    isLeader: () => boolean;
    apiBase?: string;
    gatewayUrl?: string;
    fetchImpl?: typeof fetch;
    now?: () => number;
  }) {
    this.conversation = new ChannelConversation(options, "discord", {
      send: (chatId, text) => this.send(chatId, text),
      typing: async (chatId) => { await this.rest("POST", `/channels/${chatId}/typing`); },
    }, { get: () => this.config()?.defaultBotId, set: (botId) => { this.setDefaultTeammate(botId); } });
  }

  private get apiBase() { return (this.options.apiBase || process.env.OPENBOT_DISCORD_API_BASE || "https://discord.com/api/v10").replace(/\/$/, ""); }
  private get gatewayUrl() { return this.options.gatewayUrl || process.env.OPENBOT_DISCORD_GATEWAY || "wss://gateway.discord.gg/?v=10&encoding=json"; }
  private now() { return (this.options.now || Date.now)(); }
  private config() { return this.options.db.extensionRecord<DiscordConfig>(RECORD, CONFIG_ID); }
  private saveConfig(config: DiscordConfig) { this.options.db.saveExtensionRecord(RECORD, CONFIG_ID, config); }

  status(): DiscordStatus {
    const config = this.config();
    const pairing = config?.pairing && config.pairing.expiresAt > this.now() ? config.pairing : null;
    return {
      configured: Boolean(config?.token), botUsername: config?.botUsername || null, paired: Boolean(config?.ownerChannelId),
      ownerName: config?.ownerName || null, pairingCode: pairing?.code || null,
      pairingExpiresAt: pairing ? new Date(pairing.expiresAt).toISOString() : null,
      defaultBotId: config?.defaultBotId || null, connected: this.ready, lastError: this.lastError,
      inviteLink: config?.botUserId ? `https://discord.com/oauth2/authorize?client_id=${config.botUserId}&scope=bot&permissions=0` : null,
      profileLink: config?.botUserId ? `https://discord.com/users/${config.botUserId}` : null,
    };
  }

  private async rest<T>(method: "GET" | "POST", path: string, body?: unknown, token = this.config()?.token): Promise<T> {
    if (!token) throw new Error("Connect a Discord bot first.");
    const response = await (this.options.fetchImpl || fetch)(`${this.apiBase}${path}`, {
      method, headers: { authorization: `Bot ${token}`, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload = await response.json().catch(() => ({})) as T & { message?: string };
    if (!response.ok) throw new Error(payload.message ? `Discord: ${payload.message}` : `Discord returned ${response.status}.`);
    return payload;
  }

  async connect(token: string): Promise<DiscordStatus> {
    const trimmed = token.trim();
    if (!/^[A-Za-z0-9_-]{20,40}\.[A-Za-z0-9_-]{4,10}\.[A-Za-z0-9_-]{20,60}$/.test(trimmed)) throw new Error("That does not look like a Discord bot token. Copy it from the Bot page of your Discord application.");
    const me = await this.rest<{ id?: string; username?: string; bot?: boolean }>("GET", "/users/@me", undefined, trimmed);
    if (!me.bot || !me.id) throw new Error("Discord did not recognize this as a bot token.");
    const previous = this.config();
    const sameBot = previous?.token === trimmed;
    this.saveConfig({
      token: trimmed, botUsername: me.username || "bot", botUserId: me.id,
      ...(sameBot ? { ownerUserId: previous?.ownerUserId, ownerChannelId: previous?.ownerChannelId, ownerName: previous?.ownerName } : {}),
      defaultBotId: previous?.defaultBotId,
      pairing: sameBot && previous?.ownerChannelId ? null : this.freshPairing(),
      connectedAt: new Date(this.now()).toISOString(),
    });
    this.lastError = null;
    this.restart();
    return this.status();
  }

  private freshPairing() { return { code: String(randomInt(100_000, 1_000_000)), expiresAt: this.now() + PAIRING_MINUTES * 60_000 }; }

  newPairingCode(): DiscordStatus {
    const config = this.config();
    if (!config) throw new Error("Connect a Discord bot first.");
    this.saveConfig({ ...config, pairing: this.freshPairing() });
    return this.status();
  }

  setDefaultTeammate(botId: string | null): DiscordStatus {
    const config = this.config();
    if (!config) throw new Error("Connect a Discord bot first.");
    if (botId && !this.options.db.getBot(botId)) throw new Error("That teammate does not exist.");
    this.saveConfig({ ...config, defaultBotId: botId || undefined });
    return this.status();
  }

  /** Prove the whole path works: the bot writes to the paired owner. */
  async sendTest() {
    const config = this.config();
    if (!config?.ownerChannelId) throw new Error("Link your Discord account first.");
    await this.send(config.ownerChannelId, "✅ OpenBot is connected. Message me here any time — your team will answer.");
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
    this.open();
    this.deliverTimer = setInterval(() => void this.deliver().catch(() => {}), 3_000);
    this.deliverTimer.unref();
  }

  private restart() { this.stop(); this.start(); }

  stop() {
    this.stopped = true;
    this.ready = false;
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.deliverTimer) clearInterval(this.deliverTimer);
    this.heartbeat = this.reconnectTimer = this.deliverTimer = null;
    const socket = this.socket;
    this.socket = null;
    socket?.removeAllListeners();
    socket?.on("error", () => {});
    socket?.close();
  }

  private scheduleReconnect(ms = 5_000) {
    if (this.stopped || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; this.open(); }, ms);
    this.reconnectTimer.unref();
  }

  private open() {
    if (this.stopped) return;
    const config = this.config();
    if (!config?.token || !this.options.isLeader()) { this.scheduleReconnect(2_000); return; }
    const socket = new WebSocket(this.gatewayUrl);
    this.socket = socket;
    this.sequence = null;
    socket.on("message", (raw) => void this.onFrame(socket, String(raw)).catch((error) => { this.lastError = error instanceof Error ? error.message : String(error); }));
    socket.on("close", () => {
      if (this.socket !== socket) return;
      this.ready = false;
      if (this.heartbeat) clearInterval(this.heartbeat);
      this.heartbeat = null;
      this.scheduleReconnect();
    });
    socket.on("error", (error) => { this.lastError = `Discord connection: ${error.message}`; });
  }

  private async onFrame(socket: WebSocket, raw: string) {
    const frame = JSON.parse(raw) as { op: number; d?: unknown; s?: number | null; t?: string | null };
    if (typeof frame.s === "number") this.sequence = frame.s;
    if (frame.op === 10) {
      const interval = Number((frame.d as { heartbeat_interval?: number })?.heartbeat_interval || 41_250);
      if (this.heartbeat) clearInterval(this.heartbeat);
      this.heartbeat = setInterval(() => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ op: 1, d: this.sequence })); }, interval);
      this.heartbeat.unref();
      socket.send(JSON.stringify({ op: 2, d: { token: this.config()?.token, intents: DIRECT_MESSAGES_INTENT, properties: { os: process.platform, browser: "openbot", device: "openbot" } } }));
      return;
    }
    if (frame.op === 7 || frame.op === 9) { socket.close(); return; } // reconnect / invalid session
    if (frame.op !== 0) return;
    if (frame.t === "READY") { this.ready = true; this.lastError = null; return; }
    if (frame.t === "MESSAGE_CREATE") await this.handleMessage(frame.d as DiscordMessage);
  }

  private async send(channelId: string, text: string) {
    const content = text.length > DISCORD_TEXT_LIMIT ? `${text.slice(0, DISCORD_TEXT_LIMIT - 60)}…\n\n(Open OpenBot for the full reply.)` : text;
    await this.rest("POST", `/channels/${channelId}/messages`, { content, allowed_mentions: { parse: [] } });
  }

  /** Exposed for tests. */
  async handleMessage(message: DiscordMessage) {
    const config = this.config();
    if (!config || !message?.author || message.author.bot || message.author.id === config.botUserId) return;
    // Direct messages only: a server channel must never drive a teammate.
    if (message.guild_id) return;
    const text = String(message.content || "").trim();
    if (!text) return;
    if (!config.ownerChannelId) {
      const code = /^(?:\/start|pair)\s+(\d{6})$/i.exec(text)?.[1];
      const pairing = config.pairing;
      if (code && pairing && pairing.expiresAt > this.now() && code === pairing.code) {
        this.saveConfig({ ...config, ownerUserId: message.author.id, ownerChannelId: message.channel_id, ownerName: message.author.global_name || message.author.username || "Owner", pairing: null });
        await this.send(message.channel_id, this.conversation.greeting());
      }
      return;
    }
    if (message.author.id !== config.ownerUserId || message.channel_id !== config.ownerChannelId) return;
    await this.conversation.handleOwnerText(message.channel_id, text, `discord-${config.botUserId}-${message.id}`);
  }

  async deliver() {
    if (!this.config()?.ownerChannelId) return;
    await this.conversation.deliver();
  }
}

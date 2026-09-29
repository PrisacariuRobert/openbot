import { execFile } from "node:child_process";
import { createHash, randomInt } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { OpenBotDatabase } from "./database.js";
import { ChannelConversation, type LocalApi } from "./channel-core.js";

/** Owner-only iMessage channel for a Mac: text your teammates from the
 * Messages app on your iPhone and they answer in the same thread.
 *
 * - Reads new messages from this Mac's Messages database (read-only; needs
 *   Full Disk Access, which only the owner can grant) and replies through
 *   the Messages app (macOS asks the owner once for Automation access).
 * - One owner handle. It works both ways people set up their Mac: texting
 *   your own number ("note to self", same Apple ID on Mac and iPhone), or
 *   texting a separate Apple ID signed in on the Mac. Anyone else is ignored.
 * - Pairing: the Mac texts a one-time code to the handle the owner entered;
 *   replying with it proves the round trip before anything is accepted.
 * - Messages enter through the studio's own message API (admission, budgets,
 *   replay protection); approvals are never granted from chat. */

const RECORD = "channel";
const CONFIG_ID = "imessage";
const PAIRING_MINUTES = 15;
const TEXT_LIMIT = 3000;

export interface IMessageConfig {
  ownerHandle: string;
  paired: boolean;
  lastRowId: number;
  defaultBotId?: string;
  pairing?: { code: string; expiresAt: number } | null;
  /** Hashes of texts OpenBot sent recently: in a note-to-self thread our own
   * replies come back as "from me" and must not be read as commands. */
  sent?: Array<{ hash: string; at: number }>;
  /** Texts already read: note-to-self delivers every message twice. */
  seen?: Array<{ hash: string; at: number }>;
  /** Paused by the loop brake; the owner turns it back on. */
  paused?: boolean;
  connectedAt?: string;
}

export interface IMessageStatus {
  available: boolean;
  configured: boolean;
  ownerHandle: string | null;
  paired: boolean;
  pairingExpiresAt: string | null;
  needsFullDiskAccess: boolean;
  defaultBotId: string | null;
  paused: boolean;
  lastError: string | null;
}

export interface IMessageRow { rowId: number; text: string | null; body: Uint8Array | null; fromMe: boolean; handle: string | null; chat: string | null }
export interface IMessageStore { maxRowId(): number; rowsAfter(rowId: number): IMessageRow[] }
export type IMessageSender = (handle: string, text: string) => Promise<void>;

export class FullDiskAccessError extends Error {}

/** Phone numbers compare by digits; emails case-insensitively. */
export function normalizeHandle(handle: string | null | undefined): string {
  const value = (handle || "").trim().toLowerCase().replace(/^(?:mailto:|tel:)/, "");
  if (value.includes("@")) return value;
  const digits = value.replace(/[^\d+]/g, "");
  return digits.replace(/^00/, "+");
}
const sameHandle = (a: string | null | undefined, b: string | null | undefined) => {
  const left = normalizeHandle(a), right = normalizeHandle(b);
  if (!left || !right) return false;
  if (left === right) return true;
  // +43 664 … and 0664 … are the same number written two ways.
  const digits = (value: string) => value.replace(/\D/g, "");
  return !left.includes("@") && !right.includes("@") && digits(left).length >= 7 && (digits(left).endsWith(digits(right).replace(/^0+/, "")) || digits(right).endsWith(digits(left).replace(/^0+/, "")));
};

/** Newer macOS keeps message text in `attributedBody` (a typedstream
 * NSAttributedString). The plain string follows the NSString class name. */
export function textFromAttributedBody(body: Uint8Array | null): string | null {
  if (!body || !body.length) return null;
  const buffer = Buffer.from(body);
  const marker = buffer.indexOf("NSString");
  if (marker < 0) return null;
  const plus = buffer.indexOf(0x2b, marker + 8);
  if (plus < 0 || plus > marker + 20) return null;
  let length = buffer[plus + 1]!, start = plus + 2;
  if (length === 0x81) { length = buffer.readUInt16LE(plus + 2); start = plus + 4; }
  else if (length === 0x82) { length = buffer.readUInt32LE(plus + 2); start = plus + 6; }
  if (start + length > buffer.length) return null;
  return buffer.subarray(start, start + length).toString("utf8");
}

export function macMessagesStore(file = path.join(homedir(), "Library", "Messages", "chat.db")): IMessageStore {
  const open = () => {
    try { return new DatabaseSync(file, { readOnly: true }); }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/authorization denied|not authorized|operation not permitted|unable to open/i.test(message)) throw new FullDiskAccessError("OpenBot needs Full Disk Access to read your Messages.");
      throw error;
    }
  };
  return {
    maxRowId() { const db = open(); try { return Number((db.prepare("SELECT COALESCE(MAX(ROWID), 0) AS id FROM message").get() as { id: number }).id); } finally { db.close(); } },
    rowsAfter(rowId) {
      const db = open();
      try {
        return (db.prepare(`SELECT m.ROWID AS rowId, m.text AS text, m.attributedBody AS body, m.is_from_me AS fromMe, h.id AS handle, c.chat_identifier AS chat
          FROM message m LEFT JOIN handle h ON h.ROWID = m.handle_id
          LEFT JOIN chat_message_join cmj ON cmj.message_id = m.ROWID LEFT JOIN chat c ON c.ROWID = cmj.chat_id
          WHERE m.ROWID > ? AND m.item_type = 0 ORDER BY m.ROWID ASC LIMIT 50`).all(rowId) as Array<Record<string, unknown>>)
          .map((row) => ({ rowId: Number(row.rowId), text: row.text == null ? null : String(row.text), body: row.body instanceof Uint8Array ? row.body : null, fromMe: Number(row.fromMe) === 1, handle: row.handle == null ? null : String(row.handle), chat: row.chat == null ? null : String(row.chat) }));
      } finally { db.close(); }
    },
  };
}

/** Sends through the Messages app. Handle and text travel as arguments,
 * never spliced into the script. */
export const messagesAppSender: IMessageSender = (handle, text) => new Promise((resolve, reject) => {
  const script = ['on run {targetHandle, messageText}', 'tell application "Messages"', 'set targetService to 1st account whose service type = iMessage', 'send messageText to participant targetHandle of targetService', 'end tell', 'end run'];
  execFile("osascript", [...script.flatMap((line) => ["-e", line]), handle, text], { timeout: 20_000 }, (error, _stdout, stderr) => {
    if (!error) return resolve();
    const detail = String(stderr || error.message);
    reject(new Error(/not authori[sz]ed|-1743/i.test(detail) ? "macOS hasn't allowed OpenBot to use Messages yet. Allow it in System Settings → Privacy & Security → Automation." : `Messages couldn't send the text: ${detail.trim().slice(0, 160)}`));
  });
});

const hash = (text: string) => createHash("sha256").update(text.trim()).digest("hex").slice(0, 24);

export class IMessageChannel {
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  private lastError: string | null = null;
  private needsAccess = false;
  private readonly conversation: ChannelConversation;

  constructor(private readonly options: {
    db: OpenBotDatabase;
    localApi: LocalApi;
    appUrl: string;
    isLeader: () => boolean;
    store?: IMessageStore;
    sender?: IMessageSender;
    platform?: NodeJS.Platform;
    now?: () => number;
  }) {
    this.conversation = new ChannelConversation(options, "imessage", {
      send: (_chatId, text) => this.send(text),
    }, { get: () => this.config()?.defaultBotId, set: (botId) => { this.setDefaultTeammate(botId); } });
  }

  private get available() { return (this.options.platform || process.platform) === "darwin"; }
  private get store() { return this.options.store || macMessagesStore(); }
  private get sender() { return this.options.sender || messagesAppSender; }
  private now() { return (this.options.now || Date.now)(); }
  private config() { return this.options.db.extensionRecord<IMessageConfig>(RECORD, CONFIG_ID); }
  private saveConfig(config: IMessageConfig) { this.options.db.saveExtensionRecord(RECORD, CONFIG_ID, config); }

  status(): IMessageStatus {
    const config = this.config();
    const pairing = config?.pairing && config.pairing.expiresAt > this.now() ? config.pairing : null;
    return {
      available: this.available,
      configured: Boolean(config?.ownerHandle),
      ownerHandle: config?.ownerHandle || null,
      paired: Boolean(config?.paired),
      pairingExpiresAt: pairing ? new Date(pairing.expiresAt).toISOString() : null,
      needsFullDiskAccess: this.needsAccess,
      defaultBotId: config?.defaultBotId || null,
      paused: Boolean(config?.paused),
      lastError: this.lastError,
    };
  }

  /** Save the owner's handle and text them a pairing code. */
  async connect(ownerHandle: string): Promise<IMessageStatus> {
    if (!this.available) throw new Error("iMessage works on a Mac with Messages signed in.");
    const handle = ownerHandle.trim();
    if (!/^(?:\+?[\d\s().-]{7,20}|[^\s@]+@[^\s@]+\.[^\s@]+)$/.test(handle)) throw new Error("Enter the phone number or email you use for iMessage.");
    let lastRowId: number;
    try { lastRowId = this.store.maxRowId(); this.needsAccess = false; }
    catch (error) { if (error instanceof FullDiskAccessError) { this.needsAccess = true; throw error; } throw error; }
    const pairing = { code: String(randomInt(100_000, 1_000_000)), expiresAt: this.now() + PAIRING_MINUTES * 60_000 };
    this.saveConfig({ ownerHandle: handle, paired: false, lastRowId, pairing, defaultBotId: this.config()?.defaultBotId, sent: [], connectedAt: new Date(this.now()).toISOString() });
    await this.send(`OpenBot: reply with ${pairing.code} to connect your team to iMessage. (Ignore this if you didn't ask for it.)`);
    this.lastError = null;
    this.start();
    return this.status();
  }

  resume(): IMessageStatus {
    const config = this.config();
    if (!config) throw new Error("Connect iMessage first.");
    this.saveConfig({ ...config, paused: false, seen: [], lastRowId: (() => { try { return this.store.maxRowId(); } catch { return config.lastRowId; } })() });
    this.lastError = null;
    return this.status();
  }

  setDefaultTeammate(botId: string | null): IMessageStatus {
    const config = this.config();
    if (!config) throw new Error("Connect iMessage first.");
    if (botId && !this.options.db.getBot(botId)) throw new Error("That teammate does not exist.");
    this.saveConfig({ ...config, defaultBotId: botId || undefined });
    return this.status();
  }

  disconnect() {
    this.stop();
    this.options.db.saveExtensionRecord(RECORD, CONFIG_ID, null);
    this.conversation.clearTracked();
    this.lastError = null;
  }

  start() {
    if (this.timer || !this.available) return;
    this.timer = setInterval(() => void this.tick(), 3_000);
    this.timer.unref();
  }

  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }

  private async tick() {
    if (this.busy || !this.options.isLeader() || !this.config()?.ownerHandle) return;
    this.busy = true;
    try { await this.pollOnce(); if (this.config()?.paired) await this.conversation.deliver(); this.lastError = null; }
    catch (error) { this.lastError = error instanceof Error ? error.message : String(error); }
    finally { this.busy = false; }
  }

  private async send(text: string) {
    const config = this.config();
    if (!config?.ownerHandle) return;
    const body = text.length > TEXT_LIMIT ? `${text.slice(0, TEXT_LIMIT - 60)}…\n\n(Open OpenBot for the full reply.)` : text;
    const recent = (config.sent || []).filter((item) => this.now() - item.at < 6 * 60 * 60_000);
    this.saveConfig({ ...config, sent: [...recent, { hash: hash(body), at: this.now() }].slice(-100) });
    await this.sender(config.ownerHandle, body);
  }

  /** Read messages that arrived since the last look. Exposed for tests. */
  async pollOnce() {
    let config = this.config();
    if (!config?.ownerHandle) return;
    let rows: IMessageRow[];
    try { rows = this.store.rowsAfter(config.lastRowId); this.needsAccess = false; }
    catch (error) { if (error instanceof FullDiskAccessError) { this.needsAccess = true; return; } throw error; }
    for (const row of rows) {
      config = this.config()!;
      this.saveConfig({ ...config, lastRowId: Math.max(config.lastRowId, row.rowId) });
      if (config.paused) continue;
      const text = (row.text ?? textFromAttributedBody(row.body) ?? "").trim();
      if (!text) continue;
      const fromOwner = row.fromMe ? sameHandle(row.chat, config.ownerHandle) : sameHandle(row.handle, config.ownerHandle);
      if (!fromOwner) continue;
      const key = hash(text), now = this.now();
      // Never read OpenBot's own texts back, in either copy.
      if ((config.sent || []).some((item) => item.hash === key)) continue;
      // Note-to-self shows each message as sent and as received: read once.
      const seen = (config.seen || []).filter((item) => now - item.at < 5 * 60_000);
      if (seen.some((item) => item.hash === key)) continue;
      const lastMinute = seen.filter((item) => now - item.at < 60_000).length;
      this.saveConfig({ ...this.config()!, seen: [...seen, { hash: key, at: now }].slice(-50) });
      // Loop brake: a person doesn't send 7 texts a minute to their team.
      if (lastMinute >= 6) {
        this.saveConfig({ ...this.config()!, paused: true });
        this.lastError = "iMessage paused: too many messages in a minute. Turn it back on in Chat apps.";
        await this.send("OpenBot paused iMessage because it received too many messages at once. Turn it back on in OpenBot → Chat apps.").catch(() => {});
        return;
      }
      if (!config.paired) {
        const pairing = config.pairing;
        if (pairing && pairing.expiresAt > this.now() && text === pairing.code) {
          this.saveConfig({ ...this.config()!, paired: true, pairing: null });
          await this.send(this.conversation.greeting());
        }
        continue; // Not paired yet: nothing else is read.
      }
      await this.conversation.handleOwnerText(normalizeHandle(config.ownerHandle), text, `imessage-${row.rowId}`);
    }
  }
}

import { useEffect, useState, type ReactNode } from "react";
import { Check, CheckCircle2, Copy, ExternalLink, LoaderCircle, Send } from "lucide-react";
import type { Bot } from "../shared/types";
import { SettingsCard, SettingsGroup, SettingsRow } from "../studio/Settings";
import "./away-access-panel.css";
import { BrandIcon } from "./brand-icons";

type Status = {
  configured: boolean; botUsername: string | null; paired: boolean; ownerName: string | null;
  pairingCode: string | null; pairingExpiresAt: string | null; defaultBotId: string | null; lastError: string | null;
  pairingLink?: string | null; pairingQr?: string | null; inviteLink?: string | null; profileLink?: string | null;
};

function CopyChip({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return <button type="button" className="copy-chip" onClick={() => void navigator.clipboard?.writeText(text).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); }).catch(() => {})}>
    <code>{text}</code>{copied ? <Check size={14} /> : <Copy size={14} />}<span className="sr-only">{copied ? "Copied" : "Copy"}</span>
  </button>;
}

type Channel = "telegram" | "discord";

const COPY: Record<Channel, { name: string; create: ReactNode; createLink: { href: string; label: string }; createCommand?: string; tokenHint: string; placeholder: string; pairCommand: (code: string) => string; handle: (name: string | null) => string }> = {
  telegram: {
    name: "Telegram",
    create: <>Send <strong>/newbot</strong> to BotFather, pick a name, and copy the token it replies with.</>,
    createLink: { href: "https://t.me/BotFather", label: "Open BotFather" },
    createCommand: "/newbot",
    tokenHint: "It stays encrypted on this host and is never shown again.",
    placeholder: "123456789:AA…",
    pairCommand: (code) => `/start ${code}`,
    handle: (name) => `@${name}`,
  },
  discord: {
    name: "Discord",
    create: <>Choose <strong>New Application</strong>, open <strong>Bot</strong>, tap <strong>Reset Token</strong>, and copy it.</>,
    createLink: { href: "https://discord.com/developers/applications", label: "Open the Discord developer portal" },
    tokenHint: "It stays encrypted on this host and is never shown again. Only direct messages are used.",
    placeholder: "MTIz….Gab….…",
    pairCommand: (code) => `pair ${code}`,
    handle: (name) => name || "your bot",
  },
};

async function request<T>(channel: Channel, path = "", method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`/api/channels/${channel}${path}`, {
    method, credentials: "same-origin",
    ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || "This chat app needs attention.");
  return value as T;
}

/** Message your team from the chat apps you already use. */
export function TelegramPanel({ bots }: { bots: Bot[] }) {
  return <>
    <IMessageSection bots={bots} />
    <ChannelSection channel="telegram" bots={bots} />
    <ChannelSection channel="discord" bots={bots} />
    <p className="telegram-footnote">Your Mac needs to be awake and online for replies. Messages pass through the chat app's servers; don't send anything you wouldn't put in that chat.</p>
  </>;
}

/** Paste a bot token, send the one-time code from your own account, done. */
function ChannelSection({ channel, bots }: { channel: Channel; bots: Bot[] }) {
  const copy = COPY[channel];
  const [status, setStatus] = useState<Status | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const teammates = bots.filter((bot) => !bot.retiredAt);

  async function run(action: () => Promise<Status | void>) {
    setBusy(true); setError("");
    try { const next = await action(); if (next) setStatus(next); }
    catch (reason) { setError(reason instanceof Error ? reason.message : `${copy.name} needs attention.`); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    void run(() => request<Status>(channel));
    // Poll while waiting for the owner to send the pairing code.
    const timer = window.setInterval(() => void request<Status>(channel).then(setStatus).catch(() => {}), 4_000);
    return () => window.clearInterval(timer);
  }, []);

  const defaultName = teammates.find((bot) => bot.id === status?.defaultBotId)?.name || teammates[0]?.name || "your teammate";
  return <section className="away-pairing" aria-label={copy.name}>
    <div className="away-pairing-heading"><span className="away-pairing-icon brand"><BrandIcon brand={channel} /></span><div>
      <h3>{status?.paired ? `Your team is on ${copy.name}` : `Message your team from ${copy.name}`}</h3>
      <p>Ask from your phone, get the answer back in the same chat. Approvals stay in OpenBot.</p>
    </div></div>

    {!status?.configured && <SettingsGroup title="Connect a bot">
      <SettingsCard>
        <SettingsRow title="1. Create a bot" description={copy.create}>
          <div className="channel-actions">
            <a className="channel-link" href={copy.createLink.href} target="_blank" rel="noreferrer">{copy.createLink.label} <ExternalLink size={14} /></a>
            {copy.createCommand && <CopyChip text={copy.createCommand} />}
          </div>
        </SettingsRow>
        <SettingsRow title="2. Paste the token" description={copy.tokenHint}>
          <form className="telegram-token" onSubmit={(event) => { event.preventDefault(); void run(async () => { const next = await request<Status>(channel, "", "POST", { token }); setToken(""); return next; }); }}>
            <input type="password" autoComplete="off" spellCheck={false} value={token} onChange={(event) => setToken(event.target.value)} placeholder={copy.placeholder} aria-label={`${copy.name} bot token`} />
            <button className="away-pairing-primary" type="submit" disabled={busy || token.trim().length < 20}>{busy ? <LoaderCircle className="spinner" size={18} /> : <Send size={18} />}Connect</button>
          </form>
        </SettingsRow>
      </SettingsCard>
    </SettingsGroup>}

    {status?.configured && !status.paired && <SettingsGroup title={`Link your ${copy.name} account`}>
      <SettingsCard>
        {channel === "discord" && status.inviteLink && <SettingsRow title="1. Add the bot to a server" description="Pick any server you manage. No server yet? In Discord tap +, then Create My Own.">
          <div className="channel-actions"><a className="channel-link" href={status.inviteLink} target="_blank" rel="noreferrer">Add to a server <ExternalLink size={14} /></a></div>
        </SettingsRow>}
        {status.pairingCode ? <SettingsRow
          title={channel === "telegram" ? "Tap to link your account" : "2. Send the bot this code"}
          description={channel === "telegram"
            ? <>Opens {copy.handle(status.botUsername)} in Telegram with your code filled in — just tap <strong>Start</strong>. Only your account can use this bot.</>
            : <>Open a direct message with {copy.handle(status.botUsername)} and send the code. Only your account can use this bot.</>}
          control={<LoaderCircle className="spinner" size={19} aria-label="Waiting for your message" />}
        >
          <div className="channel-actions">
            {channel === "telegram" && status.pairingLink && <a className="away-pairing-primary channel-primary" href={status.pairingLink} target="_blank" rel="noreferrer"><Send size={16} /> Open in Telegram</a>}
            {channel === "discord" && status.profileLink && <a className="channel-link" href={status.profileLink} target="_blank" rel="noreferrer">Open a direct message <ExternalLink size={14} /></a>}
            <CopyChip text={copy.pairCommand(status.pairingCode)} />
          </div>
          {channel === "telegram" && status.pairingQr && <img className="channel-qr" src={status.pairingQr} width="160" height="160" alt="Scan with your phone's camera to open the bot in Telegram" />}
        </SettingsRow> : <SettingsRow title="The code expired" description="Make a new one-time code."
          control={<button onClick={() => void run(() => request<Status>(channel, "/pairing-code", "POST"))} disabled={busy}>New code</button>} />}
      </SettingsCard>
    </SettingsGroup>}

    {status?.paired && <SettingsGroup title="Connected">
      <SettingsCard>
        <SettingsRow
          title={`${copy.handle(status.botUsername)} · ${status.ownerName || "you"}`}
          description={`${defaultName} answers by default. Start a message with @Name to ask someone else; /who lists your team.`}
          control={<CheckCircle2 size={19} />}
        />
        <SettingsRow title="Check the connection" description={`Your bot sends you a short hello in ${copy.name}.`}
          control={<button onClick={() => void run(async () => { await request(channel, "/test", "POST"); return undefined; })} disabled={busy}>Send a test message</button>} />
        {teammates.length > 1 && <SettingsRow title="Answers by default" description="Who replies when you don't name anyone.">
          <select value={status.defaultBotId || teammates[0]?.id || ""} disabled={busy} aria-label={`Default teammate on ${copy.name}`}
            onChange={(event) => void run(() => request<Status>(channel, "/default-teammate", "POST", { botId: event.target.value }))}>
            {teammates.map((bot) => <option key={bot.id} value={bot.id}>{bot.name}</option>)}
          </select>
        </SettingsRow>}
      </SettingsCard>
    </SettingsGroup>}

    {status?.configured && <SettingsGroup title="Manage">
      <SettingsCard>
        <SettingsRow
          title={`Disconnect ${copy.name}`}
          description="Forgets the token and your linked account. Tasks already started keep running in OpenBot."
          control={<button onClick={() => { if (window.confirm(`Disconnect ${copy.name}? You can connect again with the same or a new bot.`)) void run(() => request<Status>(channel, "", "DELETE")); }} disabled={busy}>Disconnect</button>}
        />
      </SettingsCard>
    </SettingsGroup>}

    {(error || status?.lastError) && <p className="away-pairing-error" role="alert">{error || status?.lastError}</p>}
  </section>;
}

type IMessageStatus = { available: boolean; configured: boolean; ownerHandle: string | null; paired: boolean; pairingExpiresAt: string | null; needsFullDiskAccess: boolean; defaultBotId: string | null; paused?: boolean; lastError: string | null };

/** Text your team from the Messages app. Uses this Mac's Messages, so there
 * is no bot account to create; macOS asks the owner for two permissions. */
function IMessageSection({ bots }: { bots: Bot[] }) {
  const [status, setStatus] = useState<IMessageStatus | null>(null);
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [needsAccess, setNeedsAccess] = useState(false);
  const teammates = bots.filter((bot) => !bot.retiredAt);
  const call = async <T,>(path = "", method = "GET", body?: unknown): Promise<T> => {
    const response = await fetch(`/api/channels/imessage${path}`, { method, credentials: "same-origin", ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) });
    const value = await response.json();
    if (!response.ok) { if (value.needsFullDiskAccess) setNeedsAccess(true); throw new Error(value.error || "iMessage needs attention."); }
    return value as T;
  };
  async function run(action: () => Promise<IMessageStatus | void>) {
    setBusy(true); setError("");
    try { const next = await action(); if (next) { setStatus(next); setNeedsAccess(next.needsFullDiskAccess); } }
    catch (reason) { setError(reason instanceof Error ? reason.message : "iMessage needs attention."); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    void run(() => call<IMessageStatus>());
    const timer = window.setInterval(() => void call<IMessageStatus>().then((next) => { setStatus(next); if (next.needsFullDiskAccess) setNeedsAccess(true); }).catch(() => {}), 4_000);
    return () => window.clearInterval(timer);
  }, []);
  if (status && !status.available) return null;
  const defaultName = teammates.find((bot) => bot.id === status?.defaultBotId)?.name || teammates[0]?.name || "your teammate";
  return <section className="away-pairing" aria-label="iMessage">
    <div className="away-pairing-heading"><span className="away-pairing-icon brand"><BrandIcon brand="imessage" /></span><div>
      <h3>{status?.paired ? "Your team is on iMessage" : "Text your team from iMessage"}</h3>
      <p>Use Messages on your iPhone — no app to install. Replies come back in the same thread while your Mac is on.</p>
    </div></div>

    {needsAccess && !status?.paired && <SettingsGroup title="First, let OpenBot read Messages">
      <SettingsCard>
        <SettingsRow title="1. Open Full Disk Access" description="macOS protects your messages, so you choose to allow this."
          control={<button onClick={() => void call("/open-privacy", "POST")}>Open System Settings</button>} />
        <SettingsRow title="2. Add OpenBot" description={<>Tap <strong>Show OpenBot</strong>, then drag the highlighted <strong>OpenBot</strong> app into the Full Disk Access list and switch it on. Come back and connect below.</>}
          control={<button onClick={() => void call("/reveal-app", "POST")}>Show OpenBot</button>} />
      </SettingsCard>
    </SettingsGroup>}

    {!status?.paired && <SettingsGroup title={status?.configured ? "Reply to the text we sent" : "Connect"}>
      <SettingsCard>
        {status?.configured && status.pairingExpiresAt
          ? <SettingsRow title={`Check Messages on your iPhone`} description={<>OpenBot texted <strong>{status.ownerHandle}</strong> a 6-digit code. Reply with it. The first time, your Mac asks to let OpenBot use Messages — choose <strong>OK</strong>.</>} control={<LoaderCircle className="spinner" size={19} aria-label="Waiting for your reply" />} />
          : <SettingsRow title="Your iPhone number or iMessage email" description="Only messages from this number or email are read. To text the Mac, message yourself (or the Mac's own Apple ID).">
              <form className="telegram-token" onSubmit={(event) => { event.preventDefault(); void run(() => call<IMessageStatus>("", "POST", { handle })); }}>
                <input value={handle} onChange={(event) => setHandle(event.target.value)} placeholder="+43 664 123 4567" aria-label="Your iPhone number or iMessage email" autoComplete="off" />
                <button className="away-pairing-primary" type="submit" disabled={busy || handle.trim().length < 5}>{busy ? <LoaderCircle className="spinner" size={18} /> : <Send size={18} />}Send code</button>
              </form>
            </SettingsRow>}
      </SettingsCard>
    </SettingsGroup>}

    {status?.paired && <SettingsGroup title="Connected">
      <SettingsCard>
        <SettingsRow title={status.ownerHandle || "You"} description={`${defaultName} answers by default. Start a text with @Name to ask someone else.`} control={<CheckCircle2 size={19} />} />
        {status.paused && <SettingsRow title="Paused" description="OpenBot paused iMessage after too many messages in a minute." control={<button onClick={() => void run(() => call<IMessageStatus>("/resume", "POST"))} disabled={busy}>Turn back on</button>} />}
        {teammates.length > 1 && <SettingsRow title="Answers by default" description="Who replies when you don't name anyone.">
          <select value={status.defaultBotId || teammates[0]?.id || ""} disabled={busy} aria-label="Default teammate on iMessage"
            onChange={(event) => void run(() => call<IMessageStatus>("/default-teammate", "POST", { botId: event.target.value }))}>
            {teammates.map((bot) => <option key={bot.id} value={bot.id}>{bot.name}</option>)}
          </select>
        </SettingsRow>}
      </SettingsCard>
    </SettingsGroup>}

    {status?.configured && <SettingsGroup title="Manage">
      <SettingsCard>
        <SettingsRow title="Disconnect iMessage" description="OpenBot stops reading Messages. Tasks already started keep running."
          control={<button onClick={() => { if (window.confirm("Disconnect iMessage?")) void run(() => call<IMessageStatus>("", "DELETE")); }} disabled={busy}>Disconnect</button>} />
      </SettingsCard>
    </SettingsGroup>}
    {(error || status?.lastError) && <p className="away-pairing-error" role="alert">{error || status?.lastError}</p>}
  </section>;
}

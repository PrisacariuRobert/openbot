import { useEffect, useState, type ReactNode } from "react";
import { CheckCircle2, LoaderCircle, MessageCircle, Send } from "lucide-react";
import type { Bot } from "../shared/types";
import { SettingsCard, SettingsGroup, SettingsRow } from "../studio/Settings";
import "./away-access-panel.css";

type Status = {
  configured: boolean; botUsername: string | null; paired: boolean; ownerName: string | null;
  pairingCode: string | null; pairingExpiresAt: string | null; defaultBotId: string | null; lastError: string | null;
};

type Channel = "telegram" | "discord";

const COPY: Record<Channel, { name: string; create: ReactNode; tokenHint: string; placeholder: string; pairCommand: (code: string) => string; handle: (name: string | null) => string }> = {
  telegram: {
    name: "Telegram",
    create: <>In Telegram, message <strong>@BotFather</strong>, send <strong>/newbot</strong>, and copy the token it gives you.</>,
    tokenHint: "It stays encrypted on this host and is never shown again.",
    placeholder: "123456789:AA…",
    pairCommand: (code) => `/start ${code}`,
    handle: (name) => `@${name}`,
  },
  discord: {
    name: "Discord",
    create: <>At <strong>discord.com/developers</strong>, create an application, open <strong>Bot</strong>, copy its token, and add the bot to a server you're in so you can direct-message it.</>,
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
    <div className="away-pairing-heading"><span className="away-pairing-icon"><MessageCircle size={23} /></span><div>
      <h3>{status?.paired ? `Your team is on ${copy.name}` : `Message your team from ${copy.name}`}</h3>
      <p>Ask from your phone, get the answer back in the same chat. Approvals stay in OpenBot.</p>
    </div></div>

    {!status?.configured && <SettingsGroup title="Connect a bot">
      <SettingsCard>
        <SettingsRow
          title="1. Create a bot"
          description={copy.create}
        />
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
        <SettingsRow
          title={status.pairingCode ? `Send this to ${copy.handle(status.botUsername)}` : "The code expired"}
          description={status.pairingCode
            ? <>From your own {copy.name} account, send <strong>{copy.pairCommand(status.pairingCode)}</strong> as a direct message. Only that account can use this bot.</>
            : "Make a new one-time code."}
          control={status.pairingCode ? <LoaderCircle className="spinner" size={19} aria-label="Waiting for your message" /> : <button onClick={() => void run(() => request<Status>(channel, "/pairing-code", "POST"))} disabled={busy}>New code</button>}
        />
      </SettingsCard>
    </SettingsGroup>}

    {status?.paired && <SettingsGroup title="Connected">
      <SettingsCard>
        <SettingsRow
          title={`${copy.handle(status.botUsername)} · ${status.ownerName || "you"}`}
          description={`${defaultName} answers by default. Start a message with @Name to ask someone else; /who lists your team.`}
          control={<CheckCircle2 size={19} />}
        />
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

import { useEffect, useState } from "react";
import type { Bot } from "../shared/types";
import type { WorkApp, WorkSourceChoices, WorkSourceSelection, WorkSourcesSettings } from "../shared/work-sources";
import "./work-sources.css";

export function WorkSourcesPanel({ bots, request }: { bots: Bot[]; request: <T>(url: string, init?: RequestInit) => Promise<T> }) {
  const [botId, setBotId] = useState(bots[0]?.id || "");
  const [settings, setSettings] = useState<WorkSourcesSettings | null>(null);
  const [service, setService] = useState<WorkApp>("slack");
  const [query, setQuery] = useState("");
  const [choices, setChoices] = useState<WorkSourceChoices | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let current = true;
    setSettings(null); setNotice(""); setChoices(null);
    if (botId) void request<WorkSourcesSettings>(`/api/work-sources/${encodeURIComponent(botId)}`).then((value) => { if (current) setSettings(value); }).catch(() => { if (current) setNotice("Couldn’t load the saved sources. Try opening this panel again."); });
    return () => { current = false; };
  }, [botId, request]);
  function toggle(choice: WorkSourceSelection) {
    if (!settings) return;
    const exists = settings.selections.some((entry) => entry.service === choice.service && entry.id === choice.id);
    if (!exists && settings.selections.filter((entry) => entry.service === choice.service).length >= 2) { setNotice("Choose up to two sources per app to keep your brief focused."); return; }
    setSettings({ ...settings, selections: exists ? settings.selections.filter((entry) => entry.service !== choice.service || entry.id !== choice.id) : [...settings.selections, choice] }); setNotice("Unsaved changes");
  }
  return <section className="work-sources">
    <div><h3>Make your brief yours</h3><p>Choose Slack channels, Notion pages and Todoist projects for a teammate’s morning brief and weekly review. Gmail and Calendar keep their existing read permissions. Nothing here sends or changes anything in your apps.</p></div>
    <div className="work-source-fields">
      <label>Teammate<select aria-label="Brief teammate" value={botId} disabled={busy} onChange={(event) => setBotId(event.target.value)}>{bots.map((bot) => <option key={bot.id} value={bot.id}>{bot.name}</option>)}</select></label>
      <label>Recent Slack context<select aria-label="Brief lookback" value={settings?.lookbackHours || 24} disabled={!settings || busy} onChange={(event) => { if (settings) setSettings({ ...settings, lookbackHours: Number(event.target.value) as 24 | 72 | 168 }); setNotice("Unsaved changes"); }}><option value={24}>Past day</option><option value={72}>Past three days</option><option value={168}>Past week</option></select></label>
    </div>
    <p className="work-source-note">Weekly reviews always use seven days of Slack context. Notion pages and open Todoist tasks show their current state, not a history of changes. Reconfirm sources after reconnecting an account.</p>
    <ul className="work-source-selected" aria-label="Selected brief sources">{settings?.selections.map((entry) => <li key={`${entry.service}:${entry.id}`}><span><small>{entry.service}</small>{entry.label}</span><button type="button" disabled={busy} aria-label={`Remove ${entry.label}`} onClick={() => toggle(entry)}>Remove</button></li>)}</ul>
    {settings && !settings.selections.length && <p>No extra sources selected. Your teammate will not search these apps for a brief.</p>}
    <div className="work-source-fields">
      <label>App<select aria-label="Brief source app" value={service} disabled={busy} onChange={(event) => { setService(event.target.value as WorkApp); setChoices(null); setQuery(""); }}><option value="slack">Slack</option><option value="notion">Notion</option><option value="todoist">Todoist</option></select></label>
      {service === "notion" && <label>Page name<input value={query} maxLength={200} onChange={(event) => setQuery(event.target.value)} placeholder="Find a shared page" /></label>}
      <button type="button" disabled={busy || !settings} onClick={async () => { setBusy(true); setNotice(""); try { setChoices(await request<WorkSourceChoices>(`/api/work-source-choices/${service}?q=${encodeURIComponent(query)}`)); } catch (error) { setChoices(null); setNotice(error instanceof Error ? error.message : "Couldn’t list these sources."); } finally { setBusy(false); } }}>{busy ? "Working…" : "Browse sources"}</button>
    </div>
    {choices && <div className="work-source-choices">{choices.choices.map((choice) => <label key={choice.id}><input type="checkbox" checked={Boolean(settings?.selections.some((entry) => entry.service === choice.service && entry.id === choice.id))} onChange={() => toggle(choice)} disabled={busy} /><span>{choice.label}</span></label>)}{!choices.choices.length && <p>No shared sources returned. Check this app’s permissions.</p>}{choices.limited && <p className="work-source-note">A bounded list, not every source in your account. For Notion, narrow the page name; Slack lists joined channels from the first page.</p>}</div>}
    <div className="work-source-footer"><p role="status">{notice}</p><button type="button" className="primary-button" disabled={!settings || busy} onClick={async () => { if (!settings) return; setBusy(true); try { const result = await request<WorkSourcesSettings>(`/api/work-sources/${encodeURIComponent(botId)}`, { method: "PUT", body: JSON.stringify({ lookbackHours: settings.lookbackHours, selections: settings.selections }) }); setSettings(result); setNotice("Saved for this teammate. Future briefs will use these sources."); } catch (error) { setNotice(error instanceof Error ? error.message : "Couldn’t save your sources."); } finally { setBusy(false); } }}>Save sources</button></div>
  </section>;
}

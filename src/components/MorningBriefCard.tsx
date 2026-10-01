import { useCallback, useEffect, useState } from "react";
import { LoaderCircle, Sunrise } from "lucide-react";

interface Brief { id: string; enabled: boolean; nextRunAt: string | null; lastRunAt: string | null; lastStatus: string; botId: string; botName: string; threadId: string; time: string; weekdaysOnly: boolean; city: string | null }
interface State { routine: Brief | null; bots: Array<{ id: string; name: string }>; macAccess: boolean; available: boolean }

const when = (iso: string | null) => {
  if (!iso) return "";
  const date = new Date(iso), days = Math.round((new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() - new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime()) / 86_400_000);
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return days <= 0 ? `today at ${time}` : days === 1 ? `tomorrow at ${time}` : `${date.toLocaleDateString([], { weekday: "long" })} at ${time}`;
};

/** One tap to a daily note from the team: what's on today, the mail that
 * needs you, what's due. It only reads, and runs at the time you pick. */
export function MorningBriefCard({ onOpenThread }: { onOpenThread?: (threadId: string) => void }) {
  const [state, setState] = useState<State | null>(null);
  const [editing, setEditing] = useState(false), [busy, setBusy] = useState<string | null>(null), [error, setError] = useState(""), [note, setNote] = useState("");
  const [botId, setBotId] = useState(""), [time, setTime] = useState("08:00"), [weekdaysOnly, setWeekdaysOnly] = useState(true), [city, setCity] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/morning-brief", { credentials: "same-origin" });
    if (!response.ok) return;
    const value = await response.json() as State;
    setState(value);
    setBotId((current) => current || value.routine?.botId || value.bots[0]?.id || "");
    if (value.routine) { setTime(value.routine.time); setWeekdaysOnly(value.routine.weekdaysOnly); setCity(value.routine.city || ""); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const call = async (key: string, url: string, method: string, body?: object) => {
    setBusy(key); setError(""); setNote("");
    try {
      const response = await fetch(url, { method, credentials: "same-origin", headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
      const value = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(value.error || "That didn't work.");
      await load();
      return value;
    } catch (reason) { setError(reason instanceof Error ? reason.message : "That didn't work."); return null; }
    finally { setBusy(null); }
  };
  const save = async () => { if (await call("save", "/api/morning-brief", "POST", { botId, time, weekdaysOnly, city: city.trim() || null, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })) { setEditing(false); setNote("Saved. Your first brief arrives at the next run."); } };
  const tryNow = async () => { const value = await call("try", "/api/morning-brief/try", "POST") as { threadId?: string } | null; if (value?.threadId) { setNote("Started. The brief will appear in the chat in a minute or so."); onOpenThread?.(value.threadId); } };

  if (!state || !state.available || !state.bots.length) return null;
  const routine = state.routine;
  const form = (
    <div className="brief-form">
      {state.bots.length > 1 && (
        <label>Who writes it<select value={botId} onChange={(event) => setBotId(event.target.value)}>{state.bots.map((bot) => <option key={bot.id} value={bot.id}>{bot.name}</option>)}</select></label>
      )}
      <label>At<input type="time" value={time} onChange={(event) => setTime(event.target.value)} /></label>
      <label>On<select value={weekdaysOnly ? "weekdays" : "daily"} onChange={(event) => setWeekdaysOnly(event.target.value === "weekdays")}><option value="weekdays">Weekdays</option><option value="daily">Every day</option></select></label>
      <label>Weather for <small>(optional)</small><input value={city} maxLength={60} placeholder="A city, like Vienna" onChange={(event) => setCity(event.target.value)} /></label>
    </div>
  );
  return (
    <section className="brief-card" aria-label="Morning brief">
      <span className="brief-icon" aria-hidden="true"><Sunrise size={20} /></span>
      <div className="brief-copy">
        <strong>{routine ? "Your morning brief" : "Start your day with a brief"}</strong>
        <p>{routine
          ? `${routine.weekdaysOnly ? "Every weekday" : "Every day"} at ${routine.time}, ${routine.botName} writes what's on your calendar, the mail that needs you and what's due${routine.city ? `, plus the weather in ${routine.city}` : ""}. Next: ${when(routine.nextRunAt)}.`
          : "Each morning your teammate writes a short note: what's on your calendar, the mail that needs you, what's due. It only reads — it never sends or changes anything."}</p>
        {!state.macAccess && <p className="brief-warning" role="status">Turn on <strong>Files &amp; apps on this Mac</strong> in Permissions so it can read your Calendar, Mail and Reminders.</p>}
        {(!routine || editing) && form}
        <div className="brief-actions">
          {!routine || editing ? <button type="button" disabled={busy !== null || !botId} onClick={() => void save()}>{busy === "save" ? <LoaderCircle className="spinner" size={14} /> : null}{routine ? "Save" : "Start my morning brief"}</button> : <button type="button" className="secondary" onClick={() => setEditing(true)}>Change</button>}
          {editing && <button type="button" className="secondary" onClick={() => { setEditing(false); void load(); }}>Cancel</button>}
          <button type="button" className="secondary" disabled={busy !== null} onClick={() => void tryNow()}>{busy === "try" ? <LoaderCircle className="spinner" size={14} /> : null}Try it now</button>
          {routine && !editing && <button type="button" className="quiet" disabled={busy !== null} onClick={() => void call("off", "/api/morning-brief", "DELETE")}>Turn off</button>}
        </div>
        {note && <p className="brief-note" role="status">{note}</p>}
        {error && <p role="alert" className="brief-error">{error}</p>}
      </div>
    </section>
  );
}

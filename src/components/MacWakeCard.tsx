import { useEffect, useState } from "react";
import { AlarmClock, LoaderCircle } from "lucide-react";

type WakeState = { available: boolean; enabled: boolean; time: string | null; suggested: string | null };
const clock = (time: string | null) => time ? time.slice(0, 5) : "";

/** Routines run on time even when the Mac has gone to sleep: macOS wakes it
 * a few minutes before the day's first one. Setting it asks for the owner's
 * password in macOS's own prompt. */
export function MacWakeCard() {
  const [state, setState] = useState<WakeState | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const load = () => fetch("/api/mac-wake", { credentials: "same-origin" }).then((r) => r.json()).then(setState).catch(() => {});
  useEffect(() => { void load(); }, []);
  if (!state?.available || (!state.enabled && !state.suggested)) return null;
  const change = async (enabled: boolean) => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/mac-wake", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled }) });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || "The wake schedule wasn't changed.");
      setState(value);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The wake schedule wasn't changed."); }
    finally { setBusy(false); }
  };
  const stale = state.enabled && state.suggested && state.suggested !== state.time;
  return (
    <section className="mac-wake-card" aria-label="Wake my Mac for routines">
      <span className="mac-wake-icon"><AlarmClock size={20} /></span>
      <div>
        <strong>{state.enabled ? `Your Mac wakes at ${clock(state.time)} every day` : "Wake your Mac for routines"}</strong>
        <p>{state.enabled
          ? stale ? `Your first routine moved — update to wake at ${clock(state.suggested)}.` : "So your first routine runs on time even if the Mac went to sleep. Keep it plugged in; a closed MacBook may still stay asleep."
          : `Your Mac can wake at ${clock(state.suggested)}, just before your first routine. macOS asks for your password once.`}</p>
        {error && <p role="alert" className="mac-wake-error">{error}</p>}
      </div>
      <div className="mac-wake-actions">
        {stale && <button type="button" disabled={busy} onClick={() => void change(true)}>Update</button>}
        <button type="button" disabled={busy} onClick={() => void change(!state.enabled)}>{busy ? <LoaderCircle className="spinner" size={15} /> : state.enabled ? "Turn off" : "Turn on"}</button>
      </div>
    </section>
  );
}

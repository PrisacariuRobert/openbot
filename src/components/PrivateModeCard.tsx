import { useEffect, useState } from "react";
import { SettingsCard, SettingsGroup, SwitchRow } from "../studio/Settings";
import "./private-mode.css";

interface PrivateModeView { on: boolean; names: string[]; local: boolean; connection: string | null; model: string }

/** Task F3: one teammate's Private mode. It applies at once, like Autopilot. */
export function PrivateModeCard({ botId, name }: { botId: string; name: string }) {
  const [view, setView] = useState<PrivateModeView | null>(null);
  const [names, setNames] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    setView(null); setError("");
    fetch(`/api/bots/${encodeURIComponent(botId)}/private-mode`, { signal: abort.signal })
      .then(async (response) => { if (!response.ok) throw new Error(); return response.json() as Promise<PrivateModeView>; })
      .then((value) => { setView(value); setNames(value.names.join("\n")); })
      .catch(() => { if (!abort.signal.aborted) setError("Private mode couldn't be loaded. Reopen this page to try again."); });
    return () => abort.abort();
  }, [botId]);
  const save = async (on: boolean, list: string[]) => {
    setBusy(true); setError(""); setSaved(false);
    try {
      const response = await fetch(`/api/bots/${encodeURIComponent(botId)}/private-mode`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ on, names: list }) });
      const value = await response.json().catch(() => ({})) as PrivateModeView & { error?: string };
      if (!response.ok) throw new Error(value.error || "That couldn't be saved. Try again.");
      setView(value); setNames(value.names.join("\n"));
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That couldn't be saved. Try again.");
      return false;
    } finally { setBusy(false); }
  };
  const list = () => names.split("\n").map((line) => line.trim()).filter(Boolean);
  const where = view?.connection || "your AI";
  const description = !view
    ? (error ? "Not loaded." : "Checking…")
    : view.local
      ? `${name} uses ${view.model} on this Mac, so nothing it reads leaves the Mac. ${view.on ? "Private mode starts masking if you switch to a cloud AI." : "Turn this on to mask personal details if you later switch to a cloud AI."}`
      : view.on
        ? `Before anything reaches ${where}, names, email addresses, phone numbers, IBANs and card numbers become placeholders such as [NAME_1]. ${name}'s answers get the real ones back on this Mac. Pictures and screenshots stay here.`
        : `Off: ${where} sees what ${name} reads as written. On: personal details are replaced before they leave this Mac.`;
  return (
    <SettingsGroup title="Private mode">
      <SettingsCard>
        <SwitchRow title={`Keep ${name}'s personal details on this Mac`} description={description} checked={Boolean(view?.on)} disabled={!view || busy} onChange={(next) => void save(next, list())} />
        {view?.on && (
          <div className="private-mode-names">
            <label htmlFor={`private-names-${botId}`}>Also hide these names <small>one per line</small></label>
            <textarea id={`private-names-${botId}`} rows={3} value={names} maxLength={8_000} onChange={(event) => { setNames(event.target.value); setSaved(false); }} placeholder={"Mira Kovac\nTom"} />
            <p>Names are recognised in mail headers, greetings and sign-offs, contacts, and as first and last names in your own requests and memories. A first name alone, mentioned in passing, can get through: add it here.</p>
            <button type="button" className="secondary" disabled={busy} onClick={() => void save(true, list()).then((ok) => setSaved(ok))}>Save names</button>
            {saved && <small role="status">Saved.</small>}
          </div>
        )}
      </SettingsCard>
      {error && <small role="alert">{error}</small>}
    </SettingsGroup>
  );
}

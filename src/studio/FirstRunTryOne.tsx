import { useEffect, useState, type ReactNode } from "react";
import { Check, Circle, LoaderCircle } from "lucide-react";
import type { Bot } from "../shared/types";
import { firstRunSuggestions, macStepRows, type FirstRunSuggestion, type MacStepRow } from "../shared/first-run";
import "./guided-first-run.css";

type Permissions = { available: false } | { available: true; automation: Record<"Calendar" | "Reminders", string | null>; fullDiskAccess: "granted" | "missing" | "unknown" };

const post = (url: string, body: unknown, method = "POST") => fetch(url, { method, credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

/** "Try one", in the first teammate's empty conversation. A card fills the
 * message box without sending; a card that needs the Mac first shows only
 * what it needs, with Skip always there. */
export function FirstRunTryOne({ bot, macAccess, onPick }: { bot: Bot; macAccess: boolean; onPick: (text: string) => void }) {
  const [permissions, setPermissions] = useState<Permissions | null>(null);
  const [setting, setSetting] = useState<FirstRunSuggestion | null>(null);
  const load = () => fetch("/api/mac/permissions", { credentials: "same-origin" }).then(async (response) => { if (response.ok) setPermissions(await response.json() as Permissions); }).catch(() => setPermissions({ available: false }));
  useEffect(() => {
    void load();
    // Coming back from System Settings: check again.
    const again = () => void load();
    window.addEventListener("focus", again);
    return () => window.removeEventListener("focus", again);
  }, []);
  const mac = permissions?.available === true;
  const cards = firstRunSuggestions({ browserEnabled: bot.browserEnabled }, { mac });

  const choose = (card: FirstRunSuggestion) => {
    if (mac && macStepRows(card.needs).length) setSetting(card);
    else onPick(card.text);
  };

  if (setting && permissions?.available) return <MacSetup card={setting} permissions={permissions} macAccess={macAccess} onRefresh={load}
    onDone={() => { onPick(setting.text); setSetting(null); }} onBack={() => setSetting(null)} />;

  return <div className="first-run-try" aria-label={`Things to try with ${bot.name}`}>
    <p className="first-run-try-lead">Try one. It goes into the message box; nothing is sent until you press Send.</p>
    <div className="chat-starters">
      {cards.map((card) => (
        <button key={card.key} type="button" className="chat-starter" onClick={() => choose(card)}>
          <strong>{card.label}</strong>
          <span>{card.hint}</span>
        </button>
      ))}
    </div>
  </div>;
}

function MacSetup({ card, permissions, macAccess, onRefresh, onDone, onBack }: {
  card: FirstRunSuggestion; permissions: Extract<Permissions, { available: true }>; macAccess: boolean;
  onRefresh: () => Promise<void>; onDone: () => void; onBack: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null), [error, setError] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const run = async (key: string, action: () => Promise<Response>) => {
    setBusy(key); setError("");
    try {
      const response = await action();
      const result = await response.json().catch(() => ({})) as { error?: string; state?: string };
      if (!response.ok) throw new Error(result.error || "That didn’t work. Try again.");
      if (result.state) setAnswers((current) => ({ ...current, [key]: result.state! }));
      await onRefresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "That didn’t work. Try again."); }
    finally { setBusy(null); }
  };
  const state = (row: MacStepRow): { done: boolean; text: string; action?: ReactNode } => {
    if (row.need === "mac-apps") return macAccess
      ? { done: true, text: "On" }
      : { done: false, text: "Off", action: <button type="button" disabled={busy !== null} onClick={() => {
        if (window.confirm("Let every teammate inspect visible files and accessible app controls on this Mac? Actions such as moving files, clicking and typing will still ask first.")) void run(row.need, () => post("/api/settings", { macAccessEnabled: true }, "PATCH"));
      }}>Turn on</button> };
    if (row.need === "full-disk-access") return permissions.fullDiskAccess === "granted"
      ? { done: true, text: "On" }
      : { done: false, text: "Off", action: <span className="first-run-actions">
        <button type="button" disabled={busy !== null} onClick={() => void run(row.need, () => post("/api/mac/permissions/open", { pane: "full-disk-access" }))}>Open System Settings</button>
        <button type="button" className="secondary" disabled={busy !== null} onClick={() => void run("reveal", () => post("/api/mac/permissions/open", { pane: "reveal-app" }))}>Show Sidemates</button>
      </span> };
    const app = row.need === "automation:Calendar" ? "Calendar" : "Reminders";
    const answer = answers[row.need] ?? permissions.automation[app];
    if (answer === "granted") return { done: true, text: "Allowed" };
    if (answer === "denied") return { done: false, text: "Turned off. macOS won’t ask again.", action: <button type="button" disabled={busy !== null} onClick={() => void run("automation", () => post("/api/mac/permissions/open", { pane: "automation" }))}>Open System Settings</button> };
    return { done: false, text: answer === "waiting" ? "No answer yet. Look for the macOS prompt." : "Not asked yet", action: <button type="button" disabled={busy !== null || !macAccess} onClick={() => void run(row.need, () => post("/api/mac/permissions/request", { app }))}>{busy === row.need ? <LoaderCircle size={14} className="spinner" aria-hidden="true" /> : null}Ask now</button> };
  };
  const rows = macStepRows(card.needs);
  const ready = rows.every((row) => state(row).done);
  return <section className="first-run-mac" aria-labelledby="first-run-mac-heading">
    <h3 id="first-run-mac-heading">Set up your Mac</h3>
    <p className="first-run-try-lead">“{card.label}” needs these. Each is asked once; you can skip and do it later.</p>
    <ul>
      {rows.map((row) => {
        const current = state(row);
        return <li key={row.need} className={current.done ? "done" : ""}>
          <span className="first-run-mac-mark" aria-hidden="true">{current.done ? <Check size={16} /> : <Circle size={14} />}</span>
          <span className="first-run-mac-text"><strong>{row.title}</strong><small>{row.why}</small><small className="first-run-mac-state">{current.text}</small></span>
          {current.action}
        </li>;
      })}
    </ul>
    {error && <p className="send-error" role="alert">{error}</p>}
    <div className="guided-run-actions">
      <button type="button" onClick={onBack}>Back</button>
      <button type="button" onClick={onDone}>Skip for now</button>
      <button type="button" className="primary" disabled={!ready} onClick={onDone}>Continue</button>
    </div>
  </section>;
}

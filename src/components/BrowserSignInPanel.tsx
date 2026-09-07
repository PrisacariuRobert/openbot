import { useRef, useState } from "react";
import { LockKeyhole, RefreshCw } from "lucide-react";
import type { BrowserSignInHandoff } from "../shared/browser-sign-in";
import "./browser-sign-in.css";

export function BrowserSignInPanel({ approvalId, handoff, disabled = false, onBusyChange, onInteraction }: {
  approvalId: string; handoff: BrowserSignInHandoff; disabled?: boolean;
  onBusyChange: (busy: boolean) => void; onInteraction: () => void;
}) {
  const [view, setView] = useState<{ siteOrigin: string; screenshot: string | null } | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const lock = useRef(false);
  async function control(input: Record<string, unknown>) {
    if (lock.current || disabled || (needsRefresh && input.operation !== "view")) return;
    lock.current = true; setBusy(true); onBusyChange(true); onInteraction(); setError("");
    // Private input is never retained after submission, including a failed request.
    setText("");
    try {
      const response = await fetch(`/api/approvals/${encodeURIComponent(approvalId)}/sign-in`, {
        method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", body: JSON.stringify(input),
      });
      if (!response.ok) throw new Error("Couldn’t update sign-in. Refresh the screen and task status. Your last input may have reached the website; it wasn’t retried.");
      const result = await response.json() as { siteOrigin: string; screenshot: string | null };
      if (typeof result.siteOrigin !== "string" || (result.screenshot !== null && !/^data:image\/(jpeg|png);base64,/.test(result.screenshot))) throw new Error("The sign-in screen is unavailable. Refresh to check again.");
      setView(result); setNeedsRefresh(false);
    } catch (reason) {
      setView(null); setNeedsRefresh(true); setError(reason instanceof Error ? reason.message : "Refresh sign-in before continuing.");
    } finally { lock.current = false; setBusy(false); onBusyChange(false); }
  }
  const unavailable = disabled || busy || needsRefresh;
  return <section className="browser-sign-in" aria-label="Private website sign-in">
    <header className="browser-sign-in-title"><LockKeyhole size={20} strokeWidth={1.5} /><div><strong>{handoff.siteOrigin.replace(/^https?:\/\//, "")}</strong><span>Your teammate is waiting for you.</span></div></header>
    <p className="browser-sign-in-hint">Sign in privately in your teammate’s browser. Passwords and codes stay out of the conversation and the model.</p>
    {!view && <button type="button" disabled={disabled || busy} onClick={() => void control({ operation: "view" })}>{needsRefresh ? "Refresh sign-in screen" : "Open sign-in"}</button>}
    {view && <>
      <div className="browser-sign-in-address"><span>Currently showing</span><strong>{view.siteOrigin}</strong><button type="button" aria-label="Refresh screen" disabled={disabled || busy} onClick={() => void control({ operation: "view" })}><RefreshCw size={15} /></button></div>
      <p className="browser-sign-in-hint">Check the address before entering anything. A website may send you to its sign-in provider.</p>
      {view.screenshot && <button type="button" className="browser-sign-in-screen" disabled={unavailable} aria-label="Website screen. Click a field, then enter text below. Use Tab to move between fields."
        onClick={(event) => { if (event.detail === 0) return; const rect = event.currentTarget.getBoundingClientRect(); void control({ operation: "click", x: Math.min(1280, Math.max(0, (event.clientX - rect.left) / rect.width * 1280)), y: Math.min(820, Math.max(0, (event.clientY - rect.top) / rect.height * 820)) }); }}>
        <img src={view.screenshot} alt="Your private browser sign-in screen" draggable={false} />
      </button>}
      <form onSubmit={(event) => { event.preventDefault(); if (text) void control({ operation: "type", value: text, replace: true }); }}>
        <label htmlFor={`private-sign-in-${approvalId}`}>Text for the selected field</label>
        <div className="browser-sign-in-input"><input id={`private-sign-in-${approvalId}`} type="password" autoComplete="off" spellCheck={false} value={text} disabled={unavailable} onChange={(event) => setText(event.target.value)} placeholder="Kept out of chat" maxLength={4000} /><button type="submit" disabled={unavailable || !text}>Enter text</button></div>
      </form>
      <details className="browser-sign-in-keyboard"><summary>Keyboard controls</summary><div className="browser-sign-in-keys">{["Tab", "Enter", "Backspace", "Escape"].map((key) => <button type="button" key={key} disabled={unavailable} onClick={() => void control({ operation: "key", key })}>{key}</button>)}</div><p className="browser-sign-in-hint">Use Tab to select a field, then enter text above. If the website blocks this browser or needs an unsupported passkey, stop here.</p></details>
      <p className="browser-sign-in-hint">Once the right account is open, close any password prompts and continue your task below.</p>
    </>}
    {busy && <p role="status">Updating your private browser…</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}

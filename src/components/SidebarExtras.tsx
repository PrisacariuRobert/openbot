import { useEffect, useState } from "react";
import { ArrowUpCircle, LoaderCircle, MessageSquareHeart, X } from "lucide-react";

type Update = { current: string; latest: string | null; available: boolean; notesUrl: string | null; canInstall: boolean; installing: boolean };

/** Bottom of the sidebar: a note when a new version is out (one tap to
 * install it) and a way to tell us what to fix. */
export function SidebarExtras() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [feedback, setFeedback] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const load = () => fetch("/api/update", { credentials: "same-origin" }).then((r) => r.ok ? r.json() : null).then(setUpdate).catch(() => {});
    void load();
    const timer = window.setInterval(load, 30 * 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const install = async () => {
    setError("");
    const response = await fetch("/api/update", { method: "POST", credentials: "same-origin" });
    const value = await response.json().catch(() => ({}));
    if (!response.ok) { setError(value.error || "The update couldn't start."); return; }
    setUpdate(value);
    // The studio restarts on the new version; reload once it answers again.
    const wait = window.setInterval(async () => {
      try { const health = await (await fetch("/api/healthz")).json(); if (health.version && health.version !== update?.current) { window.clearInterval(wait); window.location.reload(); } } catch { /* restarting */ }
    }, 3_000);
  };
  return <div className="sidebar-extras">
    {update?.available && <div className="update-pill">
      <ArrowUpCircle size={16} aria-hidden="true" />
      <span><strong>OpenBot {update.latest}</strong><small>{update.installing ? "Updating… back in a minute" : "A new version is ready"}</small></span>
      {update.canInstall
        ? <button type="button" disabled={update.installing} onClick={() => void install()}>{update.installing ? <LoaderCircle className="spinner" size={14} /> : "Update"}</button>
        : update.notesUrl && <a href={update.notesUrl} target="_blank" rel="noreferrer">What's new</a>}
    </div>}
    {error && <p className="update-error" role="alert">{error}</p>}
    <button type="button" className="feedback-link" onClick={() => setFeedback(true)}><MessageSquareHeart size={15} aria-hidden="true" /> Send feedback</button>
    {feedback && <FeedbackSheet version={update?.current || ""} onClose={() => setFeedback(false)} />}
  </div>;
}

function FeedbackSheet({ version, onClose }: { version: string; onClose: () => void }) {
  const [text, setText] = useState(""), [details, setDetails] = useState(true);
  const send = async () => {
    let facts = "";
    if (details) {
      const provider = await fetch("/api/provider", { credentials: "same-origin" }).then((r) => r.json()).catch(() => null) as { instances?: Array<{ id: string; connected: boolean }> } | null;
      const connected = (provider?.instances || []).filter((item) => item.connected).map((item) => item.id.replace(/^local-/, "")).join(", ") || "none";
      facts = `\n\n---\nOpenBot ${version || "?"} · ${navigator.platform} · ${navigator.userAgent.match(/Mac OS X [\d_]+/)?.[0]?.replace(/_/g, ".") || ""}\nAI connected: ${connected}`;
    }
    const firstLine = text.trim().split("\n")[0]!.slice(0, 80) || "Feedback";
    const url = `https://github.com/PrisacariuRobert/openbot/issues/new?title=${encodeURIComponent(firstLine)}&body=${encodeURIComponent(text.trim() + facts)}&labels=feedback`;
    window.open(url, "_blank", "noopener,noreferrer");
    onClose();
  };
  return <div className="feedback-backdrop" role="dialog" aria-modal="true" aria-label="Send feedback" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="feedback-sheet">
      <header><strong>What should we fix or add?</strong><button type="button" aria-label="Close" onClick={onClose}><X size={16} /></button></header>
      <textarea autoFocus value={text} onChange={(event) => setText(event.target.value)} placeholder="Something that didn't work, felt confusing, or that you wish your team could do…" rows={6} />
      <label><input type="checkbox" checked={details} onChange={(event) => setDetails(event.target.checked)} /> Include version, macOS and which AI is connected — never your chats</label>
      <footer>
        <small>Opens GitHub to post it (a free account is enough).</small>
        <button type="button" disabled={!text.trim()} onClick={() => void send()}>Send</button>
      </footer>
    </div>
  </div>;
}

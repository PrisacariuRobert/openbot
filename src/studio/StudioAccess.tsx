import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight, LockKeyhole, LoaderCircle } from "lucide-react";

/** One first-load/recovery surface for both routes, including paired browsers. */
export function StudioAccess({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<"checking" | "ready" | "locked" | "offline">("checking");
  const [retry, setRetry] = useState(0), [key, setKey] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    void fetch("/api/state", { signal: abort.signal, cache: "no-store" }).then((response) => {
      if (!abort.signal.aborted) setPhase(response.ok ? "ready" : response.status === 401 ? "locked" : "offline");
    }).catch(() => { if (!abort.signal.aborted) setPhase("offline"); });
    const locked = () => setPhase("locked");
    window.addEventListener("openbot:locked", locked);
    return () => { abort.abort(); window.removeEventListener("openbot:locked", locked); };
  }, [retry]);
  if (phase === "ready") return children;
  return <main className="studio-access"><section>
    <span className="access-mark"><LockKeyhole size={24} strokeWidth={1.5} /></span>
    <p className="overline">OPENBOT</p>
    <h1>{phase === "locked" ? "Your studio is private." : phase === "offline" ? "Let’s reconnect." : "Opening your studio."}</h1>
    <p>{phase === "locked" ? "Use your studio’s access key to continue on this device." : phase === "offline" ? "Keep the Mac running OpenBot awake and connected, then try again." : "Your conversations and teammates will be here in a moment."}</p>
    {phase === "checking" && <LoaderCircle className="spinner" size={21} aria-label="Loading" />}
    {phase === "offline" && <button className="primary" onClick={() => { setPhase("checking"); setRetry((n) => n + 1); }}>Try again <ArrowRight size={16} /></button>}
    {phase === "locked" && <form onSubmit={async (event) => {
      event.preventDefault(); if (busy) return; setBusy(true); setError("");
      try {
        const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: key }) });
        if (!response.ok) throw new Error("That key wasn’t accepted. Check it on the Mac running your studio.");
        setKey(""); setPhase("checking"); setRetry((n) => n + 1);
      } catch (reason) { setError(reason instanceof Error ? reason.message : "Couldn’t connect. Please try again."); }
      finally { setBusy(false); }
    }}><label>Access key<input autoFocus type="password" autoComplete="off" required value={key} onChange={(event) => setKey(event.target.value)} /></label><button className="primary" disabled={busy}>{busy ? "Connecting…" : "Unlock studio"}<ArrowRight size={16} /></button></form>}
    {error && <p role="alert">{error}</p>}
  </section></main>;
}

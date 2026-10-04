import { useState } from "react";
import { Car, Headphones, LoaderCircle, Lock, Share } from "lucide-react";

/** "Hey Siri, Ask Sidemates": a signed Shortcut made on this Mac, imported on
 * the iPhone by scanning a one-time code. It gets its own revocable key. */
export function SiriCard() {
  const [invite, setInvite] = useState<{ qr: string; link: string; kind: "ask" | "share" } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [needsConnection, setNeedsConnection] = useState(false);
  const make = async (kind: "ask" | "share") => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/access/siri", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind }) });
      const value = await response.json();
      if (response.status === 409) { setError(""); setNeedsConnection(true); return; }
      if (!response.ok) throw new Error(value.error || "The Siri shortcut couldn't be made.");
      setInvite({ ...value, kind });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The Siri shortcut couldn't be made."); }
    finally { setBusy(false); }
  };
  return (
    <section className="siri-card" aria-label="Ask with Siri">
      <span className="siri-orb" aria-hidden="true"><i /><i /><i /></span>
      <div className="siri-copy">
        <strong>“Hey Siri, Ask Sidemates”</strong>
        <p>Ask your team out loud, and name a teammate: “ask Nova to find a hotel in Rome”. Siri reads the answer back.</p>
        <ul className="siri-places" aria-label="Works from">
          <li><Lock size={13} />Lock Screen</li><li><Headphones size={13} />AirPods</li><li><Car size={13} />CarPlay</li>
        </ul>
        {invite ? <>
          <img src={invite.qr} width={180} height={180} alt={`Scan with your iPhone camera to add the ${invite.kind === "share" ? "Send to Sidemates" : "Ask Sidemates"} shortcut`} />
          <ol>
            <li>Scan this with your iPhone camera and open the link.</li>
            <li>Tap <strong>Add Shortcut</strong>.</li>
            {invite.kind === "share"
              ? <li>In any app, tap <strong>Share</strong> → <strong>Send to Sidemates</strong>, and say what to do with it.</li>
              : <li>Say <strong>“Hey Siri, Ask Sidemates”</strong>, then “ask Nova to…”.</li>}
          </ol>
          <small>The code works once, for 5 minutes. The shortcut shows up as “Siri” in your phones below, where you can remove it.</small>
        </> : <div className="siri-actions">
          <button type="button" className="siri-add" onClick={() => void make("ask")} disabled={busy}>{busy ? <LoaderCircle className="spinner" size={15} /> : null}Add to Siri</button>
          <button type="button" className="siri-share" onClick={() => void make("share")} disabled={busy}><Share size={14} />Add to Share menu</button>
        </div>}
        {needsConnection && <p className="siri-hint">First set up the internet connection below, so your iPhone can reach this Mac. Then tap Add to Siri again.</p>}
        {error && <p role="alert" className="siri-error">{error}</p>}
      </div>
    </section>
  );
}

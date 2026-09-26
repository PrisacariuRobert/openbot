import { useState } from "react";
import { LoaderCircle, Mic } from "lucide-react";

/** "Hey Siri, Ask OpenBot": a signed Shortcut made on this Mac, imported on
 * the iPhone by scanning a one-time code. It gets its own revocable key. */
export function SiriCard() {
  const [invite, setInvite] = useState<{ qr: string; link: string } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [needsConnection, setNeedsConnection] = useState(false);
  const make = async () => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/access/siri", { method: "POST", credentials: "same-origin" });
      const value = await response.json();
      if (response.status === 409) { setError(""); setNeedsConnection(true); return; }
      if (!response.ok) throw new Error(value.error || "The Siri shortcut couldn't be made.");
      setInvite(value);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The Siri shortcut couldn't be made."); }
    finally { setBusy(false); }
  };
  return (
    <section className="siri-card" aria-label="Ask with Siri">
      <span className="siri-icon"><Mic size={20} /></span>
      <div className="siri-copy">
        <strong>“Hey Siri, Ask OpenBot”</strong>
        <p>Ask your team by voice from the Lock Screen, AirPods or CarPlay. Siri reads the answer back.</p>
        {invite ? <>
          <img src={invite.qr} width={180} height={180} alt="Scan with your iPhone camera to add the Ask OpenBot shortcut" />
          <ol>
            <li>Scan this with your iPhone camera and open the link.</li>
            <li>Tap <strong>Add Shortcut</strong>.</li>
            <li>Say <strong>“Hey Siri, Ask OpenBot”</strong>.</li>
          </ol>
          <small>The code works once, for 5 minutes. The shortcut shows up as “Siri” in your phones below, where you can remove it.</small>
        </> : <button type="button" onClick={() => void make()} disabled={busy}>{busy ? <LoaderCircle className="spinner" size={15} /> : null}Add to Siri</button>}
        {needsConnection && <p className="siri-hint">First set up the internet connection below, so your iPhone can reach this Mac. Then tap Add to Siri again.</p>}
        {error && <p role="alert" className="siri-error">{error}</p>}
      </div>
    </section>
  );
}

import { useState } from "react";
import { Command, LoaderCircle, Search, Share } from "lucide-react";

/** Ask the team from anywhere on this Mac: an "Ask OpenBot" shortcut that
 * works from Spotlight, Siri, the menu bar and a keyboard shortcut, and a
 * "Send to OpenBot" item in every app's Share menu. Shortcuts shows its own
 * Add sheet; nothing is installed without the owner confirming there. */
export function MacShortcutsCard() {
  const [busy, setBusy] = useState<"ask" | "share" | null>(null);
  const [added, setAdded] = useState<string[]>([]);
  const [error, setError] = useState("");
  const add = async (kind: "ask" | "share") => {
    setBusy(kind); setError("");
    try {
      const response = await fetch("/api/access/mac-shortcut", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind }) });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || "The shortcut couldn't be made.");
      setAdded((list) => [...new Set([...list, kind])]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The shortcut couldn't be made."); }
    finally { setBusy(null); }
  };
  return (
    <section className="mac-shortcuts-card" aria-label="Ask from anywhere on this Mac">
      <div className="mac-shortcuts-copy">
        <strong>Ask from anywhere on this Mac</strong>
        <p>Reach your team from Spotlight, Siri, the menu bar or a keyboard shortcut — and send any page or text from an app's Share menu.</p>
        <ul className="siri-places" aria-label="Works from">
          <li><Search size={13} />Spotlight</li><li><Command size={13} />Keyboard shortcut</li><li><Share size={13} />Share menu</li>
        </ul>
        <div className="mac-shortcuts-actions">
          <button type="button" onClick={() => void add("ask")} disabled={busy !== null}>{busy === "ask" ? <LoaderCircle className="spinner" size={15} /> : null}{added.includes("ask") ? "Added — add again" : "Add Ask OpenBot"}</button>
          <button type="button" className="secondary" onClick={() => void add("share")} disabled={busy !== null}>{busy === "share" ? <LoaderCircle className="spinner" size={15} /> : <Share size={14} />}{added.includes("share") ? "Added — add again" : "Add to Share menu"}</button>
        </div>
        {added.length > 0 && <p className="mac-shortcuts-next">Click <strong>Add Shortcut</strong> in the Shortcuts window that opened. For a keyboard shortcut: in Shortcuts, open <strong>Ask OpenBot</strong> → <strong>ⓘ</strong> → <strong>Add Keyboard Shortcut</strong> (for example ⌥ Space).</p>}
        {error && <p role="alert" className="siri-error">{error}</p>}
      </div>
    </section>
  );
}

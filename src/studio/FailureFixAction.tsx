import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import type { FailureFix } from "../shared/failure-fixes";
import type { CapabilityPanel } from "./capability-navigation";
import { BrowserDownloadOffer } from "./BrowserDownloadOffer";
import "./failure-fix.css";

/** The one-click fix next to a stopped task or a "needs your help" note (task J6).
 * Each click is the owner's own decision: it opens a page, turns on a switch the
 * owner can see, or sends the same request again through the normal send path. */
export function FailureFixAction({ fix, macAccessOn, onOpenPanel, onRetry }: {
  fix: FailureFix;
  macAccessOn: boolean;
  onOpenPanel: (panel: CapabilityPanel) => void;
  /** Absent when the request can't be sent again as it was (no trigger, or files attached). */
  onRetry?: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false), [done, setDone] = useState(""), [error, setError] = useState("");
  const [showDownload, setShowDownload] = useState(false);
  if (fix.kind === "retry" && !onRetry) return null;
  if (fix.kind === "mac-access" && macAccessOn) return <small className="failure-fix-done" role="status">Files &amp; apps is on now. Ask again when you’re ready.</small>;
  if (fix.kind === "browser-download" && showDownload) return <BrowserDownloadOffer className="failure-fix-download" />;
  // Sent once: a second click would start a second task.
  if (fix.kind === "retry" && done) return <small className="failure-fix-done" role="status">{done}</small>;

  const act = async () => {
    setError(""); setDone("");
    if (fix.kind === "panel") return onOpenPanel(fix.panel);
    if (fix.kind === "browser-download") return setShowDownload(true);
    setBusy(true);
    try {
      if (fix.kind === "retry") { await onRetry!(); setDone("Asked again."); return; }
      if (fix.kind === "mac-settings") {
        const response = await fetch("/api/mac/permissions/open", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pane: fix.pane }) });
        if (response.status === 409) throw new Error("Open System Settings on the Mac that runs Sidemates.");
        if (!response.ok) throw new Error("System Settings couldn’t be opened. Open it from the Apple menu.");
        setDone("Turn on Sidemates there, then ask again.");
      }
      if (fix.kind === "mac-access") {
        const response = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ macAccessEnabled: true }) });
        if (!response.ok) throw new Error("Files & apps couldn’t be turned on. Try Permissions.");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "That didn’t work. Try once more.");
    } finally { setBusy(false); }
  };

  return <span className="failure-fix">
    <button type="button" className="text-action strong" disabled={busy} aria-busy={busy || undefined} onClick={() => void act()}>
      {busy && <LoaderCircle size={13} className="spinner" aria-hidden="true" />}{fix.label}
    </button>
    {fix.kind === "mac-access" && !error && <small>Lets your teammates use this Mac’s folders and apps. Changes still ask you first.</small>}
    {done && <small role="status">{done}</small>}
    {error && <small role="alert">{error}</small>}
  </span>;
}

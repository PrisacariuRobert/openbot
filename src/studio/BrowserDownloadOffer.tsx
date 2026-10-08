import { useEffect, useRef, useState } from "react";
import { Download, LoaderCircle } from "lucide-react";
import "./browser-download.css";

/** Offers the private browser download (task A5) only when this computer has no
 * Chrome, Edge or Brave and none was downloaded yet. Says nothing otherwise. */

type Status = { systemBrowser: boolean; downloaded: boolean; state: "idle" | "downloading" | "ready" | "failed"; error: string | null };

export const BROWSER_DOWNLOAD_LABEL = "Download a private browser for your teammates (about 190 MB)";
const START_FAILED = "The browser download couldn’t start. Try again.";

export function BrowserDownloadOffer({ className = "" }: { className?: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [requestError, setRequestError] = useState("");
  const [finished, setFinished] = useState(false);
  const timer = useRef<number | null>(null);
  const alive = useRef(true);
  const downloading = useRef(false);

  // Reads the status, and keeps reading every two seconds while a download runs.
  const read = async () => {
    timer.current = null;
    try {
      const response = await fetch("/api/browser/download", { cache: "no-store" });
      if (!response.ok) throw new Error();
      const next = await response.json() as Status;
      if (!alive.current) return;
      if (downloading.current && next.downloaded) setFinished(true);
      downloading.current = next.state === "downloading";
      setStatus(next);
      if (downloading.current) timer.current = window.setTimeout(read, 2_000);
    } catch {
      // The offer is optional: a failed first check shows nothing; a failed check mid-download tries again.
      if (alive.current && downloading.current) timer.current = window.setTimeout(read, 4_000);
    }
  };

  useEffect(() => {
    alive.current = true;
    void read();
    return () => { alive.current = false; if (timer.current !== null) window.clearTimeout(timer.current); };
  }, []);

  async function start() {
    setRequestError("");
    try {
      const response = await fetch("/api/browser/download", { method: "POST" });
      const body = await response.json().catch(() => ({})) as Partial<Status> & { error?: string };
      if (!response.ok) throw new Error(body.error || START_FAILED);
      if (!alive.current) return;
      downloading.current = body.state === "downloading";
      setStatus(body as Status);
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(read, 1_500);
    } catch (reason) {
      if (alive.current) setRequestError(reason instanceof Error && reason.message ? reason.message : START_FAILED);
    }
  }

  if (!status || status.systemBrowser) return null;
  if (status.downloaded) {
    return finished ? <p className={`browser-download is-done ${className}`} role="status">Private browser downloaded. Your teammates can use the web now.</p> : null;
  }
  const busy = status.state === "downloading";
  const error = requestError || (status.state === "failed" ? status.error : null);
  return <div className={`browser-download ${className}`}>
    <p>This computer doesn’t have Chrome, Edge or Brave for web work. Sidemates can download its own copy of Chrome for Testing into its data folder, used only by your teammates.</p>
    <button type="button" onClick={() => void start()} disabled={busy} aria-describedby={error ? "browser-download-error" : undefined}>
      {busy ? <LoaderCircle size={16} className="spinner" aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}
      {busy ? "Downloading… this can take a few minutes" : error ? "Try the download again" : BROWSER_DOWNLOAD_LABEL}
    </button>
    {busy && <p className="browser-download-note" role="status">You can keep going; the download continues in the background.</p>}
    {error && <p id="browser-download-error" className="send-error" role="alert">{error}</p>}
  </div>;
}

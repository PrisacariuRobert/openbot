import { useEffect, useRef, useState } from "react";
import { File as FileIcon, LoaderCircle, Plus, RefreshCw, Trash2 } from "lucide-react";
import type { Bot, SavedFile } from "../shared/types";
import "./saved-files-panel.css";

type PendingPin = { attachmentId: string; name: string };

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

async function responseError(response: Response) {
  const body = await response.json().catch(() => ({})) as { error?: string };
  return body.error || "Something went wrong. Please try again.";
}

export function SavedFilesPanel({ bot }: { bot: Bot }) {
  const [files, setFiles] = useState<SavedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [pendingPin, setPendingPin] = useState<PendingPin | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestVersion = useRef(0);

  const load = () => {
    const version = ++requestVersion.current;
    setLoading(true); setError("");
    void fetch(`/api/bots/${encodeURIComponent(bot.id)}/saved-files`)
      .then(async (response) => { if (!response.ok) throw new Error(await responseError(response)); return response.json() as Promise<SavedFile[]>; })
      .then((next) => { if (version === requestVersion.current) setFiles(next); })
      .catch((cause: Error) => { if (version === requestVersion.current) setError(cause.message); })
      .finally(() => { if (version === requestVersion.current) setLoading(false); });
  };

  useEffect(() => { setFiles([]); setPendingPin(null); setConfirmId(null); load(); return () => { requestVersion.current += 1; }; }, [bot.id]);

  const pin = async (attachmentId: string) => {
    const response = await fetch(`/api/bots/${encodeURIComponent(bot.id)}/saved-files`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attachmentId }) });
    if (!response.ok) throw new Error(await responseError(response));
    const saved = await response.json() as SavedFile;
    setFiles((current) => current.some((file) => file.id === saved.id) ? current : [saved, ...current]);
    setPendingPin(null);
  };

  const upload = async (file: globalThis.File) => {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/attachments?threadId=${encodeURIComponent(bot.threadId)}`, { method: "POST", headers: { "Content-Type": "application/octet-stream", "x-file-name": encodeURIComponent(file.name), "x-file-type": file.type || "application/octet-stream" }, body: file });
      if (!response.ok) throw new Error(await responseError(response));
      const attachment = await response.json() as { id: string };
      try { await pin(attachment.id); }
      catch (cause) { setPendingPin({ attachmentId: attachment.id, name: file.name }); throw new Error(`“${file.name}” uploaded, but could not be added to the library. Retry when ready.`); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not add that file."); }
    finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/bots/${encodeURIComponent(bot.id)}/saved-files/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await responseError(response));
      setFiles((current) => current.filter((file) => file.id !== id)); setConfirmId(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not remove that file."); }
    finally { setBusy(false); }
  };

  return <section className="saved-files-panel" aria-labelledby="saved-files-heading">
    <div className="saved-files-heading-row">
      <div><h2 id="saved-files-heading">Saved files</h2><p>Files {bot.name} can use again in future conversations.</p></div>
      <button type="button" className="saved-files-add" disabled={loading || busy || Boolean(pendingPin) || Boolean(error)} onClick={() => inputRef.current?.click()}><Plus size={16} /> Add files</button>
      <input ref={inputRef} type="file" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file); }} />
    </div>
    {busy && <div className="saved-files-state" role="status"><LoaderCircle className="spinner" size={16} /> Updating saved files…</div>}
    {error && <div className="saved-files-error" role="alert"><span>{error}</span>{pendingPin ? <button type="button" disabled={busy} onClick={() => void (async () => { setBusy(true); setError(""); try { await pin(pendingPin.attachmentId); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not add that file."); } finally { setBusy(false); } })()}><RefreshCw size={14} /> Retry</button> : <button type="button" onClick={load} disabled={busy}><RefreshCw size={14} /> Retry</button>}</div>}
    {loading ? <div className="saved-files-state"><LoaderCircle className="spinner" size={18} /> Loading saved files…</div> : files.length === 0 && !error ? <div className="saved-files-state">No saved files yet. Add a CV or other reference file to get started.</div> : files.length > 0 ? <div className="saved-files-list">{files.map((file) => <div className="saved-file-row" key={file.id}><FileIcon size={18} /><span className="saved-file-meta"><strong>{file.name}</strong><small>{formatSize(file.size)} · Saved to library</small></span><a href={file.url} target="_blank" rel="noreferrer">Open</a>{confirmId === file.id ? <span className="saved-file-confirm" role="group" aria-label={`Remove ${file.name} from library`}><span>Remove from library?</span><small>Removes it from this library, but does not erase existing messages or the original upload.</small><button type="button" disabled={busy} onClick={() => setConfirmId(null)}>Cancel</button><button type="button" disabled={busy} onClick={() => void remove(file.id)}><Trash2 size={14} /> Remove</button></span> : <button type="button" className="saved-file-remove" disabled={busy} onClick={() => setConfirmId(file.id)}>Remove</button>}</div>)}</div> : null}
  </section>;
}

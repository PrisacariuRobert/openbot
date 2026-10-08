import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Download, EyeOff, LoaderCircle, X } from "lucide-react";

interface Shared { title: string; html: string; text: string; filename: string; total: number; summary: string; hasQuestion: boolean; hasTeammate?: boolean }

/** Turns a finished result into a page you can send. Personal details are
 * hidden first, and the owner sees exactly what will be shared. The page is a
 * file made on this Mac: nothing is uploaded anywhere. */
export function ShareResultSheet({ messageId, onClose }: { messageId: string; onClose: () => void }) {
  const [page, setPage] = useState<Shared | null>(null), [question, setQuestion] = useState(true), [teammate, setTeammate] = useState(true), [error, setError] = useState(""), [copied, setCopied] = useState(false);
  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch(`/api/messages/${encodeURIComponent(messageId)}/share-page?question=${question ? 1 : 0}&teammate=${teammate ? 1 : 0}`, { credentials: "same-origin" });
      const value = await response.json().catch(() => ({})) as Shared & { error?: string };
      if (!response.ok) throw new Error(value.error || "That result couldn't be prepared.");
      setPage(value);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "That result couldn't be prepared."); }
  }, [messageId, question, teammate]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close); }, [onClose]);

  const save = () => {
    if (!page) return;
    const url = URL.createObjectURL(new Blob([page.html], { type: "text/html" }));
    const link = document.createElement("a"); link.href = url; link.download = page.filename;
    document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };
  const copy = async () => {
    if (!page) return;
    try { await navigator.clipboard.writeText(page.text); setCopied(true); window.setTimeout(() => setCopied(false), 2_000); } catch { window.prompt("Copy this text:", page.text); }
  };
  return (
    <div className="feedback-backdrop" role="dialog" aria-modal="true" aria-label="Share this result" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="feedback-sheet share-sheet">
        <header><strong>Share this result</strong><button type="button" aria-label="Close" onClick={onClose}><X size={16} /></button></header>
        {error && <p role="alert" className="share-error">{error}</p>}
        {!page && !error && <p className="share-loading"><LoaderCircle className="spinner" size={15} /> Preparing the page…</p>}
        {page && <>
          <p className={`share-hidden${page.total ? " has" : ""}`}><EyeOff size={15} aria-hidden="true" />{page.total ? <span><strong>{page.total} {page.total === 1 ? "detail" : "details"} hidden:</strong> {page.summary}.</span> : <span>Nothing personal was found — still, read it before you send it.</span>}</p>
          <iframe className="share-preview" title="Preview of the page" sandbox="" srcDoc={page.html} />
          {page.hasQuestion && <label><input type="checkbox" checked={question} onChange={(event) => { setPage(null); setQuestion(event.target.checked); }} /> Include my question</label>}
          {page.hasTeammate && <label><input type="checkbox" checked={teammate} onChange={(event) => { setPage(null); setTeammate(event.target.checked); }} /> Include “Make this teammate” <small>(its name, job and instructions, so others can add it)</small></label>}
          <footer>
            <small>A page made on this Mac. Nothing is uploaded; you choose who gets it.</small>
            <span className="share-actions">
              <button type="button" className="secondary" onClick={() => void copy()}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copied" : "Copy text"}</button>
              <button type="button" onClick={save}><Download size={14} />Save as a page</button>
            </span>
          </footer>
        </>}
      </div>
    </div>
  );
}

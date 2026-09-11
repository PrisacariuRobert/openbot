import { useEffect, useState, type CSSProperties } from "react";
import { Check, ShieldCheck, Download, FileText } from "lucide-react";
import { Character } from "./Character";
import type { Attachment, Bot, Message, Run } from "../shared/types";
import "./delivery-receipt.css";

/** One delivery object: the result files, a one-line trust strip (who
 * reviewed it, what was checked), the review action, and the proof
 * disclosure. Data already in hand — no extra fetch per card. */
export function DeliveryCard({ message, run, childRuns, teammates }: {
  message: Message; run?: Run; childRuns?: Run[]; teammates?: Bot[];
}) {
  if (!run || run.status !== "completed" || !run.task.tracked)
    return <>{message.attachments.map((file) => <DeliveredFile key={file.id} file={file} />)}</>;
  const kids = childRuns || [];
  const reviewed = kids.filter((r) => r.status === "completed");
  const reviewing = kids.filter((r) => !["completed", "failed", "cancelled"].includes(r.status));
  const faceOf = (botId: string) => (teammates || []).find((b) => b.id === botId);
  const author = (teammates || []).find((b) => b.id === run.botId);
  const hosts = run.task.verificationChecks.filter((c) => c.source === "host");
  const checksLabel = run.task.verificationStatus === "passed"
    ? hosts.length ? "Host-checked" : "Teammate-checked" : "Unchecked";
  return (
    <section className="delivery-card" aria-label={`Delivered result${reviewed.length ? `, reviewed by ${reviewed.map((r) => r.botName).join(", ")}` : ""}`}
      style={author ? ({ "--delivery-accent": author.color } as CSSProperties) : undefined}>
      <p className="delivery-strip">
        {reviewed.length > 0
          ? <><span className="delivery-faces">
              {author && <Character name={author.name} color={author.color} variant={author.mascot} size={30} />}
              {reviewed.map((r) => {
                const bot = faceOf(r.botId);
                return bot
                  ? <Character key={r.id} name={bot.name} color={bot.color} variant={bot.mascot} size={24} />
                  : <Check key={r.id} size={13} />;
              })}
            </span><span className="delivery-strip-text">Reviewed by {reviewed.map((r) => r.botName).join(", ")}</span></>
          : reviewing.length > 0
            ? <><i className="delivery-pulse" aria-hidden="true" /><span>{reviewing.map((r) => r.botName).join(", ")} {reviewing.length === 1 ? "is" : "are"} reviewing…</span></>
            : <span>Not yet reviewed</span>}
        <span aria-hidden="true">·</span>
        <span>{checksLabel}</span>
      </p>
      {message.attachments.map((file) => <DeliveredFile key={file.id} file={file} artifact />)}
      <DeliveryReceipt run={run} teammates={teammates} />
    </section>
  );
}

export function DeliveryReceipt({ run, teammates }: { run?: Run; teammates?: Bot[] }) {
  const [picking, setPicking] = useState(false);
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { setPicking(false); setChoice(""); setNotice(""); setError(""); }, [run?.id]);
  if (!run || run.status !== "completed" || !run.task.tracked) return null;
  const task = run.task, checks = task.verificationChecks;
  const hosts = checks.filter((check) => check.source === "host");
  const passed = task.verificationStatus === "passed";
  const label = passed ? hosts.length === checks.length && checks.length > 0 ? "Recorded checks passed" : hosts.length ? "Some checks passed" : "Checks reported by teammate" : task.verificationStatus === "partial" ? "Finished with a note" : "Result delivered";
  const candidates = (teammates || []).filter((bot) => bot.id !== run.botId && !bot.retiredAt);
  async function askReviewer() {
    if (!choice || busy) return;
    setBusy(true); setNotice(""); setError("");
    try {
      const response = await fetch(`/api/runs/${encodeURIComponent(run!.id)}/review`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewerBotId: choice }),
      });
      const result = await response.json() as { reviewerName?: string; error?: string };
      if (!response.ok) throw new Error(result.error || "The review could not start.");
      setPicking(false);
      setNotice(`${result.reviewerName || "A teammate"} is reviewing this result — follow it in Activity. The review joins this receipt.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The review could not start.");
    } finally { setBusy(false); }
  }
  return <>
  <details className="delivery-receipt"><summary><ShieldCheck size={15} /><span>{label}</span></summary>
    {task.verificationSummary && <p>Teammate summary: {task.verificationSummary}</p>}
    {hosts.length > 0 && <p>OpenBot checked only the evidence described below. A file check does not verify every claim in the result.</p>}
    <ul>{checks.map((check, index) => <li key={index}><Check size={13} opacity={check.passed ? 1 : .35} /><div><strong>{check.label}</strong><small>{check.source === "host" ? "Host check" : "Teammate report"} · {check.passed ? "Passed" : "Not confirmed"}{check.detail ? ` · ${check.detail}` : ""}</small></div></li>)}</ul>
    {task.steps.length > 0 && <p className="delivery-progress">{task.steps.filter((step) => step.status === "completed").length} of {task.steps.length} steps completed.</p>}
  </details>
  {candidates.length > 0 && !notice && (
    picking ? <div className="delivery-review">
      <label>Ask a teammate to check this result
        <select aria-label="Teammate to review this result" value={choice} disabled={busy} onChange={(event) => setChoice(event.target.value)}>
          <option value="">Choose a reviewer</option>
          {candidates.map((bot) => <option key={bot.id} value={bot.id}>{bot.name} — {bot.role}</option>)}
        </select>
      </label>
      <div className="delivery-review-actions">
        <button type="button" className="primary" disabled={!choice || busy} onClick={() => void askReviewer()}>{busy ? "Asking…" : "Ask for a review"}</button>
        <button type="button" className="text-action" disabled={busy} onClick={() => { setPicking(false); setChoice(""); setError(""); }}>Not now</button>
      </div>
      {error && <p role="alert">{error}</p>}
    </div>
    : <button type="button" className="text-action delivery-review-cta" onClick={() => { setPicking(true); setError(""); }}><ShieldCheck size={14} /> Have another teammate check this</button>
  )}
  {notice && <p role="status" className="delivery-review-note">{notice}</p>}
  </>;
}

/** A delivered file shown as the work itself — a miniature of its actual
 * content on a sheet of paper, not a generic icon row. Quick Look, not a
 * file manager: you see the first lines before you decide to open it.
 * Plain uploads keep the compact row (artifact={false}). */
export function DeliveredFile({ file, artifact = false }: { file: Attachment; artifact?: boolean }) {
  const size = `${Math.max(1, Math.ceil(file.size / 1000))} KB`;
  const meta = [size, file.kind, file.source === "artifact" ? "Result" : null, file.revision > 1 ? `v${file.revision}` : null].filter(Boolean).join(" · ");
  if (!artifact) {
    return <section className="delivered-file" aria-label={`File: ${file.name}`}>
      {file.kind === "image" && file.previewUrl && <a href={file.previewUrl} target="_blank" rel="noreferrer"><img src={file.previewUrl} alt={file.name} loading="lazy" /></a>}
      <a className="message-file" href={file.url} target="_blank" rel="noreferrer"><FileText size={17} /><span><strong>{file.name}</strong><small>{meta}</small></span><Download size={15} /></a>
      {file.summary && <p>{file.summary}</p>}
      {file.previewText && <details><summary>Read preview</summary><pre>{file.previewText}</pre></details>}
      {file.processingStatus === "partial" && <small>Partial preview. Download the original for the complete file.</small>}
      {["failed", "unsupported"].includes(file.processingStatus) && <small>Preview unavailable. Your original file is still available.</small>}
    </section>;
  }
  const lines = (file.previewText || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/[#*_`>]/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 5);
  const rows = lines.map((line) => {
    const match = /^(.{1,34}?)\s*[:—·]\s+(.+)$/.exec(line);
    return match ? { label: match[1], value: match[2].slice(0, 26) } : { label: line.slice(0, 40), value: "" };
  });
  const image = file.kind === "image" && file.previewUrl;
  const glyph = file.kind === "spreadsheet" ? "XLSX" : file.kind === "presentation" ? "PPTX" : file.kind === "document" ? (file.mime.includes("pdf") ? "PDF" : "DOC") : file.kind === "archive" ? "ZIP" : "FILE";
  const stamp = new Date(file.createdAt).toISOString().slice(0, 10);
  return <section className="delivered-file" aria-label={`File: ${file.name}`}>
    <a className="ledger" href={file.url} target="_blank" rel="noreferrer">
      <span className="ledger-head"><span>Result</span><span>{stamp}{file.revision > 1 ? ` · rev ${file.revision}` : ""}</span></span>
      <span className="ledger-body">
        {image
          ? <span className="ledger-image"><img src={file.previewUrl!} alt="" loading="lazy" /></span>
          : rows.length > 0
            ? rows.map((row, index) => <span className={`ledger-line${index === 0 ? " is-lead" : ""}`} key={index}><span className="ledger-label">{row.label}</span>{row.value && <span className="ledger-value">{row.value}</span>}</span>)
            : <span className="ledger-glyph">{glyph}</span>}
      </span>
      <span className="ledger-foot">
        <span className="ledger-name">{file.name}</span>
        <span className="ledger-meta">{meta}</span>
        <span className="ledger-open" aria-hidden="true"><Download size={14} /></span>
      </span>
    </a>
    {file.summary && lines.length === 0 && <p>{file.summary}</p>}
    {file.previewText && <details><summary>Read full text</summary><pre>{file.previewText}</pre></details>}
    {file.processingStatus === "partial" && <small>Partial preview. Download the original for the complete file.</small>}
    {["failed", "unsupported"].includes(file.processingStatus) && <small>Preview unavailable. Your original file is still available.</small>}
  </section>;
}

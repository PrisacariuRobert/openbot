import { useEffect, useState } from "react";
import { Check, ShieldCheck, FileText, Download } from "lucide-react";
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
      style={author ? { background: `color-mix(in srgb, ${author.color} 6%, var(--surface))` } : undefined}>
      {author && <i className="delivery-accent" aria-hidden="true" style={{ background: `linear-gradient(90deg, ${author.color}, ${author.color} 40%, transparent)` }} />}
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
      {message.attachments.map((file) => <DeliveredFile key={file.id} file={file} />)}
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

export function DeliveredFile({ file }: { file: Attachment }) {
  return <section className="delivered-file" aria-label={`File: ${file.name}`}>
    {file.kind === "image" && file.previewUrl && <a href={file.previewUrl} target="_blank" rel="noreferrer"><img src={file.previewUrl} alt={file.name} loading="lazy" /></a>}
    <a className="message-file" href={file.url} target="_blank" rel="noreferrer"><FileText size={17} /><span><strong>{file.name}</strong><small>{Math.max(1, Math.ceil(file.size / 1000))} KB · {file.kind}{file.source === "artifact" ? " · Result" : ""}{file.revision > 1 ? ` · v${file.revision}` : ""}</small></span><Download size={15} /></a>
    {file.summary && <p>{file.summary}</p>}
    {file.previewText && <details><summary>Read preview</summary><pre>{file.previewText}</pre></details>}
    {file.processingStatus === "partial" && <small>Partial preview. Download the original for the complete file.</small>}
    {["failed", "unsupported"].includes(file.processingStatus) && <small>Preview unavailable. Your original file is still available.</small>}
  </section>;
}

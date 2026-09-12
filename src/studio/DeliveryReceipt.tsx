import { useEffect, useState } from "react";
import { Check, ShieldCheck, Download, FileText, ChevronRight, MessageSquare, CircleAlert } from "lucide-react";
import type { Attachment, Bot, Message, Run } from "../shared/types";
import "./delivery-receipt.css";
import { deliveryReview, deliveryReviewSummary } from "./delivery-review";
import ReactMarkdown from "react-markdown";
import { newerDeliveredVersion } from "./artifact-versions";
import { isUnverifiedTextFallback } from "./delivery-fallback";

/** A finished result, presented flat: the files as quiet tappable rows with
 * one line of real content each, then a single whisper of provenance.
 * No cards, no boxes, no bars — spacing does the work, like Mail. */
export function DeliveryCard({ message, run, childRuns, teammates, visibleFiles = [] }: {
  message: Message; run?: Run; childRuns?: Run[]; teammates?: Bot[]; visibleFiles?: Attachment[];
}) {
  if (!run || run.status !== "completed" || !run.task.tracked)
    return <>{message.attachments.map((file) => <DeliveredFile key={file.id} file={file} />)}</>;
  const kids = childRuns || [];
  const reviews = kids.flatMap((r) => {
    const review = deliveryReview(r);
    return review ? [{ run: r, ...review }] : [];
  });
  const hosts = run.task.verificationChecks.filter((c) => c.source === "host");
  const checked = run.task.verificationStatus === "passed"
    ? hosts.length ? "Host-checked" : "Teammate-checked" : null;
  const provenance = [
    run.botName,
    reviews.length === 0 ? "Not yet reviewed" : null,
    checked,
  ].filter(Boolean).join(" · ");
  return (
    <div className="delivery-result" aria-label={`Delivered result. ${provenance}`}>
      {message.attachments.map((file) => {
        const newer = newerDeliveredVersion(file, visibleFiles);
        const meta = `${Math.max(1, Math.ceil(file.size / 1000))} KB · ${file.kind}${file.revision > 1 ? ` · v${file.revision}` : ""}`;
        return (
          <div className="delivery-version" key={file.id}><a className="delivery-row" href={file.url} target="_blank" rel="noreferrer">
            <span className="delivery-row-text">
              <strong>{file.name}</strong>
              <small>{meta}</small>
            </span>
            <ChevronRight size={16} aria-hidden="true" />
          </a>{newer && <p className="delivery-newer">A newer version is ready. <a href={newer.url} target="_blank" rel="noreferrer">Open v{newer.revision}<ChevronRight size={13} aria-hidden="true" /></a></p>}</div>
        );
      })}
      <div className="delivery-summary">
      {reviews.length > 0 && <details className="delivery-reviews"><summary><MessageSquare size={14} /><span>{deliveryReviewSummary(kids)}</span><ChevronRight size={13} /></summary>
      {reviews.map((review) => <section className="delivery-finding" key={review.run.id} aria-label={review.label}>
        <strong>{review.label}</strong>
        {!review.bound && <p className="delivery-review-note">Earlier review · file version not recorded.</p>}
        {review.finding && <p>{review.finding}</p>}
        {review.detail && <details><summary>Read review</summary>
          <p>{review.bound ? "A teammate’s assessment—not a guarantee that every claim is correct." : "This earlier review was not linked to an exact file version. Ask for a new review before relying on it."}</p>
          <div className="delivery-finding-full"><ReactMarkdown skipHtml disallowedElements={["a", "img"]} unwrapDisallowed>{review.detail}</ReactMarkdown></div>
        </details>}
      </section>)}</details>}
      <DeliveryReceipt run={run} teammates={teammates} reviews={kids} hasDeliveredArtifacts={message.attachments.length > 0} />
      </div>
    </div>
  );
}

export function DeliveryReceipt({ run, teammates, reviews = [], hasDeliveredArtifacts }: { run?: Run; teammates?: Bot[]; reviews?: Run[]; hasDeliveredArtifacts?: boolean }) {
  const [picking, setPicking] = useState(false);
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const reviewState = reviews.map((review) => `${review.id}:${review.status}`).join("|");
  const reviewRunning = reviews.some((review) => Boolean(deliveryReview(review)) && !["completed", "failed", "cancelled"].includes(review.status));
  useEffect(() => { setNotice(""); }, [reviewState]);
  useEffect(() => { setPicking(false); setChoice(""); setNotice(""); setError(""); }, [run?.id]);
  if (!run || run.status !== "completed" || !run.task.tracked) return null;
  const task = run.task, checks = task.verificationChecks;
  const stepSummary = (() => {
    const completed = task.steps.filter((step) => step.status === "completed").length;
    const skipped = task.steps.filter((step) => step.status === "skipped").length;
    const unfinished = task.steps.length - completed - skipped;
    return [
      completed ? `${completed} completed` : "",
      skipped ? `${skipped} skipped` : "",
      unfinished ? `${unfinished} unfinished` : "",
    ].filter(Boolean).join(" · ");
  })();
  const hosts = checks.filter((check) => check.source === "host");
  const passed = task.verificationStatus === "passed";
  const candidates = (teammates || []).filter((bot) => bot.id !== run.botId && !bot.retiredAt);
  const quietFallback = isUnverifiedTextFallback(run, reviews.length > 0, hasDeliveredArtifacts);
  const label = quietFallback ? "Details · not independently checked" : passed ? hosts.length === checks.length && checks.length > 0 ? "Recorded checks passed" : hosts.length ? "Some checks passed" : "Checks reported by teammate" : task.verificationStatus === "partial" ? "Finished with a note" : "Result delivered";
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
      setNotice(`${result.reviewerName || "A teammate"} is checking this. Their finding will appear here.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The review could not start.");
    } finally { setBusy(false); }
  }
  const reviewPrompt = candidates.length > 0 && !notice && !reviewRunning && (
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
    : <button type="button" className="text-action delivery-review-cta" onClick={() => { setPicking(true); setError(""); }}><ShieldCheck size={14} /> Request review</button>
  );
  return <>
  <details className="delivery-receipt"><summary>{passed ? <ShieldCheck size={14} /> : <CircleAlert size={14} />}<span>{label}</span></summary>
    {task.verificationSummary && <p>Teammate summary: {task.verificationSummary}</p>}
    {hosts.length > 0 && <p>OpenBot checked only the evidence described below. A file check does not verify every claim in the result.</p>}
    <ul>{checks.map((check, index) => <li key={index}><Check size={13} opacity={check.passed ? 1 : .35} /><div><strong>{check.label}</strong><small>{check.source === "host" ? "Host check" : "Teammate report"} · {check.passed ? "Passed" : "Not confirmed"}{check.detail ? ` · ${check.detail}` : ""}</small></div></li>)}</ul>
    {stepSummary && <p className="delivery-progress">Recorded plan: {stepSummary}</p>}
    {quietFallback && reviewPrompt}
  </details>
  {!quietFallback && reviewPrompt}
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

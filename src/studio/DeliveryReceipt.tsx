import { Check, ShieldCheck, FileText, Download } from "lucide-react";
import type { Attachment, Run } from "../shared/types";
import "./delivery-receipt.css";

export function DeliveryReceipt({ run }: { run?: Run }) {
  if (!run || run.status !== "completed" || !run.task.tracked) return null;
  const task = run.task, checks = task.verificationChecks;
  const hosts = checks.filter((check) => check.source === "host");
  const passed = task.verificationStatus === "passed";
  const label = passed ? hosts.length === checks.length && checks.length > 0 ? "Recorded checks passed" : hosts.length ? "Some checks passed" : "Checks reported by teammate" : task.verificationStatus === "partial" ? "Finished with a note" : "Result delivered";
  return <details className="delivery-receipt"><summary><ShieldCheck size={15} /><span>{label}</span></summary>
    {task.verificationSummary && <p>Teammate summary: {task.verificationSummary}</p>}
    {hosts.length > 0 && <p>OpenBot checked only the evidence described below. A file check does not verify every claim in the result.</p>}
    <ul>{checks.map((check, index) => <li key={index}><Check size={13} opacity={check.passed ? 1 : .35} /><div><strong>{check.label}</strong><small>{check.source === "host" ? "Host check" : "Teammate report"} · {check.passed ? "Passed" : "Not confirmed"}{check.detail ? ` · ${check.detail}` : ""}</small></div></li>)}</ul>
    {task.steps.length > 0 && <p className="delivery-progress">{task.steps.filter((step) => step.status === "completed").length} of {task.steps.length} steps completed.</p>}
  </details>;
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

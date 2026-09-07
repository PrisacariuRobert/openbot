import { useEffect, useState } from "react";
import type { TaughtWorkflow } from "../shared/types";
import "./workflow-checks.css";

type Check = { runId: string; input: string; expected: string; current: boolean; status: string; result: string; error: string | null; toolCount: number; verdict: string | null };
type Status = { ready: boolean; reviewedInputs: number; message: string; checks: Check[] };
export function WorkflowChecksPanel({ workflow }: { workflow: TaughtWorkflow }) {
  const [status, setStatus] = useState<Status | null>(null), [error, setError] = useState("");
  const [input, setInput] = useState(""), [expected, setExpected] = useState(""), [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false);
  const [reviewed, setReviewed] = useState<Record<string, boolean>>({});
  const request = async (suffix = "", body?: unknown) => {
    const response = await fetch(`/api/extensions/workflows/${workflow.id}/checks${suffix}`, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || "Could not check this skill.");
    setStatus(result);
  };
  const perform = async (work: () => Promise<void>) => { setBusy(true); setError(""); try { await work(); } catch (e) { setError(e instanceof Error ? e.message : "Try again."); } finally { setBusy(false); } };
  useEffect(() => { void perform(() => request()); }, [workflow.id, workflow.version]);
  return <section className="workflow-checks" aria-label={`Checks for ${workflow.name}`}>
    <header><h3>Check before scheduling</h3><button type="button" disabled={busy} onClick={() => void perform(() => request())}>Refresh checks</button></header>
    <p role="status">{status?.message || "Loading checks…"}</p>
    <p className="workflow-checks-note">Run two different examples, then compare each result with what you expected. Checks use {workflow.botName}’s selected model and its normal usage budget. They are real tasks with normal approval rules—not a simulation. Never enter passwords here.</p>
    {error && <p role="alert">{error}</p>}
    <form onSubmit={(event) => { event.preventDefault(); void perform(async () => { await request("", { input, expected, confirmed }); setInput(""); setConfirmed(false); }); }}>
      <label>Test input<textarea required minLength={3} maxLength={2000} value={input} onChange={(e) => setInput(e.target.value)} placeholder="For example: summarize support ticket 42" /></label>
      <label>What should the result show?<textarea required minLength={3} maxLength={2000} value={expected} onChange={(e) => setExpected(e.target.value)} placeholder="The correct customer, issue and source link" /></label>
      <label className="workflow-checks-consent"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> Start a real check using this teammate’s model and tools.</label>
      <button type="submit" disabled={busy || !confirmed || input.trim().length < 3 || expected.trim().length < 3}>Run this check</button>
    </form>
    {status?.checks.slice().reverse().map((check) => <article key={check.runId}>
      <strong>{check.input}</strong><small>{!check.current ? "Older version or expired check" : check.verdict ? `Your review: ${check.verdict}` : check.status.replaceAll("_", " ")}</small>
      <p>Expected: {check.expected}</p>
      {check.result && <details><summary>Review the result</summary><p className="workflow-checks-result">{check.result}</p><p>Open the teammate’s conversation to inspect source links and the work behind this result.</p></details>}
      {check.error && <p>{check.error}</p>}
      {check.current && !check.verdict && ["completed", "failed", "cancelled"].includes(check.status) && <>
        <label className="workflow-checks-consent"><input type="checkbox" checked={reviewed[check.runId] || false} onChange={(e) => setReviewed({ ...reviewed, [check.runId]: e.target.checked })} /> I compared the result and its sources with the expected outcome.</label>
        <div className="workflow-checks-actions">
          <button disabled={busy || !reviewed[check.runId] || check.status !== "completed" || !check.result || !check.toolCount} onClick={() => void perform(() => request(`/${check.runId}/review`, { verdict: "passed", reviewedResult: true }))}>Matches expected result</button>
          <button disabled={busy || !reviewed[check.runId]} onClick={() => void perform(() => request(`/${check.runId}/review`, { verdict: "failed", reviewedResult: true }))}>Needs fixing</button>
        </div>
      </>}
    </article>)}
    <p className="workflow-checks-note">Reviewed examples are valid for 30 days for this skill and setup. A changed version, model or permissions needs new checks. This does not grant permission to send, publish or delete.</p>
  </section>;
}

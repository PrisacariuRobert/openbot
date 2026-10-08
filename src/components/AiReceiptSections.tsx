import { useEffect, useState } from "react";
import type { AiReceipt, AiReceiptEntry } from "../shared/ai-receipt";
import "./private-mode.css";

const KIND_LABEL: Record<AiReceiptEntry["kind"], string> = { instructions: "Instructions and memories", request: "The request and conversation", tool: "Tool answer", kept: "Kept on this Mac" };

function entryTitle(entry: AiReceiptEntry): string {
  if (entry.kind === "tool") return `Tool answer: ${entry.label}`;
  if (entry.kind === "kept" && entry.label !== "Kept on this Mac") return entry.label;
  return KIND_LABEL[entry.kind];
}

/** Task F3: inside the work receipt, which AI saw what, and what the task used. */
export function AiReceiptSections({ runId }: { runId: string }) {
  const [receipt, setReceipt] = useState<AiReceipt | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    setReceipt(null); setError(false);
    fetch(`/api/runs/${encodeURIComponent(runId)}/ai-receipt`, { signal: abort.signal })
      .then(async (response) => { if (!response.ok) throw new Error(); return response.json() as Promise<AiReceipt>; })
      .then(setReceipt)
      .catch(() => { if (!abort.signal.aborted) setError(true); });
    return () => abort.abort();
  }, [runId]);
  if (error) return <p className="work-receipt-missing">What the AI saw is unavailable for this task.</p>;
  if (!receipt) return <p className="work-receipt-missing">Loading what the AI saw…</p>;
  const { usage } = receipt;
  return (
    <>
      <section className="work-receipt-ai" aria-label="What the AI saw">
        <h5>What the AI saw</h5>
        {receipt.runs.map((run) => (
          <div key={run.runId}>
            <p className="work-receipt-ai-run">
              <strong>{run.botName}</strong> · {run.model || "default model"} · {run.local ? `${run.connection}, on this Mac` : run.connection}{run.privateMode ? " · Private mode" : ""}
            </p>
            {run.entries.length === 0
              ? <p className="work-receipt-dim">Nothing was recorded for this run. Receipts keep what was sent from now on, for {receipt.keptDays} days.</p>
              : run.entries.map((entry, index) => (
                <details key={index}>
                  <summary>
                    <span>{entryTitle(entry)}</span>
                    <span className="work-receipt-dim">{entry.chars.toLocaleString()} characters</span>
                    {entry.kind === "kept" ? <span className="work-receipt-badge is-masked">Not sent</span>
                      : run.local ? <span className="work-receipt-badge is-masked">Stayed on this Mac</span>
                        : entry.maskedBeforeSending ? <span className="work-receipt-badge is-masked">Masked before sending: {entry.maskedBeforeSending}</span>
                          : entry.sentAsWritten ? <span className="work-receipt-badge is-written">Sent as written: {entry.sentAsWritten} (masked here)</span>
                            : null}
                  </summary>
                  <pre>{entry.text}</pre>
                  {entry.truncatedChars > 0 && <small className="work-receipt-note">…and {entry.truncatedChars.toLocaleString()} more characters, not kept here.</small>}
                </details>
              ))}
          </div>
        ))}
        <small className="work-receipt-dim">The exact text Sidemates handed the AI, kept on this Mac for {receipt.keptDays} days. The AI's runtime adds its own instructions and tool list, which hold nothing of yours.</small>
      </section>
      <section className="work-receipt-usage" aria-label="Usage">
        <h5>Usage</h5>
        <dl>
          <div><dt>Tokens</dt><dd>{usage.totalTokens.toLocaleString()}</dd></div>
          <div><dt>Sent / written</dt><dd>{usage.inputTokens.toLocaleString()} / {usage.outputTokens.toLocaleString()}</dd></div>
          {usage.cacheReadTokens > 0 && <div><dt>Reused from cache</dt><dd>{usage.cacheReadTokens.toLocaleString()}</dd></div>}
          <div><dt>Requests</dt><dd>{usage.requests.toLocaleString()}</dd></div>
          {usage.cost > 0 && <div><dt>Reported cost</dt><dd>${usage.cost >= 0.01 ? usage.cost.toFixed(2) : usage.cost.toFixed(4)}</dd></div>}
        </dl>
        {receipt.allowance.length > 0 && <ul>{receipt.allowance.map((line) => <li key={line}>{line}</li>)}</ul>}
      </section>
    </>
  );
}

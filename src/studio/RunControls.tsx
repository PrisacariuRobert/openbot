import { useEffect, useRef, useState } from "react";
import { LockKeyhole } from "lucide-react";
import type { Approval, Run } from "../shared/types";
import type { ApprovalPreview } from "../shared/approval-preview";
import { TASK_TOKEN_OPTIONS } from "../shared/task-token-budget";
import { BrowserSignInPanel } from "../components/BrowserSignInPanel";
import "./run-controls.css";

export function RunControls({
  run,
  approval,
  onChange,
  onSignInPane,
}: {
  run: Run;
  approval?: Approval;
  onChange: () => void | Promise<void>;
  onSignInPane?: (approvalId: string) => void;
}) {
  const [preview, setPreview] = useState<ApprovalPreview | null>(null);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [signInBusy, setSignInBusy] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [reload, setReload] = useState(0);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const lock = useRef(false);
  const generation = useRef(0);
  const pending = approval?.status === "pending" && approval.runId === run.id;
  const previewPending =
    pending &&
    preview?.status === "pending" &&
    preview.approvalId === approval?.id &&
    preview.runId === run.id;
  const completeReview = previewPending && preview?.canApprove === true && preview.limitation === null &&
    typeof preview.reviewFingerprint === "string" && /^[a-f0-9]{64}$/.test(preview.reviewFingerprint) &&
    preview.fields.length > 0 && preview.fields.every(field => field.label.trim() && field.value.trim());
  const canStop = [
    "queued",
    "running",
    "waiting_for_teammate",
    "awaiting_approval",
  ].includes(run.status);
  useEffect(() => {
    setError("");
    setNotice("");
    setNeedsRefresh(false);
  }, [run.id, approval?.id, approval?.status]);
  useEffect(() => {
    generation.current += 1;
    const controller = new AbortController();
    setPreview(null);
    setLoadError("");
    setReviewed(false);
    lock.current = false;
    setBusy(false);
    if (pending && approval) {
      void fetch(`/api/approvals/${encodeURIComponent(approval.id)}/preview`, {
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok)
            throw new Error(
              "Couldn’t load the full action. Refresh its details before deciding.",
            );
          const result = (await response.json()) as ApprovalPreview;
          if (result.approvalId !== approval.id || result.runId !== run.id)
            throw new Error(
              "The action changed. Refresh its details before reviewing.",
            );
          if (!controller.signal.aborted) {
            setPreview(result);
            setNeedsRefresh(false);
          }
        })
        .catch((reason: unknown) => {
          if (!controller.signal.aborted)
            setLoadError(
              reason instanceof Error
                ? reason.message
                : "Couldn’t load the action.",
            );
        });
    } else setNeedsRefresh(false);
    return () => controller.abort();
  }, [run.id, approval?.id, approval?.status, pending, reload]);

  async function chooseTokenAmount(additionalTokens: number) {
    if (!approval || lock.current || !previewPending) return;
    lock.current = true;
    setBusy(true);
    setReviewed(false);
    const current = generation.current;
    try {
      const response = await fetch(`/api/approvals/${encodeURIComponent(approval.id)}/token-allowance`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ additionalTokens }) });
      if (current !== generation.current) return;
      if (!response.ok) throw new Error("The allowance could not be changed. Refresh before deciding.");
      setReload(value => value + 1);
    } catch (reason) {
      if (current === generation.current) setError(reason instanceof Error ? reason.message : "Couldn’t update the allowance.");
    } finally {
      if (current === generation.current) { lock.current = false; setBusy(false); }
    }
  }

  async function act(action: "approved" | "denied" | "cancel") {
    if (lock.current || needsRefresh) return;
    if (action === "cancel" && !canStop) return;
    if (action !== "cancel" && (!pending || !approval)) return;
    if (
      action === "approved" &&
      (!completeReview || !reviewed)
    )
      return;
    if (action === "denied" && !previewPending) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const current = generation.current;
    try {
      const endpoint =
        action === "cancel"
          ? `/api/runs/${encodeURIComponent(run.id)}/cancel`
          : `/api/approvals/${encodeURIComponent(approval!.id)}/decide`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: action === "cancel" ? "{}" : JSON.stringify({ decision: action, ...(action === "approved" ? { reviewFingerprint: preview!.reviewFingerprint } : {}) }),
      });
      if (current !== generation.current) return;
      if (response.status === 409) {
        setNotice("This task has changed. Checking its latest status…");
        setNeedsRefresh(true);
        await onChange();
        setReload((value) => value + 1);
        return;
      }
      if (!response.ok)
        throw new Error(
          "We couldn’t confirm that change. Check the latest status before trying again.",
        );
      const result = (await response.json()) as Partial<Approval> & {
        ok?: boolean;
      };
      if (current !== generation.current) return;
      if (
        action === "cancel"
          ? result.ok !== true
          : result.id !== approval!.id ||
            result.runId !== run.id ||
            result.status !== action
      )
        throw new Error("OpenBot did not confirm the requested decision.");
      setNotice(
        action === "cancel"
          ? "Stop requested. Completed actions are not undone."
          : "Your decision was recorded. Checking what happened next…",
      );
      // An accepted approval is not proof that its external action succeeded.
      await onChange();
    } catch (reason) {
      if (current === generation.current) {
        setNeedsRefresh(true);
        setError(
          "We couldn’t confirm the latest result. Refresh status before another decision; the first request may already have reached OpenBot.",
        );
      }
    } finally {
      if (current === generation.current) {
        lock.current = false;
        setBusy(false);
      }
    }
  }

  if (!pending && !canStop) return null;
  return (
    <section className="run-controls" aria-label="Task controls">
      {pending && (
        <>
          <strong>{approval?.kind === "budget" ? "Continue this task?" : preview?.browserSignIn ? "Needs your sign-in" : "Needs your review"}</strong>
          {preview && <p>{preview.actionLabel}</p>}
          {preview && !preview.browserSignIn && <p className="run-control-note">{preview.reason}</p>}
          {preview?.taskTokens && <label className="run-token-amount">Extra tokens for this task
            <select aria-label="Extra tokens for this task" value={preview.taskTokens.additionalTokens} disabled={busy || needsRefresh} onChange={event => void chooseTokenAmount(Number(event.target.value))}>
              {TASK_TOKEN_OPTIONS.map(amount => <option key={amount} value={amount}>{amount.toLocaleString()}</option>)}
            </select>
          </label>}
          {completeReview && preview?.browserSignIn && (onSignInPane
            ? <div className="sign-in-pane-cta">
                <p className="run-control-note">Sign in on the private screen beside this chat — it drives your teammate’s own browser, and passwords stay out of the conversation.</p>
                <button type="button" className="primary" onClick={() => onSignInPane(approval!.id)}><LockKeyhole size={14} strokeWidth={2} />Open the private browser</button>
              </div>
            : <BrowserSignInPanel key={approval!.id} approvalId={approval!.id} handoff={preview.browserSignIn} disabled={busy || needsRefresh || Boolean(notice)} onBusyChange={setSignInBusy} onInteraction={() => setReviewed(false)} />)}
          {preview && preview.fields.length > 0 && (
            <details
              onToggle={(event) => {
                if (event.currentTarget.open && !preview.browserSignIn) setReviewed(true);
              }}
            >
              <summary>{approval?.kind === "budget" ? "Review the token allowance" : "Review the full action"}</summary>
              <dl>
                {preview.fields.map((field) => (
                  <div key={field.label}>
                    <dt>{field.label}</dt>
                    <dd>{field.value}</dd>
                  </div>
                ))}
              </dl>
            </details>
          )}
          {loadError && (
            <p role="alert">
              {loadError}{" "}
              <button
                type="button"
                disabled={busy}
                onClick={() => setReload((value) => value + 1)}
              >
                Try again
              </button>
            </p>
          )}
          {!preview && !loadError && (
            <p role="status">Loading action details…</p>
          )}
          {preview?.limitation && (
            <p className="run-control-note">{preview.limitation}{approval?.kind === "budget" && <button type="button" className="text-action" disabled={busy} onClick={() => setReload(value => value + 1)}>Refresh allowance</button>}</p>
          )}
          {previewPending && preview?.canApprove && !completeReview && !preview.limitation && (
            <p className="run-control-note">This review is incomplete or out of date. Refresh before approving. You can still decline it.</p>
          )}
          {completeReview && preview?.browserSignIn && <label><input type="checkbox" checked={reviewed} disabled={busy || signInBusy || needsRefresh || Boolean(notice)} onChange={(event) => setReviewed(event.target.checked)} /> I’ve finished signing in to the account I want to use.</label>}
          <div className="run-control-actions">
            {completeReview && (
              <button
                type="button"
                className="primary"
                disabled={busy || signInBusy || needsRefresh || !reviewed || Boolean(notice)}
                onClick={() => void act("approved")}
              >
                {preview?.taskTokens ? `Allow ${preview.taskTokens.additionalTokens.toLocaleString()} more tokens` : preview?.browserSignIn ? "Continue task" : approval?.kind === "prompt"
                  ? "Allow task to start"
                  : "Approve action"}
              </button>
            )}
            <button
              type="button"
              disabled={
                busy ||
                needsRefresh ||
                Boolean(notice) ||
                !previewPending
              }
              onClick={() => void act("denied")}
            >
              Decline
            </button>
          </div>
          {completeReview && !reviewed && (
            <p className="run-control-note">
              {preview?.browserSignIn ? "Finish signing in before continuing your task." : "Open the action details before approving."}
            </p>
          )}
        </>
      )}
      {canStop && (
        <button
          type="button"
          className="run-stop"
          disabled={busy || needsRefresh || Boolean(notice)}
          onClick={() => void act("cancel")}
        >
          Stop this task
        </button>
      )}
      {busy && <p role="status">Updating…</p>}
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
      {(error || notice) && (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            void Promise.resolve()
              .then(onChange)
              .then(() => {
                setError("");
                setNotice("");
                setReload((value) => value + 1);
              })
              .catch(() =>
                setError(
                  "Couldn’t refresh the task. Keep this view open and try again.",
                ),
              );
          }}
        >
          Refresh status
        </button>
      )}
    </section>
  );
}

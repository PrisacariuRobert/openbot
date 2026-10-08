import { useState } from "react";
import type { Message, Run } from "../shared/types";
import type { Fix } from "../shared/recovery";

const post = async (url: string, method: "POST" | "PATCH", body: unknown) => {
  const response = await fetch(url, { method, credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(((await response.json().catch(() => ({}))) as { error?: string }).error || "That didn't work.");
};

/** The one-tap fix under a stopped job: never just "I can't". */
export function StopFix({ message, run, request, openPanel }: {
  message: Message;
  run: Run | undefined;
  /** What the owner asked for, to run the same job again. */
  request: string;
  openPanel: (panel: "provider" | "usage" | "control" | "bot") => void;
}) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [error, setError] = useState("");
  let fix: Fix | null = null;
  try { fix = typeof message.eventData?.fix === "string" ? JSON.parse(message.eventData.fix) as Fix : null; } catch { fix = null; }
  if (!fix || !run || state === "done") return state === "done" ? <small role="status"> Working on it again.</small> : null;

  const again = () => post("/api/messages", "POST", { threadId: run.threadId, body: request, targetBotIds: [run.botId], timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, requestId: `fix-${run.id}-${Date.now()}` });
  const act = async () => {
    const action = fix!.action;
    if (action.kind === "panel") { openPanel(action.panel); return; }
    setState("busy"); setError("");
    try {
      if (action.kind === "setting") await post("/api/settings", "PATCH", { [action.setting]: true });
      if (action.kind === "automatic") await post(`/api/bots/${encodeURIComponent(run.botId)}`, "PATCH", { aiMode: "automatic" });
      if (action.kind === "install-browser") {
        await post("/api/browser/private/install", "POST", {});
        // About 150 MB: check back until it's in place, then run the job again.
        for (;;) {
          await new Promise((resolve) => window.setTimeout(resolve, 3_000));
          const status = await (await fetch("/api/browser/private", { credentials: "same-origin" })).json() as { available: boolean; install: { state: string; detail: string } };
          if (status.available) break;
          if (status.install.state === "failed") throw new Error(status.install.detail);
        }
      }
      if ((action.kind === "retry" || fix!.retryAfter) && request) await again();
      setState("done");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "That didn't work.");
      setState("error");
    }
  };

  return <>
    {" "}
    {fix.action.kind === "open"
      ? <a className="text-action stop-fix" href={fix.action.url} target={fix.action.url.startsWith("http") ? "_blank" : undefined} rel="noreferrer">{fix.label}</a>
      : <button type="button" className="text-action stop-fix" disabled={state === "busy" || (fix.action.kind === "retry" && !request)} onClick={() => void act()}>{state === "busy" ? (fix.action.kind === "install-browser" ? "Downloading…" : "Working…") : fix.label}</button>}
    {fix.action.kind === "open" && request && <> <button type="button" className="text-action" onClick={() => void (async () => { setState("busy"); try { await again(); setState("done"); } catch (failure) { setError(failure instanceof Error ? failure.message : "That didn't work."); setState("error"); } })()}>Try again</button></>}
    {state === "error" && <small role="alert"> {error}</small>}
  </>;
}

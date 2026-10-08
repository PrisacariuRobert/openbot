import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import type { Bot } from "../shared/types";
import "./move-in-out.css";

/** Task F8: a teammate out as plain files that also work elsewhere. */
export function TakeOutFiles({ bot }: { bot: Pick<Bot, "id" | "name"> }) {
  return (
    <a className="skill-action-btn take-out-files" href={`/api/bots/${encodeURIComponent(bot.id)}/files`} download>
      <Download size={14} aria-hidden="true" /> Take {bot.name} out as files
    </a>
  );
}

interface MoveInResult { kind: "sidemates" | "chatgpt" | "claude"; botId: string; botName: string; created: boolean; queued: number; skills: number; routines: number }

/** Task F8: memories from a ChatGPT or Claude export, or a teammate from Sidemates files. */
export function MoveInCard({ bots, onReview }: { bots: Array<Pick<Bot, "id" | "name" | "threadId">>; onReview: (threadId: string) => void }) {
  const file = useRef<HTMLInputElement>(null);
  const [botId, setBotId] = useState(bots[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<MoveInResult | null>(null);
  const upload = async (selected: File) => {
    setBusy(true); setError(""); setResult(null);
    try {
      const response = await fetch(`/api/move-in?botId=${encodeURIComponent(botId)}`, { method: "POST", headers: { "content-type": "application/octet-stream", "x-filename": selected.name.slice(0, 200) }, body: selected });
      const value = await response.json().catch(() => ({})) as MoveInResult & { error?: string };
      if (!response.ok) throw new Error(value.error || "That file couldn't be read.");
      setResult(value);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "That file couldn't be read."); }
    finally { setBusy(false); }
  };
  const source = result?.kind === "chatgpt" ? "ChatGPT" : result?.kind === "claude" ? "Claude" : "";
  const reviewThread = result ? bots.find((bot) => bot.id === result.botId)?.threadId : undefined;
  return (
    <section className="move-in" aria-label="Move in">
      <h3>Move in</h3>
      <p>Bring what ChatGPT or Claude knows about you: download your data export there, then choose the .zip (or its conversations.json). Sidemates suggests the sentences where you described yourself, and you keep or discard each one. A teammate taken out of Sidemates as files comes back the same way.</p>
      {bots.length > 0 && (
        <label className="move-in-target">For
          <select value={botId} onChange={(event) => setBotId(event.target.value)}>{bots.map((bot) => <option key={bot.id} value={bot.id}>{bot.name}</option>)}</select>
        </label>
      )}
      <input ref={file} className="visually-hidden" type="file" accept=".zip,.json,application/zip,application/json" tabIndex={-1} aria-hidden="true" onChange={(event) => { const selected = event.target.files?.[0]; event.target.value = ""; if (selected) void upload(selected); }} />
      <button type="button" disabled={busy} onClick={() => file.current?.click()}><Upload size={15} aria-hidden="true" /> {busy ? "Reading…" : "Choose an export"}</button>
      {error && <p role="alert" className="move-in-error">{error}</p>}
      {result && (
        <p role="status" className="move-in-done">
          {result.created
            ? `${result.botName} is back, with ${result.skills} ${result.skills === 1 ? "skill" : "skills"} and ${result.routines} ${result.routines === 1 ? "routine" : "routines"} (paused). ${result.queued} ${result.queued === 1 ? "memory waits" : "memories wait"} for your review.`
            : result.queued ? `${result.queued} ${result.queued === 1 ? "fact" : "facts"} from your ${source} export ${result.queued === 1 ? "waits" : "wait"} for your review. Nothing is used until you keep it.` : `Nothing new to suggest from your ${source} export.`}
          {result.queued > 0 && reviewThread && <> <button type="button" className="text-action" onClick={() => onReview(reviewThread)}>Review on What {result.botName} remembers</button></>}
        </p>
      )}
    </section>
  );
}

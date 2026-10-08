import { useRef, type CSSProperties } from "react";
import type { Run } from "../shared/types";
import { MarkdownMessage } from "../MarkdownMessage";
import { Character } from "./Character";
import { RunControls } from "./RunControls";
import { conversationProgress, helperProgress, liveTail } from "./conversation-progress";
import "./conversation-progress.css";

export function ConversationProgress({ run, helpers = [], onDetails, onChange }: {
  run: Run; helpers?: Run[]; onDetails: () => void; onChange: () => void;
}) {
  const progress = conversationProgress(run);
  // Show the reply as it is written only once it has visibly grown: a
  // runtime that hands over finished text never flashes it here first.
  const seen = useRef<{ runId: string; lengths: number[] }>({ runId: run.id, lengths: [] });
  if (seen.current.runId !== run.id) seen.current = { runId: run.id, lengths: [] };
  const length = run.partialText?.trim().length || 0;
  const lengths = seen.current.lengths;
  if (length && length !== lengths.at(-1)) lengths.push(length);
  const streaming = lengths.length >= 2 && lengths.at(-1)! > lengths[0]!;
  if (!progress) return null;
  const live = progress.animated && streaming ? liveTail(run.partialText) : "";
  return <section className="conversation-progress" aria-label={`Progress for ${run.botName}`}>
    <div className="conversation-progress-heading">
      <Character name={run.botName} color={run.botColor} variant={run.botMascot} status={progress.animated ? "working" : "ready"} size={32} />
      <div className="conversation-progress-copy">
        <p role="status">{progress.label}{progress.animated && <span className="conversation-progress-dots" aria-hidden="true"><i /><i /><i /></span>}</p>
        <small>{progress.detail}</small>
      </div>
    </div>
    {run.status === "waiting_for_teammate" && helpers.length > 0 && <ul className="conversation-progress-helpers" aria-label="Who is helping">
      {helpers.map((helper) => { const line = helperProgress(helper); return <li key={helper.id}><Character name={helper.botName} color={helper.botColor} variant={helper.botMascot} status="working" size={20} /><span><strong>{line.name}:</strong> {line.doing}</span>{line.since && <small>{line.since}</small>}</li>; })}
    </ul>}
    {live && <div className={`conversation-progress-live prose${live.startsWith("…") ? " is-trimmed" : ""}`} aria-live="off" style={{ "--message-tint": run.botColor } as CSSProperties}><MarkdownMessage body={live} /></div>}
    <div className="conversation-progress-actions">
      <button type="button" className="text-action" onClick={onDetails}>View progress</button>
      <RunControls run={run} onChange={onChange} />
    </div>
  </section>;
}

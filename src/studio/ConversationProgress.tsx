import type { Run } from "../shared/types";
import { Character } from "./Character";
import { RunControls } from "./RunControls";
import { conversationProgress } from "./conversation-progress";
import "./conversation-progress.css";

export function ConversationProgress({ run, onDetails, onChange }: {
  run: Run; onDetails: () => void; onChange: () => void;
}) {
  const progress = conversationProgress(run);
  if (!progress) return null;
  return <section className="conversation-progress" aria-label={`Progress for ${run.botName}`}>
    <div className="conversation-progress-heading">
      <Character name={run.botName} color={run.botColor} variant={run.botMascot} status={progress.animated ? "working" : "ready"} size={32} />
      <div className="conversation-progress-copy">
        <p role="status">{progress.label}{progress.animated && <span className="conversation-progress-dots" aria-hidden="true"><i /><i /><i /></span>}</p>
        <small>{progress.detail}</small>
      </div>
    </div>
    <div className="conversation-progress-actions">
      <button type="button" className="text-action" onClick={onDetails}>View progress</button>
      <RunControls run={run} onChange={onChange} />
    </div>
  </section>;
}

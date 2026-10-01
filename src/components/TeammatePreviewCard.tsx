import { Check, LoaderCircle, ShieldCheck } from "lucide-react";
import { Character } from "../studio/Character";
import { readTeammate, type TeammatePreview } from "../shared/teammate-preview";

export type { TeammatePreview };
export { readTeammate };

export function TeammatePreviewCard({ preview, pending, macAccess = false, onAdd, onCancel }: { preview: TeammatePreview; pending: boolean; macAccess?: boolean; onAdd: () => void; onCancel: () => void }) {
  return (
    <section className="teammate-preview" aria-label={`Add ${preview.name}`}>
      <div className="teammate-preview-head">
        <Character name={preview.name} color={preview.color} variant={preview.mascot as never} size={72} />
        <div>
          <span className="teammate-preview-kicker">A teammate someone shared</span>
          <h3>{preview.name}</h3>
          <p>{preview.role}</p>
        </div>
      </div>
      {preview.about && <p className="teammate-preview-about">{preview.about}</p>}
      <details open>
        <summary>What it's told to do</summary>
        <p className="teammate-preview-instructions">{preview.instructions}</p>
      </details>
      {preview.routines.length > 0 && (
        <details>
          <summary>{preview.routines.length === 1 ? "1 routine" : `${preview.routines.length} routines`} — they arrive paused</summary>
          <ul>{preview.routines.map((routine, index) => <li key={`${routine.name}-${index}`}><strong>{routine.name}</strong><span>{routine.prompt.slice(0, 280)}{routine.prompt.length > 280 ? "…" : ""}</span></li>)}</ul>
        </details>
      )}
      <p className="teammate-preview-safe"><ShieldCheck size={16} aria-hidden="true" /><span><strong>Starts with the browser and private computer off.</strong> Your accounts, history and memory aren't part of it, it uses the AI you already chose, and anything that matters still asks you first.{macAccess ? " Files & apps on this Mac is on, so it can read your Mail, Notes and calendar like your other teammates — changes still ask first." : ""}</span></p>
      <div className="teammate-preview-actions">
        <button type="button" className="primary" disabled={pending} onClick={onAdd}>{pending ? <LoaderCircle className="spinner" size={15} /> : <Check size={15} />}{pending ? "Adding…" : `Add ${preview.name}`}</button>
        <button type="button" disabled={pending} onClick={onCancel}>Not now</button>
      </div>
    </section>
  );
}

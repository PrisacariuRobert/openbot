import { useRef, useState, type CSSProperties } from "react";
import { ArrowUpRight, ChevronRight, Plus, Upload } from "lucide-react";
import type { AppState, Bot } from "../shared/types";
import { Character } from "./Character";

export function WorkspaceNote({ bot, title, children }: { bot?: Bot; title: string; children: React.ReactNode }) {
  return <aside className="workspace-note" style={bot ? { "--mascot-color": bot.color } as CSSProperties : undefined}>{bot && <Character name={bot.name} color={bot.color} variant={bot.mascot} size={52} />}<div><strong>{title}</strong><p>{children}</p></div></aside>;
}

export function TeamOverview({ state, onCreate, onEdit, onThread, onImport, onRestore }: {
  state: AppState; onCreate: () => void; onEdit: (thread: string) => void; onThread: (thread: string) => void;
  onImport: (bundle: unknown) => Promise<void>; onRestore: (id: string) => Promise<void>;
}) {
  const file = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [preview, setPreview] = useState<{ raw: unknown; name: string; role: string; instructions: string; skills: number; routines: number } | null>(null);
  const [error, setError] = useState("");
  async function perform(action: () => Promise<void>) {
    if (pending) return;
    setPending(true); setError("");
    try { await action(); } catch (error) { setError(error instanceof Error ? error.message : "Could not save. Your existing team is unchanged."); }
    finally { setPending(false); }
  }
  return <div className="team-overview">
    <div className="workspace-page-actions"><button className="button-primary" onClick={onCreate}><Plus size={16} /> New teammate</button><button disabled={pending} onClick={() => file.current?.click()}><Upload size={16} /> Import a profile</button></div>
    <input ref={file} className="visually-hidden" type="file" accept=".json,application/json" aria-label="Import a teammate profile" onChange={event => {
      const selected = event.target.files?.[0]; event.target.value = "";
      if (selected) void perform(async () => { if (selected.size > 256000) throw new Error("Choose a profile under 256 KB."); const raw = JSON.parse(await selected.text());
        if (raw?.kind !== "openbot-teammate" || raw?.version !== 1 || typeof raw.bot?.name !== "string" || typeof raw.bot?.role !== "string" || typeof raw.bot?.instructions !== "string") throw new Error("This is not an OpenBot teammate profile.");
        setPreview({raw, name: raw.bot.name, role: raw.bot.role, instructions: raw.bot.instructions, skills: Array.isArray(raw.skills) ? raw.skills.length : 0, routines: Array.isArray(raw.routines) ? raw.routines.length : 0}); });
    }} />
    {error && <p role="alert" className="panel-error">{error}</p>}
    {preview && <section className="workspace-import-preview" aria-label="Profile preview"><h3>Bring a familiar face.</h3><strong>{preview.name}</strong><p>{preview.role}</p><details><summary>Read instructions</summary><p>{preview.instructions}</p></details><p>{preview.skills} skill references · {preview.routines} routines, imported paused</p><WorkspaceNote title="Your workspace keeps its boundaries.">This imports a new profile. Accounts, keys, history, memory and access grants are not imported. Choose an AI connection before starting work.</WorkspaceNote><div className="workspace-page-actions"><button disabled={pending} className="button-primary" onClick={() => void perform(async () => { await onImport(preview.raw); setPreview(null); })}>{pending ? "Importing…" : "Import teammate"}</button><button disabled={pending} onClick={() => setPreview(null)}>Cancel import</button></div></section>}
    <div className="workspace-team-grid">{state.bots.map(bot => <article key={bot.id} className="workspace-teammate">
      <button className="workspace-teammate-identity" onClick={() => onEdit(bot.threadId)} aria-label={`Edit ${bot.name}`}><Character name={bot.name} color={bot.color} variant={bot.mascot} size={60} /><span><strong>{bot.name}</strong><small>{bot.role}</small></span><ChevronRight size={16} /></button>
      <button className="workspace-teammate-chat" onClick={() => onThread(bot.threadId)}>Open conversation <ArrowUpRight size={14} /></button>
    </article>)}</div>
    {!state.bots.length && <WorkspaceNote title="Make room for someone useful.">Create a teammate, choose their AI, and start with something small.</WorkspaceNote>}
    {state.retiredBots.length > 0 && <section className="workspace-restoration"><h3>Recoverable teammates</h3><p>Their history stays with your workspace.</p>{state.retiredBots.map(bot => <div className="workspace-list-row" key={bot.id}><span><strong>{bot.name}</strong><small>{bot.role}</small></span><button disabled={pending} onClick={() => void perform(() => onRestore(bot.id))}>Restore</button></div>)}</section>}
    <p className="workspace-footnote">Bring another teammate into the work from a conversation. No group configuration is required.</p>
  </div>;
}

export function UsageOverview({ state, onEdit, onThread }: { state: AppState; onEdit: (thread: string) => void; onThread: (thread: string) => void }) {
  return <div className="usage-overview">
    <WorkspaceNote bot={state.bots[0]} title="No surprise “still working”.">When a task reaches its allowance, review what is already done before deciding whether to continue. Extra tokens require a separate decision.</WorkspaceNote>
    <div className="workspace-usage-totals"><div><strong>{state.usage.totalTokens.toLocaleString()}</strong><small>tokens · 7 days</small></div><div><strong>{state.usage.completedRuns}</strong><small>finished tasks</small></div><div><strong>{state.usage.activeRuns}</strong><small>active tasks</small></div></div>
    <h3>Teammate budgets</h3><div className="workspace-row-group">{state.bots.map(bot => <button className="workspace-list-row" key={bot.id} onClick={() => onEdit(bot.threadId)}><Character name={bot.name} color={bot.color} variant={bot.mascot} size={36} /><span><strong>{bot.name}</strong><small>{bot.tokensUsedThisWeek.toLocaleString()} tokens used this week</small></span><small>{bot.weeklyTokenBudget > 0 ? `${bot.weeklyTokenBudget.toLocaleString()} limit` : "No weekly limit"}</small><ChevronRight size={16} /></button>)}</div>
    <h3>Waiting for a decision</h3><div className="workspace-row-group">{state.approvals.length ? state.approvals.map(approval => <button key={approval.id} className="workspace-list-row" onClick={() => { const run = [...state.runs, ...state.studioRuns].find(item => item.id === approval.runId); if (run) onThread(run.threadId); }}><span><strong>{approval.botName}</strong><small>{approval.reason}</small></span><ChevronRight size={16} /></button>) : <p className="workspace-empty">No actions are waiting for your approval.</p>}</div>
    <p className="workspace-footnote">Usage comes from host records. Token counts do not determine your provider’s subscription price.</p>
  </div>;
}

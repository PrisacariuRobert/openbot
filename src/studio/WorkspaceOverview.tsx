import { ExistingAgentsCard } from "../components/ExistingAgentsCard";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowUpRight, ChevronRight, Link2, Plus, Upload } from "lucide-react";
import { TeammatePreviewCard, readTeammate, type TeammatePreview } from "../components/TeammatePreviewCard";
import { decodeTeammate, payloadFromLink } from "../shared/teammate-link";
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
  const [preview, setPreview] = useState<TeammatePreview | null>(null);
  const [error, setError] = useState("");
  const [linkOpen, setLinkOpen] = useState(false), [linkText, setLinkText] = useState("");
  const previewAnchor = useRef<HTMLDivElement>(null);
  useEffect(() => { if (preview) previewAnchor.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [preview]);
  async function perform(action: () => Promise<void>) {
    if (pending) return;
    setPending(true); setError("");
    try { await action(); } catch (error) { setError(error instanceof Error ? error.message : "Could not save. Your existing team is unchanged."); }
    finally { setPending(false); }
  }
  /** A shared teammate arrives as a file, a pasted link, a gallery address or
   * ?import= from the website. All of them end in the same preview. */
  async function fromLink(text: string) {
    const trimmed = text.trim();
    if (/^https:\/\/(?:www\.)?(?:sidemates\.app|openbots\.foundation)\/teammates\//.test(trimmed)) {
      const response = await fetch(`/api/teammate-source?url=${encodeURIComponent(trimmed)}`, { credentials: "same-origin" });
      const value = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(value.error || "That teammate couldn't be loaded.");
      setPreview(readTeammate(value)); return;
    }
    const payload = payloadFromLink(trimmed);
    if (!payload) throw new Error("This doesn't look like a Sidemates teammate link.");
    setPreview(readTeammate(await decodeTeammate(payload)));
  }
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("import");
    if (!wanted) return;
    const url = new URL(window.location.href); url.searchParams.delete("import"); window.history.replaceState(null, "", url);
    void perform(() => fromLink(wanted));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div className="team-overview">
    <div className="workspace-page-actions"><button className="button-primary" onClick={onCreate}><Plus size={16} /> New teammate</button><button disabled={pending} onClick={() => file.current?.click()}><Upload size={16} /> Import a profile</button><button disabled={pending} onClick={() => setLinkOpen((open) => !open)}><Link2 size={16} /> Add from a link</button></div>
    {linkOpen && <form className="teammate-link-form" onSubmit={(event) => { event.preventDefault(); void perform(async () => { await fromLink(linkText); setLinkOpen(false); setLinkText(""); }); }}><input value={linkText} onChange={(event) => setLinkText(event.target.value)} placeholder="Paste a teammate link" aria-label="Teammate link" autoFocus /><button type="submit" className="button-primary" disabled={pending || !linkText.trim()}>Preview</button></form>}
    <input ref={file} className="visually-hidden" type="file" accept=".json,application/json" aria-label="Import a teammate profile" onChange={event => {
      const selected = event.target.files?.[0]; event.target.value = "";
      if (selected) void perform(async () => { if (selected.size > 256000) throw new Error("Choose a profile under 256 KB."); setPreview(readTeammate(JSON.parse(await selected.text()))); });
    }} />
    {preview && <div ref={previewAnchor}><TeammatePreviewCard preview={preview} pending={pending} macAccess={state.settings.macAccessEnabled} onCancel={() => setPreview(null)} onAdd={() => void perform(async () => { await onImport(preview.raw); setPreview(null); })} /></div>}
    <ExistingAgentsCard onOpen={(botId) => { const bot = state.bots.find((item) => item.id === botId); if (bot) onEdit(bot.threadId); }} />
    {error && <p role="alert" className="panel-error">{error}</p>}
    <div className="workspace-team-grid">{state.bots.map(bot => <article key={bot.id} className="workspace-teammate">
      <button className="workspace-teammate-identity" onClick={() => onEdit(bot.threadId)} aria-label={`Edit ${bot.name}`}><Character name={bot.name} color={bot.color} variant={bot.mascot} size={60} /><span><strong>{bot.name}</strong><small>{bot.role}</small></span><ChevronRight size={16} /></button>
      <button className="workspace-teammate-chat" onClick={() => onThread(bot.threadId)}>Open conversation <ArrowUpRight size={14} /></button>
    </article>)}</div>
    {!state.bots.length && <WorkspaceNote title="Make room for someone useful.">Create a teammate, choose their AI, and start with something small.</WorkspaceNote>}
    {state.retiredBots.length > 0 && <section className="workspace-restoration"><h3>Recoverable teammates</h3><p>Their history stays with your workspace.</p>{state.retiredBots.map(bot => <div className="workspace-list-row" key={bot.id}><span><strong>{bot.name}</strong><small>{bot.role}</small></span><button disabled={pending} onClick={() => void perform(() => onRestore(bot.id))}>Restore</button></div>)}</section>}
    <p className="workspace-footnote">Bring another teammate into the work from a conversation. No group configuration is required.</p>
  </div>;
}

const clockText = (seconds: number) => seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;

/** How long a new studio took to do something useful. Timed and kept on this Mac only. */
function FirstMinutes() {
  const [summary, setSummary] = useState<{ recorded: boolean; steps: Array<{ step: string; label: string; afterSeconds: number }>; usefulAfterSeconds: number | null } | null>(null);
  useEffect(() => { void fetch("/api/first-run", { credentials: "same-origin" }).then((response) => response.ok ? response.json() : null).then(setSummary).catch(() => {}); }, []);
  if (!summary?.recorded) return null;
  return <section className="first-minutes" aria-label="Your first minutes">
    <h3>Your first minutes</h3>
    <p>{summary.usefulAfterSeconds === null ? "Your team hasn't finished its first job yet." : `Something useful after ${clockText(summary.usefulAfterSeconds)}.`}</p>
    <ol>{summary.steps.map((step) => <li key={step.step}><span>{step.label}</span><small>{step.step === "opened" ? "start" : clockText(step.afterSeconds)}</small></li>)}</ol>
    <p className="workspace-footnote">Timed on this Mac. Nothing is sent anywhere.</p>
  </section>;
}

export function UsageOverview({ state, onEdit, onThread }: { state: AppState; onEdit: (thread: string) => void; onThread: (thread: string) => void }) {
  return <div className="usage-overview">
    <WorkspaceNote bot={state.bots[0]} title="No surprise “still working”.">When a task reaches its allowance, review what is already done before deciding whether to continue. Extra tokens require a separate decision.</WorkspaceNote>
    <div className="workspace-usage-totals"><div><strong>{state.usage.totalTokens.toLocaleString()}</strong><small>tokens · 7 days</small></div><div><strong>{state.usage.completedRuns}</strong><small>finished tasks</small></div><div><strong>{state.usage.activeRuns}</strong><small>active tasks</small></div></div>
    <h3>Teammate budgets</h3><div className="workspace-row-group">{state.bots.map(bot => <button className="workspace-list-row" key={bot.id} onClick={() => onEdit(bot.threadId)}><Character name={bot.name} color={bot.color} variant={bot.mascot} size={36} /><span><strong>{bot.name}</strong><small>{bot.tokensUsedThisWeek.toLocaleString()} tokens used this week</small></span><small>{bot.weeklyTokenBudget > 0 ? `${bot.weeklyTokenBudget.toLocaleString()} limit` : "No weekly limit"}</small><ChevronRight size={16} /></button>)}</div>
    <h3>Waiting for a decision</h3><div className="workspace-row-group">{state.approvals.length ? state.approvals.map(approval => <button key={approval.id} className="workspace-list-row" onClick={() => { const run = [...state.runs, ...state.studioRuns].find(item => item.id === approval.runId); if (run) onThread(run.threadId); }}><span><strong>{approval.botName}</strong><small>{approval.reason}</small></span><ChevronRight size={16} /></button>) : <p className="workspace-empty">No actions are waiting for your approval.</p>}</div>
    <FirstMinutes />
    <p className="workspace-footnote">Usage comes from host records. When an AI re-reads what it already saw, that counts as a tenth, the way AI providers price it. Token counts do not determine your provider’s subscription price.</p>
  </div>;
}

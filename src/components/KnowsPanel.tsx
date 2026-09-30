import { useCallback, useEffect, useState } from "react";
import { FileText, Folder, LoaderCircle, Mail, MessageSquare, NotebookText, Trash2, X } from "lucide-react";
import { SettingsCard, SettingsGroup, SettingsRow, SwitchRow } from "../studio/Settings";

type SourceId = "files" | "notes" | "mail" | "messages";
interface SourceStatus { id: SourceId; enabled: boolean; items: number; newest: string | null; indexedAt: string | null; indexing: boolean; problem: { message: string; needsFullDiskAccess: boolean } | null }
interface Status { sources: SourceStatus[]; folders: string[]; total: number; available: boolean; macAccess: boolean }

const COPY: Record<SourceId, { title: string; description: string; icon: typeof Mail; color: string; unit: string }> = {
  files: { title: "Documents in folders you choose", description: "Word, PDF, PowerPoint, Excel and text files.", icon: FileText, color: "#5b7cfa", unit: "files" },
  notes: { title: "Apple Notes", description: "All your notes, read once and kept up to date.", icon: NotebookText, color: "#f5b800", unit: "notes" },
  mail: { title: "Mail", description: "Your newest emails from the last year, with attachment names.", icon: Mail, color: "#1668e3", unit: "emails" },
  messages: { title: "Messages", description: "Your texts and iMessages, grouped by conversation and day, with names from Contacts.", icon: MessageSquare, color: "#34c759", unit: "messages" },
};

const ago = (iso: string | null) => {
  if (!iso) return "never";
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  return minutes < 2 ? "just now" : minutes < 90 ? `${minutes} min ago` : minutes < 2_880 ? `${Math.round(minutes / 60)} hours ago` : `${Math.round(minutes / 1_440)} days ago`;
};

/** "What your team knows": the owner decides which parts of their Mac a
 * teammate can search, sees how much is indexed, and can forget it all. The
 * index stays on this Mac; only the few snippets a teammate finds for a
 * question are sent to the AI that answers it. */
export function KnowsPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState<string | null>(null), [error, setError] = useState(""), [folder, setFolder] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/personal-index", { credentials: "same-origin" });
    if (response.ok) setStatus(await response.json() as Status);
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!status?.sources.some((source) => source.indexing)) return;
    const timer = window.setInterval(() => void load(), 2_000);
    return () => window.clearInterval(timer);
  }, [status, load]);

  const call = async (key: string, url: string, method: string, body?: object) => {
    setBusy(key); setError("");
    try {
      const response = await fetch(url, { method, credentials: "same-origin", headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
      const value = await response.json().catch(() => ({})) as Status & { error?: string };
      if (!response.ok) throw new Error(value.error || "That didn't work.");
      setStatus((previous) => previous ? { ...previous, ...value } : previous);
      await load();
      return true;
    } catch (reason) { setError(reason instanceof Error ? reason.message : "That didn't work."); return false; }
    finally { setBusy(null); }
  };
  const addFolder = async () => { if (folder.trim() && await call("folder", "/api/personal-index/folders", "POST", { path: folder.trim() })) setFolder(""); };

  if (!status) return <p className="capability-notice">Loading…</p>;
  if (!status.available) return <p className="panel-note">Searching your own files, notes and mail works when OpenBot runs on a Mac.</p>;
  const source = (id: SourceId) => status.sources.find((item) => item.id === id)!;

  return (
    <div className="knows-panel">
      <div className="knows-intro">
        <strong>What your team can find</strong>
        <p>Choose what a teammate may search on this Mac — “what did Anna say about the trip?”, “find my note about…”. The index stays in OpenBot's folder on this Mac; nothing is uploaded. When you ask a question, only the few matching snippets go to your AI, like any other message.</p>
        {!status.macAccess && <p className="knows-warning" role="status">Turn on <strong>Files &amp; apps on this Mac</strong> in Permissions first.</p>}
      </div>

      <SettingsGroup title="Sources">
        <SettingsCard>
          {(["notes", "mail", "files", "messages"] as const).map((id) => {
            const info = source(id), copy = COPY[id], Icon = copy.icon;
            const detail = info.enabled
              ? info.indexing ? <span className="knows-working"><LoaderCircle className="spinner" size={13} /> Reading… {info.items ? `${info.items.toLocaleString()} so far` : ""}</span>
                : info.problem ? <span className="knows-problem">{info.problem.message}</span>
                : `${info.items.toLocaleString()} ${copy.unit} · updated ${ago(info.indexedAt)}`
              : copy.description;
            return (
              <SwitchRow key={id} title={copy.title} description={detail} icon={<Icon size={16} />} iconBg={copy.color}
                checked={info.enabled} disabled={busy !== null || !status.macAccess || (id === "files" && !info.enabled && !status.folders.length)}
                onChange={(enabled) => void call(id, "/api/personal-index/sources", "POST", { source: id, enabled })} />
            );
          })}
        </SettingsCard>
        {[source("mail"), source("messages")].some((item) => item.problem?.needsFullDiskAccess) && (
          <div className="knows-fda" role="status">
            <strong>Mail and Messages need Full Disk Access.</strong>
            <p>In System Settings → Privacy &amp; Security → Full Disk Access, switch on <strong>OpenBot</strong>, then come back here.</p>
            <button type="button" onClick={() => void fetch("/api/channels/imessage/open-privacy", { method: "POST", credentials: "same-origin" })}>Open that page</button>
            <button type="button" className="secondary" disabled={busy !== null} onClick={() => void call("retry", "/api/personal-index/refresh", "POST")}>Try again</button>
          </div>
        )}
      </SettingsGroup>

      <SettingsGroup title="Folders">
        <SettingsCard>
          {status.folders.map((path) => (
            <SettingsRow key={path} title={path.replace(/^\/Users\/[^/]+/, "~")} icon={<Folder size={16} />} iconBg="#5b7cfa"
              control={<button type="button" className="knows-remove" aria-label={`Remove ${path}`} disabled={busy !== null} onClick={() => void call("remove", "/api/personal-index/folders", "DELETE", { path })}><X size={15} /></button>} />
          ))}
          <div className="knows-add">
            <input value={folder} onChange={(event) => setFolder(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void addFolder(); }} placeholder="A folder in your home folder, like Documents/Contracts" aria-label="Folder to include" disabled={!status.macAccess} />
            <button type="button" disabled={busy !== null || !folder.trim() || !status.macAccess} onClick={() => void addFolder()}>{busy === "folder" ? <LoaderCircle className="spinner" size={14} /> : null}Add</button>
          </div>
        </SettingsCard>
        <p className="panel-note">Hidden folders, app libraries and code dependencies are skipped.</p>
      </SettingsGroup>

      {status.total > 0 && (
        <SettingsGroup title="Forget">
          <SettingsCard>
            <SettingsRow title="Forget everything" description={`Deletes the index of ${status.total.toLocaleString()} items and turns every source off. Your files, notes and mail are not touched.`}
              control={<button type="button" className="knows-forget" disabled={busy !== null} onClick={() => { if (window.confirm("Forget everything OpenBot has indexed on this Mac? Your files, notes and mail stay exactly as they are.")) void call("forget", "/api/personal-index", "DELETE"); }}><Trash2 size={14} /> Forget</button>} />
          </SettingsCard>
        </SettingsGroup>
      )}
      {error && <p className="panel-error" role="alert">{error}</p>}
    </div>
  );
}

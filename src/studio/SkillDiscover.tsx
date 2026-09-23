import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight, Check, FileText, LoaderCircle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Bot } from "../shared/types";
import "./skill-discover.css";

export type CatalogEntry = { name: string; description: string; url: string; collection: string; license: string; addable: boolean; reason: string | null; installed?: boolean };
type Preview = { name: string; description: string; license: string; source: string; files: Record<string, string>; instructions: string; digest: string; warnings: string[]; blockers: string[] };

export const skillTitle = (name: string) => name.replace(/-/g, " ").replace(/\b(mcp|api|pdf|ui|csv|seo)\b/g, (word) => word.toUpperCase()).replace(/^./, (letter) => letter.toUpperCase());

async function call<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/extensions${path}`, body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "That didn’t work. Try again.");
  return result as T;
}

/** Public skills to browse, under the owner's own skills in the Library. */
export function SkillDiscover({ query, refreshKey, onOpen }: { query: string; refreshKey: number; onOpen: (entry: CatalogEntry) => void }) {
  const [catalog, setCatalog] = useState<CatalogEntry[] | null>(null), [error, setError] = useState("");
  const load = (refresh = false) => {
    setError("");
    void call<CatalogEntry[]>(`/skills/catalog${refresh ? "?refresh=1" : ""}`).then(setCatalog).catch((cause) => setError(cause instanceof Error ? cause.message : "Public skills are unavailable right now."));
  };
  useEffect(() => { load(); }, [refreshKey]);
  const needle = query.trim().toLowerCase();
  const matches = (entry: CatalogEntry) => !needle || `${entry.name} ${entry.description}`.toLowerCase().includes(needle);
  const addable = catalog?.filter((entry) => entry.addable && matches(entry)) || [];
  const unavailable = catalog?.filter((entry) => !entry.addable && matches(entry)) || [];
  if (catalog && needle && !addable.length && !unavailable.length) return null;
  return (
    <section className="skill-discover" aria-labelledby="skill-discover-title">
      <div className="skill-discover-head">
        <h3 id="skill-discover-title">Discover</h3>
        <p>Public skills in the open Agent Skills format. Each is checked first, and nothing is added until you review it.</p>
      </div>
      {error ? (
        <p className="skill-discover-note" role="status">{error} <button type="button" className="text-action" onClick={() => load(true)}>Try again</button></p>
      ) : !catalog ? (
        <div className="skill-discover-list" aria-busy="true" aria-label="Loading public skills">
          {[0, 1, 2].map((index) => <div className="skill-discover-skeleton" key={index} />)}
        </div>
      ) : (
        <>
          <div className="skill-discover-list">
            {addable.map((entry) => (
              <div className="skill-discover-row" key={entry.url}>
                <button type="button" className="skill-discover-open" onClick={() => onOpen(entry)}>
                  <span className="skill-number" aria-hidden="true"><FileText size={20} strokeWidth={1.3} /></span>
                  <span>
                    <strong>{skillTitle(entry.name)}</strong>
                    <small>{entry.description}</small>
                  </span>
                </button>
                {entry.installed
                  ? <span className="skill-discover-added"><Check size={13} aria-hidden="true" /> Added</span>
                  : <button type="button" className="skill-get" aria-label={`Get ${skillTitle(entry.name)}`} onClick={() => onOpen(entry)}>Get</button>}
              </div>
            ))}
          </div>
          {unavailable.length > 0 && (
            <details className="skill-discover-unavailable">
              <summary>{unavailable.length} more can’t be added as they are</summary>
              <ul>{unavailable.map((entry) => <li key={entry.url}><strong>{skillTitle(entry.name)}</strong> — {entry.reason}</li>)}</ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}

/** Review sheet: exactly the bundle that will be saved, then one clear action. */
export function SkillDiscoverDetail({ entry, bots, face, onAdded }: { entry: CatalogEntry; bots: Bot[]; face: (bot: Bot) => ReactNode; onAdded: (message: string) => void }) {
  const [preview, setPreview] = useState<Preview | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [chosen, setChosen] = useState<string[]>(() => bots.map((bot) => bot.id));
  useEffect(() => {
    let live = true;
    void call<Preview>("/skills/fetch", { url: entry.url }).then((next) => { if (live) setPreview(next); }).catch((cause) => { if (live) setError(cause instanceof Error ? cause.message : "This skill could not be loaded."); });
    return () => { live = false; };
  }, [entry.url]);
  const add = async () => {
    if (!preview) return;
    setBusy(true); setError("");
    try {
      await call("/skills", { bundle: { files: preview.files, source: preview.source }, digest: preview.digest, botIds: chosen });
      onAdded(`${skillTitle(entry.name)} added.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "It wasn’t added. Try again."); }
    finally { setBusy(false); }
  };
  const toggle = (id: string) => setChosen((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  return (
    <>
      <p className="overline">FROM {entry.collection.toUpperCase()}</p>
      <h2 className="detail-title">{skillTitle(entry.name)}</h2>
      <p className="drawer-intro">{entry.description}</p>
      {!preview && !error && <p className="quiet-copy"><LoaderCircle size={14} className="spin" aria-hidden="true" /> Checking this skill…</p>}
      {preview && (
        <>
          <h3 className="detail-subtitle">Who can use it</h3>
          <div className="skill-discover-people" role="group" aria-label="Teammates who can use this skill">
            {bots.map((bot) => (
              <button type="button" key={bot.id} aria-pressed={chosen.includes(bot.id)} onClick={() => toggle(bot.id)}>
                {face(bot)}
                <span>{bot.name}</span>
                {chosen.includes(bot.id) && <Check size={13} className="skill-discover-tick" aria-hidden="true" />}
              </button>
            ))}
          </div>
          <details className="source-details">
            <summary>Read the instructions</summary>
            <div className="prose"><ReactMarkdown remarkPlugins={[remarkGfm]}>{preview.instructions.replace(/^---\n[\s\S]*?\n---\n?/, "")}</ReactMarkdown></div>
          </details>
          <ul className="skill-discover-warnings">{preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
          {preview.blockers.map((blocker) => <p className="send-error" key={blocker}>{blocker}</p>)}
          <button type="button" className="primary full-width" disabled={busy || !chosen.length || preview.blockers.length > 0} onClick={() => void add()}>
            {busy ? <LoaderCircle size={15} className="spin" aria-hidden="true" /> : null}
            {entry.installed ? "Update who can use it" : "Add skill"} {!busy && <ArrowRight size={15} />}
          </button>
          <small className="boundary-note">{Object.keys(preview.files).length} {Object.keys(preview.files).length === 1 ? "file" : "files"} · pinned to this exact version · adds instructions only, never account access</small>
        </>
      )}
      {error && <p className="send-error" role="alert">{error}</p>}
    </>
  );
}

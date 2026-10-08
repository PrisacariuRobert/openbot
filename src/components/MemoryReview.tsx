import { useEffect, useState } from "react";
import { MEMORY_ORIGIN_TEXT, type MemoryReviewItem } from "../shared/memory-origin";
import "./memory-review.css";

interface SearchMode { mode: "local" | "connection" | "keyword"; model: string | null; connection: string | null }

/** Task T5: memories a teammate learned after reading mail, web pages or files wait here. */
export function MemoryReviewQueue({ botId, botName, onDecided }: { botId: string; botName: string; onDecided: () => void }) {
  const [items, setItems] = useState<MemoryReviewItem[] | null>(null);
  const [search, setSearch] = useState<SearchMode | null>(null);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const load = () => {
    setError("");
    fetch(`/api/bots/${encodeURIComponent(botId)}/memory-review`)
      .then(async (response) => { if (!response.ok) throw new Error(); return response.json() as Promise<{ items: MemoryReviewItem[]; search: SearchMode }>; })
      .then((value) => { setItems(value.items); setSearch(value.search); })
      .catch(() => setError("Memories waiting for review couldn't be loaded. Try again."));
  };
  useEffect(load, [botId]);
  const decide = async (item: MemoryReviewItem, decision: "keep" | "discard") => {
    setBusy(item.id); setError("");
    try {
      const content = editing[item.id];
      const response = await fetch(`/api/memory-review/${encodeURIComponent(item.id)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision, ...(decision === "keep" && content !== undefined ? { content } : {}) }) });
      if (!response.ok) throw new Error(((await response.json().catch(() => ({}))) as { error?: string }).error || "That couldn't be saved.");
      setItems((current) => current?.filter((entry) => entry.id !== item.id) ?? null);
      onDecided();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "That couldn't be saved."); }
    finally { setBusy(null); }
  };
  const keepAll = async () => {
    if (!items?.length || !window.confirm(`Keep all ${items.length} memories for ${botName}? Read them first: from now on every task can use them.`)) return;
    setBusy("all"); setError("");
    try {
      const response = await fetch(`/api/bots/${encodeURIComponent(botId)}/memory-review/keep-all`, { method: "POST" });
      const value = await response.json() as { kept?: number; failed?: string[]; error?: string };
      if (!response.ok) throw new Error(value.error || "They couldn't be saved.");
      if (value.failed?.length) setError(`${value.failed.length} couldn't be saved: ${value.failed[0]}`);
      load(); onDecided();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "They couldn't be saved."); }
    finally { setBusy(null); }
  };
  return (
    <section className="memory-review" aria-label={`What ${botName} remembers`}>
      <h4>What {botName} remembers</h4>
      {search && <p className="memory-search-mode">{search.mode === "local" ? `Finds memories by meaning on this Mac, with ${search.model}.` : search.mode === "connection" ? `Finds memories by meaning through ${search.connection}.` : "Finds memories by their words. To find them by meaning without sending them anywhere, install Ollama and run “ollama pull embeddinggemma”."}</p>}
      {items === null && !error && <p className="memory-review-empty">Loading…</p>}
      {items && items.length > 0 && (
        <div className="memory-review-queue" role="group" aria-label="Waiting for your review">
          <h5>Waiting for your review · {items.length}</h5>
          <p>{items.some((item) => item.from) ? "Brought in from an export, or learned after reading something from outside." : `${botName} learned these after reading something from outside.`} They aren't used until you keep them.</p>
          {items.length > 1 && <button type="button" className="memory-review-all" disabled={busy !== null} onClick={() => void keepAll()}>Keep all {items.length}</button>}
          {items.map((item) => (
            <article key={item.id} className="memory-review-item">
              <header><strong>{item.key}</strong><span>{item.from ? `From ${item.from}` : MEMORY_ORIGIN_TEXT[item.origin]}{item.origins.length > 1 ? ` and ${item.origins.length - 1} more` : ""} · {new Date(item.at).toLocaleString()}</span></header>
              <label className="visually-hidden" htmlFor={`memory-review-${item.id}`}>What {botName} would remember</label>
              <textarea id={`memory-review-${item.id}`} rows={2} maxLength={1200} value={editing[item.id] ?? item.content} onChange={(event) => setEditing((current) => ({ ...current, [item.id]: event.target.value }))} />
              <div className="memory-review-actions">
                <button type="button" className="extension-primary" disabled={busy === item.id} onClick={() => void decide(item, "keep")}>Keep</button>
                <button type="button" disabled={busy === item.id} onClick={() => void decide(item, "discard")}>Discard</button>
              </div>
            </article>
          ))}
        </div>
      )}
      {items && items.length === 0 && <p className="memory-review-empty">Nothing waiting for review.</p>}
      {error && <p role="alert" className="memory-review-error">{error} <button type="button" onClick={load}>Retry</button></p>}
    </section>
  );
}

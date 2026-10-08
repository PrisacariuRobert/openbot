import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { FileText, LoaderCircle, Mail, MessageCircle, NotebookPen, Search } from "lucide-react";
import "./ask-panel.css";

interface AskSource { n: number; source: "files" | "notes" | "mail" | "messages"; key: string; title: string; from: string | null; date: string; snippet: string }
interface AskAnswer { question: string; answer: string | null; answeredWith: string | null; sources: AskSource[]; cited: number[]; searchedBy: "meaning" | "words"; note: string | null }

const ICON = { files: FileText, notes: NotebookPen, mail: Mail, messages: MessageCircle } as const;
const OPENS_IN = { files: "Finder", notes: "Notes", mail: "Mail", messages: "Messages" } as const;

/** Task F7: the small "Ask my Mac" box the global shortcut opens. Keyboard first:
 * type and press Return, ↑/↓ through the sources, Return opens one, Esc closes. */
export function AskPanel() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<AskAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [active, setActive] = useState(0);
  const [status, setStatus] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => { document.title = "Ask my Mac · Sidemates"; input.current?.focus(); }, []);

  const ask = async () => {
    if (question.trim().length < 2 || busy) return;
    setBusy(true); setError(""); setStatus(""); setResult(null);
    try {
      const response = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question }) });
      const value = await response.json() as AskAnswer & { error?: string };
      if (!response.ok) throw new Error(value.error || "That couldn't be answered.");
      setResult(value); setActive(0);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "That couldn't be answered."); }
    finally { setBusy(false); }
  };
  const open = async (source: AskSource) => {
    setStatus("");
    try {
      const response = await fetch("/api/ask/open", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source: source.source, key: source.key }) });
      const value = await response.json() as { opened?: boolean; reason?: string; error?: string };
      setStatus(value.opened ? `Opened in ${OPENS_IN[source.source]}.` : value.reason || value.error || "That couldn't be opened.");
    } catch { setStatus("That couldn't be opened."); }
  };
  // Esc clears first; on an empty box it closes the window (the shortcut's window hides).
  const close = () => {
    if (question || result) { setQuestion(""); setResult(null); setError(""); setStatus(""); input.current?.focus(); return; }
    window.close();
  };
  const onKey = (event: KeyboardEvent) => {
    const sources = result?.sources ?? [];
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    if (!sources.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = (active + (event.key === "ArrowDown" ? 1 : -1) + sources.length) % sources.length;
      setActive(next);
      (list.current?.querySelectorAll("button")[next] as HTMLButtonElement | undefined)?.focus();
    }
  };
  const answerParts = result?.answer?.split(/(\[\d{1,2}\])/g) ?? [];
  return (
    <main className="ask-panel" onKeyDown={onKey}>
      <form className="ask-box" onSubmit={(event) => { event.preventDefault(); void ask(); }}>
        <Search size={18} aria-hidden="true" />
        <label className="visually-hidden" htmlFor="ask-question">Ask about your own mail, notes and files</label>
        <input id="ask-question" ref={input} value={question} maxLength={300} autoComplete="off" placeholder="Ask about your mail, notes and files…" onChange={(event) => setQuestion(event.target.value)} />
        {busy && <LoaderCircle size={18} className="spin" aria-label="Looking" />}
      </form>
      <p className="ask-privacy">Answered from what's indexed on this Mac. Nothing is sent to a cloud AI.</p>
      {error && <p role="alert" className="ask-error">{error}</p>}
      {result && (
        <section aria-label="Answer" aria-live="polite">
          {result.answer && <p className="ask-answer">{answerParts.map((part, index) => /^\[\d{1,2}\]$/.test(part) ? <sup key={index}>{part}</sup> : <span key={index}>{part}</span>)}</p>}
          {result.answer && <small className="ask-meta">Written on this Mac by {result.answeredWith}. Check it against the sources.</small>}
          {result.note && <p className="ask-note">{result.note}</p>}
          {result.sources.length > 0 && (
            <ol className="ask-sources" ref={list} aria-label="Sources">
              {result.sources.map((source, index) => {
                const Icon = ICON[source.source];
                return (
                  <li key={`${source.source}:${source.key}`} className={result.cited.includes(source.n) ? "is-cited" : undefined}>
                    <button type="button" aria-current={index === active ? "true" : undefined} onFocus={() => setActive(index)} onClick={() => void open(source)}>
                      <span className="ask-source-n">[{source.n}]</span>
                      <Icon size={15} aria-hidden="true" />
                      <span className="ask-source-text">
                        <strong>{source.title}</strong>
                        <small>{[source.from, source.date].filter(Boolean).join(" · ")} · opens in {OPENS_IN[source.source]}</small>
                        <span>{source.snippet}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
          <small className="ask-meta">{result.searchedBy === "meaning" ? "Found by meaning, on this Mac." : "Found by matching words."} ↑ ↓ to move, Return to open, Esc to close.</small>
        </section>
      )}
      {status && <p role="status" className="ask-status">{status}</p>}
    </main>
  );
}

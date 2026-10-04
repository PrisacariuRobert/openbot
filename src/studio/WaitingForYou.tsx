import { useCallback, useEffect, useState } from "react";
import { Bell, CalendarPlus, Check, ChevronRight, Inbox, Paperclip, Reply, Sparkles, Undo2 } from "lucide-react";
import type { QueueCard, QueueOffer, QueueRuleCard } from "../shared/types";
import "./waiting.css";

/** The front door: things your teammates prepared, one card each. Approving does exactly what the
 * card says, nothing is ever sent, and everything done on your Mac can be undone from "Done for you". */

const KIND: Record<QueueCard["kind"], { icon: typeof Bell; approve: string; label: string }> = {
  reminder: { icon: Bell, approve: "Add reminder", label: "Reminder" },
  calendar_event: { icon: CalendarPlus, approve: "Add to calendar", label: "Calendar" },
  reply_draft: { icon: Reply, approve: "Save draft", label: "Reply" },
  file_attachment: { icon: Paperclip, approve: "Save file", label: "File" },
};

const when = (value: unknown) => typeof value === "string" && value
  ? new Date(value).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
  : "";

/** The exact thing, not a summary. */
function CardDetails({ card }: { card: QueueCard }) {
  const a = card.action as Record<string, unknown>;
  if (card.kind === "reply_draft") {
    return <div className="waiting-detail">
      <p className="waiting-meta"><span>To</span> {Array.isArray(a.to) ? a.to.join(", ") : ""}</p>
      <p className="waiting-meta"><span>Subject</span> {String(a.subject ?? "")}</p>
      <blockquote>{String(a.body ?? "")}</blockquote>
    </div>;
  }
  if (card.kind === "calendar_event") {
    return <div className="waiting-detail">
      <p className="waiting-meta"><span>When</span> {when(a.start)} – {when(a.end)}</p>
      {Boolean(a.location) && <p className="waiting-meta"><span>Where</span> {String(a.location)}</p>}
      {Boolean(a.notes) && <p className="waiting-meta"><span>Notes</span> {String(a.notes)}</p>}
    </div>;
  }
  if (card.kind === "file_attachment") {
    return <div className="waiting-detail">
      <p className="waiting-meta"><span>File</span> {String(a.attachment ?? "")}</p>
      <p className="waiting-meta"><span>Into</span> ~/{String(a.folder ?? "").replace(/\/+$/, "")}</p>
    </div>;
  }
  return <div className="waiting-detail">
    <p className="waiting-meta"><span>Reminder</span> {String(a.title ?? card.title)}</p>
    {Boolean(a.due) && <p className="waiting-meta"><span>Due</span> {when(a.due)}</p>}
    {Boolean(a.list) && <p className="waiting-meta"><span>List</span> {String(a.list)}</p>}
  </div>;
}

/** What happened, in plain words. */
function outcome(card: QueueCard): string {
  const r = (card.result ?? {}) as Record<string, unknown>;
  if (card.status === "undone") return "Undone";
  if (card.status === "failed") return card.error || "That didn't work. Nothing was changed.";
  if (card.kind === "reminder") return `Added to Reminders${r.list ? ` (${String(r.list)})` : ""}`;
  if (card.kind === "calendar_event") return `Added to Calendar${r.calendar ? ` (${String(r.calendar)})` : ""}`;
  if (card.kind === "reply_draft") return "Saved in Mail's Drafts. Not sent";
  return `Saved to ${String(r.saved ?? "your Mac").replace(/^\/Users\/[^/]+/, "~")}`;
}

/** The sidebar row: a count that tells you, at a glance, whether anything needs you. */
export function WaitingEntry({ count, active, onOpen }: { count: number; active: boolean; onOpen: () => void }) {
  return <button type="button" className={`waiting-row${count > 0 ? " has-cards" : ""}${active ? " current" : ""}`} aria-current={active ? "page" : undefined} onClick={onOpen}>
    <span className="waiting-row-icon" aria-hidden="true"><Inbox size={15} /></span>
    <span><strong>Waiting for you</strong><small>{count > 0 ? `${count} to review` : "All clear"}</small></span>
    {count > 0 ? <b className="waiting-count" aria-hidden="true">{count}</b> : <ChevronRight size={15} aria-hidden="true" />}
  </button>;
}

export function WaitingForYou({ queueReady, onChanged }: { queueReady?: number; onChanged: () => void }) {
  const [ready, setReady] = useState<QueueCard[]>([]);
  const [recent, setRecent] = useState<QueueCard[]>([]);
  const [offers, setOffers] = useState<QueueOffer[]>([]);
  const [rules, setRules] = useState<QueueRuleCard[]>([]);
  const [alone, setAlone] = useState(0);
  const [scan, setScan] = useState<{ state: "idle" | "starting" | "started" | "error"; text: string }>({ state: "idle", text: "" });
  const [busy, setBusy] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/queue", { credentials: "same-origin" });
      if (!response.ok) return;
      const body = await response.json() as { ready: QueueCard[]; recent: QueueCard[]; offers?: QueueOffer[]; rules?: QueueRuleCard[]; automaticThisWeek?: number };
      setReady(body.ready); setRecent(body.recent);
      setOffers(body.offers ?? []); setRules(body.rules ?? []); setAlone(body.automaticThisWeek ?? 0);
    } finally { setLoaded(true); }
  }, []);
  useEffect(() => { void load(); }, [load, queueReady]);

  const act = async (card: QueueCard, action: "approve" | "skip" | "undo") => {
    setBusy((items) => ({ ...items, [card.id]: action }));
    setErrors((items) => { const { [card.id]: _gone, ...rest } = items; return rest; });
    try {
      const response = await fetch(`/api/queue/${card.id}/${action}`, { method: "POST", credentials: "same-origin" });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) setErrors((items) => ({ ...items, [card.id]: body.error || "That didn't work. Nothing was changed." }));
    } catch {
      setErrors((items) => ({ ...items, [card.id]: "Couldn't reach your studio. Nothing was changed." }));
    } finally {
      setBusy((items) => { const { [card.id]: _gone, ...rest } = items; return rest; });
      await load(); onChanged();
    }
  };

  /** Offers, rules and their buttons. Same shape as a card action: ask, show what went wrong, reload. */
  const trust = async (key: string, request: () => Promise<Response>) => {
    setBusy((items) => ({ ...items, [key]: "trust" }));
    setErrors((items) => { const { [key]: _gone, ...rest } = items; return rest; });
    try {
      const response = await request();
      if (!response.ok) { const body = await response.json().catch(() => ({})) as { error?: string }; setErrors((items) => ({ ...items, [key]: body.error || "That didn't work. Nothing was changed." })); }
    } catch {
      setErrors((items) => ({ ...items, [key]: "Couldn't reach your studio. Nothing was changed." }));
    } finally {
      setBusy((items) => { const { [key]: _gone, ...rest } = items; return rest; });
      await load(); onChanged();
    }
  };
  const startScan = async () => {
    setScan({ state: "starting", text: "" });
    try {
      const response = await fetch("/api/queue/scan", { method: "POST", credentials: "same-origin" });
      const body = await response.json().catch(() => ({})) as { error?: string; teammate?: string };
      setScan(response.ok
        ? { state: "started", text: `${body.teammate ?? "A teammate"} is reading your last three days of mail. Cards appear here as they're ready, usually within a few minutes.` }
        : { state: "error", text: body.error || "That couldn't start. Nothing was changed." });
    } catch { setScan({ state: "error", text: "Couldn't reach your studio. Nothing was changed." }); }
  };
  const post = (url: string, body?: unknown) => fetch(url, { method: "POST", credentials: "same-origin", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const undoable = recent.filter((card) => card.status === "done");
  return <div className="page-content waiting-page">
    <div className="page-heading">
      <div>
        <p className="overline">WAITING FOR YOU</p>
        <h1>{!loaded ? "Looking…" : ready.length === 0 ? "All clear" : ready.length === 1 ? "One thing needs a look" : `${ready.length} things need a look`}</h1>
      </div>
    </div>
    <p className="waiting-promise">Nothing happens until you say so. Replies are saved as drafts you send yourself, and anything done on your Mac can be undone.</p>

    {offers.map((offer) => <section key={offer.pattern} className="waiting-offer" aria-label="Make this automatic?">
      <span className="waiting-offer-icon" aria-hidden="true"><Sparkles size={16} /></span>
      <div>
        <strong>Do this for you from now on?</strong>
        <p className="waiting-offer-what">{offer.label}</p>
        <p>You've approved this {offer.approvals} times in a row. If you say yes, only this exact kind happens on its own, it shows up under Done for you with an Undo, and one Undo switches it off.</p>
        {errors[offer.pattern] && <p className="waiting-error" role="alert">{errors[offer.pattern]}</p>}
        <div className="waiting-offer-actions">
          <button type="button" className="waiting-approve" disabled={Boolean(busy[offer.pattern])} onClick={() => void trust(offer.pattern, () => post("/api/queue/rules", { pattern: offer.pattern }))}>Yes, do these automatically</button>
          <button type="button" className="waiting-skip" disabled={Boolean(busy[offer.pattern])} onClick={() => void trust(offer.pattern, () => post("/api/queue/offers/dismiss", { pattern: offer.pattern }))}>Not now</button>
        </div>
      </div>
    </section>)}

    {loaded && ready.length === 0 && <div className="waiting-empty">
      <Check size={22} aria-hidden="true" />
      <strong>You're all caught up</strong>
      <span>When a teammate notices something that needs you, such as a reply, a bill or an invitation, it shows up here as a card.</span>
      {scan.state === "started"
        ? <span className="waiting-scan-note" role="status">{scan.text}</span>
        : <button type="button" className="waiting-skip waiting-scan" disabled={scan.state === "starting"} onClick={() => void startScan()}>{scan.state === "starting" ? "Starting…" : "Look at my last few days"}</button>}
      {scan.state === "error" && <span className="waiting-error" role="alert">{scan.text}</span>}
    </div>}

    <ul className="waiting-list" aria-label="Cards waiting for you">
      {ready.map((card) => {
        const { icon: Icon, approve, label } = KIND[card.kind];
        const working = busy[card.id];
        return <li key={card.id} className="waiting-card" aria-busy={Boolean(working)}>
          <header>
            <span className="waiting-kind"><Icon size={14} aria-hidden="true" /> {label}</span>
            <h2>{card.title}</h2>
            <p className="waiting-why">{card.why}</p>
          </header>
          <CardDetails card={card} />
          <p className="waiting-preview">{card.preview}</p>
          {errors[card.id] && <p className="waiting-error" role="alert">{errors[card.id]}</p>}
          <footer>
            <button type="button" className="waiting-approve" disabled={Boolean(working)} onClick={() => void act(card, "approve")}>{working === "approve" ? "Working…" : approve}</button>
            <button type="button" className="waiting-skip" disabled={Boolean(working)} onClick={() => void act(card, "skip")}>Skip</button>
          </footer>
        </li>;
      })}
    </ul>

    {recent.length > 0 && <section className="waiting-done" aria-label="Done for you">
      <h3>Done for you</h3>
      <ul>
        {recent.map((card) => {
          const working = busy[card.id];
          return <li key={card.id} className={`waiting-done-row status-${card.status}`}>
            <span className="waiting-done-text"><strong>{card.title}{card.decidedBy?.startsWith("rule:") && <em className="waiting-auto">On its own</em>}</strong><small>{outcome(card)}</small>{errors[card.id] && <small className="waiting-error" role="alert">{errors[card.id]}</small>}</span>
            {card.status === "done" && <button type="button" className="waiting-undo" disabled={Boolean(working)} onClick={() => void act(card, "undo")}><Undo2 size={14} aria-hidden="true" /> {working === "undo" ? "Undoing…" : "Undo"}</button>}
          </li>;
        })}
      </ul>
      {undoable.length > 0 && <p className="waiting-footnote">Undo is available for 7 days.</p>}
    </section>}

    {rules.length > 0 && <section className="waiting-rules" aria-label="Things done on their own">
      <h3>Done on its own</h3>
      <p className="waiting-footnote">{alone === 0 ? "Nothing has happened on its own this week." : `${alone} ${alone === 1 ? "thing was" : "things were"} done on their own this week. Each one is listed above with an Undo.`}</p>
      <ul>
        {rules.map((rule) => <li key={rule.id} className={`waiting-rule status-${rule.status}`}>
          <span className="waiting-done-text">
            <strong>{rule.label}</strong>
            <small>{rule.status === "paused" ? `Paused. ${rule.pausedReason ?? ""} Nothing happens on its own until you turn it back on.` : `On. Done ${rule.uses} ${rule.uses === 1 ? "time" : "times"}.`}</small>
            {errors[rule.id] && <small className="waiting-error" role="alert">{errors[rule.id]}</small>}
          </span>
          {rule.status === "paused"
            ? <button type="button" className="waiting-undo" disabled={Boolean(busy[rule.id])} onClick={() => void trust(rule.id, () => post(`/api/queue/rules/${rule.id}/resume`))}>Turn back on</button>
            : <button type="button" className="waiting-undo" disabled={Boolean(busy[rule.id])} onClick={() => void trust(rule.id, () => post(`/api/queue/rules/${rule.id}/pause`))}>Pause</button>}
          <button type="button" className="waiting-undo" disabled={Boolean(busy[rule.id])} onClick={() => void trust(rule.id, () => fetch(`/api/queue/rules/${rule.id}`, { method: "DELETE", credentials: "same-origin" }))}>Remove</button>
        </li>)}
      </ul>
    </section>}
  </div>;
}

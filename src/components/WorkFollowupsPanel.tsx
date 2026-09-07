import { useEffect, useState } from "react";
import type { WorkFollowupStatus } from "../shared/work-followups";

export function WorkFollowupsPanel({ request }: { request: <T>(url: string, init?: RequestInit) => Promise<T> }) {
  const [data, setData] = useState<WorkFollowupStatus | null>(null), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false), [history, setHistory] = useState(false);
  useEffect(() => { let current = true; void request<WorkFollowupStatus>("/api/work-followups").then((result) => { if (current) setData(result); }).catch(() => { if (current) setNotice("Couldn’t load follow-ups."); }); return () => { current = false; }; }, [request]);
  async function act(url: string, method: string, body?: unknown) {
    setBusy(true); setNotice("");
    try { await request(url, { method, ...(body ? { body: JSON.stringify(body) } : {}) }); setData(await request<WorkFollowupStatus>("/api/work-followups")); }
    catch { setNotice("Couldn’t save that change. Your previous items are still saved."); }
    finally { setBusy(false); }
  }
  async function setDigest(enabled: boolean) {
    if (!data || busy) return;
    const previous = data; setData({ ...data, digestEnabled: enabled }); setBusy(true); setNotice("");
    try { setData(await request<WorkFollowupStatus>("/api/work-followups/digest", { method: "PUT", body: JSON.stringify({ enabled }) })); }
    catch { setData(previous); setNotice("Couldn’t change your digest preference. Your previous choice is still saved."); }
    finally { setBusy(false); }
  }
  return <section className="work-sources"><div><h3>Your follow-ups</h3><p>Keep useful suggestions from a saved brief. Tracking is local to OpenBot—it does not send a message, create a reminder or change Todoist. Sources are snapshots, not live facts.</p></div>
    {data && <label className="work-digest-toggle"><input type="checkbox" checked={data.digestEnabled} disabled={busy} onChange={(event) => void setDigest(event.target.checked)} />Show a daily suggestion digest here</label>}
    <p className="work-source-note">Optional and in-app only. New briefs can prepare up to five suggestions, at most once every 24 hours. Exact repeated suggestions are remembered for 90 days. Nothing is sent, scheduled or automatically tracked.</p>
    {data?.digest && !!data.digest.items.length && <div className="work-followup"><h4>A few things worth considering</h4><small>Prepared {new Date(data.digest.createdAt).toLocaleString()} from saved reports—not a fresh account check.</small>{data.digest.items.map((entry) => <article className="work-followup" key={entry.id}><p>{entry.text}</p><small>{entry.sources.map((source) => source.title).join(" · ")}</small><button disabled={busy} onClick={() => void act("/api/work-followups", "POST", { snapshotId: entry.snapshotId, itemIndex: entry.itemIndex })}>Track this suggestion</button></article>)}<button disabled={busy} onClick={() => void act("/api/work-followups/digest", "DELETE")}>Dismiss digest</button></div>}
    {data?.tracked.filter((entry) => history || entry.status === "open").map((entry) => <article className="work-followup" key={entry.id}><p>{entry.text}</p><small>{entry.status === "open" ? "Tracking" : entry.status === "done" ? "Done" : "Dismissed"} · source captured {new Date(entry.capturedAt).toLocaleDateString()}</small><div className="work-source-fields">{entry.sources.map((source) => source.url ? <a key={source.ref} href={source.url} target="_blank" rel="noreferrer">{source.title}</a> : <span key={source.ref}>{source.title}</span>)}</div><div className="work-source-fields"><button disabled={busy} onClick={() => void act(`/api/work-followups/${entry.id}`, "PATCH", { status: entry.status === "open" ? "done" : "open" })}>{entry.status === "open" ? "Mark done" : "Reopen"}</button><button disabled={busy} onClick={() => void act(`/api/work-followups/${entry.id}`, "PATCH", { status: "dismissed" })}>Dismiss</button>{entry.status !== "open" && <button disabled={busy} onClick={() => void act(`/api/work-followups/${entry.id}`, "DELETE")}>Remove from tracker</button>}</div></article>)}
    {!data?.tracked.some((entry) => entry.status === "open") && <p>No open follow-ups. Run a brief, then choose which suggestions to keep.</p>}
    {data && data.tracked.some((entry) => entry.status !== "open") && <button onClick={() => setHistory(!history)}>{history ? "Hide finished items" : "Show finished items"}</button>}
    {!!data?.suggestions.length && <details><summary>Suggestions from recent briefs ({data.suggestions.length})</summary><div className="work-source-choices">{data.suggestions.map((entry) => <article className="work-followup" key={entry.id}><p>{entry.text}</p><small>Captured {new Date(entry.capturedAt).toLocaleDateString()} · {entry.sources.map((source) => source.title).join(" · ")}</small><button disabled={busy} onClick={() => void act("/api/work-followups", "POST", { snapshotId: entry.snapshotId, itemIndex: entry.itemIndex })}>Track this</button></article>)}</div></details>}
    <p role="status">{notice}</p></section>;
}
